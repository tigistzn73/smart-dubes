const path = require('path');
const { Pool, types } = require('pg');

// Parse PostgreSQL NUMERIC/DECIMAL as float
types.setTypeParser(1700, function(val) {
  return val === null ? null : parseFloat(val);
});
// Parse PostgreSQL BIGINT as integer
types.setTypeParser(20, function(val) {
  return val === null ? null : parseInt(val, 10);
});

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

// Managed Postgres (Neon, Render, Supabase) only accepts TLS, but a local
// dev cluster usually has ssl disabled and rejects the handshake outright.
function sslForConnectionString(connectionString) {
  const { hostname, searchParams } = new URL(connectionString);
  const sslmode = (searchParams.get('sslmode') || '').toLowerCase();

  if (sslmode === 'disable') return false;
  if (process.env.PG_SSL === 'false') return false;
  if (process.env.PG_SSL === 'true') return { rejectUnauthorized: false };
  if (sslmode) return { rejectUnauthorized: false };
  return LOOPBACK_HOSTS.includes(hostname) ? false : { rejectUnauthorized: false };
}

let pgPool = null;

// PostgreSQL is the only datastore. There is no embedded fallback: a silent
// downgrade to a local JSON file is how two databases ended up out of sync.
if (process.env.DATABASE_URL) {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslForConnectionString(process.env.DATABASE_URL),
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT || '10000', 10)
  });
} else if (process.env.PG_HOST || process.env.PG_PORT) {
  pgPool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5433'),
    database: process.env.PG_DATABASE || 'smart_dube_system',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD,
    connectionTimeoutMillis: 3000
  });
} else {
  throw new Error(
    '[DB] No database configured. Set DATABASE_URL (hosted Postgres) or the PG_* block in server/.env'
  );
}

pgPool.on('error', (err) => {
  console.warn('[DB] PostgreSQL notice:', err.message);
});

// ----------------------------------------------------------------
// Data access. Every call goes to PostgreSQL; failures propagate so the
// API surfaces an error instead of quietly serving stale embedded data.
// ----------------------------------------------------------------
module.exports = {
  pool: pgPool,

  async all(text, params = []) {
    const res = await pgPool.query(text, params);
    return res.rows;
  },

  async get(text, params = []) {
    const res = await pgPool.query(text, params);
    return res.rows[0] || null;
  },

  async run(text, params = []) {
    const res = await pgPool.query(text, params);
    return { rowCount: res.rowCount, rows: res.rows };
  },

  async transaction(callback) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
};

