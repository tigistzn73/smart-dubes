// Boots the app once and dumps dashboard summary for every user that owns an
// active schedule, to find which account renders an empty receipt list.
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = require('../src/app');

(async () => {
  const db = require('../src/config/database');
  const users = await db.all(`
    SELECT DISTINCT cs.user_id AS id, u.full_name, u.phone, u.role
    FROM customer_schedules cs
    JOIN users u ON u.id = cs.user_id
    WHERE cs.status = 'ACTIVE'
  `);

  const server = app.listen(0, async () => {
    const port = server.address().port;
    try {
      for (const u of users) {
        const token = jwt.sign(
          { id: u.id, fullName: u.full_name, phone: u.phone, role: u.role },
          process.env.JWT_SECRET,
          { expiresIn: '10m' }
        );
        const res = await fetch(`http://127.0.0.1:${port}/api/customer/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const txs = data.transactions || [];
        console.log(
          `user ${u.id} (${u.full_name}) | HTTP ${res.status} | profiles: ${(data.profiles || []).length}` +
          ` | transactions: ${txs.length} | pending: ${txs.filter(t => t.status !== 'SETTLED').length}` +
          ` | activeSchedules: ${(data.activeSchedules || []).length}` +
          (data.error ? ` | ERROR: ${data.error}` : '')
        );
      }
    } catch (e) {
      console.error('ERR', e);
    } finally {
      server.close();
      process.exit(0);
    }
  });
})().catch((e) => { console.error('ERR', e); process.exit(1); });
