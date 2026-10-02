// Resolves the externally reachable base URL for this deployment.
//
// Twilio fetches MMS media over the public internet, so an image served from
// http://localhost:5000 is useless to it. Render exposes RENDER_EXTERNAL_URL
// automatically; elsewhere PUBLIC_BASE_URL covers it.

require('dotenv').config();

function normaliseBase(value) {
  if (!value) return null;
  const trimmed = String(value).trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function getPublicBaseUrl() {
  const explicit = normaliseBase(process.env.PUBLIC_BASE_URL);
  if (explicit) return explicit;

  const renderUrl = normaliseBase(process.env.RENDER_EXTERNAL_URL);
  if (renderUrl) return renderUrl;

  return null;
}

/**
 * True when the deployment has a publicly reachable address, which is the
 * precondition for attaching an image to an MMS.
 */
function hasPublicBaseUrl() {
  return getPublicBaseUrl() !== null;
}

function buildPublicUrl(pathname) {
  const base = getPublicBaseUrl();
  if (!base) return null;
  return `${base}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
}

/**
 * Warn loudly when the server has no public address, because court letters
 * will silently degrade to text-only MMS-less SMS.
 */
function describePublicUrlStatus() {
  const base = getPublicBaseUrl();
  if (base) {
    console.log(`[PUBLIC URL] Court letter images will be served from ${base}`);
    return;
  }
  console.warn('[PUBLIC URL] No PUBLIC_BASE_URL or RENDER_EXTERNAL_URL set.');
  console.warn('[PUBLIC URL] Court letters will be sent as text only. Set PUBLIC_BASE_URL to attach the letter image to SMS.');
}

module.exports = {
  getPublicBaseUrl,
  hasPublicBaseUrl,
  buildPublicUrl,
  describePublicUrlStatus
};
