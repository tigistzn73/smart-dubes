// Safe single-account creation script.
//
// Creates ONE user account (and, for MERCHANT/CUSTOMER, the profile that goes
// with it) with a bcrypt-hashed password, mirroring POST /api/auth/register but
// runnable from a terminal against any database. It never wipes or rewrites any
// existing row, never stores a plaintext password, and refuses to touch an
// account that already exists.
//
// Everything comes from the environment — nothing is hardcoded here:
//   DATABASE_URL                   required — which database to write to
//   SEED_ACCOUNT_PHONE             required — dialled as-is, e.g. +251932167208
//   SEED_ACCOUNT_PASSWORD          required — plaintext; bcrypt-hashed here
//   SEED_ACCOUNT_EMAIL             required — accounts must have a verified email
//   SEED_ACCOUNT_FULL_NAME         optional (default "New User")
//   SEED_ACCOUNT_ROLE              optional (ADMIN | MERCHANT | CUSTOMER, default MERCHANT)
//   SEED_ACCOUNT_STORE_NAME        optional (MERCHANT only)
//   SEED_ACCOUNT_LICENSE_NO        optional (MERCHANT only)
//   SEED_ACCOUNT_ADDRESS           optional (MERCHANT only)
//   SEED_ACCOUNT_FAYDA_ID          optional
//
// Run against production from server/:
//   $env:DATABASE_URL='<values from the Render dashboard>'
//   $env:SEED_ACCOUNT_PHONE='+251932167208'
//   $env:SEED_ACCOUNT_PASSWORD='<the real password>'
//   $env:SEED_ACCOUNT_FULL_NAME='zinabu zena'
//   $env:SEED_ACCOUNT_EMAIL='znn@gmail.com'
//   node src/db/seed_account.js

const bcrypt = require('bcryptjs');
const db = require('../config/database');

const NO_VALUE = (name) => !process.env[name] || !String(process.env[name]).trim();

function requireEnv(name) {
  if (NO_VALUE(name)) {
    console.error(`[SEED ACCOUNT] Missing required env var ${name}.`);
    return false;
  }
  return true;
}

async function main() {
  if (!requireEnv('DATABASE_URL') || !requireEnv('SEED_ACCOUNT_PHONE') || !requireEnv('SEED_ACCOUNT_PASSWORD') || !requireEnv('SEED_ACCOUNT_EMAIL')) {
    console.error('[SEED ACCOUNT] Nothing was written. Usage (see top of this file for all vars):');
    console.error('  DATABASE_URL=... SEED_ACCOUNT_PHONE=... SEED_ACCOUNT_PASSWORD=... SEED_ACCOUNT_EMAIL=... node src/db/seed_account.js');
    process.exit(1);
  }

  const phone = String(process.env.SEED_ACCOUNT_PHONE).trim();
  const password = String(process.env.SEED_ACCOUNT_PASSWORD);
  if (password.length < 6) {
    console.error('[SEED ACCOUNT] Password must be at least 6 characters. Nothing was written.');
    process.exit(1);
  }

  const role = (String(process.env.SEED_ACCOUNT_ROLE || 'MERCHANT').trim().toUpperCase());
  if (!['ADMIN', 'MERCHANT', 'CUSTOMER'].includes(role)) {
    console.error(`[SEED ACCOUNT] Role must be ADMIN, MERCHANT or CUSTOMER (got ${role}).`);
    process.exit(1);
  }

  // Lowercased to match how registerUser stores the address. users.email carries a
  // case-insensitive unique index, so an unnormalised value would still be
  // rejected — but only as a raw constraint violation rather than the friendly
  // "already exists" message below.
  const email = (process.env.SEED_ACCOUNT_EMAIL || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('[SEED ACCOUNT] SEED_ACCOUNT_EMAIL must be a valid email address. Nothing was written.');
    process.exit(1);
  }
  const fullName = (process.env.SEED_ACCOUNT_FULL_NAME || 'New User').trim();
  const faydaId = (process.env.SEED_ACCOUNT_FAYDA_ID || '').trim() || null;
  const photoUrl = (process.env.SEED_ACCOUNT_PHOTO_URL || '').trim()
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`;

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const created = await db.transaction(async (client) => {
      const existing = await client.query(
        `SELECT id, full_name, role FROM users WHERE phone = $1 OR lower(btrim(email)) = lower($2)`,
        [phone, email]
      );
      if (existing.rows.length > 0) {
        const u = existing.rows[0];
        console.log(`[SEED ACCOUNT] Account with phone ${phone} already exists (id ${u.id}, role ${u.role}, name "${u.full_name}").`);
        console.log('[SEED ACCOUNT] No changes made.');
        return { existing: u };
      }

      const userRes = await client.query(
        `INSERT INTO users (full_name, phone, email, role, password_hash, fayda_id, photo_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, full_name, role`,
        [fullName, phone, email, role, passwordHash, faydaId, photoUrl]
      );
      const user = userRes.rows[0];

      let merchant = null;
      if (role === 'MERCHANT') {
        const m = await client.query(
          `INSERT INTO merchants (user_id, store_name, business_license_no, address, kyc_status)
           VALUES ($1, $2, $3, $4, 'PENDING') RETURNING id`,
          [user.id, (process.env.SEED_ACCOUNT_STORE_NAME || `${fullName}'s Shop`).trim(),
            (process.env.SEED_ACCOUNT_LICENSE_NO || 'LIC-PENDING').trim(),
            (process.env.SEED_ACCOUNT_ADDRESS || 'Addis Ababa').trim()]
        );
        merchant = m.rows[0];
      } else if (role === 'CUSTOMER') {
        await client.query(
          `UPDATE customer_profiles SET user_id = $1, photo_url = $2 WHERE phone = $3 AND user_id IS NULL`,
          [user.id, photoUrl, phone]
        );
      }

      return { existing: null, user, merchant };
    });

    if (created.existing) {
      try { await db.pool.end(); } catch (e) {}
      process.exit(0);
    }

    console.log('[SEED ACCOUNT] Created account:');
    console.log(`  user id     : ${created.user.id}`);
    console.log(`  full name   : ${created.user.full_name}`);
    console.log(`  role        : ${created.user.role}`);
    console.log(`  phone       : ${phone}`);
    if (created.merchant) console.log(`  merchant id : ${created.merchant.id}`);
    console.log('[SEED ACCOUNT] Password stored as bcrypt:', passwordHash.slice(0, 7) + '…  (never plaintext)');
    try { await db.pool.end(); } catch (e) {}
    process.exit(0);
  } catch (err) {
    console.error('[SEED ACCOUNT] Failed:', err.message);
    try { await db.pool.end(); } catch (e) {}
    process.exit(1);
  }
}

main();