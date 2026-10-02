// Sends one real password-reset email so SMTP can be verified before trusting
// it with a live password reset.
//
//   node scripts/test_email.js [recipient@example.com]
//
// Prints whether a real message left the machine or the service fell back to
// simulation. Never throws: a failure here should be a readable line, not a
// stack trace.

// dotenv is no longer required here: the service resolves its configuration on
// first use and loads .env itself, so it behaves identically no matter which
// module is required first. The explicit call is kept because it points dotenv
// at the server directory rather than the repository root, which is where .env
// actually lives when this script is run from scripts/.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sendOtpEmail, isEmailConfigured, describeEmailConfig } = require('../src/services/emailService');

const to = process.argv[2] || process.env.OTP_TEST_EMAIL || process.env.SMTP_USER;

(async () => {
  describeEmailConfig();

  if (!to) {
    console.error('[EMAIL TEST] No recipient. Pass one: node scripts/test_email.js someone@example.com');
    process.exit(1);
  }

  console.log(`[EMAIL TEST] Sending a test code to ${to}...`);

  const result = await sendOtpEmail({
    to,
    fullName: 'Smart Dube Test',
    otpCode: '123456',
    expiresInMinutes: 5
  });

  if (result.success && result.simulated) {
    console.log('[EMAIL TEST] SIMULATION — nothing was sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM in server/.env.');
    process.exit(2);
  }

  if (!result.success) {
    console.error(`[EMAIL TEST] FAILED — ${result.error}`);
    if (/auth|credential|password|535|534|invalid login/i.test(result.error || '')) {
      console.error('[EMAIL TEST] Gmail rejects the account password. Use an App Password:');
      console.error('[EMAIL TEST]   myaccount.google.com > Security > 2-Step Verification > App passwords');
    }
    process.exit(1);
  }

  console.log(`[EMAIL TEST] DELIVERED — accepted by the relay (messageId ${result.messageId}).`);
  console.log(`[EMAIL TEST] Check ${to}, including spam. Note that ${to} is the SENDING account when`);
  console.log('[EMAIL TEST] SMTP_USER equals the recipient, so check the other inbox in a real test.');
  process.exit(0);
})().catch((err) => {
  console.error('[EMAIL TEST] ERROR', err.message);
  process.exit(1);
});
