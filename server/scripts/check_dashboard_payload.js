// Boots the Express app in-process, mints a token for the test user, and dumps
// the exact /api/customer/dashboard payload the portal renders from.
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = require('../src/app');

(async () => {
  const db = require('../src/config/database');
  const user = await db.get('SELECT id, full_name, phone, role FROM users WHERE id = $1', [55]);
  if (!user) { console.error('no user 55'); process.exit(1); }

  const token = jwt.sign(
    { id: user.id, fullName: user.full_name, phone: user.phone, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const server = app.listen(0, async () => {
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/customer/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      console.log('HTTP', res.status);
      console.log('transactions:', JSON.stringify((data.transactions || []).map(t => ({
        id: t.id, ref: t.transaction_ref, status: t.status, total: t.total_amount, remaining: t.remaining_amount, due: t.due_date
      })), null, 2));
      console.log('activeSchedules:', JSON.stringify((data.activeSchedules || []).map(s => ({
        id: s.id, transaction_id: s.transaction_id, merchant_id: s.merchant_id, customer_id: s.customer_id,
        store_name: s.store_name, status: s.status, installments: s.installments
      })), null, 2));
    } catch (e) {
      console.error('ERR', e);
    } finally {
      server.close();
      process.exit(0);
    }
  });
})().catch((e) => { console.error('ERR', e); process.exit(1); });
