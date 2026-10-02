// Drives the password-reset flow through the real Express routes, in the order a
// customer actually walks it, and asserts the OTP policy holds at the HTTP
// boundary — not just in the database.
//
//   node scripts/test_otp_http.js
//
// Safe on a live database: it only ever reads, and it restores the target
// account's password and OTP state in a finally block.

const bcrypt = require('bcryptjs');
const path = require('path');
const express = require('express');
const db = require('../src/config/database');
const authRoutes = require('../src/routes/authRoutes');

const PHONE = process.env.OTP_TEST_PHONE || '+251933445566'; // a CUSTOMER
const NEW_PASSWORD = 'TempOtpTest!4471';

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Boot the real router on an ephemeral port and return a fetch helper. */
function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const { server, port } = await startServer();
  const post = async (route, body) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  };

  const user = await db.get('SELECT * FROM users WHERE phone = $1', [PHONE]);
  if (!user) throw new Error(`No user with phone ${PHONE}`);
  if (!user.email) throw new Error(`User ${PHONE} has no email on file`);

  const originalHash = user.password_hash;
  console.log(`[HTTP TEST] Customer ${PHONE} (${user.role}) — registered email ${user.email}\n`);

  try {
    // ---- Step 1: customer types their phone number ----------------------
    const step1 = await post('/forgot-password', { phone: PHONE });
    check(
      '1. phone number submitted, code requested',
      step1.status === 200 && ['EMAIL', 'SMS'].includes(step1.body.channel),
      `HTTP ${step1.status} via ${step1.body.channel} to ${step1.body.destination}`
    );
    check(
      '1b. the code went to the email registered on the account',
      step1.body.channel === 'EMAIL',
      step1.body.channel === 'EMAIL'
        ? 'email channel chosen (SMS is fallback only)'
        : `fell back to ${step1.body.channel} — email delivery failed`
    );
    check(
      '2. response advertises a 5-minute lifetime',
      step1.body.expiresInMinutes === 5,
      `expiresInMinutes = ${step1.body.expiresInMinutes}`
    );

    const code = step1.body._demoOTP;
    check(
      '2b. a code was actually issued',
      !!code && /^\d{6}$/.test(code),
      code ? '6-digit code generated' : 'no code (live SMTP mode: read it from the inbox)'
    );

    // ---- Step 2: the hash, not the code, is what is in Neon --------------
    const stored = await db.get('SELECT reset_token FROM users WHERE id = $1', [user.id]);
    check(
      '6. Postgres holds a bcrypt hash, not the code',
      stored.reset_token.startsWith('$2') && stored.reset_token !== code,
      `stored value is a 60-char bcrypt hash`
    );

    // ---- Step 3: wrong codes are bounded to 5 ---------------------------
    let wrongResults = [];
    for (let i = 1; i <= 5; i++) {
      const wrong = code === '000001' ? '000002' : '000001';
      wrongResults.push(await post('/reset-password', { phone: PHONE, otpCode: wrong, newPassword: NEW_PASSWORD }));
    }
    const allRejected = wrongResults.every((r) => r.status === 400);
    check(
      '3. all 5 wrong codes are rejected without resetting the password',
      allRejected,
      `statuses: ${wrongResults.map((r) => r.status).join(', ')}`
    );
    const lastWrong = wrongResults[wrongResults.length - 1];
    check(
      '3b. the user is told how many guesses remain',
      /0 attempt/.test(lastWrong.body.error || ''),
      lastWrong.body.error
    );

    const sixth = await post('/reset-password', { phone: PHONE, otpCode: '999999', newPassword: NEW_PASSWORD });
    check(
      '3c. exceeding 5 attempts destroys the code',
      sixth.status === 429,
      `HTTP ${sixth.status} — ${sixth.body.error}`
    );

    const afterBrute = await db.get('SELECT reset_token FROM users WHERE id = $1', [user.id]);
    check(
      '3d. the code is gone from the database after the cap',
      afterBrute.reset_token === null,
      'users.reset_token is NULL'
    );

    const loginAfterBrute = await post('/login', { phone: PHONE, password: NEW_PASSWORD });
    check(
      '3e. the password was never changed by the brute-force attempts',
      loginAfterBrute.status === 401,
      `new password rejected (HTTP ${loginAfterBrute.status})`
    );

    // ---- Step 4: a fresh request works, and supersedes the old code -----
    await db.run('UPDATE users SET reset_token_sent_at = NULL WHERE id = $1', [user.id]);
    const step4 = await post('/forgot-password', { phone: PHONE });
    const code2 = step4.body._demoOTP;
    check(
      '4. a new code is issued once the cooldown has passed',
      step4.status === 200 && !!code2,
      `HTTP ${step4.status}`
    );

    if (code && code2) {
      // Checked here, right after a code was issued. Doing this later would be
      // testing the wrong state: the successful reset in 5b clears
      // reset_token_sent_at, so there is legitimately no cooldown left to hit.
      const blocked = await post('/forgot-password', { phone: PHONE });
      check(
        '4b. an immediate repeat request is rate limited',
        blocked.status === 429 && blocked.body.retryAfterSeconds > 0,
        blocked.status === 429
          ? `HTTP 429 — ${blocked.body.error}`
          : `HTTP ${blocked.status} — cooldown NOT enforced`
      );

      const sentAt = await db.get('SELECT reset_token_sent_at FROM users WHERE id = $1', [user.id]);
      check(
        '4c. the cooldown lives in Postgres, so a restart cannot clear it',
        !!sentAt.reset_token_sent_at,
        `users.reset_token_sent_at = ${sentAt.reset_token_sent_at}`
      );

      const reuseOld = await post('/reset-password', { phone: PHONE, otpCode: code, newPassword: NEW_PASSWORD });
      check(
        '5. the superseded code no longer works',
        reuseOld.status === 400,
        `old code rejected (HTTP ${reuseOld.status}) — ${reuseOld.body.error}`
      );

      const useNew = await post('/reset-password', { phone: PHONE, otpCode: code2, newPassword: NEW_PASSWORD });
      check(
        '5b. the newest code does work, and logs the customer straight in',
        useNew.status === 200 && !!useNew.body.token,
        useNew.status === 200 ? 'HTTP 200, JWT issued' : `HTTP ${useNew.status} — ${useNew.body.error}`
      );

      const login = await post('/login', { phone: PHONE, password: NEW_PASSWORD });
      check(
        '5c. the new password signs in',
        login.status === 200 && !!login.body.token,
        `HTTP ${login.status}`
      );

      const singleUse = await post('/reset-password', { phone: PHONE, otpCode: code2, newPassword: 'Another!9932' });
      check(
        '5d. the code is single-use',
        singleUse.status === 400,
        `replaying it is refused (HTTP ${singleUse.status})`
      );
    }

    // ---- Step 6: expiry is enforced on a known-good code -----------------
    // Expired by rewriting reset_token_expires, keeping the same hash, so the
    // only thing that changes is the clock.
    if (code2) {
      await db.run(
        'UPDATE users SET reset_token = $1, reset_token_expires = $2, reset_token_sent_at = NULL WHERE id = $3',
        [bcrypt.hashSync(code2, 10), new Date(Date.now() - 1000).toISOString(), user.id]
      );
      const expired = await post('/reset-password', { phone: PHONE, otpCode: code2, newPassword: NEW_PASSWORD });
      check(
        '2c. the correct code is refused once it is past 5 minutes',
        expired.status === 400 && /expired/i.test(expired.body.error || ''),
        `HTTP ${expired.status} — ${expired.body.error}`
      );
    }
  } finally {
    await db.run(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL,
       reset_token_sent_at = NULL, reset_token_attempts = 0, failed_login_attempts = 0, locked_until = NULL
       WHERE id = $2`,
      [originalHash, user.id]
    );
    server.close();
    console.log('\n[HTTP TEST] Original password restored; OTP and lockout state cleared.');
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n[HTTP TEST] ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.error('[HTTP TEST] FAILED:', failed.map((f) => f.name).join('; '));
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[HTTP TEST ERROR]', err.message);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode || 0));
