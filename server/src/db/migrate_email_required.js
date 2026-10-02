// Makes users.email mandatory, and enforces that it identifies exactly one
// account.
//
// The email used to be optional, on the assumption that the phone number was
// enough to identify a customer. It is not, once password reset is involved: the
// reset code is delivered by email, so an account with no email on file has no
// way back in after a forgotten password. The reset flow still falls back to SMS
// for such rows, but that only covers accounts whose number is still reachable —
// someone who has lost their SIM is locked out permanently. Making the field
// mandatory stops that class of account being created in the first place.
//
// Two invariants are enforced here:
//
//   1. email IS NOT NULL
//   2. no two accounts share an email, compared case-insensitively
//
// Case matters because mail hosts treat Foo@x.com and foo@x.com as the same
// mailbox. A plain UNIQUE on the raw column would happily accept both, and then
// one mailbox would be the recovery factor for two unrelated accounts.
//
// Existing rows are normalised (trimmed and lowercased) rather than rejected,
// since mixed case is a data-quality issue and not a reason to block a deploy.
// Rows with no email at all CANNOT be repaired here: inventing an address would
// send someone's password-reset code to a stranger, so the migration stops and
// lists them instead.
//
//   node src/db/migrate_email_required.js

const db = require('../config/database');

async function migrate() {
  console.log('[MIGRATE] Making users.email mandatory...');

  const tableExists = await db.get(`
    SELECT 1 AS ok FROM information_schema.tables WHERE table_name = 'users' LIMIT 1
  `);
  if (!tableExists) {
    console.log('[MIGRATE] users table does not exist yet — nothing to do. Run `npm run migrate` first.');
    return;
  }

  // ---- 1. Report anything that cannot be auto-repaired -----------------
  const missing = await db.all(`
    SELECT id, full_name, phone, role
    FROM users
    WHERE email IS NULL OR btrim(email) = ''
    ORDER BY id
  `);

  if (missing.length) {
    console.error(`[MIGRATE] BLOCKED: ${missing.length} account(s) have no email address.`);
    console.table(missing);
    console.error('[MIGRATE] users.email cannot be made NOT NULL until these are filled in.');
    console.error('[MIGRATE] For each row, either set a real address the owner controls, or');
    console.error('[MIGRATE] delete the account. Do NOT substitute a placeholder — these');
    console.error('[MIGRATE] addresses receive password-reset codes.');
    console.error('[MIGRATE] Example, per id:');
    console.error('[MIGRATE]   UPDATE users SET email = \'real.address@example.com\' WHERE id = <id>;');
    throw new Error('Refusing to invent email addresses for existing accounts.');
  }

  // ---- 2. Refuse to proceed if normalisation would collide -------------
  // Checked before writing anything, so a collision aborts the migration with
  // the table untouched rather than half-way through.
  const collisions = await db.all(`
    SELECT lower(btrim(email)) AS normalized_email,
           count(*)             AS accounts,
           array_agg(id ORDER BY id) AS ids,
           array_agg(phone ORDER BY id) AS phones
    FROM users
    GROUP BY 1
    HAVING count(*) > 1
    ORDER BY 2 DESC, 1
  `);

  if (collisions.length) {
    console.error(`[MIGRATE] BLOCKED: ${collisions.length} email address(es) are shared by more than one account.`);
    console.table(collisions);
    console.error('[MIGRATE] One mailbox must not be the recovery factor for two accounts.');
    console.error('[MIGRATE] Correct the duplicates by hand, then re-run this migration.');
    throw new Error('Duplicate email addresses would violate the uniqueness rule.');
  }

  // ---- 3. Normalise what is safely normalisable ------------------------
  const { rowCount: normalized } = await db.run(`
    UPDATE users
    SET email = lower(btrim(email))
    WHERE email IS DISTINCT FROM lower(btrim(email))
  `);
  console.log(`[MIGRATE] Normalised ${normalized} email address(es) to trimmed lowercase.`);

  // ---- 4. Enforce NOT NULL --------------------------------------------
  await db.run(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users ALTER COLUMN email SET NOT NULL;
      END IF;
    END $$;
  `);
  console.log('[MIGRATE] users.email is now NOT NULL.');

  // ---- 5. Enforce one account per mailbox ------------------------------
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (lower(email))');
  console.log('[MIGRATE] index idx_users_email_unique ensured (case-insensitive uniqueness).');

  // ---- 6. Verify -------------------------------------------------------
  const verified = await db.all(`
    SELECT column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  `);
  console.log('[MIGRATE] Verified column:', verified[0]);

  if (verified[0] && verified[0].is_nullable === 'YES') {
    throw new Error('users.email is still nullable — the constraint did not apply.');
  }

  const indexPresent = await db.get(`
    SELECT indexdef FROM pg_indexes
    WHERE tablename = 'users' AND indexname = 'idx_users_email_unique'
  `);
  if (!indexPresent) {
    throw new Error('idx_users_email_unique was not created.');
  }
  console.log('[MIGRATE] Verified index:', indexPresent.indexdef);

  const summary = await db.get(`
    SELECT count(*) AS accounts, count(DISTINCT lower(email)) AS distinct_mails
    FROM users
  `);
  console.log(`[MIGRATE] ${summary.accounts} account(s) across ${summary.distinct_mails} distinct email address(es).`);
  console.log('[MIGRATE] Email-required migration completed successfully.');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[MIGRATE ERROR]', err.message);
    process.exit(1);
  });
