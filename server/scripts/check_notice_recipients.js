const db = require('../src/config/database');

(async () => {
  const rows = await db.all(`
    SELECT cp.id, cp.full_name, cp.phone, cp.user_id, cp.created_at,
           u.email AS linked_email, u.phone AS user_phone
    FROM customer_profiles cp
    LEFT JOIN users u ON u.id = cp.user_id
    ORDER BY cp.created_at DESC
    LIMIT 10
  `);
  console.log(JSON.stringify(rows, null, 2));

  const notif = await db.all(`
    SELECT id, customer_id, phone, type, status, sent_at, left(message, 60) AS message
    FROM sms_notifications
    ORDER BY sent_at DESC
    LIMIT 5
  `);
  console.log('recent notifications:', JSON.stringify(notif, null, 2));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
