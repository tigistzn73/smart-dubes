// Why is the password-reset OTP not reaching the customer by email?
//
//   node scripts/diagnose_email_otp.js
//
// Checks the three independent reasons delivery can fail, and reports each one
// separately instead of stopping at the first:
//
//   1. Does the account actually have an email on file?
//      getMe/forgotPassword read users.email. If it is NULL or blank the email
//      branch is skipped entirely and the code silently goes out by SMS, which
//      looks identical to "the email did not arrive".
//   2. Is SMTP configured? Without SMTP_PASS the service runs in SIMULATION:
//      the message is logged and the code is returned in the API response, so
//      nothing is ever delivered.
//   3. Can the SMTP host actually be reached and does it accept the credentials?
//      Only attempted when SMTP_PASS is present.
//
// Email addresses and phone numbers are masked in the output.

require('dotenv').config();
const path = require('path');
const net = require('net');

const { Pool } = require('pg');
require(path.resolve(__dirname, '..', 'src', 'config', 'db'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskEmail(e) {
  if (!e) return '(none)';
  const [local, domain] = String(e).split('@');
  if (!domain) return '(malformed)';
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}
function maskPhone(p) {
  const s = String(p || '');
  return s.length <= 4 ? '***' : `${'*'.repeat(s.length - 4)}${s.slice(-4)}`;
}

const problems = [];
const notes = [];

async function checkAccounts() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.role, u.phone, u.email, u.full_name
      FROM users u
      ORDER BY u.role, u.id
    `);
    console.log(`\n=== 1. Accounts in the database (${rows.length}) ===`);
    console.table(
      rows.map((r) => ({
        id: r.id,
        role: r.role,
        name: r.full_name,
        phone: maskPhone(r.phone),
        email: maskEmail(r.email),
        email_ok: r.email && EMAIL_RE.test(r.email) ? 'YES' : 'NO  <-- unusable'
      }))
    );

    const bad = rows.filter((r) => !r.email || !EMAIL_RE.test(r.email));
    if (bad.length) {
      problems.push(
        `${bad.length} of ${rows.length} accounts have no usable email (ids ${bad.map((r) => r.id).join(', ')}). ` +
          'These accounts can never receive an email OTP; the code silently falls back to SMS.'
      );
    } else {
      notes.push(`All ${rows.length} accounts have a valid email address.`);
    }

    // The columns the OTP flow writes to must exist, or the UPDATE throws and the
    // request 500s before any delivery is attempted.
    const { rows: cols } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name LIKE 'reset_token%'
      ORDER BY column_name
    `);
    const names = cols.map((c) => c.column_name);
    const need = ['reset_token', 'reset_token_expires', 'reset_token_sent_at', 'reset_token_attempts'];
    const missing = need.filter((n) => !names.includes(n));
    console.log(`\nreset_token* columns present: ${names.join(', ') || '(none)'}`);
    if (missing.length) {
      problems.push(
        `Missing column(s): ${missing.join(', ')}. The OTP update will fail. ` +
          'Run: npm run migrate:auth-lockout'
      );
    } else {
      notes.push('All OTP columns exist, so the code can be stored.');
    }

    const { rows: nulls } = await pool.query(
      `SELECT count(*)::int AS n FROM users WHERE email IS NULL`
    );
    console.log(`rows with NULL email: ${nulls[0].n}`);
  } finally {
    await pool.end();
  }
}

async function checkSmtpConfig() {
  console.log('\n=== 2. SMTP configuration ===');
  const host = process.env.SMTP_HOST || '';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.EMAIL_FROM || '';
  const port = process.env.SMTP_PORT || '587';

  console.log(`SMTP_HOST  = ${host || '(unset)'}`);
  console.log(`SMTP_PORT  = ${port}`);
  console.log(`SMTP_USER  = ${user ? maskEmail(user) : '(unset)'}`);
  console.log(`SMTP_PASS  = ${pass ? `(set, ${pass.length} chars)` : '(unset)'}`);
  console.log(`EMAIL_FROM = ${from || '(unset)'}`);

  if (!host || !user || !pass || !from) {
    problems.push(
      'SMTP is not fully configured, so the email service is in SIMULATION mode: nothing is sent, ' +
        'the code is printed to the server log and returned in the API response instead.'
    );
    return null;
  }
  notes.push('SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM are all set.');
  return { host, port: Number(port), user, pass };
}

function checkReachable(cfg) {
  return new Promise((resolve) => {
    console.log(`\n=== 3. Connecting to ${cfg.host}:${cfg.port} ===`);
    const socket = new net.Socket();
    let settled = false;
    const done = (err, banner) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ err, banner });
    };
    socket.setTimeout(10000);
    socket.on('timeout', () => done(new Error('timed out after 10s')));
    socket.on('error', (e) => done(e));
    socket.on('data', (buf) => {
      const banner = buf.toString('utf8').trim();
      if (banner.startsWith('220')) done(null, banner);
    });
    socket.connect(cfg.port, cfg.host, () => console.log('  TCP connection opened, waiting for banner...'));
  });
}

async function main() {
  console.log('Diagnosing password-reset OTP email delivery.');

  try {
    await checkAccounts();
  } catch (err) {
    problems.push(`Could not query the database: ${err.message}`);
  }

  const cfg = await checkSmtpConfig();

  if (cfg) {
    const { err, banner } = await checkReachable(cfg);
    if (err) {
      problems.push(`Cannot reach the SMTP host: ${err.message}`);
    } else {
      console.log(`  Banner: ${banner}`);
      notes.push('The SMTP host is reachable and greeted us.');
      console.log(
        '\n  Credentials were not tested. AUTH needs a live handshake, which the\n' +
          '  real send below performs.'
      );
    }
  }

  if (cfg) {
    console.log('\n=== 4. Attempting a real send ===');
    const to = process.env.SMTP_TEST_TO || user2(cfg.user);
    try {
      const { sendOtpEmail } = require(path.resolve(__dirname, '..', 'src', 'services', 'emailService'));
      const res = await sendOtpEmail({
        to,
        fullName: 'Smart Dube Delivery Check',
        otpCode: '123456',
        expiresInMinutes: 5
      });
      console.log(`  To:      ${maskEmail(to)}`);
      console.log(`  Result:  success=${res.success} simulated=${!!res.simulated}`);
      if (res.messageId) console.log(`  Message: ${res.messageId}`);
      if (res.error) console.log(`  Error:   ${res.error}`);
      if (res.simulated) {
        problems.push('The service still reports SIMULATION, so SMTP_PASS is not being picked up by this process.');
      } else if (res.success) {
        notes.push(`A real email was accepted by the relay for ${maskEmail(to)}. Check that inbox, including Spam.`);
      } else {
        problems.push(`The relay rejected the send: ${res.error}`);
      }
    } catch (err) {
      problems.push(`Send threw: ${err.message}`);
    }
  }

  console.log('\n================ SUMMARY ================');
  if (notes.length) {
    console.log('\nWorking:');
    notes.forEach((n) => console.log(`  + ${n}`));
  }
  if (problems.length) {
    console.log('\nBroken:');
    problems.forEach((p) => console.log(`  ! ${p}`));
  } else {
    console.log('\nNothing found to fix: the path from account to inbox is intact.');
  }
}

function user2(u) {
  return u;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});