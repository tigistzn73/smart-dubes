const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const authRoutes = require('./routes/authRoutes');
const merchantRoutes = require('./routes/merchantRoutes');
const customerRoutes = require('./routes/customerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const publicRoutes = require('./routes/publicRoutes');
const seedDatabase = require('./db/seed');
const db = require('./config/database');
const { startEscalationScheduler } = require('./services/escalationService');
const { describeSmsGatewayConfig } = require('./services/smsService');
const { describeEmailConfig, verifyEmailConnection, isEmailConfigured } = require('./services/emailService');
const { describePublicUrlStatus } = require('./config/publicUrl');
const { isImageRenderingAvailable } = require('./services/courtLetterImageService');

const app = express();

// Mutated in place by the boot-time SMTP check below and read by /api/health, so
// that "is email actually working?" is answerable without sending a real reset
// request to a real customer. `configured` is known synchronously; `verified` is
// only known once the relay handshake completes.
const emailHealth = {
  configured: isEmailConfigured(),
  verified: null,
  lastCheck: null,
  detail: null
};

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Auto-seed demo database if empty (async check)
async function initDb() {
  try {
    const row = await db.get('SELECT COUNT(*) as count FROM users');
    // Host and database name only. The whole intent of this log is to make the
    // two databases comparable at a glance; a password never belongs in it.
    const parsed = process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL)
      : { hostname: process.env.PG_HOST || 'localhost', pathname: `/${process.env.PG_DATABASE || ''}` };
    console.log(`[DB] Connected to ${parsed.hostname}${parsed.pathname || ''}`);
    if (!row || parseInt(row.count) === 0) {
      console.log('[DB] Empty database detected — running auto-seed...');
      await seedDatabase();
    } else {
      console.log(`[DB] Database ready — ${row.count} users found.`);
    }
  } catch (err) {
    console.error('[DB] Startup check failed:', err.message);
    console.error('[DB] Refusing to touch the schema automatically — no data was changed.');
    console.error('[DB] If tables are genuinely missing, create them deliberately.');
  }

  // Arm the overdue-debt sweep only after the database check has settled. The
  // scheduler swallows its own errors, so this cannot break the HTTP server.
  try {
    startEscalationScheduler();
  } catch (err) {
    console.error('[ESCALATION] Failed to start the daily debt sweep:', err.message);
  }

  // Report how court letters will actually leave the building. A letter image
  // needs three things at once — a renderer, a public URL, and an MMS-capable
  // gateway — and it is far better to say so at boot than to discover it later.
  try {
    describeSmsGatewayConfig();
    describePublicUrlStatus();
    describeEmailConfig();
    if (isImageRenderingAvailable()) {
      console.log('[COURT LETTER] Image renderer ready — court letters will be produced as PNG.');
    } else {
      console.warn('[COURT LETTER] Image renderer unavailable — court letters will be text only.');
      console.warn('[COURT LETTER] Install fonts-dejavu-core on the host, or set COURT_LETTER_FONT_FILE to a .ttf path.');
    }
  } catch (err) {
    console.error('[COURT LETTER] Failed to report letter delivery configuration:', err.message);
  }

  // Prove the SMTP relay accepts us once, here, rather than on the first customer
  // who presses "forgot password". A reset service that only fails on demand is
  // indistinguishable from an application bug, because every other endpoint keeps
  // working. Deliberately not awaited and not able to reject: a relay outage must
  // never stop the server from booting, since login and the ledger live in this
  // same process.
  verifyEmailConnection()
    .then((result) => {
      emailHealth.lastCheck = new Date().toISOString();
      emailHealth.verified = result.ok;
      emailHealth.detail = result.ok ? 'ok' : result.reason;
      if (!result.ok && result.hint) console.warn(`[EMAIL] ${result.hint}`);
    })
    .catch((err) => {
      emailHealth.lastCheck = new Date().toISOString();
      emailHealth.verified = false;
      emailHealth.detail = err.message;
    });
}
initDb();

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const storage = {
    driver: 'POSTGRESQL',
    persistent: true,
    reachable: false,
    host: null,
    database: null,
    userCount: null
  };

  try {
    const conn = await db.get('SELECT current_database() AS db, current_user AS usr, COUNT(*) AS count FROM users');
    const url = process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL)
      : { hostname: process.env.PG_HOST || 'localhost', pathname: `/${process.env.PG_DATABASE || ''}` };
    storage.reachable = true;
    storage.host = url.hostname;
    storage.database = conn.db;
    storage.userCount = parseInt(conn.count, 10);
  } catch (err) {
    storage.error = err.message;
  }

  res.json({
    status: storage.reachable ? 'HEALTHY' : 'DEGRADED',
    service: 'Smart Dube REST API',
    timestamp: new Date().toISOString(),
    storage,
    // Password-reset codes can only be delivered by email if the relay both has
    // credentials and actually accepted the connection. Reported separately from
    // `status` on purpose: the API being HEALTHY says nothing about whether a
    // customer can receive their code.
    email: emailHealth
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/merchant', merchantRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);
// Unauthenticated on purpose: Twilio fetches MMS media with a bare GET. The
// court-letter image carries its own signed, expiring, case-scoped token.
app.use('/api/public', publicRoutes);

const mountPoints = [
  { prefix: '/api/auth', router: authRoutes, group: 'Auth' },
  { prefix: '/api/merchant', router: merchantRoutes, group: 'Merchant' },
  { prefix: '/api/customer', router: customerRoutes, group: 'Customer' },
  { prefix: '/api/admin', router: adminRoutes, group: 'Admin' }
];

// Build the endpoint catalogue straight from the Express routers so it can
// never drift out of sync with the actual routing table.
function listEndpoints() {
  const groups = [
    {
      group: 'System',
      endpoints: [{ method: 'GET', path: '/api/health', description: 'Service status and database connectivity' }]
    }
  ];

  for (const { prefix, router, group } of mountPoints) {
    const endpoints = [];
    for (const layer of router.stack || []) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        endpoints.push({
          method: method.toUpperCase(),
          path: `${prefix}${layer.route.path}`
        });
      }
    }
    groups.push({ group, endpoints });
  }

  return groups;
}

// Root API index so hitting http://localhost:5000/api in Postman or a browser
// lists every available endpoint instead of returning a 404.
app.get('/api', (req, res) => {
  res.json({
    service: 'Smart Dube REST API',
    documentation: 'Import smart-dubes.postman_collection.json into Postman',
    healthCheck: '/api/health',
    auth: 'POST /api/auth/login returns a JWT. Send it as "Authorization: Bearer <token>".',
    groups: listEndpoints()
  });
});

// Unknown API routes always return JSON, never the SPA shell
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    requestedUrl: req.originalUrl,
    availableEndpoints: '/api',
    documentation: 'Import smart-dubes.postman_collection.json into Postman'
  });
});

// Serve the built React frontend from the same origin
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
const clientIndex = path.join(clientDist, 'index.html');

if (fs.existsSync(clientIndex)) {
  app.use(express.static(clientDist));

  // SPA fallback so deep links like /login or /merchant/dashboard work on refresh
  app.get('*', (req, res) => {
    res.sendFile(clientIndex);
  });
} else {
  app.get('*', (req, res) => {
    res.status(503).json({
      error: 'Frontend not built',
      requestedUrl: req.originalUrl,
      instructions: 'Run: npm run build --prefix client'
    });
  });
}

// 404 Handler for anything still unmatched
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    requestedUrl: req.originalUrl,
    availableEndpoints: '/api',
    documentation: 'Import smart-dubes.postman_collection.json into Postman'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled API Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

module.exports = app;
