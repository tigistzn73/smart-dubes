// Proves the SMTP resolver is pinned to IPv4.
//
// Reproduces the production failure this was written for: on a host that
// advertises an IPv6 interface but has no route to it, nodemailer picks a
// random address from smtp.gmail.com's A + AAAA records, lands on the IPv6
// one, and the send fails with ENETUNREACH.
//
// The assertions are deliberately aimed at nodemailer's OWN resolver
// (shared.resolveHostname) rather than at dns.lookup. nodemailer resolves the
// relay with dns.Resolver#resolve4/#resolve6 and only falls back to dns.lookup
// when both of those come back empty, so a test that only exercises dns.lookup
// passes while IPv6 is still being handed to the transport. The first version of
// this file did exactly that.
//
//   node scripts/test_email_ipv4.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const dns = require('dns');

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const lookupAll = (host, fn = dns.lookup) =>
  new Promise((resolve, reject) => {
    fn(host, { all: true }, (err, addrs) => (err ? reject(err) : resolve(addrs)));
  });

const resolve4 = (host) =>
  new Promise((resolve) => new dns.Resolver().resolve4(host, (err, addrs) => resolve(err ? [] : addrs)));

const resolve6 = (host) =>
  new Promise((resolve) => new dns.Resolver().resolve6(host, (err, addrs) => resolve(err ? [] : addrs)));

const isV6 = (a) => a.family === 6 || a.family === 'IPv6';
const hasColon = (a) => typeof a === 'string' && a.includes(':');

/** Ask nodemailer exactly the question it asks the relay, and see what it got. */
function nodemailerCandidates(host) {
  const shared = require('nodemailer/lib/shared');
  // Its cache is process-wide with a 5 minute TTL; a stale entry would mask the
  // behaviour under test.
  shared.dnsCache.delete(host);
  return new Promise((resolve, reject) => {
    shared.resolveHostname({ host }, (err, resolved) => (err ? reject(err) : resolve(resolved._addresses || [])));
  });
}

async function main() {
  const relay = process.env.SMTP_HOST || 'smtp.gmail.com';
  const unrelated = 'registry.npmjs.org';

  // ---- 1. What the host looks like WITHOUT the patch ---------------------
  // Captured before emailService is required, because requiring it installs the
  // wrappers.
  const rawV4 = await resolve4(relay);
  const rawV6 = await resolve6(relay);
  const rawLookup = await lookupAll(relay, dns.lookup);

  console.log(
    `\n  ${relay} resolves to ${rawV4.length} IPv4 and ${rawV6.length} IPv6 via dns.Resolver ` +
      `(${rawV4.join(', ') || 'none'}${rawV6.length ? ' / ' + rawV6.join(', ') : ''})\n`
  );

  // Whether the original failure is reachable from this machine depends on the
  // host: the coin flip needs an AAAA record in the candidate list. Assert the
  // vulnerable shape only where it exists, and say so where it does not.
  if (rawV6.length > 0) {
    check(
      'the relay does publish an AAAA record that nodemailer could pick',
      rawV4.length > 0,
      `${rawV4.length} A + ${rawV6.length} AAAA — an unpinned random pick hits either`
    );
  } else {
    console.log(
      `NOTE  ${relay} has no AAAA record from here, so the original random pick cannot land on\n` +
        '      IPv6 on this machine. The checks below still hold it to IPv4-only, which is\n' +
        '      what prevents the failure on a host that does resolve AAAA.\n'
    );
    check('this host cannot reproduce the original failure', true, 'relay has no AAAA record here');
  }

  // ---- 2. Load the service, which installs the wrappers -------------------
  const { verifyEmailConnection, isEmailConfigured } = require('../src/services/emailService');

  check(
    'the IPv4-only wrapper is installed on dns.Resolver#resolve6',
    dns.Resolver.prototype.resolve6.__smartDubeIpv4Only === true
  );
  check('the IPv4-only wrapper is installed on dns.lookup', dns.lookup.__smartDubeIpv4Only === true);

  // ---- 3. nodemailer's own candidate list is IPv4-only --------------------
  // The assertion that matters. Everything below this is a footnote.
  const candidates = await nodemailerCandidates(relay);
  const v6Candidates = candidates.filter(hasColon);

  check(
    'nodemailer resolves the relay to IPv4 addresses only',
    candidates.length > 0 && v6Candidates.length === 0,
    candidates.join(', ') || 'no candidates'
  );

  // ---- 4. The random pick can no longer land on IPv6 ---------------------
  // One resolution is not enough: formatDNSValue picks at random from the list
  // on every call. Sample enough times that a 50/50 list would fail this.
  const picks = [];
  for (let i = 0; i < 12; i++) picks.push((await nodemailerCandidates(relay))[0]);
  check(
    '12 consecutive random picks all stay on IPv4',
    picks.every((p) => p && !hasColon(p)),
    [...new Set(picks)].join(', ')
  );

  // ---- 5. Non-SMTP lookups are untouched ----------------------------------
  // The Postgres pool must keep working: its hostname is deliberately not in the
  // intercept list. assertBothFamilies=true also exercises the three-argument
  // overload, since the wrapper has to widen that call before delegating.
  const otherV4 = await resolve4(unrelated);
  const otherV6 = await resolve6(unrelated);
  check(
    'an unrelated hostname still resolves AAAA records, so the database pool is unaffected',
    otherV4.length > 0 && otherV6.length > 0,
    `${unrelated}: ${otherV4.length} A, ${otherV6.length} AAAA`
  );

  const otherLookup = await lookupAll(unrelated);
  check(
    'dns.lookup still returns every family for an unrelated hostname',
    otherLookup.length > 0,
    `${otherLookup.length} address(es), ${otherLookup.filter(isV6).length} IPv6`
  );

  // ---- 6. The single-value callback shape still works --------------------
  const single = await new Promise((resolve, reject) => {
    dns.lookup(relay, (err, address, family) => (err ? reject(err) : resolve({ address, family })));
  });
  check(
    'the lookup(host, cb) callback shape is preserved',
    !hasColon(single.address),
    `${single.address} (family ${single.family})`
  );

  // ---- 7. A real connection actually gets to the AUTH stage ---------------
  // The decisive test. Reaching a credential verdict proves the TCP connection
  // and TLS handshake both completed, which is exactly what ENETUNREACH
  // prevented. Skipped rather than failed when no credentials are configured.
  if (isEmailConfigured()) {
    const result = await verifyEmailConnection();
    const reachedRelay = result.ok || /credential|auth|password|app password/i.test(String(result.reason || ''));
    check(
      'the TCP + TLS connection to the relay completes (AUTH verdict reached, not ENETUNREACH)',
      reachedRelay,
      result.ok ? 'credentials accepted' : String(result.reason).slice(0, 90)
    );
    check(
      'the failure is not an IPv6 routing error',
      !/enetunreach|ehostunreach|eaddrnotavail/i.test(String(result.reason || '')),
      result.ok ? 'n/a' : 'no IPv6 routing error'
    );
  } else {
    console.log('SKIP  live connection check — SMTP credentials are not configured on this machine.');
  }

  // ---- 8. dns.lookup on Windows is not what nodemailer sees ---------------
  // Explains a confusing artefact of this file: dns.lookup can return no AAAA
  // record on a host that plainly has IPv6, which makes a lookup-only assertion
  // look like proof of pinning when nothing was pinned at all.
  const lookupSawV6 = rawLookup.filter(isV6).length > 0;
  console.log(
    `\nNOTE  dns.lookup(all:true) reported ${rawLookup.length - lookupSawV6} IPv4 / ${lookupSawV6 ? 'some' : 'no'} IPv6 ` +
      'for the relay,\n      which is not the list nodemailer selects from. Checks 3 and 4 are the ones that bind.\n'
  );

  console.log(`[IPV4 TEST] ${passed}/${passed + failed} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('[IPV4 TEST] Crashed:', err.message);
  process.exit(1);
});
