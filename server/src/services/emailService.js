// Outbound account email: password-reset OTP codes and registration
// confirmations.
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
const dns = require('dns');

// ============================================================
//  IPv4-only SMTP resolution
// ============================================================
// nodemailer resolves the relay hostname itself and then picks ONE address at
// random from the combined A + AAAA result:
//
//     const addresses = ipv4Addresses.concat(ipv6Addresses);
//     const host = addresses[Math.floor(Math.random() * addresses.length)];
//
// smtp.gmail.com publishes one A record and one AAAA record, so that random
// pick lands on IPv6 half the time on any host that advertises a non-internal
// IPv6 interface. A host can advertise IPv6 and still have no route to it --
// a Windows box on a link-local-only adapter, Render's free web services, most
// container platforms -- and the send then fails with
// "connect ENETUNREACH 2607:f8b0:...:587 - Local (:::0)".
//
// That is not merely a hosting problem. Even on a healthy dual-stack host every
// individual send is a coin flip, so password-reset delivery fails
// intermittently for reasons that look like the relay is flaky.
//
// Fixing it means removing IPv6 from the candidate list for the SMTP host only.
// nodemailer exposes no option for this. It has two resolution paths and BOTH
// have to be intercepted:
//
//   1. Primary: `new dns.Resolver().resolve4()` / `.resolve6()` in
//      nodemailer's shared resolver. This is the path that actually runs.
//   2. Fallback: `dns.lookup(host, {all:true})`, only reached when resolve4
//      and resolve6 both return zero addresses.
//
// An earlier version of this file patched only dns.lookup. That patch installed
// cleanly and logged "Forcing IPv4 for smtp.gmail.com", which made the code look
// correct while changing nothing: path 1 short-circuits before path 2 is ever
// reached, so IPv6 stayed in the candidate pool and roughly half of all sends
// still died on ENETUNREACH.
//
// nodemailer also gates path 1 on os.networkInterfaces() -- it keeps IPv6 only
// if some non-internal IPv6 interface exists -- which reports link-local-only
// adapters as perfectly usable. So the resolver patch is the only lever.
//
// Both wrappers are installed for the configured relay hostnames only, and every
// other lookup in the process (notably the Postgres pool, which relies on Node's
// Happy Eyeballs and a Happy Eyeballs-unfriendly IPv6-literal host would break)
// passes through untouched.
//
// On by default because IPv4 reaches every SMTP relay this app supports.
// Set SMTP_IPV4_ONLY=false to opt out on a network where the relay is genuinely
// reachable over IPv6 only.
const SMTP_IPV4_ONLY = String(process.env.SMTP_IPV4_ONLY ?? 'true').toLowerCase() === 'true';

/**
 * Whether this process has a non-internal IPv4 interface. Without one, forcing
 * IPv4 cannot help and would only replace a working IPv6 path with a failure, so
 * the wrapper stands down.
 */
function hasUsableIpv4Interface() {
  const interfaces = require('os').networkInterfaces() || {};
  return Object.values(interfaces)
    .flat()
    .some((addr) => addr && addr.family !== 'internal' && (addr.family === 'IPv4' || addr.family === 4));
}

/**
 * Restrict the relay hostnames to IPv4 on both of nodemailer's DNS paths.
 *
 * @param {string[]} hostnames Relay hostnames to intercept.
 * @returns {boolean} Whether the wrappers were installed.
 */
function installIpv4OnlyResolver(hostnames) {
  const targets = new Set(hostnames.filter(Boolean).map((h) => String(h).trim().toLowerCase()));
  if (!targets.size) return false;

  if (!SMTP_IPV4_ONLY) {
    console.log('[EMAIL] SMTP_IPV4_ONLY=false — leaving DNS resolution untouched.');
    return false;
  }
  if (!hasUsableIpv4Interface()) {
    console.warn('[EMAIL] No non-internal IPv4 interface found — leaving DNS resolution untouched.');
    return false;
  }

  const isTarget = (hostname) => targets.has(String(hostname || '').toLowerCase());

  // ---- Path 1: dns.Resolver#resolve6, the one nodemailer actually uses ----
  // Reporting "this host has no AAAA record" is the only way to express the
  // intent without reimplementing nodemailer's caching and fallback logic: its
  // resolver treats an empty list as a legitimate answer and carries on with the
  // IPv4 addresses alone.
  if (dns.Resolver && dns.Resolver.prototype.resolve6 && !dns.Resolver.prototype.resolve6.__smartDubeIpv4Only) {
    const originalResolve6 = dns.Resolver.prototype.resolve6;

    dns.Resolver.prototype.resolve6 = function patchedResolve6(hostname, options, callback) {
      const twoArg = typeof options === 'function';
      if (twoArg) callback = options;

      if (typeof callback !== 'function' || !isTarget(hostname)) {
        // resolve6 is a bare alias of queryAaaa, which takes
        // (hostname, options, callback) with no two-argument overload, so the
        // caller's short form has to be widened before delegating.
        if (twoArg) return originalResolve6.call(this, hostname, {}, options);
        return originalResolve6.apply(this, arguments);
      }

      return setImmediate(() => callback(null, []));
    };
    dns.Resolver.prototype.resolve6.__smartDubeIpv4Only = true;
  }

  // ---- Path 2: dns.lookup, nodemailer's fallback when resolve4/6 come back empty ----
  if (!dns.lookup.__smartDubeIpv4Only) {
    const originalLookup = dns.lookup;

    dns.lookup = function patchedLookup(hostname, options, callback) {
      // Support both lookup(host, cb) and lookup(host, opts, cb).
      let opts = options;
      let cb = callback;
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      }
      opts = opts || {};

      if (!isTarget(hostname)) {
        return originalLookup.apply(this, arguments);
      }

      const wantsAll = !!opts.all;
      return originalLookup.call(this, hostname, { ...opts, family: 4, all: true }, (err, addresses) => {
        if (err) return cb(err);
        // Preserve the callback shape the caller asked for: (err, addresses) with
        // all:true, or (err, address, family) otherwise. nodemailer uses the former.
        if (wantsAll) return cb(null, addresses);
        return cb(null, addresses[0].address, addresses[0].family);
      });
    };
    dns.lookup.__smartDubeIpv4Only = true;
  }

  console.log(`[EMAIL] Forcing IPv4 for ${[...targets].join(', ')} (relay selection is otherwise random).`);
  return true;
}

// Configured before the transporter is built, because creation is what triggers
// the first resolution.
installIpv4OnlyResolver([
  process.env.SMTP_HOST,
  'smtp.gmail.com',
  'smtp-mail.outlook.com',
  'smtp.office365.com',
  'smtp.resend.com',
  'smtp.sendgrid.net',
  'smtp.mailgun.org',
  'email-smtp.us-east-1.amazonaws.com'
]);

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

// ============================================================
//  Transport selection: HTTP API vs SMTP
// ============================================================
// SMTP is not always available, and where it is not available no amount of
// configuration rescues it. Render blocked outbound traffic to ports 25, 465 and
// 587 on free web services on 2025-09-26 (render.com/changelog/
// free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports), so a
// service pinned to SMTP there times out on every port and with every provider.
// What works on a free instance is a paid plan, or an API over 443.
//
// Hence two transports behind one interface. The HTTP paths speak 443, which is
// the one thing a hosting platform does not filter, so they work everywhere SMTP
// does and in several places it does not.
//
// The HTTP provider is chosen over SMTP whenever its API key is present, so
// moving off SMTP is a matter of setting one variable. EMAIL_PROVIDER overrides
// that guess; set it to "smtp" to stay on SMTP even when a key is also present.
const HTTP_PROVIDERS = {
  resend: {
    keyVar: 'RESEND_API_KEY',
    label: 'Resend (HTTPS API)',
    sendUrl: 'https://api.resend.com/emails',
    verifyUrl: 'https://api.resend.com/domains',
    // Resend will not deliver to anyone but the account owner until a sending
    // domain is verified, so an unverified from-address fails at send time rather
    // than at boot. Worth saying out loud.
    hint: 'Resend only delivers to your own address until a sending domain is verified (resend.com/domains). Add smartdube.et, point its SPF and DKIM records at Resend, then set EMAIL_FROM to a mailbox on that domain.'
  },
  sendgrid: {
    keyVar: 'SENDGRID_API_KEY',
    label: 'SendGrid (HTTPS API)',
    sendUrl: 'https://api.sendgrid.com/v3/mail/send',
    verifyUrl: 'https://api.sendgrid.com/v3/scopes',
    // SendGrid's single-sender verification accepts one from-address with no domain
    // to own, which is the quickest way to see a message arrive. Worth stating the
    // trade-off: gmail.com publishes DMARC p=none, so a misaligned send is not
    // rejected on DMARC grounds — but an ESP sending as a consumer gmail.com
    // address is an unusual pattern that still costs reputation, and Google can
    // suspend an address that repeatedly sends through third-party infrastructure.
    hint: 'SendGrid needs the EMAIL_FROM address verified as a sender identity (sendgrid.com/settings/sender_verification). No domain is required. Be aware that a single consumer gmail.com address gains no sending reputation: it delivers, but through a provider it is not aligned with, so expect some spam placement.'
  },
  brevo: {
    keyVar: 'BREVO_API_KEY',
    label: 'Brevo (HTTPS API)',
    sendUrl: 'https://api.brevo.com/v3/smtp/email',
    // The sender list, not /account: it answers the question that actually stops a
    // send here — whether this EMAIL_FROM is one of the verified senders.
    verifyUrl: 'https://api.brevo.com/v3/senders',
    // The probe returns the sender list, so the boot check can confirm EMAIL_FROM is
    // among the confirmed senders rather than only that the key is live.
    verifyListsSenders: true,
    // Brevo authenticates with an `api-key` header, not `Authorization: Bearer`.
    authStyle: 'api-key',
    // The one provider that needs no domain. Brevo verifies a single from-address by
    // emailing a confirmation link to it, so a plain Gmail account is enough. That
    // matters here because the alternatives all demand DNS access the app does not
    // have, and because 443 is not blocked by the Render free tier.
    hint: 'Brevo needs EMAIL_FROM added as a sender and confirmed via the link Brevo emails to it (brevo.com/settings/senders). No domain is required. The free plan allows 300 sends a day.'
  }
};

function pickProvider() {
  const explicit = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.RESEND_API_KEY && String(process.env.RESEND_API_KEY).trim()) return 'resend';
  if (process.env.SENDGRID_API_KEY && String(process.env.SENDGRID_API_KEY).trim()) return 'sendgrid';
  if (process.env.BREVO_API_KEY && String(process.env.BREVO_API_KEY).trim()) return 'brevo';
  return 'smtp';
}

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

  const provider = pickProvider();
  const httpProvider = HTTP_PROVIDERS[provider] || null;
  const apiKey = httpProvider ? String(process.env[httpProvider.keyVar] || '').trim() : '';

  // Named rather than a boolean so the boot log can say exactly which variable
  // is missing. On an HTTP provider the SMTP settings are never read, so
  // reporting SMTP_HOST/SMTP_USER/SMTP_PASS as the missing pieces would send
  // someone hunting through settings the service does not consult.
  const missing = [];
  if (httpProvider) {
    if (!apiKey) missing.push(httpProvider.keyVar);
    if (!from) missing.push('EMAIL_FROM');
  } else {
    if (!host) missing.push('SMTP_HOST');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    if (!from) missing.push('EMAIL_FROM');
  }

  config = {
    provider,
    httpProvider,
    apiKey,
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
  // The HTTP providers do not open a socket at all, so there is nothing to pool
  // and nothing to build. Returning null here keeps every caller on the one
  // "is there a transporter?" branch instead of testing the provider again.
  if (cfg.httpProvider) return null;

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
  const cfg = resolveConfig();
  if (!cfg.configured) return false;
  // An HTTP provider has no transporter to construct and no connection to make,
  // so a present API key is the whole of it.
  if (cfg.httpProvider) return true;
  return !!getTransporter();
}

/** True when running on a managed Render instance, which sets both of these. */
function isHostedOnRender() {
  return String(process.env.RENDER || '').toLowerCase() === 'true' || !!process.env.RENDER_EXTERNAL_URL;
}

/**
 * Whether a reset code may be returned in the HTTP response.
 *
 * This is opt-in and defaults to false. POST /api/auth/forgot-password requires no
 * authentication: it takes a phone number or email and sends a code to whoever owns
 * it. So any response that contains the code is an account-takeover oracle for every
 * address the caller can guess. A customer only ever sees their own code, but the
 * endpoint does not know that — it cannot tell an owner's request from a stranger's.
 *
 * That makes simulation mode safe locally and unsafe in production, and the two are
 * not distinguished by NODE_ENV anywhere in this codebase. Hence the explicit flag,
 * plus a refusal on Render in case the flag is ever copied there by accident.
 */
function canExposeOtpInResponse() {
  const requested = String(process.env.EXPOSE_OTP_IN_RESPONSE || '').trim().toLowerCase() === 'true';
  if (!requested) return false;
  if (isHostedOnRender()) {
    console.error(
      '[EMAIL] REFUSING to return reset codes in responses: EXPOSE_OTP_IN_RESPONSE is set on a hosted Render instance.'
    );
    console.error('[EMAIL] An unauthenticated caller who knows a phone number could read that user\'s reset code.');
    return false;
  }
  return true;
}

function describeEmailConfig() {
  const cfg = resolveConfig();
  if (cfg.httpProvider) {
    if (cfg.configured) {
      console.log(`[EMAIL] LIVE mode | from: ${cfg.from} | provider: ${cfg.httpProvider.label} (HTTPS/443)`);
    } else {
      console.log(`[EMAIL] SIMULATION mode — password-reset codes are logged and shown on screen, NOT sent.`);
      console.log(`[EMAIL] Missing: ${cfg.missing.join(', ')}`);
    }
    return;
  }
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

  if (/enetunreach|ehostunreach|enetdown|eaddrnotavail/.test(text)) {
    return 'The relay resolved to an IPv6 address this server has no route for, even though SMTP_IPV4_ONLY=true already strips IPv6 from the candidate list. That means the IPv6 route is absent and something is still handing nodemailer a literal address — check for an SMTP_HOST override, and confirm the process was restarted after the resolver patch was added.';
  }
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
    return 'Could not reach the SMTP host. Check SMTP_HOST/SMTP_PORT, and whether this network permits outbound connections on that port. Note that Render free instances block 25, 465 and 587 entirely (since 2025-09-26) — switch to an HTTP provider such as Resend or SendGrid, which uses 443, or upgrade to a paid instance.';
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
 * Map an HTTP email API's failure onto the same kind of actionable sentence
 * explainSmtpError produces for SMTP.
 *
 * These providers answer with a JSON body rather than a reply code, and their
 * most common failure — an unverified sender — is a 403 carrying a sentence the
 * API returns verbatim. Without this the log shows a bare "403 Forbidden" and
 * the reader has no way to know the fix is a DNS record rather than a code
 * change.
 *
 * @param {number} status HTTP status the provider returned.
 * @param {string} body   Response body, already read as text.
 * @param {object} p      Provider descriptor, for its `hint`.
 */
function explainHttpApiError(status, body, p) {
  const text = String(body || '').toLowerCase();
  const detail = extractProviderMessage(body);

  // Sender verification is tested first and regardless of status. Both providers
  // use 403 for it, but SendGrid answers 400 to some of these phrasings, and by
  // a wide margin it is the most common setup mistake — so it must not fall
  // through to the generic invalid-request branch, whose advice (fix EMAIL_FROM)
  // is a distraction when the real fix is a DNS record.
  if (/sending domain|not verified|unverified|sender identity|does not match a verified|only send testing|not allowed to send|invalid sender|unrecognized sender|sender.{0,20}not (registered|confirmed)|no sender/.test(text)) {
    return `The provider refused the message because the from-address is not verified. ${p.hint}`;
  }

  if (status === 401 || /api key is invalid|invalid api key|unauthorized|forbidden|key not found|api-key not found/.test(text)) {
    return `The provider rejected the API key. Check ${p.keyVar} — it should be the whole key, and on Resend the key must start "re_".`;
  }

  if (status === 429 || status === 402 || /rate limit|too many requests|sending limit|quota|not_enough_credits/.test(text)) {
    return 'The provider is rate-limiting this account. The free tiers are small (SendGrid about 100 messages a day) — a password-reset storm, or a loop of resend clicks, will exhaust them.';
  }

  if (status === 422 || status === 400) {
    // Phrased from the exact wording both providers use. A customer with a typo
    // in the address on file gets a code that never arrives and no explanation,
    // so this branch has to be recognised to be worth anything.
    if (/recipient|email address is not valid|invalid email|is not a valid|does not exist|unable to resolve|mailbox not found|unknown user/.test(text)) {
      return `The provider rejected the recipient address (${detail || 'invalid address'}). The customer should correct the email on their account.`;
    }
    return `The provider rejected the request as invalid (${detail || status}). Check that EMAIL_FROM is the exact verified sender and a plain mailbox address — "Smart Dube <a@b.com>" is accepted, but some providers reject the display-name form on this endpoint.`;
  }

  if (status >= 500) {
    return `The provider returned ${status}, which is a fault on their side. Nothing to change in the app; retrying is the correct response.`;
  }

  return detail ? `The provider returned ${status}: ${detail}` : `The provider returned ${status}.`;
}

/**
 * Pull the human-readable sentence out of a provider's JSON error body. Both
 * shapes are handled because the two providers disagree: Resend returns
 * {"message": "..."} while SendGrid returns {"errors":[{"message":"..."}]}.
 */
function extractProviderMessage(body) {
  const raw = String(body || '');
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.message === 'string') return parsed.message;
    if (parsed && Array.isArray(parsed.errors) && parsed.errors[0] && typeof parsed.errors[0].message === 'string') {
      return parsed.errors.map((e) => e.message).join('; ');
    }
  } catch {
    // Not JSON. Providers sometimes return HTML from an edge proxy, and a wall
    // of markup in the log helps nobody, so fall through to the raw text only
    // when it is short enough to be a sentence.
    return raw.length <= 200 ? raw.trim() : '';
  }
  return '';
}

/**
 * Send one message through an HTTPS email API.
 *
 * fetch rather than an SDK: both providers' send endpoints are a single POST
 * with a bearer token, so a dependency would add supply-chain surface and a
 * version to track for one request. The API key is never logged and never
 * included in an error message — a thrown provider body is quoted to the log,
 * and an accidental echo of the Authorization header there would leak the key
 * into whatever log aggregator reads it.
 *
 * @returns {Promise<{success:boolean, messageId?:string, error?:string, hint?:string}>}
 */
async function sendViaHttpApi({ to, subject, text, html }) {
  const cfg = resolveConfig();
  const p = cfg.httpProvider;

  let body;
  if (cfg.provider === 'resend') {
    body = { from: cfg.from, to: [to], subject, text, html };
  } else if (cfg.provider === 'brevo') {
    // Brevo takes the display name as its own field and ignores one embedded in the
    // address, so the address is parsed rather than passed through whole.
    const sender = parseFromAddress(cfg.from);
    body = {
      sender: { name: sender.name || cfg.appName, email: sender.email },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html
    };
  } else {
    body = {
      personalizations: [{ to: [{ email: to }] }],
      from: parseFromAddress(cfg.from),
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html }
      ]
    };
  }

  const authHeaders =
    p.authStyle === 'api-key'
      ? { 'api-key': cfg.apiKey }
      : { Authorization: `Bearer ${cfg.apiKey}` };

  let res;
  try {
    res = await fetch(p.sendUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      // Bounded so a hung provider cannot stall a password-reset request. This
      // replaces nodemailer's connectionTimeout/socketTimeout pair, which have no
      // equivalent here.
      signal: AbortSignal.timeout(15000)
    });
  } catch (err) {
    const aborted = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {
      success: false,
      error: aborted ? `Request to ${p.label} timed out after 15s` : `Could not reach ${p.label}: ${err.message}`,
      hint: aborted
        ? 'This is an HTTPS call on port 443, so a timeout is not a platform firewall — check the provider status page and any egress proxy on this host.'
        : 'This is an HTTPS call on port 443. A DNS or connection failure here points at the host network or an egress proxy, not at the provider.'
    };
  }

  const raw = await res.text();

  if (!res.ok) {
    return { success: false, error: `${p.label} returned ${res.status}`, hint: explainHttpApiError(res.status, raw, p) };
  }

  let messageId = '';
  try {
    const parsed = JSON.parse(raw || '{}');
    // Resend returns id, Brevo returns messageId, SendGrid returns a header.
    messageId = String(parsed.messageId || parsed.id || parsed.message_id || parsed.headers?.['x-message-id'] || '');
  } catch {
    // A 2xx with an unparseable body is still a send; the id is a nicety.
  }

  console.log(`[EMAIL] Sent via ${p.label} | To: ${to} | MessageId: ${messageId || '(not reported)'}`);
  return { success: true, messageId: messageId || `${p.label} accepted the message` };
}

/**
 * SendGrid wants a bare address in `from` and takes the display name separately.
 * Accepting "Smart Dube <a@b.com>" in EMAIL_FROM keeps one variable working
 * across both providers instead of forcing a different value per host.
 */
function parseFromAddress(value) {
  const raw = String(value || '').trim();
  const angled = raw.match(/^(.*?)<([^>]+)>$/);
  if (!angled) return { email: raw };
  const name = angled[1].trim().replace(/^"|"$/g, '');
  return name ? { name, email: angled[2].trim() } : { email: angled[2].trim() };
}

/**
 * Confirm EMAIL_FROM is a sender the provider will actually accept.
 *
 * A 200 from the probe only proves the API key is live. The send fails separately,
 * with a 403, when the from-address is not a confirmed sender — and that failure
 * lands on a customer rather than on whoever changed the config.
 *
 * @param {string} from the configured EMAIL_FROM, display name and all
 * @param {string} raw  the probe response body
 * @param {object} p    the provider definition
 */
function checkSenderListed(from, raw, p) {
  const want = (parseFromAddress(from).email || '').toLowerCase();
  let senders = [];
  try {
    const parsed = JSON.parse(raw || '[]');
    // Brevo returns a bare array of senders. `active` is the difference between
    // registered and confirmed, so a sender that is present but inactive is a
    // distinct failure with a distinct fix.
    senders = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
  } catch {
    // Unparseable body: let the first send decide rather than block startup.
    return { ok: true };
  }

  if (!senders.length) {
    return {
      ok: false,
      reason: 'no senders registered',
      hint: `This ${p.label} account has no sender registered. Add ${want || 'your address'} under the provider's sender settings and confirm it via the email they send.`
    };
  }

  const active = senders.filter((s) => s.active !== false);
  if (active.some((s) => String(s.email || '').toLowerCase() === want)) return { ok: true };

  const listed = senders.some((s) => String(s.email || '').toLowerCase() === want);
  if (listed) {
    return {
      ok: false,
      reason: 'sender registered but unconfirmed',
      hint: `${want} is registered but not yet confirmed. Open the confirmation email sent to that address and confirm it, then redeploy. Sends are refused until then.`
    };
  }

  const confirmedList = active.map((s) => s.email).filter(Boolean).join(', ') || '(none)';
  return {
    ok: false,
    reason: 'sender not registered',
    hint: `EMAIL_FROM is ${want || '(unset)'}, which is not a confirmed sender on this account. Confirmed senders: ${confirmedList}. Register ${want || 'your address'} and confirm it, or point EMAIL_FROM at one already confirmed.`
  };
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

  // An HTTP provider has no connection to make, so the equivalent check is a
  // cheap authenticated GET. It proves the key is live and the host can reach
  // the provider on 443 — the two things that actually break in deployment —
  // without spending a send or a domain-verification attempt.
  if (cfg.httpProvider) {
    const p = cfg.httpProvider;
    const verifyHeaders =
      p.authStyle === 'api-key' ? { 'api-key': cfg.apiKey } : { Authorization: `Bearer ${cfg.apiKey}` };
    try {
      const res = await fetch(p.verifyUrl, {
        headers: verifyHeaders,
        signal: AbortSignal.timeout(15000)
      });
      const raw = await res.text();

      if (res.ok) {
        // A live key is not sufficient. Every one of these providers refuses to send
        // from an unverified address, so a key-only check reports "connected" right
        // up until a customer presses reset. When the probe returns the sender list,
        // read it and confirm the configured from-address is actually usable.
        if (p.verifyListsSenders) {
          const verdict = checkSenderListed(cfg.from, raw, p);
          if (!verdict.ok) {
            console.error(`[EMAIL] Connection check FAILED: ${verdict.hint}`);
            return { ok: false, reason: verdict.reason, hint: verdict.hint };
          }
        }
        console.log(`[EMAIL] ${p.label} reachable and API key accepted — codes will be delivered for real.`);
        return { ok: true };
      }
      const hint = explainHttpApiError(res.status, raw, p);
      console.error(`[EMAIL] Connection check FAILED: ${hint}`);
      return { ok: false, reason: `${p.label} returned ${res.status}`, hint };
    } catch (err) {
      const aborted = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      const reason = aborted ? `request to ${p.label} timed out` : (err.message || 'request failed');
      const hint = `Could not reach ${p.label} on HTTPS/443. This is not an SMTP-port restriction — check the host's network and any egress proxy.`;
      console.error(`[EMAIL] Connection check FAILED: ${hint}`);
      return { ok: false, reason, hint };
    }
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
    console.error('[EMAIL] Reset codes will NOT be delivered: forgot-password returns 503 and no code is issued.');
    console.error('[EMAIL] There is no SMS fallback in the reset flow, so reset is fully down while this persists.');
    console.error('[EMAIL] Diagnose with: npm run diagnose:provider (needs the provider API key locally).');
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
    return { success: false, simulated: true, error: `Email not configured (missing ${cfg.missing.join(', ')})` };
  }

  const token = String(Math.floor(100000 + Math.random() * 900000));
  const { text, html } = buildOtpEmail({
    fullName: 'Delivery test',
    otpCode: token,
    appName: cfg.appName,
    expiresInMinutes: 5
  });

  if (cfg.httpProvider) {
    return sendViaHttpApi({
      to: recipient,
      subject: `[${cfg.appName}] Delivery test ${token}`,
      text,
      html
    });
  }

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
 * Hand one built message to whichever transport is configured.
 *
 * Split out of sendOtpEmail because every other outbound mail here needs the
 * same three-way decision (simulate / HTTP API / SMTP) and the same
 * recipient-rejection handling. Repeating it per message is how the branches
 * drift apart and the delivery reporting stops being trustworthy.
 *
 * Never throws. A request must not become a 500 just because the mail relay is
 * down, and the caller needs a truthful `success`/`simulated` pair to decide
 * what it may tell the user.
 *
 * @returns {Promise<{success:boolean, simulated:boolean, channel:string, messageId?:string, error?:string, hint?:string}>}
 */
async function deliverMessage({ to, subject, text, html }) {
  const recipient = String(to || '').trim();
  if (!recipient) {
    return { success: false, simulated: false, channel: 'EMAIL', error: 'No email address on file.' };
  }

  const cfg = resolveConfig();

  if (!isEmailConfigured()) {
    console.log(`[EMAIL SIMULATION] To: ${recipient} | Subject: ${subject}`);
    console.log(`[EMAIL SIMULATION] Body:\n${text}`);
    return {
      success: true,
      simulated: true,
      channel: 'EMAIL',
      error: `Email not configured (missing ${cfg.missing.join(', ')})`
    };
  }

  if (cfg.httpProvider) {
    // The HTTP providers answer with a status code rather than nodemailer's
    // accepted/rejected pair, so recipient rejection surfaces as a failed send.
    // Same contract as below: a non-2xx is a failure the caller must not report
    // as delivered, or the customer is told to check an inbox that will stay empty.
    const sent = await sendViaHttpApi({ to: recipient, subject, text, html });
    if (!sent.success) {
      console.error(`[EMAIL] Delivery failed to ${recipient}: ${sent.hint || sent.error}`);
      return { success: false, simulated: false, channel: 'EMAIL', error: sent.error, hint: sent.hint };
    }
    return { success: true, simulated: false, channel: 'EMAIL', messageId: sent.messageId };
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

    console.log(`[EMAIL] Sent | To: ${recipient} | Subject: ${subject} | MessageId: ${info.messageId} | Accepted: ${info.accepted?.length ?? 0}`);
    return { success: true, simulated: false, channel: 'EMAIL', messageId: info.messageId };
  } catch (err) {
    const hint = explainSmtpError(err);
    // Name the relay in the error the API returns, not just in the server log.
    // "Connection timeout" on its own says nothing about whether the cause is
    // the port, the firewall or the credentials, and the one thing that settles
    // it — which host:port was actually dialled — was previously visible only to
    // whoever had the terminal open. Host and port are public SMTP endpoints, so
    // this discloses nothing.
    const target = `${cfg.host}:${cfg.port}`;
    console.error(`[EMAIL] Delivery failed to ${recipient} via ${target}: ${hint}`);
    return { success: false, simulated: false, channel: 'EMAIL', error: `${err.message} (${target})`, hint };
  }
}

/**
 * Send a password-reset OTP to an email address.
 *
 * @param {number} [expiresInMinutes] Lifetime to state in the copy. Passed in from
 *   the caller's OTP policy so the email can never advertise a different window
 *   than the one the server actually enforces.
 *
 * @returns {Promise<{success:boolean, simulated:boolean, channel:string, messageId?:string, error?:string, hint?:string}>}
 */
async function sendOtpEmail({ to, fullName, otpCode, expiresInMinutes = 5 }) {
  const cfg = resolveConfig();
  const { text, html } = buildOtpEmail({
    fullName,
    otpCode,
    appName: cfg.appName,
    expiresInMinutes
  });

  return deliverMessage({
    to,
    subject: `${otpCode} is your ${cfg.appName} verification code`,
    text,
    html
  });
}

/**
 * Build the welcome message sent once an account exists.
 *
 * The copy branches on role because the two audiences have different next steps:
 * a merchant is blocked on KYC review and cannot issue credit until it clears,
 * while a customer's next step is to look at credit a shop already issued. One
 * generic "your account is ready" leaves both of them with nothing to do.
 *
 * Nothing secret is ever placed in this message. The password is not echoed back
 * and no reset token is generated: the mail confirms an account and points at
 * the recovery channel, it is not a credential.
 */
function buildRegistrationEmail({ fullName, role, details = {}, appName = 'Smart Dube' }) {
  const isMerchant = String(role || '').toUpperCase() === 'MERCHANT';
  const greeting = fullName ? `Hi ${fullName},` : 'Hi,';
  const accountLabel = isMerchant ? 'merchant' : 'customer';

  // The same values the row was written with, not the raw request body, so the
  // confirmation can never describe an account differently from the stored one.
  const detailRows = (isMerchant
    ? [
        ['Store name', details.storeName],
        ['Business licence', details.businessLicenseNo],
        ['Business address', details.address]
      ]
    : [
        ['Phone number', details.phone],
        ['Fayda ID', details.faydaId]
      ]
  ).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');

  const nextSteps = isMerchant
    ? [
        'Your business licence is now under review, and your account status shows as pending. We will email you at this address once it is approved.',
        'You can issue credit to customers only after approval — until then, add your customers so their details are ready when it clears.',
        'Add your bank details in Settings so repayments are settled into the right account.'
      ]
    : [
        'Open your dashboard to see your credit balance, what you owe, and your repayment schedule.',
        `Shops that sell to you on credit on ${appName} appear there automatically. You do not need to do anything to connect with them.`,
        'If you ever forget your password, we send a verification code to this email address.'
      ];

  const subject = isMerchant
    ? `Welcome to ${appName} — your merchant account is ready`
    : `Welcome to ${appName} — your account is ready`;

  const text = [
    greeting,
    '',
    `Your ${appName} ${accountLabel} account has been created.`,
    '',
    ...(detailRows.length
      ? ['What you registered:', ...detailRows.map(([label, value]) => `  ${label}: ${value}`), '']
      : []),
    'What happens next:',
    ...nextSteps.map((step) => `  - ${step}`),
    '',
    `Sign in with the phone number you registered and the password you chose.`,
    ...(details.email ? [`We will use ${details.email} to reach you about this account.`] : []),
    '',
    'We will never ask you for your password by email or SMS. If anyone does,',
    'it is not us — do not share it.',
    '',
    `If you did not create this account, contact support straight away.`
  ].join('\n');

  const detailHtml = detailRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">
${detailRows
        .map(
          ([label, value]) => `          <tr>
            <td style="padding:6px 0;font-size:13px;line-height:1.5;color:#64748b;">${escapeHtml(label)}</td>
            <td style="padding:6px 0;font-size:13px;line-height:1.5;color:#0f172a;font-weight:600;">${escapeHtml(value)}</td>
          </tr>`
        )
        .join('\n')}
        </table>`
    : '';

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
          Your ${escapeHtml(appName)} ${escapeHtml(accountLabel)} account has been created.
        </p>
        ${detailHtml}
        <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#334155;">What happens next:</p>
        <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.6;color:#334155;">
${nextSteps.map((step) => `          <li style="margin:0 0 8px;">${escapeHtml(step)}</li>`).join('\n')}
        </ul>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#334155;">
          Sign in with the phone number you registered and the password you chose.
        </p>
        ${details.email ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#334155;">
          We will use ${escapeHtml(details.email)} to reach you about this account.
        </p>` : ''}
        <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#64748b;">
          We will never ask you for your password by email or SMS. If anyone does,
          it is not us &mdash; please do not share it.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
          If you did not create this account, contact support straight away.
        </p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

/**
 * Send the welcome message to a newly registered address.
 *
 * Confirmation, not a gate: the account already exists by the time this runs, so
 * a caller must not treat a failure here as a failed registration. Never throws
 * and reports the same `success`/`simulated` pair as the OTP path so the caller
 * can log truthfully either way.
 *
 * @returns {Promise<{success:boolean, simulated:boolean, channel:string, messageId?:string, error?:string, hint?:string}>}
 */
async function sendRegistrationEmail({ to, fullName, role, details = {} }) {
  const cfg = resolveConfig();
  const { subject, text, html } = buildRegistrationEmail({
    fullName,
    role,
    details,
    appName: cfg.appName
  });

  return deliverMessage({ to, subject, text, html });
}

module.exports = {
  sendOtpEmail,
  sendRegistrationEmail,
  isEmailConfigured,
  canExposeOtpInResponse,
  describeEmailConfig,
  verifyEmailConnection,
  sendTestEmail,
  buildOtpEmail,
  buildRegistrationEmail,
  explainSmtpError,
  // Exported for the diagnostic scripts and the provider tests, which need to
  // assert on how a failure is described without sending a message.
  explainHttpApiError,
  parseFromAddress
};