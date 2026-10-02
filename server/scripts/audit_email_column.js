// Reports the state of users.email ahead of making it mandatory: how many rows
// would violate NOT NULL, which need normalising, and which collide on a
// case-insensitive comparison.
//
//   node scripts/audit_email_column.js

const db = require('../src/config/database');

(async () => {
  const stats = await db.get(`
    SELECT
      count(*)                                                        AS total,
      count(*) FILTER (WHERE email IS NULL)                           AS null_email,
      count(*) FILTER (WHERE btrim(coalesce(email, '')) = '')         AS blank_email,
      count(*) FILTER (WHERE email IS NOT NULL
                         AND email <> lower(btrim(email)))            AS needs_normalizing,
      count(*) FILTER (WHERE email IS NULL
                         OR btrim(email) = '')                        AS would_block_not_null
    FROM users
  `);

  console.log('\nusers.email audit');
  console.table(stats);

  const dupes = await db.all(`
    SELECT lower(btrim(email)) AS normalized_email, count(*) AS accounts, array_agg(phone) AS phones
    FROM users
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY 1
    HAVING count(*) > 1
    ORDER BY 2 DESC, 1
  `);

  if (dupes.length) {
    console.log('COLLISIONS — these would block a UNIQUE constraint:');
    console.table(dupes);
  } else {
    console.log('No case-insensitive collisions. A UNIQUE constraint can be added.');
  }

  const offenders = await db.all(`
    SELECT id, full_name, phone, role, coalesce(email, '(null)') AS email
    FROM users
    WHERE email IS NULL OR btrim(email) = '' OR email <> lower(btrim(email))
    ORDER BY id
  `);

  if (offenders.length) {
    console.log('ROWS NEEDING ATTENTION:');
    console.table(offenders);
  } else {
    console.log('Every account has a clean, already-normalised email.');
  }
})()
  .catch((err) => {
    console.error('[AUDIT ERROR]', err.message);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode || 0));
