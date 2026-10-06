const db = require('../config/database');
require('dotenv').config();

const { isTwilioConfigured, sendViaTwilio, describeTwilioConfig } = require('./twilioService');
const { sendNotificationEmail } = require('./emailService');

// ============================================================
//  Outbound SMS gateway selection
// ============================================================
// Two providers are supported and one is preferred over the other:
//   twilio            SMS, and MMS when public media URLs are supplied
//   africastalking    SMS only, and no MMS support at all
//
// Twilio is tried first because it is the only gateway that can carry the court
// letter image. Set SMS_GATEWAY_ORDER to change the preference, e.g.
// "africastalking,twilio". Whatever the order, a gateway is only attempted if it
// is actually configured, so a missing key silently moves down the list instead
// of throwing.
//
// Nothing here is load-bearing: if both SDKs are missing the message is still
// recorded in the database and logged.
const GATEWAY_ORDER = (process.env.SMS_GATEWAY_ORDER || 'twilio,africastalking')
  .split(',')
  .map((g) => g.trim().toLowerCase())
  .filter(Boolean);

function gatewayIsAvailable(gateway) {
  if (gateway === 'twilio') return isTwilioConfigured();
  if (gateway === 'africastalking') return !!smsClient;
  return false;
}

// ============================================================
//  Africa's Talking SMS Gateway — optional outbound SMS
// ============================================================
// Required lazily and defensively. A top-level require here would abort the
// whole server at boot if the package is absent, taking down login, the
// ledger and the dashboards with it, because nearly every controller imports
// this module. SMS is an optional add-on, so it must never be load-bearing.
let AfricasTalking = null;
try {
  AfricasTalking = require('africastalking');
} catch (err) {
  console.warn('[SMS GATEWAY] SDK not installed — SMS logging only, no messages will be sent.');
}

const AT_USERNAME = process.env.AT_USERNAME || 'sandbox';
const AT_API_KEY = process.env.AT_API_KEY || '';
const AT_SENDER_ID = process.env.AT_SENDER_ID || '';
const AT_ENV = (process.env.AT_ENV || 'sandbox').toLowerCase();

// Africa's Talking picks the billing endpoint from the username, not from a
// separate mode flag: the literal username "sandbox" routes to the free test
// endpoint, any other username bills the real account. Honouring AT_ENV means
// forcing that username when the mode is sandbox, otherwise setting
// AT_ENV=sandbox with a live username would still spend real money.
const LIVE_SEND = AT_ENV === 'live';
const EFFECTIVE_USERNAME = LIVE_SEND ? AT_USERNAME : 'sandbox';

// Whether the configured AT_API_KEY is real enough to be worth calling with.
// Africa's Talking rejects a production key against the sandbox endpoint with a
// 401, so in sandbox mode the client is not built at all: every message would
// otherwise cost a doomed HTTPS round trip, print a stack line, and be recorded
// as FAILED. Skipping it means sandbox behaves as SIMULATION, which is both
// faster and a truthful description of what happened.
const AT_CREDENTIALS_PRESENT = !!(AT_API_KEY && AT_API_KEY !== 'YOUR_AFRICASTALKING_API_KEY_HERE');
const AT_CAN_SEND = AT_CREDENTIALS_PRESENT && LIVE_SEND;

let smsClient = null;
if (!AfricasTalking) {
  console.log('[SMS GATEWAY] Gateway SDK unavailable — reminders and receipts are logged in-app only.');
} else if (!AT_CREDENTIALS_PRESENT) {
  console.log('[SMS GATEWAY] No API key configured — running in SIMULATION mode.');
} else if (!AT_CAN_SEND) {
  console.log('[SMS GATEWAY] AT_ENV=sandbox — messages are recorded and logged, not sent.');
  console.log(`[SMS GATEWAY] Set AT_ENV=live (with a real AT_USERNAME) to send through Africa's Talking.`);
} else {
  try {
    const at = AfricasTalking({
      apiKey: AT_API_KEY,
      username: EFFECTIVE_USERNAME
    });
    smsClient = at.SMS;
    console.log(`[SMS GATEWAY] LIVE mode — SMS sent as "${AT_USERNAME}" are billed to this account.`);
    console.log(`[SMS GATEWAY] Africa's Talking initialized | Username: ${EFFECTIVE_USERNAME} | Key: ${AT_API_KEY.substring(0, 6)}... | Sender: ${AT_SENDER_ID || 'None'}`);
  } catch (err) {
    console.error('[SMS GATEWAY] Failed to initialize Africa\'s Talking:', err.message);
  }
}

/**
 * Look up the customer's registered email and send the same notice there.
 *
 * Never throws: this is a secondary channel, so any lookup or relay failure is
 * logged and swallowed rather than propagated into the SMS flow.
 */
async function mirrorToEmail({ customerId, type, message }) {
  if (!customerId) return;
  try {
    const row = await db.get(`
      SELECT u.email
      FROM customer_profiles cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.id = $1 AND u.email IS NOT NULL AND btrim(u.email) <> ''
    `, [customerId]);
    if (!row) return;

    const result = await sendNotificationEmail({ to: row.email, type, message });
    if (result.success) {
      console.log(`[EMAIL NOTICE] ${result.simulated ? 'SIMULATED' : 'Sent'} | To: ${row.email} | Type: ${type}${result.messageId ? ` | MessageId: ${result.messageId}` : ''}`);
    } else {
      console.error(`[EMAIL NOTICE] Failed | To: ${row.email} | Type: ${type} | ${result.hint || result.error}`);
    }
    return result;
  } catch (err) {
    console.error('[EMAIL NOTICE] Error:', err.message);
  }
}

/**
 * Send an outbound SMS, or an MMS when `mediaUrls` is supplied.
 *
 * `mediaUrls` must be absolute public HTTPS URLs. Providers fetch media
 * server-side, so they cannot be localhost and cannot require auth headers.
 *
 * The notification row is always written first and updated afterwards with the
 * real outcome, so the in-app message history is never lost even if every
 * gateway fails.
 */
async function sendSMS({ customerId, phone, message, type, mediaUrls }) {
  const requestedMedia = (Array.isArray(mediaUrls) ? mediaUrls : mediaUrls ? [mediaUrls] : []).filter(Boolean);

  // 1. Always persist to database regardless of gateway status
  let dbNotificationId = null;
  const allowedTypes = ['CREDIT_ISSUED', 'REMINDER', 'OVERDUE_ALERT', 'PAYMENT_RECEIPT', 'COURT_LETTER'];
  const dbType = allowedTypes.includes(type) ? type : 'REMINDER';

  try {
    const result = await db.get(`
      INSERT INTO sms_notifications (customer_id, phone, message, type, status)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [customerId, phone, message, dbType, 'PENDING']);
    dbNotificationId = result.id;
  } catch (dbErr) {
    console.error('[SMS DB Error]:', dbErr.message);
  }

  // 1b. Mirror the notice to the customer's registered email, when they have
  //     one on file. Fire-and-forget: the notification row already exists, so a
  //     slow or broken relay must not delay or fail the SMS attempt. Customers
  //     without a linked user account (or without an email) are silently
  //     skipped — the in-app notice is the channel of record either way.
  mirrorToEmail({ customerId, type: dbType, message });

  // 2. Normalize phone to E.164. Both gateways reject anything else.
  const normalizePhone = (p) => {
    const cleaned = String(p || '').replace(/\s+/g, '').replace(/-/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('251')) return `+${cleaned}`;
    if (cleaned.startsWith('0')) return `+251${cleaned.slice(1)}`;
    return `+251${cleaned}`;
  };

const intlPhone = normalizePhone(phone);
const isMms = requestedMedia.length > 0;
const plannedGates = GATEWAY_ORDER.filter(gatewayIsAvailable);
console.log(
    `[SMS GATEWAY OUTBOUND] Phone: ${intlPhone} | Type: ${type} | ` +
    `Plan: ${plannedGates.length > 0 ? plannedGates.join(' -> ') : 'SIMULATION'} | ` +
    `${isMms ? `MMS (${requestedMedia.length} media)` : 'Text'} | Message: ${message}`
  );

  const finalise = async (status) => {
    if (dbNotificationId) {
      try {
        await db.run(`UPDATE sms_notifications SET status = $1 WHERE id = $2`, [status, dbNotificationId]);
      } catch (dbErr) {
        console.error('[SMS DB Update Error]:', dbErr.message);
      }
    }
  };

  // 3. Walk the gateway order until one accepts the message.
  //
  // Each gateway is a handler rather than an if/else chain so the fallback order
  // stays correct no matter how SMS_GATEWAY_ORDER is configured. Africa's Talking
  // is only handed the message once the court letter attachment has been dropped,
  // because it cannot carry media at all.
  const attachments = [...requestedMedia];
  const attempts = [];

  for (const gateway of GATEWAY_ORDER) {
    if (!gatewayIsAvailable(gateway)) continue;

    if (gateway === 'twilio') {
      const media = [...attachments];
      const result = await sendViaTwilio({ to: intlPhone, body: message, mediaUrls: media });

      if (result.success) {
        console.log(`[SMS GATEWAY] Sent via Twilio | Status: ${result.status} | SID: ${result.messageSid} | MMS: ${result.isMms}`);
        await finalise('DELIVERED');
        return {
          success: true,
          simulated: false,
          isMms: result.isMms,
          notificationId: dbNotificationId,
          phone: intlPhone,
          gateway: 'TWILIO',
          messageId: result.messageSid,
          status: result.status,
          mediaUrls: result.isMms ? media : [],
          attempts,
          sentAt: new Date().toISOString()
        };
      }

      console.error(`[SMS GATEWAY] Twilio send failed: ${result.error}`);
      attempts.push({ gateway: 'TWILIO', error: result.error, code: result.twilioCode });

      // 21614 is "trial account, recipient not verified" — worth retrying
      // elsewhere. Any other coded error (bad number, blocked sender) will fail
      // identically on every other provider, so stop rather than burn quota.
      if (result.twilioCode && result.twilioCode !== '21614') {
        break;
      }
      continue;
    }

    if (gateway === 'africastalking') {
      const droppingAttachment = attachments.length > 0;

      try {
        const response = await smsClient.send({
          to: [intlPhone],
          message,
          ...(AT_SENDER_ID ? { from: AT_SENDER_ID } : {})
        });

        const recipient = response.SMSMessageData?.Recipients?.[0];
        const status = recipient?.status || 'Unknown';
        const cost = recipient?.cost || 'N/A';
        const messageId = recipient?.messageId || null;

        console.log(`[SMS GATEWAY] Sent ✓ | Mode: ${LIVE_SEND ? 'LIVE' : 'SANDBOX'} | Status: ${status} | Cost: ${cost} | MsgId: ${messageId}${droppingAttachment ? ' | attachment dropped' : ''}`);

        // Sandbox accepts every message and reports Success without delivering
        // anything, so recording DELIVERED there would be a false claim.
        await finalise(!LIVE_SEND ? 'SIMULATED' : (status === 'Success' ? 'DELIVERED' : 'FAILED'));

        return {
          success: status === 'Success',
          simulated: !LIVE_SEND,
          isMms: false,
          notificationId: dbNotificationId,
          phone: intlPhone,
          gateway: LIVE_SEND ? 'AFRICA_TALKING' : 'AFRICA_TALKING_SANDBOX',
          messageId,
          status,
          cost,
          mediaUrls: [],
          attachmentDropped: droppingAttachment,
          attempts,
          sentAt: new Date().toISOString()
        };
      } catch (err) {
        console.error('[SMS GATEWAY] Africa\'s Talking send error:', err.message);
        attempts.push({ gateway: 'AFRICA_TALKING', error: err.message });
        continue;
      }
    }
  }

  // 4. Nothing was ever attempted because no gateway is configured. This is the
  //    normal local-dev path: keep reporting success so the rest of the app is
  //    not littered with false delivery failures, while still being explicit
  //    that nothing left the machine.
  if (attempts.length === 0 && GATEWAY_ORDER.filter(gatewayIsAvailable).length === 0) {
    console.warn('[SMS GATEWAY] No gateway configured — message recorded and logged only.');
    await finalise('SIMULATED');
    return {
      success: true,
      simulated: true,
      isMms: false,
      notificationId: dbNotificationId,
      phone: intlPhone,
      gateway: 'SIMULATION',
      mediaUrls: [],
      attempts,
      sentAt: new Date().toISOString()
    };
  }

  // 5. Every configured gateway was tried and rejected the message. The notice is
  //    still on the customer's page, so record the failure honestly and let the
  //    UI surface it.
  const lastError = attempts.length > 0 ? attempts[attempts.length - 1].error : 'No SMS gateway is configured.';
  console.error(`[SMS GATEWAY] Delivery failed: ${lastError}`);
  await finalise('FAILED');

  return {
    success: false,
    simulated: false,
    isMms: false,
    notificationId: dbNotificationId,
    phone: intlPhone,
    gateway: 'NONE',
    error: lastError,
    mediaUrls: [],
    attempts,
    sentAt: new Date().toISOString()
  };
}

/**
 * Log the resolved gateway posture at boot. Never prints secrets.
 */
function describeSmsGatewayConfig() {
  describeTwilioConfig();
  const active = GATEWAY_ORDER.filter(gatewayIsAvailable);
  console.log(`[SMS GATEWAY] Active order: ${active.length > 0 ? active.join(' -> ') : 'none (SIMULATION only)'}`);

  if (active.length > 0 && !active.includes('twilio')) {
    console.warn('[SMS GATEWAY] Twilio is not in the active set — court letters will be delivered as text with no image.');
  }
}

/**
 * Generate standard SMS templates
 */
function getTemplate(type, data) {
  switch (type) {
    case 'REMINDER':
      return `[Smart Dube Alert] Dear ${data.customerName}, your Dube credit repayment of ${data.amount} ETB to ${data.storeName} is due on ${data.dueDate}. Pay via Telebirr / CBE Birr to maintain active credit limit.`;
    case 'OVERDUE_ALERT':
      return `[Smart Dube URGENT] ${data.customerName}, your Dube debt of ${data.amount} ETB at ${data.storeName} is OVERDUE! New credit purchases are currently RESTRICTED. Please settle immediately.`;
    case 'PAYMENT_RECEIPT':
      return `[Smart Dube Receipt] Thank you ${data.customerName}! Payment of ${data.amount} ETB via ${data.gateway} received for ${data.storeName}. Ref: ${data.refCode}. Remaining balance: ${data.remainingBalance} ETB.`;
    case 'CREDIT_ISSUED':
      return `[Smart Dube Notification] New credit transaction logged at ${data.storeName}: ${data.amount} ETB on ${data.date}. Total Balance: ${data.totalBalance} ETB. Due: ${data.dueDate}.`;
    case 'COURT_LETTER':
      // Deliberately short. Africa's Talking bills per 160-character segment, so
      // the full legal text lives on the customer's Smart Dube page and this SMS
      // only tells them it exists and where to read it.
      return `[Smart Dube LEGAL NOTICE] ${data.customerName}, a final court letter (Ref ${data.letterRef}) for your overdue Dube of ${data.amount} ETB at ${data.storeName} has been issued and is now on your Smart Dube page. You have ${data.graceDays} days to settle in full. Failure to pay will result in legal action.`;
    default:
      return data.customMessage || 'Smart Dube ledger notification.';
  }
}

async function getSMSHistory(customerId = null) {
  if (customerId) {
    return await db.all('SELECT * FROM sms_notifications WHERE customer_id = $1 ORDER BY sent_at DESC', [customerId]);
  }
  return await db.all('SELECT * FROM sms_notifications ORDER BY sent_at DESC LIMIT 100');
}

module.exports = {
  sendSMS,
  getTemplate,
  getSMSHistory,
  describeSmsGatewayConfig
};
