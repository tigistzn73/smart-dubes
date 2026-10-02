// Signs and verifies the capability token that guards the public court-letter
// image route.
//
// Twilio fetches MMS media by GET with no cookies and no Authorization header,
// so the image cannot sit behind the normal JWT auth middleware. Instead the URL
// itself carries an HMAC token scoped to a single escalation case and valid for
// a bounded window. Possession of the URL is the authorisation, which is the same
// model used for password-reset links.
//
// Reuses JWT_SECRET so no additional secret has to be provisioned. Set
// COURT_LETTER_TOKEN_SECRET to rotate this independently of user sessions.

// The Node crypto module, not the WebCrypto global. `globalThis.crypto` exposes
// subtle crypto but no createHmac, so a bare require() here would silently
// resolve to the wrong object and fail only when a letter was actually signed.
const crypto = require('crypto');
require('dotenv').config();

const DEFAULT_TTL_HOURS = 168; // 7 days: covers the notice grace period plus retries.

function resolveSecret() {
  return process.env.COURT_LETTER_TOKEN_SECRET || process.env.JWT_SECRET || 'smart_dube_super_secret_jwt_key_2026';
}

function hmac(payload) {
  return crypto.createHmac('sha256', resolveSecret()).update(payload).digest('hex');
}

/**
 * Issue a token for one escalation case.
 * @returns {string} "<caseId>.<expiryEpochSeconds>.<signature>"
 */
function signCourtLetterToken(caseId, ttlHours = DEFAULT_TTL_HOURS) {
  const expiry = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const payload = `${caseId}.${expiry}`;
  return `${payload}.${hmac(payload)}`;
}

/**
 * Constant-time verification of a court letter token.
 * @returns {{valid: boolean, reason?: string, caseId?: number}}
 */
function verifyCourtLetterToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'missing' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'malformed' };
  }

  const [caseIdRaw, expiryRaw, signature] = parts;
  const expiry = Number(expiryRaw);
  const caseId = Number(caseIdRaw);

  if (!Number.isInteger(caseId) || caseId <= 0 || !Number.isFinite(expiry)) {
    return { valid: false, reason: 'malformed' };
  }

  const expected = hmac(`${caseIdRaw}.${expiryRaw}`);
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad_signature' };
  }

  if (expiry * 1000 < Date.now()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, caseId };
}

module.exports = {
  signCourtLetterToken,
  verifyCourtLetterToken,
  DEFAULT_TTL_HOURS
};