const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const merchantRoutes = require('./routes/merchantRoutes');
const customerRoutes = require('./routes/customerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { setupSwagger } = require('./config/swagger');
const seedDatabase = require('./db/seed');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Auto-seed demo database if empty (async check)
const db = require('./config/database');
async function initDb() {
  try {
    const row = await db.get('SELECT COUNT(*) as count FROM users');
    if (!row || parseInt(row.count) === 0) {
      console.log('[DB] Empty database detected — running auto-seed...');
      await seedDatabase();
    } else {
      console.log(`[DB] Database ready — ${row.count} users found.`);
    }
  } catch (err) {
    // Never apply schema.sql here. It begins with DROP TABLE, so running it
    // on a transient error (a dropped connection, an edited file triggering a
    // watcher restart) silently wipes every table. Add columns individually.
    console.error('[DB] Startup check failed:', err.message);
    console.error('[DB] Refusing to touch the schema automatically — no data was changed.');
    console.error('[DB] If tables are genuinely missing, create them deliberately.');
  }
}
initDb();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'Smart Dube REST API',
    timestamp: new Date().toISOString(),
    storage: {
      driver: 'POSTGRESQL',
      persistent: true
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/merchant', merchantRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);

// Interactive API browser — must be mounted before the SPA catch-all below
setupSwagger(app);

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
