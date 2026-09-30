// One-time import: bring rows that exist only in Neon into local PostgreSQL,
// matching on natural keys rather than IDs so the two ID spaces stay independent.
//
//   node import_neon_to_local.js
//
// Never deletes or overwrites local rows.

const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const env = process.env;
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is empty — nothing to import from.');
  process.exit(1);
}

// Natural key per table, used to decide "already present".
const KEY = {
  users: 'phone',
  merchants: 'business_license_no',
  customer_profiles: 'phone',
  credit_transactions: 'transaction_ref',
  repayments: 'repayment_ref',
  customer_schedules: null,
  sms_notifications: null,
  payment_gateway_logs: null,
  audit_logs: null
};

const ORDER = [
  'users', 'merchants', 'customer_profiles', 'credit_transactions',
  'repayments', 'customer_schedules', 'sms_notifications',
  'payment_gateway_logs', 'audit_logs'
];

const FKS = {
  merchants: { user_id: 'users' },
  customer_profiles: { user_id: 'users', merchant_id: 'merchants' },
  credit_transactions: { customer_id: 'customer_profiles', merchant_id: 'merchants' },
  repayments: { customer_id: 'customer_profiles', merchant_id: 'merchants', transaction_id: 'credit_transactions' },
  customer_schedules: { customer_id: 'customer_profiles', user_id: 'users', transaction_id: 'credit_transactions' },
  sms_notifications: { customer_id: 'customer_profiles' },
  payment_gateway_logs: {},
  audit_logs: { user_id: 'users' }
};

// Tables without a single-column natural key dedupe on their content columns.
// Timestamps are excluded: the two databases return them in different
// timezones, so including them makes every row look new and duplicates
// everything. Foreign-key id columns are excluded too, since the two
// databases number their rows independently.
const CONTENT_KEY = {
  customer_schedules: ['total_amount', 'frequency', 'salary_day', 'duration_months', 'installments_json', 'status'],
  sms_notifications: ['phone', 'type', 'status', 'message'],
  payment_gateway_logs: ['gateway_name', 'event_type', 'payload_json', 'response_status'],
  audit_logs: ['actor_name', 'action', 'resource', 'details_json', 'ip_address']
};

async function contentExistsLocal(local, table, row) {
  const cols = CONTENT_KEY[table];
  const where = cols
    .map((c, i) => `coalesce("${c}"::text, '<null>') = $${i + 1}`)
    .join(' and ');
  const r = await local.query(
    `select 1 from "${table}" where ${where} limit 1`,
    cols.map((c) => (row[c] == null ? '<null>' : String(row[c])))
  );
  return r.rows.length > 0;
}

(async () => {
  const neon = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const local = new Client({
    host: env.PG_HOST,
    port: parseInt(env.PG_PORT, 10),
    database: env.PG_DATABASE,
    user: env.PG_USER,
    password: env.PG_PASSWORD
  });
  await neon.connect();
  await local.connect();

  console.log(`from : ${await neon.query('select current_database() d').then((r) => r.rows[0].d)} (Neon)`);
  console.log(`to   : ${env.PG_HOST}:${env.PG_PORT}/${env.PG_DATABASE} (local)\n`);

  const idMap = {};
  let totalAdded = 0;
  let totalSkipped = 0;

  for (const table of ORDER) {
    const { rows } = await neon.query(`select * from "${table}" order by id`);
    const localCols = new Set(
      (
        await local.query(
          `select column_name from information_schema.columns
           where table_schema='public' and table_name=$1`,
          [table]
        )
      ).rows.map((c) => c.column_name)
    );

    const key = KEY[table];
    const fks = FKS[table] || {};
    idMap[table] = new Map();

    // Seed the map with local IDs so FK resolution works both ways.
    for (const r of (await local.query(`select id from "${table}"`)).rows) {
      idMap[table].set(r.id, r.id);
    }

    let added = 0;
    let skipped = 0;

    for (const row of rows) {
      // Skip if the natural key is already present locally.
      if (key) {
        const k = row[key];
        if (k != null) {
          const dupe = await local.query(`select id from "${table}" where "${key}"=$1`, [k]);
          if (dupe.rows.length) {
            idMap[table].set(row.id, dupe.rows[0].id);
            skipped++;
            continue;
          }
        }
      } else if (await contentExistsLocal(local, table, row)) {
        skipped++;
        continue;
      }

      const data = { ...row };
      for (const [col, target] of Object.entries(fks)) {
        if (data[col] == null) continue;
        const mapped = idMap[target].get(data[col]);
        if (mapped == null) throw new Error(`${table}.${col}=${data[col]} has no ${target} match`);
        data[col] = mapped;
      }

      const use = Object.keys(data).filter((c) => c !== 'id' && localCols.has(c));
      const vals = use.map((c) => data[c]);
      const ph = use.map((_, i) => `$${i + 1}`).join(', ');
      const ins = await local.query(
        `insert into "${table}" (${use.map((c) => `"${c}"`).join(', ')}) values (${ph}) returning id`,
        vals
      );
      idMap[table].set(row.id, ins.rows[0].id);
      added++;
    }

    totalAdded += added;
    totalSkipped += skipped;
    console.log(`${table.padEnd(24)} imported=${String(added).padEnd(5)} already present=${skipped}`);
  }

  console.log(`\ntotal imported: ${totalAdded}, skipped as already present: ${totalSkipped}`);

  console.log('\nlocal counts now:');
  for (const t of ORDER) {
    const r = await local.query(`select count(*)::int n from ${t}`);
    console.log(`  ${t.padEnd(24)} ${r.rows[0].n}`);
  }

  await local.end();
  await neon.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });