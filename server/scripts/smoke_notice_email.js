// Forces email into SIMULATION so nothing leaves the machine, exercises the
// full sendSMS -> mirrorToEmail pipeline against a real customer row, then
// removes the test notification so nothing shows up on the customer's page.
process.env.EMAIL_PROVIDER = 'smtp';
process.env.SMTP_HOST = '';
process.env.RESEND_API_KEY = '';
process.env.SENDGRID_API_KEY = '';
process.env.BREVO_API_KEY = '';

const db = require('../src/config/database');
const smsService = require('../src/services/smsService');

(async () => {
  const customer = await db.get(`
    SELECT cp.id, cp.full_name, cp.phone, u.email
    FROM customer_profiles cp
    LEFT JOIN users u ON u.id = cp.user_id
    ORDER BY cp.id
    LIMIT 1
  `);
  if (!customer) {
    console.log('No customer profile found — nothing to test.');
    process.exit(0);
  }
  console.log('Test customer:', JSON.stringify(customer));

  const result = await smsService.sendSMS({
    customerId: customer.id,
    phone: customer.phone,
    message: `[Smart Dube] Welcome ${customer.full_name}! You have been registered for Dube credit at Test Store with a max limit of 5000.00 ETB.`,
    type: 'CREDIT_ISSUED'
  });
  console.log('sendSMS result:', JSON.stringify(result));

  // Give the fire-and-forget email mirror a moment to finish logging.
  await new Promise((r) => setTimeout(r, 3000));

  if (result.notificationId) {
    await db.run('DELETE FROM sms_notifications WHERE id = $1', [result.notificationId]);
    console.log('Cleaned up test notification row', result.notificationId);
  }
  process.exit(0);
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
