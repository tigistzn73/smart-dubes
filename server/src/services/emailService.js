// Outbound email for password-reset OTP codes.
//
// The phone number is the login identity in this app, but it is also the least
// durable one: a customer who loses their SIM or changes their number can no
// longer receive anything at all, including the code that would let them back
// in. The email captured at registration is the fallback factor, so the reset
// flow sends the OTP there first and only falls back to SMS when an account has
// no email on file.
//
// Everything is driven by plain SMTP env vars rather than a vendor SDK, so the
// same configuration works against Resend, SendGrid, Mailgun, Postmark, Amazon
// SES or a plain Gmail/Outlook mailbox. If the credentials are absent the
// service degrades to SIMULATION: the message is built and returned to the
// caller but nothing leaves the machine, which keeps local development working
// without secrets.

require('dotenv').config();

const nodemailer = require('nodemailer');

// ============================================================
//  Configuration
// ============================================================
// Resolved lazily and memoised rather than captured at require() time.
//
// The original version read process.env at module load, which only worked
// because some other module happened to require dotenv first. That is an
// invisible ordering dependency: import this file from a new script, a test or
// a worker and it silently drops to SIMULATION with no error, which reads as
// "email is broken". Resolving on first use makes the order irrelevant.
//
// dotenv is also loaded here so the service stands alone. dotenv never
// overwrites variables that are already set, so calling it again is safe.
let config = null;

function resolveConfig() {
  if (config) return config;

  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  // App passwords are pasted with surrounding spaces often enough that an
  // untrimmed value is a realistic cause of a bare "auth failed".
  const pass = (process.env.SMTP_PASS || '').trim();
  const from = (process.env.EMAIL_FROM || user || 'no-reply@smartdube.et').trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10) || 587;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const requireTLS = String(process.env.SMTP_REQUIRE_TLS || 'true').toLowerCase() === 'true';
  const appName = (process.env.APP_NAME || 'Smart Dube').trim();

  // Named rather than a boolean so the boot log can say exactly which variable
  // is missing. "Email is not configured" on its own sends people hunting
  // through four settings when the answer is one of them.
  const missing = [];
  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (!from) missing.push('EMAIL_FROM');

  config = {
    host,
    port,
    secure,
    user,
    pass,
    from,
    requireTLS,
    appName,
    // Gmail and Outlook present STARTTLS implicitly on 587; anything that needs
    // port 465 already sets SMTP_SECURE=true. Deriving this keeps a user who
    // set only SMTP_PORT=465 from silently talking plaintext.
    effectiveSecure: secure || port === 465,
    missing,
    configured: missing.length === 0
  };

  return config;
}

// ============================================================
//  Transport
// ============================================================
// Pooled rather than one connection per send. Password-reset traffic is bursty
// (a resend storm after a rollout, or several customers at once), and a pooled
// transport keeps the authenticated session warm instead of re-running the
// multi-round-handshake on every single code.
let transporter = null;
let transportError = null;

function getTransporter() {
  if (transporter || transportError) return transporter;

  const cfg = resolveConfig();
  if (!cfg.configured) return null;

  try {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.effectiveSecure,
      // Deliberately tolerant rather than strict. A provider that only
      // implements the relaxed AUTH=PLAIN/LOGIN pair will still accept these,
      // and the cost of allowing them is nil because the connection is
      // TLS-wrapped in transit. Note that requireTLS is separate: it makes the
      // transport fail loudly instead of silently downgrading a failed
      // STARTTLS negotiation to plaintext delivery.
      requireTLS: cfg.requireTLS,
      auth: { user: cfg.user, pass: cfg.pass },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      // Cap every wait so a misconfigured or firewalled host cannot hang a
      // password-reset request indefinitely — the customer is staring at a
      // spinner and a wrong password is still available to them.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
    console.log(`[EMAIL] SMTP ready | ${cfg.from} -> ${cfg.host}:${cfg.port} (secure=${cfg.effectiveSecure})`);
  } catch (err) {
    transportError = err.message;
    console.error('[EMAIL] Failed to initialize SMTP transport:', err.message);
  }

  return transporter;
}

/**
 * Whether real email can leave the machine. Callers use this to decide between
 * telling the user to check their inbox and disclosing the code inline.
 */
function isEmailConfigured() {
  return !!(resolveConfig().configured && getTransporter());
}

function describeEmailConfig() {
  const cfg = resolveConfig();
  if (cfg.configured) {
    console.log(
      `[EMAIL] LIVE mode | from: ${cfg.from} | host: ${cfg.host}:${cfg.port} (secure=${cfg.effectiveSecure})`
    );
  } else {
    console.log('[EMAIL] SIMULATION mode — password-reset codes are logged and shown on screen, NOT sent.');
    console.log(`[EMAIL] Missing: ${cfg.missing.join(', ')}`);
    console.log('[EMAIL] Gmail/Outlook need an App Password here, not the account password.');
  }
}

/**
 * Turn a raw SMTP or socket error into something a developer can act on.
 *
 * Nodemailer surfaces the relay's reply verbatim, so a wrong App Password
 * arrives as "535-5.7.8 Username and Password not accepted" with no hint that
 * the fix is a different kind of password entirely. Each branch here maps a
 * response we actually see in the wild to the change that fixes it.
 */
function explainSmtpError(err) {
  const raw = String((err && err.message) || err || 'Unknown error');
  const text = raw.toLowerCase();
  const code = err && (err.code || err.responseCode);

  if (/535/.test(raw) || /invalid credentials|authentication failed|bad credentials/.test(text)) {
    if (/too many failed login|5\.7\.0/.test(text)) {
      return 'SMTP rejected the login because too many attempts were made from this IP. Wait ~15-30 minutes, or enable 2-Step Verification and regenerate the App Password.';
    }
    return 'SMTP rejected the credentials. This is almost always the account password being used instead of an App Password. Generate one at myaccount.google.com > Security > 2-Step Verification > App passwords, then set it as SMTP_PASS (the 16-character code, spaces removed).';
  }
  if (/550.*5\.7\.1|does not exist|unrouteable|recipient.*rejected/.test(text)) {
    return 'The relay rejected the recipient address. The account has an email on file that this mailbox cannot deliver to — have the customer correct it in their profile.';
  }
  if (/550.*blocked|5\.7\.1.*blocked|not allowed to send/.test(text)) {
    return 'The mailbox is not allowed to send to this recipient. Gmail blocks "From" addresses that differ from the authenticated user — set EMAIL_FROM to the same address as SMTP_USER.';
  }
  if (/421/.test(raw) || /temporarily|try again later|rate limit|too many/.test(text)) {
    return 'The relay is rate-limiting or temporarily refusing connections. Gmail caps a personal mailbox at roughly 500 messages a day; a dedicated transactional provider has a much higher ceiling.';
  }
  if (/etimedout|timeout|getaddrinfo|enotfound|econnrefused|econnreset/.test(text)) {
    return 'Could not reach the SMTP host. Check SMTP_HOST/SMTP_PORT, and whether this server permits outbound connections on that port.';
  }
  if (code === 'EAUTH') {
    return 'SMTP authentication failed. Verify SMTP_USER and that SMTP_PASS is an App Password, not the account password.';
  }
  if (/certificate|altchain|self signed|self-signed/.test(text)) {
    return 'TLS certificate verification failed. Do not disable certificate checking; confirm SMTP_HOST is correct and the system clock is accurate.';
  }

  return raw;
}

/**
 * Prove the relay actually accepts us, at boot, instead of discovering it on
 * the first customer who presses "forgot password".
 *
 * A silent service that only fails on demand is the worst shape for this: the
 * failure looks like an app bug because every other request is working. Doing
 * the handshake once at startup surfaces a bad password in the log the
 * developer is already watching.
 *
 * Never throws and never rejects — a mail relay being down must not stop the
 * server from booting, because login, the ledger and the dashboards all depend
 * on that same process.
 *
 * @returns {Promise<{ok:boolean, reason?:string, hint?:string}>}
 */
async function verifyEmailConnection() {
  const cfg = resolveConfig();

  if (!cfg.configured) {
    return {
      ok: false,
      reason: `not_configured (missing ${cfg.missing.join(', ')})`,
      hint: 'Password-reset codes will be shown on screen instead of emailed.'
    };
  }

  const t = getTransporter();
  if (!t) {
    return { ok: false, reason: `transport_error: ${transportError}`, hint: 'See the [EMAIL] error above.' };
  }

  try {
    await t.verify();
    console.log('[EMAIL] Connection verified — codes will be delivered for real.');
    return { ok: true };
  } catch (err) {
    // Do not cache this as a permanent transport error: a relay that is down at
    // boot is usually back within minutes, and the customer still needs a reset
    // code later. getTransporter() stays usable so the next send retries.
    const hint = explainSmtpError(err);
    console.error(`[EMAIL] Connection check FAILED: ${hint}`);
    console.error('[EMAIL] Codes will fall back to SMS / on-screen display until this is fixed.');
    return { ok: false, reason: err.message, hint };
  }
}

/**
 * Send a real message end to end, used by the diagnostic scripts to prove
 * delivery rather than merely connectivity.
 */
async function sendTestEmail(to) {
  const cfg = resolveConfig();
  const recipient = String(to || cfg.user || '').trim();

  if (!recipient) return { success: false, error: 'No recipient. Set SMTP_USER or pass one in.' };
  if (!isEmailConfigured()) {
    return { success: false, simulated: true, error: `SMTP not configured (missing ${cfg.missing.join(', ')})` };
  }

  const token = String(Math.floor(100000 + Math.random() * 900000));
  const { text, html } = buildOtpEmail({
    fullName: 'Delivery test',
    otpCode: token,
    appName: cfg.appName,
    expiresInMinutes: 5
  });

  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to: recipient,
      subject: `[${cfg.appName}] SMTP delivery test ${token}`,
      text,
      html
    });
    const rejected = info.rejected || [];
    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected,
      // Gmail happily reports success for a message it later discards, so a
      // rejected recipient must be surfaced rather than logged and forgotten.
      warning: rejected.length ? `Relay rejected: ${rejected.join(', ')}` : null
    };
  } catch (err) {
    return { success: false, error: explainSmtpError(err) };
  }
}

/**
 * Build the password-reset message. Kept as plain text plus one simple HTML
 * body because OTP mail must stay readable on the low-end feature phones that
 * are common for this customer base, where a heavy template can fail to render.
 *
 * The lifetime is a parameter rather than words baked into the copy. A hardcoded
 * "15 minutes" in an email is a promise the server does not have to keep, and the
 * two drift apart silently the first time the TTL constant is changed.
 */
function buildOtpEmail({ fullName, otpCode, appName = 'Smart Dube', expiresInMinutes = 5 }) {
  const greeting = fullName ? `Hi ${fullName},` : 'Hi,';
  const text = [
    greeting,
    '',
    `We received a request to reset the password on your ${appName} account.`,
    '',
    `Your verification code is: ${otpCode}`,
    '',
    `This code expires in ${expiresInMinutes} minutes and can only be used once.`,
    `If you did not request this, you can safely ignore this email — your`,
    `password will not change until someone submits this code.`,
    '',
    'For your security, never share this code with anyone, including anyone',
    'claiming to be from ' + appName + ' support.'
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#065f46;padding:20px 24px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;letter-spacing:-0.01em;">${escapeHtml(appName)}</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">
          We received a request to reset the password on your ${escapeHtml(appName)} account.
        </p>
        <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:10px;padding:20px;text-align:center;margin:0 0 20px;">
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Verification code</div>
          <div style="font-size:34px;font-weight:700;letter-spacing:0.28em;color:#065f46;font-family:Consolas,Monaco,monospace;">${escapeHtml(otpCode)}</div>
        </div>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#334155;">
          This code expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.
        </p>
        <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#334155;">
          If you did not request this, you can safely ignore this email &mdash; your
          password will not change until someone submits this code.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
          For your security, never share this code with anyone, including anyone
          claiming to be from ${escapeHtml(appName)} support.
        </p>
      </div>
    </div>
  </body>
</html>`;

  return { text, html };
}

/**
 * Escape a value before it goes into the HTML body.
 *
 * The code itself is a digit string and the name is whatever the customer typed
 * at registration, so `full_name` is genuinely attacker-controlled input being
 * interpolated into an email. Anyone able to register can otherwise inject
 * markup into mail that arrives on a @smartdube.et-looking From address, which
 * is a credible phishing primitive.
 */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send a password-reset OTP to an email address.
 *
 * Never throws. A reset request must not become a 500 just because the mail
 * relay is down, and the caller needs a truthful `success`/`simulated` pair to
 * decide whether it may disclose the code inline.
 *
 * @param {number} [expiresInMinutes] Lifetime to state in the copy. Passed in from
 *   the caller's OTP policy so the email can never advertise a different window
 *   than the one the server actually enforces.
 *
 * @returns {Promise<{success:boolean, simulated:boolean, channel:string, messageId?:string, error?:string, hint?:string}>}
 */
async function sendOtpEmail({ to, fullName, otpCode, expiresInMinutes = 5 }) {
  const recipient = String(to || '').trim();
  if (!recipient) {
    return { success: false, simulated: false, channel: 'EMAIL', error: 'No email address on file.' };
  }

  const cfg = resolveConfig();
  const { text, html } = buildOtpEmail({
    fullName,
    otpCode,
    appName: cfg.appName,
    expiresInMinutes
  });
  const subject = `${otpCode} is your ${cfg.appName} verification code`;

  if (!isEmailConfigured()) {
    console.log(`[EMAIL SIMULATION] To: ${recipient} | Subject: ${subject}`);
    console.log(`[EMAIL SIMULATION] Body:\n${text}`);
    return {
      success: true,
      simulated: true,
      channel: 'EMAIL',
      error: `SMTP not configured (missing ${cfg.missing.join(', ')})`
    };
  }

  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to: recipient,
      subject,
      text,
      html
    });

    // Gmail accepts a message for an address it cannot actually deliver to and
    // drops it later. A rejected recipient must therefore fail this call, or
    // the customer is told to check an inbox that will never receive the code.
    const rejected = info.rejected || [];
    if (rejected.length) {
      const hint = `Relay rejected the recipient (${rejected.join(', ')}). This mailbox cannot deliver to that address — the customer should correct the email on their account.`;
      console.error(`[EMAIL] Recipient rejected for user delivery: ${hint}`);
      return { success: false, simulated: false, channel: 'EMAIL', error: 'recipient_rejected', hint };
    }

    console.log(`[EMAIL] Sent | To: ${recipient} | MessageId: ${info.messageId} | Accepted: ${info.accepted?.length ?? 0}`);
    return { success: true, simulated: false, channel: 'EMAIL', messageId: info.messageId };
  } catch (err) {
    const hint = explainSmtpError(err);
    console.error(`[EMAIL] Delivery failed to ${recipient}: ${hint}`);
    return { success: false, simulated: false, channel: 'EMAIL', error: err.message, hint };
  }
}

module.exports = {
  sendOtpEmail,
  isEmailConfigured,
  describeEmailConfig,
  verifyEmailConnection,
  sendTestEmail,
  buildOtpEmail,
  explainSmtpError
};