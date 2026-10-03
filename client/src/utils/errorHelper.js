/**
 * Error extraction and validation helpers for Smart Dube
 */

/**
 * Safely extracts a clean, human-readable error message from an API response,
 * error object, or string.
 *
 * @param {any} errOrData - Error instance, response object, or string
 * @param {string} fallback - Default message to return if nothing is found
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(errOrData, fallback = 'Operation failed. Please check your inputs.') {
  if (!errOrData) return fallback;

  if (typeof errOrData === 'string') {
    return errOrData;
  }

  // If Error instance
  if (errOrData instanceof Error) {
    if (errOrData.message && errOrData.message !== 'Validation failed for request payload') {
      return errOrData.message;
    }
  }

  // If express-validator details array: [{ field: 'phone', message: '...' }]
  if (Array.isArray(errOrData.details) && errOrData.details.length > 0) {
    const detailMsgs = errOrData.details.map(d => d.message || d.msg).filter(Boolean);
    if (detailMsgs.length > 0) {
      return Array.from(new Set(detailMsgs)).join('. ');
    }
  }

  // If errors array
  if (Array.isArray(errOrData.errors) && errOrData.errors.length > 0) {
    const errorStrings = errOrData.errors.map(e => (typeof e === 'string' ? e : e.message || e.msg)).filter(Boolean);
    if (errorStrings.length > 0) {
      return Array.from(new Set(errorStrings)).join('. ');
    }
  }

  // If primary error string
  if (errOrData.error && typeof errOrData.error === 'string' && errOrData.error !== 'Validation failed for request payload') {
    return errOrData.error;
  }

  // If message or reason
  if (errOrData.message && typeof errOrData.message === 'string' && errOrData.message !== 'Validation failed for request payload') {
    return errOrData.message;
  }

  if (errOrData.reason && typeof errOrData.reason === 'string') {
    return errOrData.reason;
  }

  return fallback;
}

/**
 * Validates Ethiopian phone number format (+2519..., +2517..., 09..., 07...).
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidEthiopianPhone(phone) {
  if (!phone) return false;
  const cleaned = String(phone).replace(/[\s\-]/g, '');
  return /^(\+251|0)[79]\d{8}$/.test(cleaned);
}

export function isValidEmail(email) {
  if (!email) return false;
  const trimmed = String(email).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
