// Idempotent migration: link a repayment to the specific schedule installment it
// settles. Receipt-upload payments are held as PENDING until the merchant
// approves or rejects them; the installment they cover must not flip to PAID at
// upload time. Storing installment_no lets approval mark exactly that installment
// PAID (and lets the customer see "Pending Review" until then). Safe to run
// repeatedly.
//
//   node src/db/migrate_repayment_installment.js

const db = require('../config/database');

async function migrate() {
  console.log('[MIGRATE] Ensuring repayments.installment_no column exists...');

  const exists = await db.get(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'repayments' AND column_name = 'installment_no'`
  );
  if (exists) {
    console.log('[MIGRATE] repayments.installment_no already exists — nothing to do.');
  } else {
    await db.run(`ALTER TABLE repayments ADD COLUMN installment_no INT`);
    console.log('[MIGRATE] Added repayments.installment_no INT.');
  }

  const schema = await db.get(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'repayments' AND column_name = 'installment_no'`
  );
  console.log('[MIGRATE] repayments.installment_no present:', Boolean(schema));
}

migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[MIGRATE] Failed:', err.message);
    process.exit(1);
  });