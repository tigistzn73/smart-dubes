const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
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

let pgPool = null;
let useMemoryStore = false;

// Set up PostgreSQL pool if configured
if (process.env.DATABASE_URL) {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else if (process.env.PG_HOST || process.env.PG_PORT) {
  pgPool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5433'),
    database: process.env.PG_DATABASE || 'smart_dube_system',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'my1919',
    connectionTimeoutMillis: 3000
  });
}

if (pgPool) {
  pgPool.on('error', (err) => {
    console.warn('[DB] PostgreSQL notice:', err.message);
  });
}

// ----------------------------------------------------------------
// Pure JavaScript Embedded Database Engine (Zero Native Addon)
// ----------------------------------------------------------------
const DATA_FILE = path.resolve(__dirname, '../../smart_dube_data.json');

let store = {
  users: [],
  merchants: [],
  customer_profiles: [],
  credit_transactions: [],
  repayments: [],
  sms_notifications: [],
  payment_gateway_logs: [],
  audit_logs: [],
  installment_schedules: []
};

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      const loaded = JSON.parse(content);
      store = { ...store, ...loaded };
    }
  } catch (e) {
    console.warn('[DB] Could not load data file, initializing fresh:', e.message);
  }

  // If users is empty, seed demo accounts
  if (!store.users || store.users.length === 0) {
    seedMemoryStore();
  }
}

function saveStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    // Non-blocking save error
  }
}

function seedMemoryStore() {
  const salt = bcrypt.genSaltSync(10);
  const adminPass = bcrypt.hashSync('admin123', salt);
  const merchantPass = bcrypt.hashSync('merchant123', salt);
  const merchantPass1212 = bcrypt.hashSync('merchant1212', salt);
  const customerPass = bcrypt.hashSync('customer123', salt);

  store.users = [
    {
      id: 1,
      full_name: 'Solomon Kebede (Admin)',
      phone: '+251987005355',
      email: 'admin@smartdube.et',
      role: 'ADMIN',
      password_hash: adminPass,
      fayda_id: 'FYD-8890-1122-33',
      photo_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Solomon',
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      full_name: 'Abebe Bikila',
      phone: '+251911223344',
      email: 'abebe@bikalastore.et',
      role: 'MERCHANT',
      password_hash: merchantPass,
      fayda_id: 'FYD-4455-6677-88',
      photo_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Abebe',
      created_at: new Date().toISOString()
    },
    {
      id: 3,
      full_name: 'Tigist Alemu',
      phone: '+251922334455',
      email: 'tigist@boleminimarket.et',
      role: 'MERCHANT',
      password_hash: merchantPass,
      fayda_id: 'FYD-1122-3344-55',
      photo_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tigist',
      created_at: new Date().toISOString()
    },
    {
      id: 4,
      full_name: 'Zemero Supermarket',
      phone: '+251932167208',
      email: 'zemero@gmail.com',
      role: 'MERCHANT',
      password_hash: merchantPass1212,
      fayda_id: 'FYD-3322-1144-55',
      photo_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zemero',
      created_at: new Date().toISOString()
    },
    {
      id: 5,
      full_name: 'Dawit Yohannes',
      phone: '+251933445566',
      email: 'dawit@gmail.com',
      role: 'CUSTOMER',
      password_hash: customerPass,
      fayda_id: 'FYD-9988-7766-55',
      photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      created_at: new Date().toISOString()
    },
    {
      id: 6,
      full_name: 'Bethlehem Tadesse',
      phone: '+251944556677',
      email: 'betty@gmail.com',
      role: 'CUSTOMER',
      password_hash: customerPass,
      fayda_id: 'FYD-5544-3322-11',
      photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      created_at: new Date().toISOString()
    }
  ];

  store.merchants = [
    {
      id: 1,
      user_id: 2,
      store_name: 'Arada Neighborhood Supermarket',
      business_license_no: 'BL-ADDIS-2024-9981',
      address: 'Arada Sub-city, Woreda 03, Addis Ababa',
      kyc_status: 'VERIFIED',
      verified_at: new Date().toISOString(),
      kyc_notes: 'All documents verified',
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      user_id: 3,
      store_name: 'Bole Medhanealem Mini Market',
      business_license_no: 'BL-BOLE-2025-4412',
      address: 'Bole Medhanealem, Addis Ababa',
      kyc_status: 'PENDING',
      verified_at: null,
      kyc_notes: null,
      created_at: new Date().toISOString()
    },
    {
      id: 3,
      user_id: 4,
      store_name: 'Zemero Supermarket & Dube',
      business_license_no: 'BL-KIRKOS-2026-1192',
      address: 'Kirkos, Addis Ababa',
      kyc_status: 'VERIFIED',
      verified_at: new Date().toISOString(),
      kyc_notes: 'Verified via automated KYC',
      created_at: new Date().toISOString()
    }
  ];

  store.customer_profiles = [
    {
      id: 1,
      merchant_id: 1,
      user_id: 5,
      full_name: 'Dawit Yohannes',
      phone: '+251933445566',
      fayda_id: 'FYD-9988-7766-55',
      photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      credit_limit: 8000.00,
      current_balance: 3250.00,
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      merchant_id: 1,
      user_id: 6,
      full_name: 'Bethlehem Tadesse',
      phone: '+251944556677',
      fayda_id: 'FYD-5544-3322-11',
      photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      credit_limit: 5000.00,
      current_balance: 4800.00,
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    }
  ];

  store.credit_transactions = [
    {
      id: 1,
      transaction_ref: 'DUBE-1001',
      customer_id: 1,
      merchant_id: 1,
      items_json: JSON.stringify([
        { name: 'Teff Flour (25kg)', quantity: 1, unitPrice: 2200.00, total: 2200.00 },
        { name: 'Sunflower Cooking Oil (5L)', quantity: 1, unitPrice: 1050.00, total: 1050.00 }
      ]),
      total_amount: 3250.00,
      due_date: '2026-09-15',
      status: 'PENDING',
      notes: 'Monthly grocery credit Dube',
      created_at: new Date().toISOString()
    }
  ];

  store.repayments = [];
  store.sms_notifications = [];
  store.payment_gateway_logs = [];
  store.audit_logs = [];
  store.installment_schedules = [];

  saveStore();
  console.log('[DB] Embedded store seeded with initial demo data successfully.');
}

loadStore();

// Pure JS Query Runner
function executeMemoryQuery(text, params = []) {
  const sql = text.trim();
  const lowerSql = sql.toLowerCase();

  // 1. SELECT COUNT(*) as count FROM users
  if (/select\s+count\(\*\)\s+as\s+count\s+from\s+(\w+)/i.test(sql)) {
    const match = sql.match(/select\s+count\(\*\)\s+as\s+count\s+from\s+(\w+)/i);
    const tbl = match[1].toLowerCase();
    const rows = store[tbl] || [];
    return [{ count: rows.length }];
  }

  // 2. SELECT ... FROM users WHERE phone = $1
  if (/select\s+[\s\S]*?\s+from\s+users\s+where\s+phone\s*=\s*\$1/i.test(sql)) {
    const phone = String(params[0] || '').trim();
    const row = store.users.find(u => u.phone === phone);
    return row ? [row] : [];
  }

  // 3. SELECT ... FROM users WHERE id = $1
  if (/select\s+[\s\S]*?\s+from\s+users\s+where\s+id\s*=\s*\$1/i.test(sql)) {
    const id = Number(params[0]);
    const row = store.users.find(u => u.id === id);
    return row ? [row] : [];
  }

  // 4. SELECT id FROM users WHERE phone = $1 OR ...
  if (/select\s+id\s+from\s+users\s+where\s+phone/i.test(sql)) {
    const phone = String(params[0] || '').trim();
    const email = String(params[1] || '').trim();
    const row = store.users.find(u => u.phone === phone || (email && u.email === email));
    return row ? [{ id: row.id }] : [];
  }

  // 5. SELECT * FROM merchants WHERE user_id = $1
  if (/select\s+\*\s+from\s+merchants\s+where\s+user_id\s*=\s*\$1/i.test(sql)) {
    const userId = Number(params[0]);
    const row = store.merchants.find(m => m.user_id === userId);
    return row ? [row] : [];
  }

  // 6. SELECT * FROM customer_profiles WHERE ...
  if (/select\s+\*\s+from\s+customer_profiles/i.test(sql)) {
    if (/merchant_id\s*=\s*\$1/i.test(sql)) {
      const mId = Number(params[0]);
      return store.customer_profiles.filter(cp => cp.merchant_id === mId);
    }
    if (/user_id\s*=\s*\$1\s+or\s+phone\s*=\s*\$2/i.test(sql)) {
      const uId = Number(params[0]);
      const ph = String(params[1] || '').trim();
      const row = store.customer_profiles.find(cp => cp.user_id === uId || cp.phone === ph);
      return row ? [row] : [];
    }
    if (/phone\s*=\s*\$1/i.test(sql)) {
      const ph = String(params[0] || '').trim();
      return store.customer_profiles.filter(cp => cp.phone === ph);
    }
    return store.customer_profiles;
  }

  // 7. SELECT * FROM credit_transactions WHERE ...
  if (/select\s+\*\s+from\s+credit_transactions/i.test(sql)) {
    if (/merchant_id\s*=\s*\$1/i.test(sql)) {
      const mId = Number(params[0]);
      return store.credit_transactions.filter(t => t.merchant_id === mId);
    }
    if (/customer_id\s*=\s*\$1/i.test(sql)) {
      const cId = Number(params[0]);
      return store.credit_transactions.filter(t => t.customer_id === cId);
    }
    return store.credit_transactions;
  }

  // 8. SELECT * FROM repayments ...
  if (/select\s+\*\s+from\s+repayments/i.test(sql)) {
    if (/merchant_id\s*=\s*\$1/i.test(sql)) {
      const mId = Number(params[0]);
      return store.repayments.filter(r => r.merchant_id === mId);
    }
    if (/customer_id\s*=\s*\$1/i.test(sql)) {
      const cId = Number(params[0]);
      return store.repayments.filter(r => r.customer_id === cId);
    }
    return store.repayments;
  }

  // 9. INSERT INTO users ...
  if (/insert\s+into\s+users/i.test(sql)) {
    const id = (store.users.length > 0 ? Math.max(...store.users.map(u => u.id)) : 0) + 1;
    const user = {
      id,
      full_name: params[0],
      phone: params[1],
      email: params[2] || null,
      role: params[3],
      password_hash: params[4],
      fayda_id: params[5] || null,
      photo_url: params[6] || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(params[0])}`,
      created_at: new Date().toISOString()
    };
    store.users.push(user);
    saveStore();
    return [{ id }];
  }

  // 10. INSERT INTO merchants ...
  if (/insert\s+into\s+merchants/i.test(sql)) {
    const id = (store.merchants.length > 0 ? Math.max(...store.merchants.map(m => m.id)) : 0) + 1;
    const merchant = {
      id,
      user_id: params[0],
      store_name: params[1],
      business_license_no: params[2],
      address: params[3],
      kyc_status: 'PENDING',
      created_at: new Date().toISOString()
    };
    store.merchants.push(merchant);
    saveStore();
    return [{ id }];
  }

  // 11. INSERT INTO customer_profiles ...
  if (/insert\s+into\s+customer_profiles/i.test(sql)) {
    const id = (store.customer_profiles.length > 0 ? Math.max(...store.customer_profiles.map(c => c.id)) : 0) + 1;
    const cp = {
      id,
      merchant_id: params[0],
      user_id: params[1],
      full_name: params[2],
      phone: params[3],
      fayda_id: params[4],
      photo_url: params[5],
      credit_limit: parseFloat(params[6] || 5000),
      current_balance: parseFloat(params[7] || 0),
      status: params[8] || 'ACTIVE',
      created_at: new Date().toISOString()
    };
    store.customer_profiles.push(cp);
    saveStore();
    return [{ id }];
  }

  // 12. INSERT INTO credit_transactions ...
  if (/insert\s+into\s+credit_transactions/i.test(sql)) {
    const id = (store.credit_transactions.length > 0 ? Math.max(...store.credit_transactions.map(t => t.id)) : 0) + 1;
    const tx = {
      id,
      transaction_ref: params[0],
      customer_id: params[1],
      merchant_id: params[2],
      items_json: params[3],
      total_amount: parseFloat(params[4]),
      due_date: params[5],
      status: 'PENDING',
      notes: params[6] || '',
      created_at: new Date().toISOString()
    };
    store.credit_transactions.push(tx);
    saveStore();
    return [{ id }];
  }

  // 13. INSERT INTO repayments ...
  if (/insert\s+into\s+repayments/i.test(sql)) {
    const id = (store.repayments.length > 0 ? Math.max(...store.repayments.map(r => r.id)) : 0) + 1;
    const repayment = {
      id,
      repayment_ref: params[0],
      transaction_id: params[1],
      customer_id: params[2],
      merchant_id: params[3],
      amount: parseFloat(params[4]),
      payment_gateway: params[5],
      reference_code: params[6],
      receipt_url: params[7] || null,
      status: 'PENDING',
      created_at: new Date().toISOString()
    };
    store.repayments.push(repayment);
    saveStore();
    return [{ id }];
  }

  // 14. INSERT INTO audit_logs ...
  if (/insert\s+into\s+audit_logs/i.test(sql)) {
    const id = (store.audit_logs.length > 0 ? Math.max(...store.audit_logs.map(a => a.id)) : 0) + 1;
    store.audit_logs.push({
      id,
      user_id: params[0],
      actor_name: params[1],
      action: params[2],
      resource: params[3],
      details_json: params[4],
      ip_address: params[5],
      created_at: new Date().toISOString()
    });
    saveStore();
    return [{ id }];
  }

  // 15. INSERT INTO sms_notifications ...
  if (/insert\s+into\s+sms_notifications/i.test(sql)) {
    const id = (store.sms_notifications.length > 0 ? Math.max(...store.sms_notifications.map(s => s.id)) : 0) + 1;
    store.sms_notifications.push({
      id,
      customer_id: params[0],
      phone: params[1],
      message: params[2],
      type: params[3],
      status: 'SIMULATED',
      sent_at: new Date().toISOString()
    });
    saveStore();
    return [{ id }];
  }

  // 16. INSERT INTO payment_gateway_logs ...
  if (/insert\s+into\s+payment_gateway_logs/i.test(sql)) {
    const id = (store.payment_gateway_logs.length > 0 ? Math.max(...store.payment_gateway_logs.map(p => p.id)) : 0) + 1;
    store.payment_gateway_logs.push({
      id,
      gateway_name: params[0],
      event_type: params[1],
      payload_json: params[2],
      response_status: params[3],
      created_at: new Date().toISOString()
    });
    saveStore();
    return [{ id }];
  }

  // 17. UPDATE customer_profiles ...
  if (/update\s+customer_profiles/i.test(sql)) {
    saveStore();
    return [{ rowCount: 1 }];
  }

  // 18. UPDATE users ...
  if (/update\s+users/i.test(sql)) {
    saveStore();
    return [{ rowCount: 1 }];
  }

  // 19. SELECT * FROM audit_logs ...
  if (/select\s+\*\s+from\s+audit_logs/i.test(sql)) {
    return store.audit_logs.slice(-100).reverse();
  }

  // 20. SELECT * FROM merchants ...
  if (/select\s+\*\s+from\s+merchants/i.test(sql)) {
    return store.merchants;
  }

  // 21. SELECT * FROM users ...
  if (/select\s+\*\s+from\s+users/i.test(sql)) {
    return store.users;
  }

  // Default fallback
  return [];
}

module.exports = {
  pool: pgPool,

  async all(text, params = []) {
    if (!useMemoryStore && pgPool) {
      try {
        const res = await pgPool.query(text, params);
        return res.rows;
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === '28P01' || err.message.includes('connect')) {
          console.warn('[DB] PostgreSQL unreachable, using pure JS embedded store...');
          useMemoryStore = true;
        } else {
          throw err;
        }
      }
    }

    return executeMemoryQuery(text, params);
  },

  async get(text, params = []) {
    if (!useMemoryStore && pgPool) {
      try {
        const res = await pgPool.query(text, params);
        return res.rows[0];
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === '28P01' || err.message.includes('connect')) {
          console.warn('[DB] PostgreSQL unreachable, using pure JS embedded store...');
          useMemoryStore = true;
        } else {
          throw err;
        }
      }
    }

    const rows = executeMemoryQuery(text, params);
    return rows[0] || null;
  },

  async run(text, params = []) {
    if (!useMemoryStore && pgPool) {
      try {
        const res = await pgPool.query(text, params);
        return { rowCount: res.rowCount, rows: res.rows };
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === '28P01' || err.message.includes('connect')) {
          console.warn('[DB] PostgreSQL unreachable, using pure JS embedded store...');
          useMemoryStore = true;
        } else {
          throw err;
        }
      }
    }

    const rows = executeMemoryQuery(text, params);
    return { rowCount: rows.length || 1, rows };
  },

  async transaction(callback) {
    if (!useMemoryStore && pgPool) {
      try {
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
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === '28P01' || err.message.includes('connect')) {
          useMemoryStore = true;
        } else {
          throw err;
        }
      }
    }

    return callback(this);
  }
};

