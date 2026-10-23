const db = require('./server/src/config/database');
(async () => {
  const u = await db.all("SELECT id, full_name, phone, email, role FROM users WHERE phone LIKE '%966601954%'");
  const c = await db.all("SELECT id, merchant_id, user_id, full_name, phone, fayda_id, credit_limit, current_balance, status, deleted_at, created_at FROM customer_profiles WHERE phone LIKE '%966601954%'");
  const s = await db.all("SELECT id, customer_id, phone, message, type, status, sent_at FROM sms_notifications WHERE phone LIKE '%966601954%' ORDER BY id");
  console.log('users:', u);
  console.log('profiles:', c);
  console.log('sms:', s);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
