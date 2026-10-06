// Fetches the dashboard payload and runs the portal's exact store-filter logic
// (CustomerPortal.jsx:1152-1159) for every pill value, printing clause results.
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = require('../src/app');

const clientFilter = (pendingTransactions, profiles, filter) => {
  if (filter === 'ALL') return pendingTransactions;
  return pendingTransactions.filter(tx => {
    const selectedProf = profiles.find(p => String(p.merchant_id) === String(filter));
    const c1 = !!(tx.merchant_id && String(tx.merchant_id) === String(filter));
    const c2 = !!(selectedProf && tx.customer_id === selectedProf.id);
    const c3 = !!(selectedProf && tx.store_name === selectedProf.store_name);
    console.log(`    tx ${tx.id} merchant_id=${JSON.stringify(tx.merchant_id)} customer_id=${JSON.stringify(tx.customer_id)} store=${JSON.stringify(tx.store_name)} | c1=${c1} c2=${c2} c3=${c3} => ${c1 || c2 || c3}`);
    return c1 || c2 || c3;
  });
};

(async () => {
  const db = require('../src/config/database');
  const users = await db.all(`
    SELECT DISTINCT u.id, u.full_name FROM users u
    JOIN customer_profiles cp ON cp.user_id = u.id
    WHERE u.role = 'CUSTOMER'
  `);

  const server = app.listen(0, async () => {
    const port = server.address().port;
    try {
      for (const u of users) {
        const user = await db.get('SELECT id, full_name, phone, role FROM users WHERE id = $1', [u.id]);
        const token = jwt.sign(
          { id: user.id, fullName: user.full_name, phone: user.phone, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: '10m' }
        );
        const res = await fetch(`http://127.0.0.1:${port}/api/customer/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const pending = (data.transactions || []).filter(t => t.status !== 'SETTLED');
        const profiles = data.profiles || [];
        if (!pending.length) continue;
        console.log(`\n=== user ${u.id} (${u.full_name}) | pending=${pending.length} profiles=${profiles.length} ===`);
        for (const p of profiles) {
          const pill = String(p.merchant_id);
          console.log(`  pill=${pill} (${p.store_name})`);
          const shown = clientFilter(pending, profiles, pill);
          console.log(`    => shows ${shown.length}/${pending.length}`);
        }
        console.log(`  pill=ALL => shows ${clientFilter(pending, profiles, 'ALL').length}/${pending.length}`);
      }
    } catch (e) {
      console.error('ERR', e);
    } finally {
      server.close();
      process.exit(0);
    }
  });
})().catch((e) => { console.error('ERR', e); process.exit(1); });
