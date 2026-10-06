// Re-delivers the welcome notice for a customer as a real Brevo email, using
// the exact same message text that is on their Smart Dube page.
const db = require('../src/config/database');
const { sendNotificationEmail } = require('../src/services/emailService');

const CUSTOMER_ID = parseInt(process.argv[2] || '21', 10);

(async () => {
  const customer = await db.get(`
    SELECT cp.id, cp.full_name, cp.phone, cp.user_id, u.email
    FROM customer_profiles cp
    LEFT JOIN users u ON u.id = cp.user_id
    WHERE cp.id = $1
  `, [CUSTOMER_ID]);

  if (!customer) { console.error('No such customer.'); process.exit(1); }
  if (!customer.email) { console.error('Customer has no linked email address.'); process.exit(1); }

  const notice = await db.get(`
    SELECT message, type FROM sms_notifications
    WHERE customer_id = $1 ORDER BY sent_at DESC LIMIT 1
  `, [CUSTOMER_ID]);

  const message = notice
    ? notice.message
    : `[Smart Dube] Welcome ${customer.full_name}! You have been registered for Dube credit with a max limit of 5000.00 ETB.`;

  console.log(`Sending to ${customer.email} | type: ${notice ? notice.type : 'CREDIT_ISSUED'}`);
  const result = await sendNotificationEmail({
    to: customer.email,
    type: notice ? notice.type : 'CREDIT_ISSUED',
    message
  });
  console.log('result:', JSON.stringify(result));
  process.exit(result.success ? 0 : 1);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
