// Confirms which email provider the service resolves to and, when it is
// Brevo, sends one real test message through the Brevo HTTPS API.
const emailService = require('../src/services/emailService');

(async () => {
  emailService.describeEmailConfig();
  const health = await emailService.verifyEmailConnection();
  console.log('verify:', JSON.stringify(health));

  const to = String(process.env.EMAIL_FROM || '').replace(/^.*<|>$/g, '').trim();
  if (!to) {
    console.log('No EMAIL_FROM address to test with.');
    process.exit(0);
  }
  const result = await emailService.sendTestEmail(to);
  console.log('test send:', JSON.stringify(result));
  process.exit(result.success ? 0 : 1);
})();
