const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Copies the local PostgreSQL database (PG_* vars) into hosted Neon
// (DATABASE_URL), remapping every primary key so the two unrelated ID
// sequences do not collide. Neon's current contents are replaced.
//
//   node migrate_to_neon.js

const env = process.env;
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — nothing to migrate into.');
  process.exit(1);
}

const OUT_DIR = path.resolve(__dirname, '../app_db_backup');

// Tables in dependency order: every table appears after the tables its
// foreign keys point at, so inserts never violate a constraint.
const TABLES = [
  'users',
  'merchants',
  'customer_profiles',
  'credit_transactions',
  'repayments',
  'customer_schedules',
  'sms_notifications',
  'payment_gateway_logs',
  'audit_logs'
];

// For each table, which of its columns are foreign keys into a table that
// was already copied (and therefore need remapping to the new IDs).
const FKS = {
  merchants: { user_id: 'users' },
  customer_profiles: { user_id: 'users', merchant_id: 'merchants' },
  credit_transactions: { customer_id: 'customer_profiles', merchant_id: 'merchants' },
  repayments: {
    customer_id: 'customer_profiles',
    merchant_id: 'merchants',
    transaction_id: 'credit_transactions'
  },
  customer_schedules: {
    customer_id: 'customer_profiles',
    user_id: 'users',
    transaction_id: 'credit_transactions'
  },
  sms_notifications: { customer_id: 'customer_profiles' },
  payment_gateway_logs: {},
  audit_logs: { user_id: 'users' }
};

function localClient() {
  return new Client({
    host: env.PG_HOST || 'localhost',
    port: parseInt(env.PG_PORT || '5433', 10),
    database: env.PG_DATABASE || 'smart_dube_system',
    user: env.PG_USER || 'postgres',
    password: env.PG_PASSWORD
  });
}

function neonClient() {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

// Snapshot Neon so a bad migration can be undone by hand.
async function backupNeon(neon) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(OUT_DIR, `neon_before_migration_${stamp}.json`);

  const tables = (
    await neon.query(
      "select table_name from information_schema.tables where table_schema='public' order by table_name"
    )
  ).rows.map((r) => r.table_name);

  const dump = { _exported_at: new Date().toISOString(), _source: 'neon-postgres', tables: {} };
  let rows = 0;
  for (const t of tables) {
    const r = await neon.query(`select * from "${t}" order by id`);
    dump.tables[t] = r.rows;
    rows += r.rows.length;
  }

  fs.writeFileSync(outFile, JSON.stringify(dump, null, 2), 'utf8');
  console.log(`backup: ${tables.length} tables / ${rows} rows -> ${outFile}`);
  console.log(`        (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)\n`);
  return outFile;
}

async function run() {
  const local = localClient();
  const neon = neonClient();

  try {
    await local.connect();
  } catch (e) {
    console.error(`Cannot reach the LOCAL database (${env.PG_HOST}:${env.PG_PORT}/${env.PG_DATABASE}):`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }

  try {
    await neon.connect();
  } catch (e) {
    console.error(`Cannot reach Neon: ${e.message}`);
    await local.end();
    process.exit(1);
  }

  console.log(`from local : ${env.PG_HOST}:${env.PG_PORT}/${env.PG_DATABASE}`);
  const where = await neon.query('select current_database() db');
  console.log(`to   neon  : ${where.rows[0].db}\n`);

  await backupNeon(neon);

  const present = new Set(
    (
      await neon.query(
        "select table_name from information_schema.tables where table_schema='public'"
      )
    ).rows.map((r) => r.table_name)
  );
  const missing = TABLES.filter((t) => !present.has(t));
  if (missing.length) {
    console.error(`Neon is missing tables: ${missing.join(', ')}`);
    console.error('Create them first (see server/src/db/schema.sql) — nothing was changed.');
    await local.end();
    await neon.end();
    process.exit(1);
  }

  await neon.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  console.log('neon tables truncated\n');

  // old id -> new id, per table
  const idMap = {};

  for (const table of TABLES) {
    const { rows } = await local.query(`select * from "${table}" order by id`);
    if (!rows.length) {
      console.log(`${table.padEnd(24)} 0 rows`);
      idMap[table] = new Map();
      continue;
    }

    const fks = FKS[table] || {};
    const cols = Object.keys(rows[0]).filter((c) => c !== 'id');

    // Columns that exist in both databases — local and Neon could have drifted.
    const targetCols = (
      await neon.query(
        `select column_name from information_schema.columns
         where table_schema='public' and table_name=$1`,
        [table]
      )
    ).rows.map((r) => r.column_name);
    const use = cols.filter((c) => targetCols.includes(c));

    idMap[table] = new Map();

    // Rewrite foreign keys onto the IDs Neon just assigned.
    const prepared = rows.map((row) => {
      const data = { ...row };
      for (const [col, target] of Object.entries(fks)) {
        if (data[col] == null) continue;
        const mapped = idMap[target].get(data[col]);
        if (mapped == null) {
          throw new Error(
            `${table}.${col} = ${data[col]} has no matching ${target} row — local data is inconsistent`
          );
        }
        data[col] = mapped;
      }
      return data;
    });

    // Insert in batches. One round trip per row is far too slow against a
    // hosted pooler, so pack many rows into each statement.
    const BATCH = 200;
    for (let start = 0; start < prepared.length; start += BATCH) {
      const chunk = prepared.slice(start, start + BATCH);

      const values = [];
      const tuples = chunk.map((data, i) => {
        const placeholders = use.map((c, ci) => `$${i * use.length + ci + 1}`);
        values.push(...use.map((c) => data[c]));
        return `(${placeholders.join(', ')})`;
      });

      // RETURNING id preserves input order for a multi-row insert.
      const res = await neon.query(
        `insert into "${table}" (${use.join(', ')}) values ${tuples.join(', ')} returning id`,
        values
      );
      chunk.forEach((data, i) => idMap[table].set(data.id, res.rows[i].id));
    }

    console.log(`${table.padEnd(24)} ${prepared.length} rows`);
  }

  // Advance each sequence past the highest copied ID, otherwise the next
  // INSERT from the app collides with a migrated row.
  console.log('');
  for (const table of TABLES) {
    await neon.query(
      `select setval(pg_get_serial_sequence('${table}', 'id'),
                      coalesce((select max(id) from "${table}"), 1),
                      (select max(id) is not null from "${table}"))`
    );
  }
  console.log('sequences resynced');

  console.log('\nfinal Neon row counts:');
  for (const table of TABLES) {
    const n = await neon.query(`select count(*)::int as n from "${table}"`);
    console.log(`  ${table.padEnd(24)} ${n.rows[0].n}`);
  }

  console.log('\nMigration complete.');
}

run()
  .catch((e) => {
    console.error('\nMIGRATION FAILED:', e.message);
    console.error('Restore from the backup printed above before retrying.');
    process.exitCode = 1;
  })
  .finally(() => process.exit());