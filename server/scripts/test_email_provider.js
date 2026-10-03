// Tests the HTTPS email-provider path: provider selection, the exact request
// each API receives, and how failures are described.
//
// Runs one scenario per child process because emailService memoises its resolved
// config on first use, and env changes cannot reach it afterwards. fetch is
// stubbed in every child, so nothing leaves the machine and no real API key is
// needed.
//
//   node scripts/test_email_provider.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { execFileSync } = require('child_process');
const path = require('path');

// Child processes get `-e` scripts, and a relative require in one of those
// resolves against the child's cwd rather than this file's directory. So the
// module paths handed to them have to be absolute.
const SERVICE = path.join(__dirname, '..', 'src', 'services', 'emailService.js');
const DOTENV = path.join(__dirname, '..', '.env');

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

/**
 * Run one send in a clean process with fetch stubbed.
 *
 * @param {string} provider   Value for EMAIL_PROVIDER.
 * @param {string} envExtra   Extra env for the child.
 * @param {string} response   JS source for the Response the stub returns.
 */
function runSend(provider, envExtra, response) {
  const script = `
    require('dotenv').config({ path: ${JSON.stringify(DOTENV)} });
    const captured = [];
    globalThis.fetch = async (url, opts) => {
      captured.push({
        url: String(url),
        method: opts.method,
        headers: opts.headers,
        body: opts.body ? JSON.parse(opts.body) : null
      });
      return ${response};
    };
    const svc = require(${JSON.stringify(SERVICE)});
    svc.sendOtpEmail({ to: 'customer@example.com', fullName: 'Dawit', otpCode: '123456', expiresInMinutes: 5 })
      .then((r) => console.log(JSON.stringify({ result: r, captured })))
      .catch((e) => console.log(JSON.stringify({ crash: e.message })));
  `;

  const out = execFileSync(process.execPath, ['-e', script], {
    env: {
      ...process.env,
      EMAIL_PROVIDER: provider,
      // A key must be present or the service reports itself unconfigured and
      // SIMULATES instead of sending. These values are fake and never leave the
      // process, because fetch is stubbed.
      RESEND_API_KEY: 're_fake_key_for_testing',
      SENDGRID_API_KEY: 'SG.fake_key_for_testing',
      EMAIL_FROM: 'Smart Dube <no-reply@smartdube.et>',
      ...envExtra
    },
    encoding: 'utf8'
  });

  return JSON.parse(out.trim().split('\n').pop());
}

const jsonResponse = (status, body) =>
  `new Response(${JSON.stringify(JSON.stringify(body))}, { status: ${status}, headers: { 'content-type': 'application/json' } })`;

function main() {
  // ---- 1. Resend request shape ------------------------------------------
  const resend = runSend('resend', {}, jsonResponse(200, { id: '49a399f8-1071-4ef7-8735-a5a54b207700' }));
  const rc = resend.captured[0] || {};

  check('resend: the send succeeds', resend.result?.success === true, resend.result?.messageId || resend.result?.error);
  check('resend: posts to the documented endpoint', rc.url === 'https://api.resend.com/emails', rc.url);
  check('resend: authenticates with a bearer token', rc.headers?.Authorization === 'Bearer re_fake_key_for_testing');
  check('resend: accepts a "Smart Dube <addr>" from value unchanged', rc.body?.from === 'Smart Dube <no-reply@smartdube.et>', rc.body?.from);
  check('resend: sends the recipient as an array', JSON.stringify(rc.body?.to) === '["customer@example.com"]', JSON.stringify(rc.body?.to));
  check('resend: subject carries the code', rc.body?.subject === '123456 is your Smart Dube verification code', rc.body?.subject);
  check('resend: both bodies are present', typeof rc.body?.text === 'string' && typeof rc.body?.html === 'string');
  check('resend: the html body carries the code', String(rc.body?.html).includes('123456'));
  check('resend: the from-name is not HTML-escaped into the body twice', !String(rc.body?.html).includes('&amp;lt;'));

  // ---- 2. SendGrid request shape ----------------------------------------
  const sg = runSend('sendgrid', {}, jsonResponse(202, { message_id: 'abc123' }));
  const sc = sg.captured[0] || {};

  check('sendgrid: the send succeeds', sg.result?.success === true, sg.result?.messageId || sg.result?.error);
  check('sendgrid: posts to the documented endpoint', sc.url === 'https://api.sendgrid.com/v3/mail/send', sc.url);
  check(
    'sendgrid: splits the display name out of EMAIL_FROM',
    JSON.stringify(sc.body?.from) === '{"name":"Smart Dube","email":"no-reply@smartdube.et"}',
    JSON.stringify(sc.body?.from)
  );
  check(
    'sendgrid: wraps the recipient in personalizations',
    sc.body?.personalizations?.[0]?.to?.[0]?.email === 'customer@example.com'
  );
  check(
    'sendgrid: declares both content types',
    sc.body?.content?.length === 2 && sc.body.content.every((c) => c.type === 'text/plain' || c.type === 'text/html')
  );

  // ---- 3. Failure modes must not read as delivered ----------------------
  // The dangerous case is a 4xx that gets swallowed, because the customer is
  // then told to check an inbox that will never receive the code.
  const cases = [
    {
      name: 'resend unverified domain',
      provider: 'resend',
      response: jsonResponse(403, {
        statusCode: 403,
        message: 'The from address is not verified. You can only send testing emails to your own email address'
      }),
      mustMatch: /not verified/i
    },
    {
      name: 'sendgrid unverified sender',
      provider: 'sendgrid',
      response: jsonResponse(403, {
        errors: [{ message: 'The from address does not match a verified Sender Identity' }]
      }),
      mustMatch: /sender identity|not verified/i
    },
    {
      name: 'bad api key',
      provider: 'resend',
      response: jsonResponse(401, { message: 'API key is invalid' }),
      mustMatch: /RESEND_API_KEY/
    },
    {
      // Resend answers 400, not 401, for a bad key. If the key check is ever
      // moved behind a status-code branch alone, this stops being recognised and
      // the reader is sent to fix EMAIL_FROM instead.
      name: 'bad api key reported as 400',
      provider: 'resend',
      response: jsonResponse(400, { message: 'API key is invalid' }),
      mustMatch: /RESEND_API_KEY/
    },
    {
      name: 'rejected recipient',
      provider: 'sendgrid',
      response: jsonResponse(400, { errors: [{ message: 'The email address is not valid.' }] }),
      mustMatch: /recipient/i
    },
    {
      name: 'rate limited',
      provider: 'sendgrid',
      response: jsonResponse(429, { errors: [{ message: 'You have reached your daily sending limit' }] }),
      mustMatch: /rate.limit/i
    },
    {
      name: 'provider outage',
      provider: 'resend',
      response: jsonResponse(502, { message: 'upstream error' }),
      mustMatch: /their side|502/i
    }
  ];

  for (const c of cases) {
    const out = runSend(c.provider, {}, c.response);
    const hint = String(out.result?.hint || '');
    check(`${c.name}: reported as failed`, out.result?.success === false, out.result?.error);
    check(`${c.name}: the hint says what to change`, c.mustMatch.test(hint), hint.slice(0, 100));
    // An SMTP-era hint here would send the reader after SMTP credentials on a
    // deployment that never opens an SMTP socket.
    check(`${c.name}: no SMTP advice leaks in`, !/app password|SMTP_PASS/i.test(hint));
    check(`${c.name}: the key is never echoed into the error`, !/fake_key_for_testing/.test(JSON.stringify(out.result)));
  }

  // ---- 4. An unconfigured key must SIMULATE, not silently "send" --------
  const uc = runSend('resend', { RESEND_API_KEY: '' }, 'new Response("{}", { status: 200 })');

  check('a missing API key degrades to SIMULATION', uc.result?.simulated === true && uc.result?.success === true, uc.result?.error);
  check('a missing API key makes no network call', uc.captured.length === 0);
  check('a missing API key names the variable that is missing', /RESEND_API_KEY/.test(String(uc.result?.error)), uc.result?.error);

  // ---- 5. Provider selection ---------------------------------------------
  const selection = (env) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ['-e', `
          require('dotenv').config({ path: ${JSON.stringify(DOTENV)} });
          const svc = require(${JSON.stringify(SERVICE)});
          console.log(JSON.stringify({ configured: svc.isEmailConfigured() }));
        `],
        { env: { ...process.env, ...env }, encoding: 'utf8' }
      )
        .trim()
        .split('\n')
        .pop()
    );

  // EMAIL_PROVIDER has to win even when a key is present, so a developer can
  // stay on SMTP for local work while the deployed copy uses the API.
  check(
    'EMAIL_PROVIDER=smtp overrides a present API key',
    selection({
      EMAIL_PROVIDER: 'smtp',
      RESEND_API_KEY: 're_x',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'a@b.com',
      SMTP_PASS: 'x',
      EMAIL_FROM: 'a@b.com'
    }).configured === true
  );
  check(
    'EMAIL_PROVIDER=sendgrid with no key is not configured',
    selection({ EMAIL_PROVIDER: 'sendgrid', SENDGRID_API_KEY: '', EMAIL_FROM: 'a@b.com' }).configured === false
  );

  console.log(`\n[PROVIDER TEST] ${passed}/${passed + failed} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main();