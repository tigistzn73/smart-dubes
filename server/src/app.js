const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const merchantRoutes = require('./routes/merchantRoutes');
const customerRoutes = require('./routes/customerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const seedDatabase = require('./db/seed');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Auto-seed demo database if empty (async check)
const db = require('./config/database');
async function initDb() {
  // A real PostgreSQL pool is required for data to survive a restart.
  // Without it the app falls back to an on-disk JSON file, which is wiped
  // on every deploy/spin-down on ephemeral hosts (Render free tier).
  if (!db.pool) {
    console.warn(
      '[DB] WARNING: no DATABASE_URL / PG_HOST configured. Falling back to the\n' +
      '[DB] embedded JSON store. ALL DATA (including SMS history) WILL BE LOST\n' +
      '[DB] on every deploy or restart. Set DATABASE_URL to a persistent database.'
    );
  }

  try {
    const row = await db.get('SELECT COUNT(*) as count FROM users');
    if (!row || parseInt(row.count) === 0) {
      console.log('[DB] Empty database detected — running auto-seed...');
      await seedDatabase();
    } else {
      console.log(`[DB] Database ready — ${row.count} users found.`);
    }
  } catch (err) {
    console.log('[DB] Initializing schema and seed...');
    try {
      if (db.pool) {
        const schemaPath = path.join(__dirname, 'db/schema.sql');
        if (fs.existsSync(schemaPath)) {
          const sql = fs.readFileSync(schemaPath, 'utf8');
          await db.pool.query(sql);
        }
      }
      await seedDatabase();
      console.log('[DB] Initial migration and seed completed successfully!');
    } catch (seedErr) {
      console.error('[DB] Migration/Seed error:', seedErr.message);
    }
  }
}
initDb();

// Health check endpoint
app.get('/api/health', (req, res) => {
  const persistent = Boolean(db.pool);
  res.json({
    status: 'HEALTHY',
    service: 'Smart Dube REST API',
    timestamp: new Date().toISOString(),
    storage: {
      driver: persistent ? 'POSTGRESQL' : 'EMBEDDED_JSON',
      persistent,
      warning: persistent
        ? null
        : 'Data is NOT persistent. It is lost on every deploy/restart. Set DATABASE_URL on this host.'
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/merchant', merchantRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);

// Serve built React frontend static files
const frontendDist = path.join(__dirname, '../../client/dist');
app.use(express.static(frontendDist));

// For any non-API route, serve the React app (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled API Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

module.exports = app;
