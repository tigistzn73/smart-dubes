// Idempotent migration for soft-delete / dismiss columns.
//
// The ledger must never hard-delete financial history, so deletion is done by
// stamping a timestamp and filtering it out of reads:
//
//   merchants.deleted_at        - admin removes a merchant; their ledger stays
//                                 for audit but disappears from every view.
//   customer_profiles.deleted_at- merchant (or admin) removes a customer
//                                 profile that has no outstanding balance.
//   sms_notifications.dismissed_at - a customer hides a notification from
//                                 their own portal; the merchant's SMS log
//                                 and the audit trail keep the row.
//
// customer_schedules needs no new column: its status column already carries
// ACTIVE / COMPLETED / SUPERSEDED, and cancelling a plan writes CANCELLED.
//
// schema.sql only issues CREATE TABLE IF NOT EXISTS, so an already-deployed
// database is untouched by re-running it; this script closes that gap and is
// safe to run repeatedly.
//
//   node src/db/migrate_soft_delete.js

const db = require('../config/database');

async function migrate() {
  console.log('[MIGRATE] Ensuring soft-delete columns exist...');

  await db.run(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchants') THEN
        ALTER TABLE merchants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_profiles') THEN
        ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sms_notifications') THEN
        ALTER TABLE sms_notifications ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
      END IF;
    END $$;
  `);
  console.log('[MIGRATE] merchants.deleted_at, customer_profiles.deleted_at, sms_notifications.dismissed_at ensured.');

  // Deleted rows are excluded from every list query, so these partial indexes
  // keep the live-set lookups cheap without indexing the tombstones.
  await db.run('CREATE INDEX IF NOT EXISTS idx_merchants_live ON merchants(id) WHERE deleted_at IS NULL');
  await db.run('CREATE INDEX IF NOT EXISTS idx_customer_profiles_live ON customer_profiles(merchant_id) WHERE deleted_at IS NULL');
  await db.run('CREATE INDEX IF NOT EXISTS idx_sms_notifications_live ON sms_notifications(phone) WHERE dismissed_at IS NULL');
  console.log('[MIGRATE] partial live-row indexes ensured.');

  const rows = await db.all(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE (table_name, column_name) IN (
      ('merchants', 'deleted_at'),
      ('customer_profiles', 'deleted_at'),
      ('sms_notifications', 'dismissed_at')
    )
    ORDER BY table_name
  `);

  console.log('[MIGRATE] Verified columns:', rows);
  console.log('[MIGRATE] Soft-delete migration completed successfully.');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[MIGRATE ERROR]', err.message);
    process.exit(1);
  });
