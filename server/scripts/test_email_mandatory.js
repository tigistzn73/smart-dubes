// Proves the mandatory-email rules are enforced by PostgreSQL, not just by the
// application layer — an application bug must not be able to create an account
// that cannot receive its own password-reset code.
//
// Every attempt below is expected to FAIL. A check that passes here means the
// database is not enforcing what it claims to.
//
//   node scripts/test_email_mandatory.js

const express = require('express');
const db = require('../src/config/database');
const authRoutes = require('../src/routes/authRoutes');

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

const post = (port, route, body) =>
  fetch(`http://127.0.0.1:${port}/api/auth${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

async function main() {
  const { server, port } = await startServer();

  // A phone number guaranteed not to collide with a real account.
  const freePhone = '+251090000001';
  let createdId = null;

  try {
    // ---- Application layer -------------------------------------------
    const noEmail = await post(port, '/register', {
      fullName: 'No Email Test', phone: freePhone, role: 'CUSTOMER', password: 'Valid123!'
    });
    check(
      '1. registration without an email is refused',
      noEmail.status === 400,
      `HTTP ${noEmail.status} — ${noEmail.body.error || JSON.stringify(noEmail.body.errors || '')}`
    );

    const blankEmail = await post(port, '/register', {
      fullName: 'Blank Email Test', phone: freePhone, role: 'CUSTOMER', password: 'Valid123!', email: '   '
    });
    check(
      '2. registration with a whitespace-only email is refused',
      blankEmail.status === 400,
      `HTTP ${blankEmail.status} — ${blankEmail.body.error || 'rejected by route validation'}`
    );

    const badEmail = await post(port, '/register', {
      fullName: 'Bad Email Test', phone: freePhone, role: 'CUSTOMER', password: 'Valid123!', email: 'not-an-email'
    });
    check(
      '3. registration with a malformed email is refused',
      badEmail.status === 400,
      `HTTP ${badEmail.status}`
    );

    const noEmailRow = await db.get('SELECT id FROM users WHERE phone = $1', [freePhone]);
    check(
      '3b. no account was created by any of those attempts',
      !noEmailRow,
      noEmailRow ? `LEAKED: user ${noEmailRow.id} exists` : 'users table is clean'
    );

    // ---- Normalisation ------------------------------------------------
    const mixedCase = await post(port, '/register', {
      fullName: 'Mixed Case Test',
      phone: freePhone,
      role: 'CUSTOMER',
      password: 'Valid123!',
      email: '  Mixed.Case@Test.COM  '
    });
    check(
      '4. a valid email is accepted, trimmed and lowercased',
      mixedCase.status === 201,
      `HTTP ${mixedCase.status}`
    );

    const stored = await db.get('SELECT id, email FROM users WHERE phone = $1', [freePhone]);
    createdId = stored?.id;
    check(
      '4b. the stored address is normalised',
      stored?.email === 'mixed.case@test.com',
      `stored as "${stored?.email}"`
    );

    // ---- Uniqueness, case-insensitively --------------------------------
    const existing = await db.get('SELECT email FROM users WHERE phone = $1', ['+251933445566']);
    const dupe = await post(port, '/register', {
      fullName: 'Duplicate Email',
      phone: '+251090000002', // different phone, same mailbox
      role: 'CUSTOMER',
      password: 'Valid123!',
      email: existing.email.toUpperCase()
    });
    check(
      '5. the same mailbox cannot be registered twice, even in different case',
      dupe.status === 400,
      `HTTP ${dupe.status} — ${dupe.body.error}`
    );

    // ---- Database layer, bypassing the application entirely -----------
    const dupeRow = await db.get('SELECT id FROM users WHERE phone = $1', ['+251090000002']);
    check(
      '5b. no duplicate-mailbox account was created',
      !dupeRow,
      dupeRow ? `LEAKED: user ${dupeRow.id}` : 'users table is clean'
    );

    const nullDirect = await db
      .run("INSERT INTO users (full_name, phone, email, role, password_hash) VALUES ('Direct Null', '+251090000003', NULL, 'CUSTOMER', 'x')")
      .then(() => 'INSERT SUCCEEDED — NOT NULL IS NOT ENFORCED')
      .catch((e) => `rejected: ${e.code} ${e.message}`);
    check(
      '6. the database itself rejects a NULL email, bypassing the API',
      nullDirect.startsWith('rejected'),
      nullDirect
    );

    const dupeDirect = await db
      .run("INSERT INTO users (full_name, phone, email, role, password_hash) VALUES ('Direct Dupe', '+251090000004', $1, 'CUSTOMER', 'x')", [existing.email.toUpperCase()])
      .then(() => 'INSERT SUCCEEDED — UNIQUENESS IS NOT ENFORCED')
      .catch((e) => `rejected: ${e.code} ${e.message}`);
    check(
      '7. the database itself rejects a duplicate mailbox, bypassing the API',
      dupeDirect.startsWith('rejected'),
      dupeDirect
    );

    // ---- The recovery path the constraint exists to protect ------------
    const column = await db.get(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'email'
    `);
    check(
      '8. users.email reports NOT NULL in the catalog',
      column.is_nullable === 'NO',
      `is_nullable = ${column.is_nullable}`
    );

    const orphans = await db.get(`
      SELECT count(*) AS accounts_without_email FROM users
      WHERE email IS NULL OR btrim(email) = ''
    `);
    check(
      '9. no account exists that could never receive its reset code',
      orphans.accounts_without_email === 0,
      `${orphans.accounts_without_email} account(s) without an email`
    );
  } finally {
    if (createdId) {
      await db.run('DELETE FROM users WHERE id = $1', [createdId]);
    }
    await db.run("DELETE FROM users WHERE phone IN ('+251090000001','+251090000002','+251090000003','+251090000004')");
    server.close();
    console.log('\n[TEST] Test accounts removed.');
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
