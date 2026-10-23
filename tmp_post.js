const db = require('./server/src/config/database');
(async () => {
  const rows = await db.all(
    `SELECT s.id, s.sent_at, s.type FROM sms_notifications s
     WHERE s.customer_id IN (SELECT id FROM customer_profiles WHERE merchant_id=4)
       AND s.sent_at > '2026-09-30T13:03:20Z'
     ORDER BY s.sent_at`
  );
  console.log('post-backup Zemero SMS count:', rows.length);
  console.log('newest:', rows.slice(-5));
  const orphans = await db.all(`
    SELECT u.id, u.full_name FROM users u LEFT JOIN merchants m ON m.user_id=u.id
    WHERE u.role='MERCHANT' AND m.id IS NULL`);
  console.log('remaining orphan merchant users:', orphans);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
