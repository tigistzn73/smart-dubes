// Idempotent migration for the debt-escalation ladder.
//
// escalation_cases used to live only in a standalone script that nothing called,
// so a freshly created database had no such table and every /escalations
// request 500'd. It is now part of schema.sql, but schema.sql only ever issues
// CREATE TABLE IF NOT EXISTS, which means an existing database is not altered
// by re-running it. This script closes that gap and is safe to run repeatedly.
//
//   node src/db/migrate_escalations.js

const db = require('../config/database');

async function migrate() {
  console.log('[MIGRATE] Ensuring escalation tables and columns exist...');

  // 1. The table itself, matching schema.sql.
  await db.run(`
    CREATE TABLE IF NOT EXISTS escalation_cases (
      id SERIAL PRIMARY KEY,
      customer_id INT NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
      merchant_id INT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      transaction_id INT REFERENCES credit_transactions(id) ON DELETE SET NULL,
      escalation_type VARCHAR(20) NOT NULL CHECK (escalation_type IN ('WARNING', 'COURT_LETTER')),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'RESPONDED', 'RESOLVED', 'CLOSED')),
      amount DECIMAL(12, 2) NOT NULL,
      due_date DATE NOT NULL,
      warning_period_days INT NOT NULL DEFAULT 7,
      warning_sent_at TIMESTAMPTZ,
      court_letter_ref VARCHAR(60),
      court_letter_body TEXT,
      court_letter_doc JSONB,
      court_letter_issued_at TIMESTAMPTZ,
      court_letter_sent_at TIMESTAMPTZ,
      customer_acknowledged_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[MIGRATE] escalation_cases ready.');

  // 2. Columns added after the original table shipped. ADD COLUMN IF NOT EXISTS
  //    keeps this a no-op on databases that already have them.
  const addedColumns = [
    ['warning_period_days', 'INT NOT NULL DEFAULT 7'],
    ['court_letter_ref', 'VARCHAR(60)'],
    ['court_letter_body', 'TEXT'],
    ['court_letter_doc', 'JSONB'],
    ['court_letter_issued_at', 'TIMESTAMPTZ'],
    ['customer_acknowledged_at', 'TIMESTAMPTZ']
  ];

  for (const [column, definition] of addedColumns) {
    await db.run(`ALTER TABLE escalation_cases ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
    console.log(`[MIGRATE] escalation_cases.${column} ensured.`);
  }

  // 2b. Backfill the issue timestamp for letters that were issued before the
  //     column existed. Those letters were published and notified in one step,
  //     so their issue date is the send date. Without this they would look
  //     un-published on the customer portal and would be re-issued with a fresh
  //     reference number, which for a legal notice is not acceptable.
  const backfilled = await db.run(`
    UPDATE escalation_cases
    SET court_letter_issued_at = court_letter_sent_at
    WHERE court_letter_issued_at IS NULL
      AND court_letter_sent_at IS NOT NULL
      AND court_letter_doc IS NOT NULL
  `);
  console.log(`[MIGRATE] Backfilled court_letter_issued_at on ${backfilled.rowCount} existing letter(s).`);

  // 3. Indexes. The due-date one backs the daily overdue sweep, which would
  //    otherwise full-scan credit_transactions on every run.
  const indexes = [
    ['idx_escalation_cases_customer', 'escalation_cases(customer_id)'],
    ['idx_escalation_cases_merchant', 'escalation_cases(merchant_id)'],
    ['idx_escalation_cases_status', 'escalation_cases(status)'],
    ['idx_credit_transactions_due', 'credit_transactions(due_date, status)']
  ];

  for (const [name, target] of indexes) {
    await db.run(`CREATE INDEX IF NOT EXISTS ${name} ON ${target}`);
    console.log(`[MIGRATE] index ${name} ensured.`);
  }

  // 4. Allow COURT_LETTER in sms_notifications.type so a legal notice is not
  //    filed as a routine overdue nudge. Rebuilding the CHECK is the only way
  //    to widen an existing constraint, and the IF EXISTS guard keeps this safe
  //    on databases that predate the table.
  await db.run(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sms_notifications') THEN
        ALTER TABLE sms_notifications DROP CONSTRAINT IF EXISTS sms_notifications_type_check;
        ALTER TABLE sms_notifications ADD CONSTRAINT sms_notifications_type_check
          CHECK (type IN ('CREDIT_ISSUED', 'REMINDER', 'OVERDUE_ALERT', 'PAYMENT_RECEIPT', 'COURT_LETTER'));
      END IF;
    END $$;
  `);
  console.log('[MIGRATE] sms_notifications.type now accepts COURT_LETTER.');

  // 5. Widen sms_notifications.status to include PENDING. The send path writes a
  //    notification row before attempting delivery, then updates it once the
  //    gateway answers. Without PENDING there is no honest value to record for
  //    that in-flight window: SIMULATED would falsely claim a simulated send, and
  //    DELIVERED would claim delivery that has not happened yet.
  await db.run(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sms_notifications') THEN
        ALTER TABLE sms_notifications DROP CONSTRAINT IF EXISTS sms_notifications_status_check;
        ALTER TABLE sms_notifications ADD CONSTRAINT sms_notifications_status_check
          CHECK (status IN ('PENDING', 'SIMULATED', 'DELIVERED', 'FAILED'));
      END IF;
    END $$;
  `);
  console.log('[MIGRATE] sms_notifications.status now accepts PENDING.');

  console.log('[MIGRATE] Debt escalation migration completed successfully.');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[MIGRATE ERROR]', err.message);
    process.exit(1);
  });
