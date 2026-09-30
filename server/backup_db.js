const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Dumps whichever database the app is currently configured to use. Reading
// .env through dotenv matters: a hand-rolled parser leaves the surrounding
// quotes on the value, which makes pg fail with ENOTFOUND.
const env = process.env;

const outDir = path.resolve(__dirname, '../app_db_backup');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = path.join(outDir, `smart_dube_${stamp}.json`);

(async () => {
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is empty — the app is configured for local PostgreSQL.');
    console.error('Set DATABASE_URL, or point this script at PG_* instead.');
    process.exit(1);
  }

  const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const tables = (await c.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name"
  )).rows.map(r => r.table_name);

  const dump = { _exported_at: new Date().toISOString(), _source: 'neon-postgres', tables: {} };
  let totalRows = 0;

  for (const t of tables) {
    const r = await c.query(`select * from "${t}" order by id`);
    dump.tables[t] = r.rows;
    totalRows += r.rows.length;
    console.log(`  ${t.padEnd(26)} ${r.rows.length} rows`);
  }

  fs.writeFileSync(outFile, JSON.stringify(dump, null, 2), 'utf8');
  console.log(`\nexported ${tables.length} tables / ${totalRows} rows`);
  console.log('wrote', outFile, `(${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);

  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
