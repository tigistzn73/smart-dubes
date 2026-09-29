const db = require('../config/database');

async function createSchedulesTable() {
  try {
    await db.run(`
      CREATE TABLE IF NOT EXISTS customer_schedules (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        user_id INTEGER,
        total_amount NUMERIC(12,2) NOT NULL,
        frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
        salary_day INTEGER NOT NULL,
        duration_months INTEGER NOT NULL DEFAULT 2,
        installments_json TEXT NOT NULL,
        transaction_id INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ customer_schedules table created successfully!');
  } catch (err) {
    console.error('Failed to create customer_schedules table:', err);
  } finally {
    process.exit(0);
  }
}

createSchedulesTable();
