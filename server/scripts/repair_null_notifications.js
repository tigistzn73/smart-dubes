// One-off: repair sms_notifications rows whose customer_id was nulled by
// ON DELETE SET NULL, by matching phone back to customer_profiles.
const db = require('../src/config/database');

function digits(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('251')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d.slice(-9);
}

(async () => {
  const nulls = await db.all('SELECT id, customer_id, phone, type, sent_at FROM sms_notifications WHERE customer_id IS NULL');
  console.log('NULL customer_id rows:', nulls.length);
  for (const n of nulls) console.log('  id=' + n.id, n.phone, n.type, String(n.sent_at).slice(0, 10));

  const profiles = await db.all('SELECT id, phone, full_name FROM customer_profiles');
  const byPhone = {};
  for (const p of profiles) {
    const k = digits(p.phone);
    if (!byPhone[k]) byPhone[k] = [];
    byPhone[k].push(p);
  }

  let fixed = 0, unmatched = 0;
  for (const n of nulls) {
    const digits = String(n.phone || '').replace(/\D/g, '').replace(/^251/, '').replace(/^0/, '');
    const tail = digits.slice(-9);
    const cands = (profiles.filter((p) => String(p.phone || '').replace(/\D/g, '').endsWith(tail)))
      // Prefer a profile that already existed when the message was written.
      .sort((a, b) => {
        const aOk = new Date(a.created_at) <= new Date(n.sent_at) ? 0 : 1;
        const bOk = new Date(b.created_at) <= new Date(n.sent_at) ? 0 : 1;
        if (aOk !== bOk) return aOk - bOk;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    if (cands.length >= 1) {
      await db.run('UPDATE sms_notifications SET customer_id = $1 WHERE id = $2', [cands[0].id, n.id]);
      console.log(`  REPAIRED id=${n.id} -> customer ${cands[0].id} (${cands[0].full_name})`);
      fixed++;
    } else {
      console.log(`  UNMATCHED id=${n.id} phone=${n.phone} (${cands.length} candidates)`);
      unmatched++;
    }
  }
  console.log(`Done. repaired=${fixed} unmatched=${unmatched}`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
