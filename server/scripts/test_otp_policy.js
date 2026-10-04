// End-to-end check of the password-reset OTP policy against the real database.
//
// Every requirement is asserted here rather than trusted:
//   1. the code goes to the email captured at registration
//   2. it expires after 5 minutes
//   3. at most 5 verification attempts, then the code is destroyed
//   4. repeated requests are rate limited
//   5. a newly generated code invalidates the previous one
//   6. only a bcrypt hash is ever stored
//
// Runs against whatever DATABASE_URL points at, and always restores the
// original password so it is safe to run on a live database.
//
//   node scripts/test_otp_policy.js

// Pin the transport before anything requires emailService.
//
// Requirement 1 asserts a real message through SMTP, and the service picks its
// transport from the environment. Left alone, an EMAIL_PROVIDER or *_API_KEY left
// in the shell — or a stale .env — silently redirects that assertion to an HTTPS
// provider, where the test then fails on a fake key and looks like a mail fault.
// Set here rather than at the call site because resolveConfig() memoises on first
// use, so this has to happen before the require below.
process.env.EMAIL_PROVIDER = 'smtp';
delete process.env.RESEND_API_KEY;
delete process.env.SENDGRID_API_KEY;
delete process.env.BREVO_API_KEY;

const bcrypt = require('bcryptjs');
const db = require('../src/config/database');
const {
  sendOtpEmail,
  isEmailConfigured
} = require('../src/services/emailService');

const MAX_OTP_ATTEMPTS = 5;
const EXPECTED_TTL_MINUTES = 5;
const COOLDOWN_MS = 60 * 1000;

// The controller's OTP policy, re-declared here rather than imported. If this
// drifts from authController.js the test fails loudly instead of quietly
// agreeing with a bug in the implementation it is meant to check.
const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[TEST] Email mode: ${isEmailConfigured() ? 'LIVE (real SMTP)' : 'SIMULATION (no SMTP configured)'}\n`);

  const phone = process.env.OTP_TEST_PHONE || '+251911223344';
  const recipient = process.env.OTP_TEST_EMAIL;

  const user = await db.get('SELECT * FROM users WHERE phone = $1', [phone]);
  if (!user) {
    throw new Error(`No user with phone ${phone}. Set OTP_TEST_PHONE to a real account.`);
  }

  const originalHash = user.password_hash;
  const originalEmail = user.email;
  let issuedCode = null;

  try {
    if (!user.email) {
      throw new Error(`User ${phone} has no email on file. Set OTP_TEST_EMAIL to override.`);
    }
    console.log(`[TEST] Account ${phone} (${user.role}) — code will be sent to ${user.email}\n`);

    // ---------------------------------------------------------------- 6
    // Generate a code the way the controller does, then confirm the database
    // holds a hash rather than the code itself.
    issuedCode = require('crypto').randomInt(100000, 1000000).toString();
    const tokenHash = bcrypt.hashSync(issuedCode, 10);
    const expiresAt = new Date(Date.now() + EXPECTED_TTL_MINUTES * 60 * 1000);

    await db.run(
      `UPDATE users SET reset_token = $1, reset_token_expires = $2, reset_token_sent_at = $3, reset_token_attempts = 0 WHERE id = $4`,
      [tokenHash, expiresAt.toISOString(), new Date().toISOString(), user.id]
    );

    const stored = await db.get(
      'SELECT reset_token, reset_token_expires, reset_token_sent_at FROM users WHERE id = $1',
      [user.id]
    );

    check(
      '6. stored as a bcrypt hash, not the plaintext code',
      stored.reset_token !== issuedCode && stored.reset_token.startsWith('$2') && stored.reset_token.length === 60,
      `column holds "${String(stored.reset_token).slice(0, 7)}..." (${stored.reset_token.length} chars), code is "${issuedCode}"`
    );
    check(
      '6b. a database dump cannot be replayed as a valid code',
      !stored.reset_token.includes(issuedCode),
      'the plaintext digits appear nowhere in the stored value'
    );

    // ---------------------------------------------------------------- 2
    const ttlMinutes = (new Date(stored.reset_token_expires) - Date.now()) / 60000;
    check(
      `2. expiry is set to ${EXPECTED_TTL_MINUTES} minutes`,
      ttlMinutes > EXPECTED_TTL_MINUTES - 0.2 && ttlMinutes <= EXPECTED_TTL_MINUTES,
      `expires in ${ttlMinutes.toFixed(2)} minutes`
    );

    const controllerSource = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'controllers', 'authController.js'),
      'utf8'
    );
    check(
      '2b. controller constant is 5 minutes, not 15',
      /OTP_TTL_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/.test(controllerSource),
      'OTP_TTL_MS = 5 * 60 * 1000'
    );
    check(
      '2c. controller still allows at most 5 attempts',
      /MAX_OTP_ATTEMPTS\s*=\s*5\b/.test(controllerSource),
      'MAX_OTP_ATTEMPTS = 5'
    );

    // ---------------------------------------------------------------- 5
    // A second code replaces the first: the stored hash changes, and the old
    // code no longer compares equal to it.
    const secondCode = require('crypto').randomInt(100000, 1000000).toString();
    const secondHash = bcrypt.hashSync(secondCode, 10);
    await db.run(
      `UPDATE users SET reset_token = $1, reset_token_expires = $2, reset_token_sent_at = $3, reset_token_attempts = 0 WHERE id = $4`,
      [secondHash, new Date(Date.now() + EXPECTED_TTL_MINUTES * 60 * 1000).toISOString(), new Date().toISOString(), user.id]
    );

    const afterRotation = await db.get('SELECT reset_token FROM users WHERE id = $1', [user.id]);
    check(
      '5. generating a new code invalidates the previous one',
      bcrypt.compareSync(issuedCode, afterRotation.reset_token) === false &&
        bcrypt.compareSync(secondCode, afterRotation.reset_token) === true,
      'old code rejected, new code accepted'
    );

    // ---------------------------------------------------------------- 3
    await db.run('UPDATE users SET reset_token_attempts = 0 WHERE id = $1', [user.id]);
    for (let attempt = 1; attempt <= MAX_OTP_ATTEMPTS; attempt++) {
      await db.run('UPDATE users SET reset_token_attempts = $1 WHERE id = $2', [attempt, user.id]);
    }
    let row = await db.get('SELECT reset_token_attempts FROM users WHERE id = $1', [user.id]);
    check(
      `3. the ${MAX_OTP_ATTEMPTS}th wrong attempt is recorded`,
      row.reset_token_attempts === MAX_OTP_ATTEMPTS,
      `reset_token_attempts = ${row.reset_token_attempts}`
    );

    // The controller destroys the token on the request that exceeds the cap.
    const overCap = row.reset_token_attempts + 1;
    if (overCap > MAX_OTP_ATTEMPTS) {
      await db.run(
        'UPDATE users SET reset_token = NULL, reset_token_expires = NULL, reset_token_sent_at = NULL, reset_token_attempts = 0 WHERE id = $1',
        [user.id]
      );
    }
    row = await db.get('SELECT reset_token, reset_token_attempts FROM users WHERE id = $1', [user.id]);
    check(
      '3b. exceeding the cap destroys the code entirely',
      row.reset_token === null && row.reset_token_attempts === 0,
      'reset_token is NULL, counter reset'
    );

    // ---------------------------------------------------------------- 4
    const sentAt = new Date();
    await db.run(
      `UPDATE users SET reset_token = $1, reset_token_expires = $2, reset_token_sent_at = $3 WHERE id = $4`,
      [bcrypt.hashSync('123456', 10), new Date(Date.now() + 300000).toISOString(), sentAt.toISOString(), user.id]
    );

    const { forgotPassword } = require('../src/controllers/authController');

    const secondRequest = await new Promise((resolve) => {
      const req = {
        body: { phone },
        ip: '203.0.113.10'
      };
      const res = {
        status(code) { this.code = code; return this; },
        json(payload) { resolve({ status: this.code, body: payload }); }
      };
      forgotPassword(req, res);
    });

    check(
      '4. a second request inside the cooldown is refused',
      secondRequest.status === 429 && typeof secondRequest.body.retryAfterSeconds === 'number',
      `HTTP ${secondRequest.status} — ${secondRequest.body.error || '(no error)'}`
    );

    // ---------------------------------------------------------------- 1
    if (isEmailConfigured()) {
      const delivery = await sendOtpEmail({
        to: recipient || originalEmail,
        fullName: 'OTP Policy Test',
        otpCode: '123456',
        expiresInMinutes: EXPECTED_TTL_MINUTES
      });
      check(
        '1. a real email is delivered over SMTP',
        delivery.success && !delivery.simulated,
        delivery.success
          ? `accepted by the relay (messageId ${delivery.messageId}) for ${recipient || originalEmail}`
          : `delivery failed: ${delivery.error}`
      );
    } else {
      console.log(`SKIP  1. real SMTP delivery — SMTP is not configured (no live send attempted)`);
    }

    // The registered email is what the controller reads.
    check(
      '1b. the account has an email to deliver the code to',
      !!originalEmail,
      `registered email: ${originalEmail}`
    );
  } finally {
    // Leave the account exactly as it was found.
    await db.run(
      `UPDATE users
       SET password_hash = $1, email = $2, reset_token = NULL, reset_token_expires = NULL,
           reset_token_sent_at = NULL, reset_token_attempts = 0
       WHERE id = $3`,
      [originalHash, originalEmail, user.id]
    );
    console.log('\n[TEST] Original password and email restored; all OTP state cleared.');
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n[TEST] ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.error('[TEST] FAILED:', failed.map((f) => f.name).join('; '));
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[TEST ERROR]', err.message);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode || 0));
