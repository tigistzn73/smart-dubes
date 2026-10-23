const db = require('./server/src/config/database');
(async () => {
  const logs = await db.all(
    `SELECT id, user_id, action, resource, details_json, created_at FROM audit_logs
     WHERE (resource ILIKE '%Zemero%' OR details_json ILIKE '%Zemero%' OR resource LIKE 'Merchant #4%' OR details_json LIKE '%"merchantId":4%')
       AND created_at > '2026-09-30T13:03:20Z'
     ORDER BY created_at`
  );
  console.log('post-backup audit entries for Zemero:', logs.length);
  for (const l of logs) console.log(l.created_at, l.action, l.resource, l.details_json.slice(0, 180));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
