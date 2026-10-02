// Twilio SMS / MMS gateway.
//
// Loaded lazily and defensively so a missing SDK, missing credentials, or a bad
// trial account degrades to "this gateway is unavailable" instead of taking the
// whole server down at require time. Every consumer must treat `isTwilioConfigured()`
// as a runtime check, never as proof that delivery will succeed.

require('dotenv').config();

let twilioClient = null;
let twilioLoadAttempted = false;

function loadTwilioClient() {
  if (twilioLoadAttempted) return twilioClient;
  twilioLoadAttempted = true;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) return null;

  try {
    // eslint-disable-next-line global-require
    const twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
  } catch (err) {
    console.warn(`[TWILIO] SDK could not be initialised: ${err.message}`);
    twilioClient = null;
  }

  return twilioClient;
}

function senderIdentity() {
  // A Messaging Service SID takes precedence: it owns the sender number and
  // its opt-out handling, which is the correct setup for production sending.
  const serviceSid = (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
  if (serviceSid) return { messagingServiceSid: serviceSid, from: null };

  const from = (process.env.TWILIO_FROM_NUMBER || '').trim();
  if (from) return { messagingServiceSid: null, from };

  return { messagingServiceSid: null, from: null };
}

/**
 * True when there is enough configuration to attempt a send.
 * Does not guarantee delivery: on a free trial Twilio rejects any destination
 * that has not completed recipient verification.
 */
function isTwilioConfigured() {
  const client = loadTwilioClient();
  if (!client) return false;
  const sender = senderIdentity();
  return !!(sender.messagingServiceSid || sender.from);
}

/**
 * Send an SMS, or an MMS when mediaUrls is supplied.
 *
 * `mediaUrls` must be absolute public HTTPS URLs. Twilio fetches them
 * server-side, so they cannot be localhost and cannot require auth headers.
 *
 * Returns a normalised result; never throws for a delivery-level failure.
 */
async function sendViaTwilio({ to, body, mediaUrls }) {
  const client = loadTwilioClient();

  if (!client) {
    return { success: false, gateway: 'twilio', error: 'Twilio is not configured. TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.' };
  }

  const sender = senderIdentity();
  if (!sender.messagingServiceSid && !sender.from) {
    return { success: false, gateway: 'twilio', error: 'Twilio has no sender. Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.' };
  }

  const media = (Array.isArray(mediaUrls) ? mediaUrls : mediaUrls ? [mediaUrls] : []).filter(Boolean);

  // Twilio's SMS body limit is 1600 characters. Long letters are already
  // chunked upstream, but guard here so a caller can never silently truncate.
  const trimmedBody = body && body.length > 1600 ? body.slice(0, 1597) + '...' : body;

  try {
    const message = await client.messages.create({
      to,
      body: trimmedBody,
      ...(sender.messagingServiceSid ? { messagingServiceSid: sender.messagingServiceSid } : { from: sender.from }),
      ...(media.length > 0 ? { mediaUrl: media } : {})
    });

    return {
      success: true,
      gateway: 'twilio',
      messageSid: message.sid,
      status: message.status,
      to: message.to,
      isMms: media.length > 0
    };
  } catch (err) {
    // 21614 is Twilio's "unverified recipient on a trial account" code. It is
    // the single most likely failure during rollout, so it gets its own message.
    if (err.code === 21614) {
      return {
        success: false,
        gateway: 'twilio',
        error: 'Twilio trial accounts can only send to verified recipients. Verify this number in the Twilio console, or upgrade the account.'
      };
    }

    return {
      success: false,
      gateway: 'twilio',
      error: err.message || 'Twilio send failed.',
      twilioCode: err.code != null ? String(err.code) : undefined,
      twilioStatus: err.status != null ? err.status : undefined
    };
  }
}

/**
 * Log the resolved Twilio posture at boot without ever printing secrets.
 */
function describeTwilioConfig() {
  const configured = isTwilioConfigured();
  if (!configured) {
    console.log('[TWILIO] Not configured. SMS will fall back to the next available gateway.');
    return;
  }

  const sender = senderIdentity();
  const senderLabel = sender.messagingServiceSid
    ? `Messaging Service ${sender.messagingServiceSid}`
    : `number ${sender.from}`;

  console.log(`[TWILIO] Configured via ${senderLabel}.`);
  if (/^SK/.test(process.env.TWILIO_ACCOUNT_SID || '')) {
    console.log('[TWILIO] Trial account: messages only reach recipient-verified numbers, and MMS is limited.');
  }
}

module.exports = {
  isTwilioConfigured,
  sendViaTwilio,
  describeTwilioConfig
};