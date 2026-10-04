// Reports what the email provider actually thinks of this deployment.
//
// The failure this exists to catch: EMAIL_FROM names a domain that has no DNS
// delegation, so the provider cannot have it verified and rejects every send with
// a 403 that reads like a credentials problem. The app then answers "We could not
// send a verification code", and the only real cause is one layer of indirection
// away — in a hosted environment, from a laptop, with no shell on the instance.
//
//   node scripts/diagnose_email_provider.js                  report only
//   node scripts/diagnose_email_provider.js you@example.com also send a real message
//
// The API key is never printed, and never included in an error.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const dns = require('dns');

const PROVIDERS = {
  resend: {
    keyVar: 'RESEND_API_KEY',
    label: 'Resend',
    domainsUrl: 'https://api.resend.com/domains'
  },
  sendgrid: {
    keyVar: 'SENDGRID_API_KEY',
    label: 'SendGrid',
    // SendGrid's own "is this from-address allowed" question, asked directly.
    domainsUrl: 'https://api.sendgrid.com/v3/senders',
    authStyle: 'api-key'
  },
  brevo: {
    keyVar: 'BREVO_API_KEY',
    label: 'Brevo',
    domainsUrl: 'https://api.brevo.com/v3/senders',
    authStyle: 'api-key'
  }
};

function pickProvider() {
  const explicit = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (explicit && PROVIDERS[explicit]) return explicit;
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) return 'resend';
  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.trim()) return 'sendgrid';
  if (process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim()) return 'brevo';
  return null;
}

/** The domain part of an address, tolerating a "Name <addr>" form. */
function domainOf(value) {
  const raw = String(value || '').trim();
  const angled = raw.match(/<([^>]+)>/);
  const addr = angled ? angled[1] : raw;
  const at = addr.lastIndexOf('@');
  return at === -1 ? '' : addr.slice(at + 1).trim().toLowerCase();
}

const doh = async (name, type) => {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`);
    const body = await res.json();
    // Status 3 is NXDOMAIN: the name does not exist at all.
    return { status: body.Status, records: (body.Answer || []).map((a) => a.data) };
  } catch (err) {
    return { status: -1, records: [], error: err.message };
  }
};

async function apiGet(url, key, authStyle) {
  const headers = authStyle === 'api-key' ? { 'api-key': key } : { Authorization: `Bearer ${key}` };
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function main() {
  const provider = pickProvider();
  const sendTo = process.argv[2] || '';

  if (!provider) {
    console.log('\nNo email provider is configured.');
    console.log('Set RESEND_API_KEY or SENDGRID_API_KEY (or both, plus EMAIL_PROVIDER).\n');
    process.exit(1);
  }

  const p = PROVIDERS[provider];
  const key = String(process.env[p.keyVar] || '').trim();
  const from = String(process.env.EMAIL_FROM || '').trim();
  const fromDomain = domainOf(from);

  const keyPrefix = {
    resend: (k) => k.startsWith('re_'),
    sendgrid: (k) => k.startsWith('SG.'),
    brevo: (k) => k.startsWith('xkeysib-')
  };
  const expected = {
    resend: 're_',
    sendgrid: 'SG.',
    brevo: 'xkeysib-'
  };
  const prefixOk = key ? keyPrefix[provider](key) : false;

  console.log(`\nprovider     : ${p.label} (EMAIL_PROVIDER=${provider})`);
  console.log(
    `api key      : ${key ? `${key.slice(0, 6)}... (${key.length} chars, expected prefix "${expected[provider]}": ${prefixOk ? 'ok' : 'DOES NOT MATCH'})` : 'MISSING'}`
  );
  console.log(`EMAIL_FROM   : ${from || '(unset)'}`);
  console.log(`from domain  : ${fromDomain || '(none)'}\n`);

  if (!key) {
    console.log(`FAILED: ${p.keyVar} is empty, so the service reports itself unconfigured and SIMULATES.`);
    console.log('        No code is emailed; the API returns the code in the response instead.\n');
    process.exit(1);
  }

  // ---- Does the from-domain exist in public DNS at all? ------------------
  // Checked before the API call because it is the root cause when it fails, and
  // it explains the provider's 403 in one step instead of two.
  if (fromDomain) {
    const ns = await doh(fromDomain, 'NS');
    if (ns.status === 3) {
      console.log(`FAILED: ${fromDomain} does not exist in public DNS (NXDOMAIN).`);
      console.log('        A provider cannot verify a domain that has no nameservers, so it will');
      console.log('        reject every send from this address. This is the root cause, not the key.\n');
    } else if (ns.status !== 0) {
      console.log(`WARN  could not resolve ${fromDomain} publicly (DNS status ${ns.status}).`);
      console.log('      From inside Ethiopia this may be local DNS filtering rather than a real fault.\n');
    } else {
      console.log(`ok    ${fromDomain} is delegated in public DNS (${ns.records[0]}).`);
    }
  }

  // ---- What does the provider itself say? --------------------------------
  const domains = await apiGet(p.domainsUrl, key, p.authStyle);
  if (!domains.ok) {
    const detail = domains.json?.message || domains.json?.errors?.[0]?.message || domains.text.slice(0, 200);
    console.log(`FAILED: ${p.label} rejected the API key with ${domains.status}: ${detail}`);
    if (domains.status === 401) {
      console.log('        Check the key was copied whole — it is shown only once, at creation.\n');
      process.exit(1);
    }
  }

  let verified = [];
  if (provider === 'resend' && Array.isArray(domains.json?.data)) {
    console.log('\ndomains on this Resend account:');
    for (const d of domains.json.data) {
      const statuses = Object.entries(d.records || {}).map(([k, v]) => `${k}=${v?.status}`).join(' ');
      console.log(`  ${String(d.name).padEnd(34)} status=${d.status}${statuses ? `  ${statuses}` : ''}`);
      if (d.status === 'verified') verified.push(String(d.name).toLowerCase());
    }
  }
  if (provider === 'brevo' && Array.isArray(domains.json)) {
    console.log('\nsenders on this Brevo account:');
    for (const s of domains.json) {
      const state = s.active === true ? 'CONFIRMED' : 'not confirmed';
      console.log(`  ${String(s.email).padEnd(34)} ${state}`);
      // `active` is the whole ballgame: Brevo will not send from an inactive sender.
      if (s.active === true) verified.push(String(s.email).toLowerCase());
    }
  }
  if (provider === 'sendgrid' && Array.isArray(domains.json)) {
    console.log('\nverified sender identities on this SendGrid account:');
    for (const s of domains.json) {
      console.log(`  ${String(s.from).padEnd(34)} id=${s.id} ${s.verified ? 'VERIFIED' : 'pending'}`);
      if (s.verified) verified.push(String(s.from).toLowerCase());
    }
  }

  // ---- Is EMAIL_FROM actually allowed to send? ---------------------------
  if (fromDomain) {
    const ok = verified.some((v) => fromDomain === v || fromDomain.endsWith(`.${v}`));
    const noun = provider === 'brevo' ? 'confirmed sender' : 'verified sending domain';
    if (!verified.length) {
      console.log(`\nFAILED: no ${noun} on this ${p.label} account.`);
      console.log(`        Every send from an unlisted address is refused with 403.`);
    } else if (!ok) {
      console.log(`\nFAILED: ${fromDomain} is not a ${noun} on this account.`);
      console.log(`        Confirmed: ${verified.join(', ')}`);
      console.log(`        Either add ${fromDomain} and confirm it, or point EMAIL_FROM at one that is confirmed.`);
    } else {
      console.log(`\nok    ${fromDomain} is a ${noun} on this account.`);
    }
  }

  // ---- Optionally prove delivery -----------------------------------------
  if (sendTo) {
    console.log(`\nsending a real message to ${sendTo} ...`);
    const bare = from.match(/<([^>]+)>/)?.[1] || from;
    const subject = 'Smart Dube configuration test';
    const bodyText = 'If you are reading this, sending works.';

    const endpoints = {
      resend: { url: 'https://api.resend.com/emails', auth: 'bearer', payload: { from, to: [sendTo], subject, text: bodyText } },
      brevo: {
        url: 'https://api.brevo.com/v3/smtp/email',
        auth: 'api-key',
        payload: {
          sender: { name: 'Smart Dube', email: bare },
          to: [{ email: sendTo }],
          subject,
          textContent: bodyText,
          htmlContent: `<p>${bodyText}</p>`
        }
      },
      sendgrid: {
        url: 'https://api.sendgrid.com/v3/mail/send',
        auth: 'bearer',
        payload: {
          personalizations: [{ to: [{ email: sendTo }] }],
          from: { email: bare },
          subject,
          content: [{ type: 'text/plain', value: bodyText }]
        }
      }
    };
    const ep = endpoints[provider];

    const res = await fetch(ep.url, {
      method: 'POST',
      headers: {
        ...(ep.auth === 'api-key' ? { 'api-key': key } : { Authorization: `Bearer ${key}` }),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ep.payload),
      signal: AbortSignal.timeout(20000)
    });
    const text = await res.text();
    console.log(res.ok ? `ok    provider accepted it (${res.status}): ${text.slice(0, 200)}` : `FAILED: provider returned ${res.status}: ${text.slice(0, 300)}`);
    console.log('\nNote: acceptance is not delivery. A verified-but-unaligned From address lands in spam\n');
    console.log('without any error here. Check the actual inbox, including spam, before trusting it.\n');
    process.exit(res.ok ? 0 : 1);
  }

  console.log('Pass a recipient to also send a real message:');
  console.log(`  node scripts/diagnose_email_provider.js ${process.env.SMTP_USER || 'you@example.com'}\n`);
}

main().catch((err) => {
  console.error('[PROVIDER DIAG] Crashed:', err.message);
  process.exit(1);
});