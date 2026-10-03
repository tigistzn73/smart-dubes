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
    domainsUrl: 'https://api.sendgrid.com/v3/senders'
  }
};

function pickProvider() {
  const explicit = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (explicit && PROVIDERS[explicit]) return explicit;
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) return 'resend';
  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.trim()) return 'sendgrid';
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

async function apiGet(url, key) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
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

  console.log(`\nprovider     : ${p.label} (EMAIL_PROVIDER=${provider})`);
  console.log(`api key      : ${key ? `${key.slice(0, 6)}... (${key.length} chars, ${key.startsWith('re_') ? 'looks like a Resend key' : 'prefix not recognised'})` : 'MISSING'}`);
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
  const domains = await apiGet(p.domainsUrl, key);
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
  if (provider === 'sendgrid' && Array.isArray(domains.json)) {
    console.log('\nverified sender identities on this SendGrid account:');
    for (const s of domains.json) {
      console.log(`  ${String(s.from).padEnd(34)} id=${s.id} ${s.verified ? 'VERIFIED' : 'pending'}`);
      if (s.verified) verified.push(String(s.from).toLowerCase());
    }
  }

  // ---- Is EMAIL_FROM actually allowed to send? ---------------------------
  // Resend's resend.dev is implicitly usable without appearing in the verified
  // list, but only to the address on the Resend account. Without this branch the
  // check reports a hard FAILED and sends you off to verify a domain that does
  // not need verifying — while hiding the restriction that actually matters.
  const isOnboardingTestDomain =
    provider === 'resend' && (fromDomain === 'resend.dev' || fromDomain.endsWith('.resend.dev'));

  if (fromDomain) {
    const ok = isOnboardingTestDomain || verified.some((v) => fromDomain === v || fromDomain.endsWith(`.${v}`));
    if (isOnboardingTestDomain) {
      console.log(`\nTEST-ONLY: ${fromDomain} is Resend's shared onboarding domain.`);
      console.log('          It needs no verification, but delivers ONLY to the email on your Resend');
      console.log('          account. Fine for proving the key and integration work — not for customers.');
      console.log('          So the recipient MUST be the email you signed up to Resend with.');
    } else if (!verified.length) {
      console.log(`\nFAILED: no verified sending domain on this ${p.label} account.`);
      console.log('        Every send from an unverified address is refused with 403.');
    } else if (!ok) {
      console.log(`\nFAILED: ${fromDomain} is not a verified sending domain on this account.`);
      console.log(`        Verified: ${verified.join(', ')}`);
      console.log('        Either verify this domain, or point EMAIL_FROM at one that is verified.');
    } else {
      console.log(`\nok    ${fromDomain} is verified on this account.`);
    }
  }

  // ---- Optionally prove delivery -----------------------------------------
  if (sendTo) {
    console.log(`\nsending a real message to ${sendTo} ...`);
    const url = provider === 'resend' ? 'https://api.resend.com/emails' : 'https://api.sendgrid.com/v3/mail/send';
    const payload =
      provider === 'resend'
        ? { from, to: [sendTo], subject: 'Smart Dube configuration test', text: 'If you are reading this, sending works.' }
        : {
            personalizations: [{ to: [{ email: sendTo }] }],
            from: { email: domainOf(from) ? from.match(/<([^>]+)>/)?.[1] || from : from },
            subject: 'Smart Dube configuration test',
            content: [{ type: 'text/plain', value: 'If you are reading this, sending works.' }]
          };

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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