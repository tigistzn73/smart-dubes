const app = require('./app');
const os = require('os');

const PORT = process.env.PORT || 5000;

// Get local network IP for display
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`================================================`);
  console.log(`🚀 Smart Dube API + Frontend running on port ${PORT}`);
  console.log(`📍 Local:   http://localhost:${PORT}/`);
  console.log(`📍 Network: http://${localIP}:${PORT}/`);
  console.log(`================================================`);
});

// Without a listener, a bind failure surfaces as an unhandled 'error' event and
// a raw Node stack trace, which reads like a crash in this codebase rather than
// the mundane "you left the server running" that it almost always is.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`[SERVER] Port ${PORT} is already in use.`);
    console.error('[SERVER] Another copy of the server is almost certainly still running.');
    console.error('[SERVER] Stop it, then start again:');
    console.error(`[SERVER]   Get-NetTCPConnection -LocalPort ${PORT} -State Listen`);
    console.error(`[SERVER]   Stop-Process -Id <PID> -Force`);
    console.error('[SERVER] Or start this one on a different port:');
    console.error(`[SERVER]   $env:PORT=5001; npm start`);
  } else if (err.code === 'EACCES') {
    console.error(`[SERVER] Not permitted to bind port ${PORT}. Ports below 1024 need elevated rights.`);
  } else {
    console.error('[SERVER] Failed to start:', err.message);
  }
  process.exit(1);
});

// Shut down cleanly so the escalation scheduler's interval timer cannot hold the
// process open and so pooled Postgres connections are returned.
function shutdown(signal) {
  console.log(`\n[SERVER] ${signal} received — shutting down.`);
  server.close(() => {
    const pool = require('./config/database').pool;
    const done = () => process.exit(0);
    if (pool && !pool.ended) {
      pool.end().then(done).catch(done);
    } else {
      done();
    }
  });
  // Do not hang forever on a stuck keep-alive connection.
  setTimeout(() => process.exit(0), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
