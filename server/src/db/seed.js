const db = require('../config/database');
const bcrypt = require('bcryptjs');

// Tables that hold real business data. Never cleared automatically.
const PROTECTED_TABLES = [
  'users', 'merchants', 'customer_profiles', 'credit_transactions',
  'repayments', 'sms_notifications', 'payment_gateway_logs', 'audit_logs'
];

// Set ALLOW_DESTRUCTIVE_SEED=true only to wipe a database on purpose.
function destructiveSeedAllowed() {
  return process.env.ALLOW_DESTRUCTIVE_SEED === 'true';
}

async function countAllRows() {
  const counts = {};
  for (const t of PROTECTED_TABLES) {
    try {
      const row = await db.get(`SELECT COUNT(*) as count FROM ${t}`);
      counts[t] = parseInt(row && row.count, 10) || 0;
    } catch (e) {
      counts[t] = 0; // table may not exist yet
    }
  }
  return counts;
}

async function seedDatabase() {
  const counts = await countAllRows();
  const existing = Object.values(counts).reduce((a, b) => a + b, 0);

  if (existing > 0 && !destructiveSeedAllowed()) {
    console.warn(
      '[DB] SKIPPING seed: database already contains data ' +
      `(${Object.entries(counts).filter(([, n]) => n > 0).map(([t, n]) => `${t}=${n}`).join(', ')}).`
    );
    console.warn('[DB] Existing records were left untouched. To force a wipe anyway,');
    console.warn('[DB] set ALLOW_DESTRUCTIVE_SEED=true in server/.env and restart.');
    return { skipped: true, reason: 'database_not_empty', counts };
  }

  if (existing > 0) {
    console.warn(`[DB] ALLOW_DESTRUCTIVE_SEED=true — wiping ${existing} existing rows.`);
  }

  console.log('Seeding Smart Dube database with demo records in PostgreSQL...');

  const salt = bcrypt.genSaltSync(10);
  const adminPass = bcrypt.hashSync('admin123', salt);
  const merchantPass = bcrypt.hashSync('merchant123', salt);
  const customerPass = bcrypt.hashSync('customer123', salt);

  try {
    // Clear existing tables (only reachable when the table is empty, or when
    // ALLOW_DESTRUCTIVE_SEED=true was set deliberately).
    for (const t of PROTECTED_TABLES) {
      try {
        await db.run(`DELETE FROM ${t}`);
      } catch (e) {
        // Table absent on a fresh database - nothing to clear.
      }
    }

    // 1. Users
    const adminUser = await db.get(`
      INSERT INTO users (full_name, phone, email, role, password_hash, fayda_id)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, ['Solomon Kebede (Admin)', '+251987005355', 'admin@smartdube.et', 'ADMIN', adminPass, 'FYD-8890-1122-33']);

    const merchantUser1 = await db.get(`
      INSERT INTO users (full_name, phone, email, role, password_hash, fayda_id)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, ['Abebe Bikila', '+251911223344', 'abebe@bikalastore.et', 'MERCHANT', merchantPass, 'FYD-4455-6677-88']);

    const merchantUser2 = await db.get(`
      INSERT INTO users (full_name, phone, email, role, password_hash, fayda_id)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, ['Tigist Alemu', '+251922334455', 'tigist@boleminimarket.et', 'MERCHANT', merchantPass, 'FYD-1122-3344-55']);

    const customerUser1 = await db.get(`
      INSERT INTO users (full_name, phone, email, role, password_hash, fayda_id)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, ['Dawit Yohannes', '+251933445566', 'dawit@gmail.com', 'CUSTOMER', customerPass, 'FYD-9988-7766-55']);

    const customerUser2 = await db.get(`
      INSERT INTO users (full_name, phone, email, role, password_hash, fayda_id)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, ['Bethlehem Tadesse', '+251944556677', 'betty@gmail.com', 'CUSTOMER', customerPass, 'FYD-5544-3322-11']);

    // 2. Merchants
    const merchant1 = await db.get(`
      INSERT INTO merchants (user_id, store_name, business_license_no, address, kyc_status, verified_at)
      VALUES ($1, $2, $3, $4, 'VERIFIED', NOW()) RETURNING id
    `, [merchantUser1.id, 'Arada Neighborhood Supermarket', 'BL-ADDIS-2024-9981', 'Arada Sub-city, Woreda 03, Addis Ababa']);

    const merchant2 = await db.get(`
      INSERT INTO merchants (user_id, store_name, business_license_no, address, kyc_status, verified_at)
      VALUES ($1, $2, $3, $4, 'PENDING', NULL) RETURNING id
    `, [merchantUser2.id, 'Bole Medhanealem Mini Market', 'BL-BOLE-2025-4412', 'Bole Medhanealem, Addis Ababa']);

    // 3. Customer Profiles
    const cp1 = await db.get(`
      INSERT INTO customer_profiles (merchant_id, user_id, full_name, phone, fayda_id, photo_url, credit_limit, current_balance, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
    `, [merchant1.id, customerUser1.id, 'Dawit Yohannes', '+251933445566', 'FYD-9988-7766-55', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 8000.00, 3250.00, 'ACTIVE']);

    const cp2 = await db.get(`
      INSERT INTO customer_profiles (merchant_id, user_id, full_name, phone, fayda_id, photo_url, credit_limit, current_balance, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
    `, [merchant1.id, customerUser2.id, 'Bethlehem Tadesse', '+251944556677', 'FYD-5544-3322-11', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 5000.00, 4800.00, 'ACTIVE']);

    const cp3 = await db.get(`
      INSERT INTO customer_profiles (merchant_id, user_id, full_name, phone, fayda_id, photo_url, credit_limit, current_balance, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
    `, [merchant1.id, null, 'Elias Worku', '+251955667788', 'FYD-7711-2233-44', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', 6000.00, 0.00, 'ACTIVE']);

    // 4. Credit Transactions
    const items1 = JSON.stringify([
      { name: 'Teff Flour (25kg)', quantity: 1, unitPrice: 2200.00, total: 2200.00 },
      { name: 'Sunflower Cooking Oil (5L)', quantity: 1, unitPrice: 1050.00, total: 1050.00 }
    ]);

    const items2 = JSON.stringify([
      { name: 'Tomoka Coffee Beans (500g)', quantity: 2, unitPrice: 400.00, total: 800.00 },
      { name: 'Anchor Milk Powder (1kg)', quantity: 4, unitPrice: 1000.00, total: 4000.00 }
    ]);

    const tx1 = await db.get(`
      INSERT INTO credit_transactions (transaction_ref, customer_id, merchant_id, items_json, total_amount, due_date, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7) RETURNING id
    `, ['DUBE-1001', cp1.id, merchant1.id, items1, 3250.00, '2026-08-20', 'Monthly grocery credit Dube']);

    const tx2 = await db.get(`
      INSERT INTO credit_transactions (transaction_ref, customer_id, merchant_id, items_json, total_amount, due_date, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7) RETURNING id
    `, ['DUBE-1002', cp2.id, merchant1.id, items2, 4800.00, '2026-07-30', 'Past due household items purchase']);

    // 5. Repayments
    await db.run(`
      INSERT INTO repayments (repayment_ref, transaction_id, customer_id, merchant_id, amount, payment_gateway, reference_code, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED')
    `, ['PAY-9001', tx1.id, cp1.id, merchant1.id, 1000.00, 'TELEBIRR', 'TEL-9988123']);

    // 6. Gateway Logs & Audit Logs
    await db.run(`
      INSERT INTO payment_gateway_logs (gateway_name, event_type, payload_json, response_status)
      VALUES ($1, $2, $3, $4)
    `, ['TELEBIRR', 'PAYMENT_COMPLETED', '{"txRef":"DUBE-1001","amount":1000,"phone":"+251933445566"}', '200_OK']);

    await db.run(`
      INSERT INTO audit_logs (user_id, actor_name, action, resource, details_json, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [adminUser.id, 'Solomon Kebede (Admin)', 'SYSTEM_INIT_SEED', 'DATABASE', '{"status":"Seeded successfully"}', '127.0.0.1']);

    console.log('Smart Dube database seeded successfully in PostgreSQL!');
    return { seeded: true };
  } catch (err) {
    console.error('Seeding failed:', err);
    return { seeded: false, error: err.message };
  }
}

if (require.main === module) {
  seedDatabase().then(() => {
    if (db.pool) db.pool.end();
  });
}

module.exports = seedDatabase;
