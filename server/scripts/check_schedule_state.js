const db = require('../src/config/database');

(async () => {
  const schedules = await db.all(`
    SELECT cs.id, cs.user_id, cs.customer_id, cs.transaction_id, cs.status, cs.total_amount, cs.frequency,
           ct.status AS tx_status, ct.total_amount AS tx_amount, ct.transaction_ref
    FROM customer_schedules cs
    LEFT JOIN credit_transactions ct ON ct.id = cs.transaction_id
    ORDER BY cs.id DESC
    LIMIT 10
  `);
  console.log('schedules:', JSON.stringify(schedules, null, 2));

  const txs = await db.all(`
    SELECT id, transaction_ref, customer_id, merchant_id, total_amount, status, due_date
    FROM credit_transactions
    ORDER BY created_at DESC
    LIMIT 15
  `);
  console.log('transactions:', JSON.stringify(txs, null, 2));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
