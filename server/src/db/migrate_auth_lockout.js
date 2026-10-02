// Idempotent migration for the account-lockout and OTP-verification columns.
//
// Both features used to live only in a process-local Map inside
// authController.js. That had three consequences worth fixing properly:
//
//   1. A lockout evaporated on every server restart, so restarting the app was
//      a trivial way to clear a lockout — and a locked-out user could not tell
//      a real lock from a fresh counter.
//   2. Two processes behind a load balancer each kept a private counter, so a
//      user could be given 3 attempts per replica.
//   3. A successful password reset did not clear the counter, so a customer who
//      proved they owned the phone/email and set a new password still could not
//      sign in until the timer ran out.
//
// Moving the state onto the users table fixes all three. schema.sql only issues
// CREATE TABLE IF NOT EXISTS, so an already-deployed database is untouched by
// re-running it; this script closes that gap and is safe to run repeatedly.
//
//   node src/db/migrate_auth_lockout.js

const db = require('../config/database');

// MAX_OTP_ATTEMPTS is duplicated from authController.js on purpose. This is a
// DDL script: it has to state the number it is enforcing, and there is no way
// to import an application constant into a migration without the migration
// becoming order-dependent on the rest of the codebase. If you raise the limit
// in the controller, change it here too, or tighten the stored token sooner
// than the app intends.
const MAX_OTP_ATTEMPTS = 5;

async function migrate() {
  console.log('[MIGRATE] Ensuring account lockout and OTP columns exist...');

  await db.run(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_attempts INT NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_sent_at TIMESTAMPTZ;
      END IF;
    END $$;
  `);
  console.log('[MIGRATE] users.failed_login_attempts, users.locked_until, users.reset_token_attempts, users.reset_token_sent_at ensured.');

  // 1b. reset_token has to grow. It used to store the plaintext 6-digit PIN and
  //     was declared VARCHAR(10); it now stores that PIN's bcrypt hash, which is
  //     60 characters. Without this ALTER every password reset fails with a
  //     string-truncation error the moment the code is written.
  //
  //     Any codes issued under the old scheme are discarded rather than
  //     migrated: they were plaintext, and the column is being reinterpreted as
  //     a hash, so a leftover value would be compared as if it were one.
  await db.run(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users ALTER COLUMN reset_token TYPE VARCHAR(72);
        UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE reset_token IS NOT NULL;
      END IF;
    END $$;
  `);
  console.log('[MIGRATE] users.reset_token widened to VARCHAR(72); pre-hash codes invalidated.');

  // The login hot path reads locked_until for every request it authenticates.
  // Without this it is a sequential scan of users, which is fine at demo scale
  // and painful once the table grows.
  await db.run('CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until)');
  console.log('[MIGRATE] index idx_users_locked_until ensured.');

  // The resend cooldown is read on every forgot-password request for an account
  // that already holds a live code.
  await db.run('CREATE INDEX IF NOT EXISTS idx_users_reset_token_sent_at ON users(reset_token_sent_at)');
  console.log('[MIGRATE] index idx_users_reset_token_sent_at ensured.');

  // Anything already locked out by the old in-memory tracker cannot exist —
  // that state died with the process — but failed_login_attempts may sit above
  // zero on rows written by a partially-migrated deploy. Start those accounts
  // clean so no one is locked out by a counter they cannot see or clear.
  await db.run('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE failed_login_attempts > 0');
  console.log(`[MIGRATE] Stale lockout counters cleared. MAX_OTP_ATTEMPTS = ${MAX_OTP_ATTEMPTS}.`);

  const rows = await db.all(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name IN ('failed_login_attempts', 'locked_until', 'reset_token_attempts', 'reset_token_sent_at')
    ORDER BY column_name
  `);

  console.log('[MIGRATE] Verified columns:', rows);
  console.log('[MIGRATE] Auth lockout migration completed successfully.');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[MIGRATE ERROR]', err.message);
    process.exit(1);
  });
