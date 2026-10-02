// Guards the two rules the sign-in page has to keep:
//   1. the phone number is remembered and prefilled on load
//   2. the password is never prefilled, never displayed, never stored
//
// The second is a security property, so it is asserted rather than assumed. A
// regression here would be invisible in review: the page still looks fine.
//
//   node scripts/test_signin_privacy.js

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'Login.jsx');
const source = fs.readFileSync(SRC, 'utf8');

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -  ${detail}` : ''}`);
}

// -  1. prefill
const phoneState = source.match(/const\s*\[phone,\s*setPhone\]\s*=\s*useState\(([^)]*)\)/);
check(
  '1. the phone field initialises from the remembered value',
  !!phoneState && phoneState[1].trim() === 'readRememberedPhone',
  phoneState ? `useState(${phoneState[1].trim()})` : 'could not find the phone state declaration'
);

check(
  '1b. the remembered value is a lazy initialiser, not evaluated on every render',
  !!phoneState && /useState\(\s*readRememberedPhone\s*\)/.test(source),
  'useState(readRememberedPhone) runs the reader once on mount'
);

check(
  '1c. the phone is saved after a successful sign-in',
  /rememberPhone\(\s*data\.user\?\.phone\s*\|\|\s*phone\s*\)/.test(source),
  'rememberPhone(data.user?.phone || phone)'
);

// -  2. password never prefilled
const passwordState = source.match(/const\s*\[password,\s*setPassword\]\s*=\s*useState\(([^)]*)\)/);
check(
  '2. the password field starts empty, with no hardcoded default',
  !!passwordState && /^['"]['"]$/.test(passwordState[1].trim()),
  passwordState ? `useState(${passwordState[1].trim()})` : 'could not find the password state declaration'
);

// The regression this replaces: a seeded demo password in the sign-in state.
const signInSeed = source.match(/const\s*\[password,\s*setPassword\]\s*=\s*useState\((['"][^'"]+['"])\)/);
check(
  '2b. no literal password is seeded into the sign-in form',
  !signInSeed,
  signInSeed ? `FOUND ${signInSeed[1]}` : 'no string literal in the password useState'
);

// -  2c. phone storage is opt-in only
// The phone is not a secret, but it is a permanent account pointer, so it must
// never be written or displayed without the user having asked for it.
check(
  '2c. the opt-in flag defaults to off when unreadable, not on',
  /function readRememberOptIn\(\)[\s\S]*?catch\s*\{[\s\S]*?return false;[\s\S]*?\}/.test(source),
  'readRememberOptIn returns false in the catch branch'
);

check(
  '3. the remembered phone is never read back unless the user opted in',
  /function readRememberedPhone\(\)\s*\{\s*if\s*\(!readRememberOptIn\(\)\)\s*return\s*'\+251';/.test(source),
  'readRememberedPhone() bails out before reading the key'
);

check(
  '3a. the opt-in flag lives in its own key, separate from the phone',
  /const REMEMBER_FLAG_KEY = 'smart_dube_remember_phone';/.test(source),
  'the flag is a boolean preference, so storing it in plain text is safe'
);

check(
  '3b. the number is only saved after login when the box is ticked',
  /if\s*\(rememberPhoneOptIn\)\s*rememberPhone\(/.test(source),
  'rememberPhone() is gated on the opt-in state'
);

check(
  '3c. opting out deletes the stored number rather than just stopping writes',
  /handleRememberPhoneToggle[\s\S]*?writeRememberOptIn\(enabled\);[\s\S]*?else forgetPhone\(\);/.test(source),
  'un-ticking calls forgetPhone(), which removes the key'
);

check(
  '3d. ticking the box saves the number immediately, without waiting for a login',
  /handleRememberPhoneToggle[\s\S]*?if \(enabled\) rememberPhone\(phone\);/.test(source),
  'the typed number is stored on tick'
);

check(
  '3e. the checkbox is rendered and wired to the toggle',
  /type="checkbox"[\s\S]{0,200}?checked=\{rememberPhoneOptIn\}[\s\S]{0,200}?handleRememberPhoneToggle\(e\.target\.checked\)/.test(source),
  'controlled checkbox, onChange calls the toggle'
);

// -  3. password never stored
// Every localStorage write in the file must be the phone key or the opt-in flag.
// This is the check that would catch a future "remember me" implementation
// storing a password.
const writes = [...source.matchAll(/localStorage\.setItem\(\s*([^,)]+)/g)].map((m) => m[1].trim());
check(
  '4. the only values written to localStorage are the phone key and the opt-in flag',
  writes.length > 0 && writes.every((w) => w.includes('LAST_PHONE_KEY') || w.includes('REMEMBER_FLAG_KEY')),
  writes.length ? `${writes.length} write(s): ${writes.join(', ')}` : 'no localStorage.setItem found -  expected one'
);

const passwordWrites = [...source.matchAll(/setItem\([^)]*password/gi)].map((m) => m[0]);
check(
  '4b. nothing writes a password to storage',
  passwordWrites.length === 0,
  passwordWrites.length ? `FOUND: ${passwordWrites.join(', ')}` : 'no password ever reaches setItem'
);

// The server response for a login carries a token and a user object. Confirm the
// code never dumps either wholesale into storage, which would sweep the password
// hash-adjacent fields along with it.

// The server response for a login carries a token and a user object. Confirm the
// code never dumps either wholesale into storage, which would sweep the password
// hash-adjacent fields along with it.
const wholesale = [...source.matchAll(/localStorage\.setItem\([^)]*\b(data|body|res|response)\b[^)]*\)/g)];
check(
  '5. the whole login response is never stored',
  wholesale.length === 0,
  wholesale.length ? `FOUND: ${wholesale.map((m) => m[0]).join(', ')}` : 'only the validated phone string is stored'
);

check(
  '6. the password is cleared when leaving the sign-in view',
  /const switchView = \(view\) => \{[\s\S]*?setPassword\(''\);[\s\S]*?\};/.test(source),
  'switchView() calls setPassword(\'\')'
);

// -  7. autofill is well-typed
check(
  '7. the phone input is marked autoComplete="tel"',
  /name="phone"\s*\n\s*autoComplete="tel"/.test(source),
  'a saved phone number autofills the phone box, not the email box'
);

// The password field keeps current-password rather than "off": it renders masked,
// and it lets a password manager fill in without this app ever seeing the value.
// It is a hint to the browser, not storage.
check(
  '8. the password input is masked by default and uses current-password',
  /autoComplete="current-password"/.test(source) && /type=\{showPassword \? 'text' : 'password'\}/.test(source),
  'type="password" unless the user presses the reveal button'
);

check(
  '9. revealing the password still requires a deliberate click',
  /onClick=\{\(\) => setShowPassword\(!showPassword\)\}/.test(source),
  'the eye toggle is the only way to render it in clear text'
);

// ===================================================================
// Behavioural checks
//
// The regexes above confirm the code is written as intended. These actually run
// the storage helpers against a fake localStorage, because the property that
// matters is behavioural: on a device that never opted in, the stored number
// must not be read, shown or trusted.
//
// The helpers are lifted out of the source and evaluated in isolation, so this
// tests the shipped code rather than a copy of it.
// ===================================================================
// The helpers are lifted out of the source and evaluated in isolation, so this
// tests the shipped code rather than a copy of it.
//
// The slice runs from the first key declaration to the closing brace of the last
// helper, found by matching braces. A naive "up to the component" slice would
// swallow any import statement sitting between the helpers and the component,
// which is what this file has to tolerate.
function sliceHelpers() {
  const start = source.indexOf('const LAST_PHONE_KEY');
  const fnStart = source.indexOf('function rememberPhone(');
  if (start === -1 || fnStart === -1) return '';

  const open = source.indexOf('{', fnStart);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}
const helperBlock = sliceHelpers();
check(
  '10. the storage helpers are present to be exercised',
  /function readRememberOptIn/.test(helperBlock) &&
    /function readRememberedPhone/.test(helperBlock) &&
    /function rememberPhone/.test(helperBlock) &&
    /function forgetPhone/.test(helperBlock),
  'all four helpers found, sliced cleanly with no stray imports'
);
check(
  '10b. the extracted slice is free of import statements',
  !/^\s*import\s/m.test(helperBlock),
  'evaluating the slice as a plain function body is valid'
);

/** A localStorage stand-in that records writes and can be made to throw. */
function makeStorage(initial = {}, { throwOnRead = false } = {}) {
  const store = { ...initial };
  return {
    store,
    getItem: (k) => {
      if (throwOnRead) throw new Error('SecurityError: storage is blocked');
      return k in store ? store[k] : null;
    },
    setItem: (k, v) => {
      if (throwOnRead) throw new Error('QuotaExceededError');
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
}

function loadHelpers(storage) {
  const sandbox = { window: { localStorage: storage } };
  // eslint-disable-next-line no-new-func
  const factory = new Function('window', `${helperBlock}; return { readRememberOptIn, writeRememberOptIn, readRememberedPhone, rememberPhone, forgetPhone };`);
  return factory(sandbox.window);
}

const FLAG = 'smart_dube_remember_phone';
const PHONE_KEY = 'smart_dube_last_phone';
const REAL = '+251911223344';

{
  // A stale number left in storage from an earlier session must not be surfaced
  // on a device where remembering was never requested.
  const storage = makeStorage({ [PHONE_KEY]: REAL });
  const h = loadHelpers(storage);
  check(
    '11. a number in storage is NOT shown when the user never opted in',
    h.readRememberedPhone() === '+251',
    `stored ${REAL} but opted out, so read back "${h.readRememberedPhone()}"`
  );
  check('12. the opt-in flag reads as false by default', h.readRememberOptIn() === false);
}

{
  const storage = makeStorage({ [FLAG]: '1', [PHONE_KEY]: REAL });
  const h = loadHelpers(storage);
  check(
    '13. the number IS shown when the user opted in',
    h.readRememberedPhone() === REAL,
    `read back "${h.readRememberedPhone()}"`
  );
  check('14. the opt-in flag reads as true when set', h.readRememberOptIn() === true);
}

{
  // localStorage is user-editable and survives app upgrades, so junk must not be
  // rendered into the sign-in field as if it were a real number.
  const cases = ['', 'javascript:alert(1)', '   ', 'abc', '<script>', 'x'.repeat(300)];
  const bad = cases.filter((junk) => loadHelpers(makeStorage({ [FLAG]: '1', [PHONE_KEY]: junk })).readRememberedPhone() !== '+251');
  check(
    '15. malformed stored values are rejected in favour of the default',
    bad.length === 0,
    bad.length ? `rendered these: ${JSON.stringify(bad)}` : `${cases.length} junk values all fell back to "+251"`
  );
}

{
  // Valid formats that must keep working, so the guard is not simply too strict.
  const good = ['+251911223344', '0911223344', '+251 911 223 344', '+251-911-223344'];
  const rejected = good.filter((ok) => loadHelpers(makeStorage({ [FLAG]: '1', [PHONE_KEY]: ok })).readRememberedPhone() !== ok);
  check(
    '16. valid phone formats are still accepted',
    rejected.length === 0,
    rejected.length ? `wrongly rejected: ${rejected.join(', ')}` : `${good.length} formats round-tripped`
  );
}

{
  const storage = makeStorage();
  const h = loadHelpers(storage);
  h.rememberPhone('  ' + REAL + '  ');
  check(
    '17. a valid number is stored, trimmed',
    storage.store[PHONE_KEY] === REAL,
    `stored "${storage.store[PHONE_KEY]}"`
  );
}

{
  // The core of "never store the password": nothing password-shaped may persist.
  const storage = makeStorage();
  const h = loadHelpers(storage);
  ['merchant123', 'correct horse battery staple', '{"password":"x"}', '+251911223344hunter2'].forEach((v) => h.rememberPhone(v));
  const stored = Object.values(storage.store);
  check(
    '18. rememberPhone() cannot write a password, only a number',
    stored.every((v) => /^\+?\d[\d\s-]{6,}$/.test(v)),
    `storage holds: ${JSON.stringify(stored)}`
  );
  check('19. a rejected value is not stored at all', storage.store[PHONE_KEY] === undefined || /^\+?\d[\d\s-]{6,}$/.test(storage.store[PHONE_KEY]));
}

{
  // Opting out must clear what is already there, not merely stop future writes.
  const storage = makeStorage({ [FLAG]: '1', [PHONE_KEY]: REAL });
  const h = loadHelpers(storage);
  h.writeRememberOptIn(false);
  h.forgetPhone();
  check('20. opting out removes the stored number', storage.store[PHONE_KEY] === undefined, `keys left: ${JSON.stringify(Object.keys(storage.store))}`);
  check('21. opting out removes the flag', storage.store[FLAG] === undefined);
  check('22. after opting out the number is not read back', h.readRememberedPhone() === '+251');
}

{
  const storage = makeStorage();
  const h = loadHelpers(storage);
  h.writeRememberOptIn(true);
  check('23. opting in sets the flag', storage.store[FLAG] === '1');
}

{
  // Blocked storage is common enough (private browsing, strict policy) that
  // failing closed matters: the page must still load and show the default.
  const storage = makeStorage({ [FLAG]: '1', [PHONE_KEY]: REAL }, { throwOnRead: true });
  const h = loadHelpers(storage);
  let threw = null;
  let result;
  try {
    result = h.readRememberedPhone();
  } catch (e) {
    threw = e;
  }
  check('24. readRememberedPhone does not throw when storage is blocked', threw === null, threw ? threw.message : `returned "${result}"`);
  check('25. blocked storage falls back to the default, failing closed', result === '+251');
  check('26. the opt-in flag fails closed to false', h.readRememberOptIn() === false);

  let writeThrew = null;
  try {
    h.rememberPhone(REAL);
    h.writeRememberOptIn(true);
  } catch (e) {
    writeThrew = e;
  }
  check('27. writes do not throw when storage is blocked', writeThrew === null, writeThrew ? writeThrew.message : 'both writes were swallowed');
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.error('FAILED:');
  for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
