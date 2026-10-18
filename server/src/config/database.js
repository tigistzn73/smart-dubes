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
// Pool sizing.
//
// The Neon endpoint used here is a pooler (note the "-pooler" hostname), which
// multiplexes many callers onto few backend connections and will close a client
// socket that has been idle too long. The defaults are a poor fit for that:
// max=10 lets a burst of concurrent requests occupy every slot, and
// idleTimeoutMillis=10000 is short enough that a quiet minute leaves a socket
// the pooler has already discarded. Both together produce "Connection
// terminated unexpectedly" on a request that looks like a simple SELECT.
const POOL_MAX = parseInt(process.env.PG_POOL_MAX || '5', 10);
const POOL_IDLE_MS = parseInt(process.env.PG_POOL_IDLE_MS || '30000', 10);
const POOL_CONNECT_MS = parseInt(process.env.PG_CONNECT_TIMEOUT || '15000', 10);

if (process.env.DATABASE_URL) {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslForConnectionString(process.env.DATABASE_URL),
    max: POOL_MAX,
    idleTimeoutMillis: POOL_IDLE_MS,
    connectionTimeoutMillis: POOL_CONNECT_MS
  });
} else if (process.env.PG_HOST || process.env.PG_PORT) {
  pgPool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5433'),
    database: process.env.PG_DATABASE || 'smart_dube_system',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD,
    max: POOL_MAX,
    idleTimeoutMillis: POOL_IDLE_MS,
    connectionTimeoutMillis: POOL_CONNECT_MS
  });
} else {
  throw new Error(
    '[DB] No database configured. Set DATABASE_URL (hosted Postgres) or the PG_* block in server/.env'
  );
}

pgPool.on('error', (err) => {
  // Emitted for background pool errors (e.g. an idle client dropped by the
  // server). Harmless: pg discards the client and opens a fresh one.
  console.warn('[DB] PostgreSQL notice:', err.message);
});

// ----------------------------------------------------------------
// Transient-failure retry
// ----------------------------------------------------------------
// A pooled socket that the server closed while it was idle surfaces as a
// connection-level error, not a SQL error, and the query never reached
// Postgres. Retrying is safe because these failures happen before the statement
// is accepted, so a retried SELECT/UPDATE/INSERT has not been applied twice.
//
// Deliberately not retried: unique-violation and foreign-key violations, which
// mean the statement really did run and really did conflict.
const RETRYABLE = [
  'Connection terminated',
  'connection timeout',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'Client has encountered a connection error',
  'server closed the connection',
  'Connection closed',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '08000', '08003', '08006', '08001', '08004', '08P01' // connection exceptions
];

// PG_QUERY_RETRIES is the number of *retries*, so the total attempt count is
// this plus one. Two retries survives a single dropped socket without letting a
// genuinely dead database hold a request open for long.
const MAX_RETRIES = Math.max(0, parseInt(process.env.PG_QUERY_RETRIES || '2', 10));
const RETRY_DELAY_MS = parseInt(process.env.PG_RETRY_DELAY_MS || '250', 10);

function isRetryable(err) {
  if (!err) return false;
  const text = `${err.message || ''} ${err.code || ''}`;
  return RETRYABLE.some((needle) => text.includes(needle));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function queryWithRetry(text, params = {}) {
  const totalAttempts = MAX_RETRIES + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await pgPool.query(text, params);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === totalAttempts) throw err;
      console.warn(
        `[DB] Connection dropped (${err.message.trim()}) — retrying, attempt ${attempt + 1} of ${totalAttempts}.`
      );
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

// ----------------------------------------------------------------
// Data access. Every call goes to PostgreSQL; failures propagate so the
// API surfaces an error instead of quietly serving stale embedded data.
// ----------------------------------------------------------------
module.exports = {
  pool: pgPool,

  async all(text, params = []) {
    const res = await queryWithRetry(text, params);
    return res.rows;
  },

  async get(text, params = []) {
    const res = await queryWithRetry(text, params);
    return res.rows[0] || null;
  },

  async run(text, params = []) {
    const res = await queryWithRetry(text, params);
    return { rowCount: res.rowCount, rows: res.rows };
  },

  async transaction(callback) {
    // A transaction must keep one client for its whole life, so it bypasses the
    // retry helper: a retry mid-transaction would have to re-run BEGIN and every
    // statement already issued, which is not something this layer should guess at.
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.warn('[DB] Rollback failed:', rollbackErr.message);
      }
      throw e;
    } finally {
      client.release();
    }
  }
};

