const db = require('../config/database');

// Adds the merchant settlement (bank) account columns. Safe to run repeatedly
// because every column is added with IF NOT EXISTS, so existing rows and any
// data already stored in merchants are left untouched.
async function addMerchantBankAccounts() {
  try {
    await db.run('ALTER TABLE merchants ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100)');
    await db.run('ALTER TABLE merchants ADD COLUMN IF NOT EXISTS account_name VARCHAR(200)');
    await db.run('ALTER TABLE merchants ADD COLUMN IF NOT EXISTS account_number VARCHAR(50)');
    console.log('✓ merchants bank account columns are ready (bank_name, account_name, account_number)');
  } catch (err) {
    console.error('Failed to add merchants bank account columns:', err.message);
  } finally {
    process.exit(0);
  }
}

addMerchantBankAccounts();
