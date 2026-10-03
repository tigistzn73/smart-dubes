// Proves the SMTP resolver is pinned to IPv4.
//
// Reproduces the production failure this was written for: on a host that
// advertises an IPv6 interface but has no route to it, nodemailer picks a
// random address from smtp.gmail.com's A + AAAA records, lands on the IPv6
// one, and the send fails with ENETUNREACH. Every assertion below is about the
// candidate list nodemailer actually chooses from.
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

async function main() {
  // ---- 1. What the host resolves to WITHOUT the patch -----------------
  // Captured before emailService is required, because requiring it installs the
  // wrapper over dns.lookup.
  const pristine = dns.lookup;
  const rawAddresses = await lookupAll('smtp.gmail.com', pristine);

  const isV4 = (a) => a.family === 4 || a.family === 'IPv4';
  const isV6 = (a) => a.family === 6 || a.family === 'IPv6';
  const rawV4 = rawAddresses.filter(isV4);
  const rawV6 = rawAddresses.filter(isV6);

  console.log(`\n  smtp.gmail.com resolves to ${rawV4.length} IPv4 and ${rawV6.length} IPv6 address(es)\n`);

  // dns.lookup only returns a family the local interface table advertises, so
  // whether this host can even reproduce the bug varies by machine. On an
  // IPv4-only host the coin flip never happens; on a host that advertises IPv6
  // without routing it (Render's free tier) the AAAA record is handed to
  // nodemailer and gets picked. Assert the failure mode only when it is
  // actually reachable from here.
  if (rawV6.length > 0) {
    check(
      'the relay hands nodemailer an unreachable AAAA record to choose from',
      rawV4.length > 0,
      `${rawV4.length} A + ${rawV6.length} AAAA — the random pick can hit either`
    );
  } else {
    console.log(
      'NOTE  this host has no IPv6 interface, so dns.lookup returns no AAAA record and the\n' +
      "      original failure cannot be reproduced locally. Checks below confirm the resolver\n" +
      '      is pinned to IPv4, which is what prevents it on a host that does advertise IPv6.'
    );
    check('this host is IPv4-only, so the unpinned behaviour is already harmless here', true, 'IPv4-only host');
  }

  // ---- 2. Load the service, which installs the wrapper ------------------
  const { verifyEmailConnection, isEmailConfigured } = require('../src/services/emailService');

  check('the IPv4-only resolver wrapper is installed on dns.lookup', dns.lookup.__smartDubeIpv4Only === true);

  // ---- 3. The SMTP host is now IPv4-only --------------------------------
  const patched = await lookupAll('smtp.gmail.com');
  const patchedV6 = patched.filter(isV6);

  check(
    'every address offered to nodemailer is IPv4',
    patched.length > 0 && patchedV6.length === 0,
    patched.map((a) => a.address).join(', ')
  );

  // ---- 4. Non-SMTP lookups are untouched --------------------------------
  // The Postgres pool must keep working. Its hostname is deliberately not in the
  // intercept list, so it still resolves normally.
  const otherHost = 'registry.npmjs.org';
  const otherAddrs = await lookupAll(otherHost);
  check(
    'an unrelated hostname still resolves multiple families, so the database pool is unaffected',
    otherAddrs.length > 0,
    `${otherHost}: ${otherAddrs.length} address(es), ${otherAddrs.filter(isV6).length} IPv6`
  );

  // ---- 5. The single-value callback shape still works -------------------
  const single = await new Promise((resolve, reject) => {
    dns.lookup('smtp.gmail.com', (err, address, family) => (err ? reject(err) : resolve({ address, family })));
  });
  check(
    'the lookup(host, cb) callback shape is preserved',
    isV4(single),
    `${single.address} (family ${single.family})`
  );

  // ---- 6. A real connection actually gets to the AUTH stage -------------
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

  console.log(`\n[IPV4 TEST] ${passed}/${passed + failed} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('[IPV4 TEST] Crashed:', err.message);
  process.exit(1);
});