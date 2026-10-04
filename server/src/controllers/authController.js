const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

// ----------------------------------------------------------------
//  Lockout policy
// ----------------------------------------------------------------
// State lives on the users table (failed_login_attempts, locked_until), not in
// process memory. An in-memory Map meant restarting the server wiped every
// lockout and each replica behind a load balancer enforced its own separate
// counter, so "3 attempts" was really "3 attempts per process, until restart".
//
// The lockout is deliberately NOT applied to phone numbers that have no
// account. Counting failures for unknown numbers means anyone could lock a
// colleague's real number out from the outside, using nothing but three
// deliberate wrong submissions. Unknown numbers are throttled per-IP in memory
// instead, which blunts brute-forcing without handing anyone a denial-of-
// service primitive against a specific person.
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// A 6-digit code has a million combinations, which is only comfortably
// unguessable because the token is single-use and short-lived. Bounding the
// guesses keeps it that way.
const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_TTL_MINUTES = Math.round(OTP_TTL_MS / 60000);

// Stops one client from burning SMS/email credits by looping the reset request.
// Tracked in users.reset_token_sent_at rather than a process-local Map: a Map is
// erased by every deploy, which would make restarting the server a way around the
// limit, and two replicas behind a load balancer would each hand out their own
// independent window.
const RESET_COOLDOWN_MS = 60 * 1000;

// Per-IP throttle for requests naming an account that does not exist. Keyed on
// IP because the point is to bound guesses per caller, not to punish a number.
const UNKNOWN_PHONE_THROTTLE = new Map();
const UNKNOWN_PHONE_MAX = 10;
const UNKNOWN_PHONE_WINDOW_MS = 15 * 60 * 1000;

const RESET_ATTEMPT_BODY_LIMIT = 32; // wrong long enough to overflow VARCHAR(10)

/**
 * Reduce any of the Ethiopian formats a human might type to the canonical E.164
 * form that is actually stored: 0911223344, 251911223344, +251 911 223 344 and
 * +251911223344 all mean the same subscriber.
 *
 * Without this, the login lookup silently fails for anyone who types the local
 * form of a number that was registered in international form, and they see a
 * generic "invalid credentials" for what is really a typo. Returns null when
 * the input cannot be a valid Ethiopian number.
 */
function normalizeEthiopianPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');

  if (digits.length === 9) return `+251${digits}`;        // 911223344
  if (digits.length === 10 && digits.startsWith('0')) return `+251${digits.slice(1)}`; // 0911223344
  if (digits.length === 12 && digits.startsWith('251')) return `+${digits}`;             // 251911223344
  if (digits.length === 13 && digits.startsWith('0251')) return `+${digits.slice(1)}`;
  return null;
}

/**
 * Look a user up by phone, tolerating any equivalent format. Returns null when
 * no account exists, which callers must not disclose to the client.
 */
async function findUserByPhone(rawPhone) {
  const canonical = normalizeEthiopianPhone(rawPhone);
  if (!canonical) return null;

  // Match the canonical form or the literal input: rows created before
  // normalisation was introduced may hold a non-canonical string.
  return db.get(
    'SELECT * FROM users WHERE phone = $1 OR phone = $2 LIMIT 1',
    [canonical, String(rawPhone || '').trim()]
  );
}

function recordUnknownPhoneAttempt(ip) {
  const key = ip || 'unknown';
  const now = Date.now();
  const entry = UNKNOWN_PHONE_THROTTLE.get(key);

  if (!entry || now - entry.firstAt > UNKNOWN_PHONE_WINDOW_MS) {
    UNKNOWN_PHONE_THROTTLE.set(key, { count: 1, firstAt: now });
    return 1;
  }

  entry.count += 1;
  return entry.count;
}

async function registerUser(req, res) {
  const { fullName, phone, role, password, faydaId, storeName, businessLicenseNo, address } = req.body;

  // Trimmed and lowercased before anything else looks at it. The email is the
  // password-reset delivery channel and the uniqueness key, so it has to have
  // exactly one spelling — otherwise "Dawit@Gmail.com" and "dawit@gmail.com"
  // become two accounts whose reset codes both land in one mailbox. Route
  // validation already rejects a missing or malformed address; this repeats the
  // check here because the column is NOT NULL and this function is also reachable
  // from anything that posts to it directly.
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({
      error: 'Email address is required. It is how you receive password reset verification codes.'
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  try {
    // Compared on lower(email) to match the database's case-insensitive unique
    // index. The index is what actually makes this safe under concurrency — this
    // check only produces a friendly message in the common case.
    const existing = await db.get(
      'SELECT id FROM users WHERE phone = $1 OR lower(btrim(email)) = lower($2)',
      [phone, email]
    );
    if (existing) {
      return res.status(400).json({ error: 'A user with this phone number or email already exists.' });
    }

    const { photoUrl } = req.body;
    const userPhoto = (photoUrl && photoUrl.trim())
      ? photoUrl
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`;

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const result = await db.get(`
      INSERT INTO users (full_name, phone, email, role, password_hash, fayda_id, photo_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
    `, [fullName, phone, email, role, passwordHash, faydaId || null, userPhoto]);
    const userId = result.id;

    let merchantInfo = null;
    if (role === 'MERCHANT') {
      const mResult = await db.get(`
        INSERT INTO merchants (user_id, store_name, business_license_no, address, kyc_status)
        VALUES ($1, $2, $3, $4, 'PENDING') RETURNING id
      `, [userId, storeName || `${fullName}'s Shop`, businessLicenseNo || 'LIC-PENDING', address || 'Addis Ababa']);
      merchantInfo = { id: mResult.id, kycStatus: 'PENDING' };
    } else if (role === 'CUSTOMER') {
      const existingCp = await db.get('SELECT id FROM customer_profiles WHERE phone = $1', [phone]);
      if (existingCp) {
        await db.run('UPDATE customer_profiles SET user_id = $1, photo_url = $2 WHERE id = $3', 
          [userId, userPhoto, existingCp.id]);
      }
    }

    // Fire and forget audit log (audit log function itself is async but we don't need to block response)
    logAudit({
      userId,
      actorName: fullName,
      action: 'USER_REGISTER',
      resource: `User #${userId} (${role})`,
      details: { role, phone, storeName }
    });

    const token = jwt.sign({ id: userId, fullName, phone, role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: userId, fullName, phone, email, role, merchant: merchantInfo }
    });
  } catch (err) {
    // 23505 is a unique violation. The check above already covers the ordinary
    // case, so this fires only when two registrations for the same phone or email
    // are in flight at once and both passed it. The database is the arbiter here;
    // reporting it as a 500 would blame the server for what is a user error.
    if (err && err.code === '23505') {
      return res.status(400).json({ error: 'A user with this phone number or email already exists.' });
    }
    // 23502 is a not-null violation. Reachable only if email were ever passed
    // as something other than the validated string handled above.
    if (err && err.code === '23502') {
      return res.status(400).json({
        error: 'Email address is required. It is how you receive password reset verification codes.'
      });
    }
    console.error('Register Error:', err);
    res.status(500).json({ error: 'Server error during user registration.' });
  }
}

async function loginUser(req, res) {
  const { phone, password } = req.body;
  const now = new Date();

  try {
    const user = await findUserByPhone(phone);

    // ---- 1. Is this account locked? -------------------------------------
    if (user && user.locked_until && new Date(user.locked_until) > now) {
      const remainingMs = new Date(user.locked_until) - now;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      logAudit({
        userId: user.id,
        actorName: user.full_name,
        action: 'LOGIN_BLOCKED_ACCOUNT_LOCKED',
        resource: 'AUTH',
        details: { phone: user.phone, remainingMinutes, remainingSeconds }
      });

      return res.status(429).json({
        error: `Account is temporarily locked due to ${MAX_FAILED_ATTEMPTS} consecutive failed password attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} (${remainingSeconds}s).`,
        locked: true,
        remainingSeconds,
        remainingMinutes
      });
    }

    // ---- 2. Verify the password ------------------------------------------
    const isMatch = user ? bcrypt.compareSync(password, user.password_hash) : false;

    if (!user || !isMatch) {
      // Unknown number: do NOT touch any account, but throttle the caller so a
      // script cannot use this endpoint as a password oracle.
      if (!user) {
        const attempts = recordUnknownPhoneAttempt(req.ip);
        if (attempts > UNKNOWN_PHONE_MAX) {
          logAudit({
            userId: null,
            actorName: 'Unknown User',
            action: 'LOGIN_THROTTLED_UNKNOWN_PHONE',
            resource: 'AUTH',
            details: { phone, ip: req.ip, attempts }
          });
          return res.status(429).json({
            error: 'Too many attempts from this device. Please try again in 15 minutes.',
            throttled: true
          });
        }

        logAudit({
          userId: null,
          actorName: 'Unknown User',
          action: 'FAILED_LOGIN_UNKNOWN_PHONE',
          resource: 'AUTH',
          details: { phone, ip: req.ip }
        });

        // Identical wording to the wrong-password case on purpose: which half
        // of the pair was wrong is not something an unauthenticated caller
        // gets to learn.
        return res.status(401).json({ error: 'Invalid phone number or password credentials.' });
      }

      // Known account, wrong password: this is the only case that locks.
      const attempts = (user.failed_login_attempts || 0) + 1;

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
        await db.run(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [attempts, lockedUntil.toISOString(), user.id]
        );

        logAudit({
          userId: user.id,
          actorName: user.full_name,
          action: 'ACCOUNT_LOCKED_5_MINUTES',
          resource: 'AUTH',
          details: { phone: user.phone, failedAttempts: attempts, lockoutMinutes: 5 }
        });

        return res.status(429).json({
          error: `Too many failed password attempts (${MAX_FAILED_ATTEMPTS} times). Your account is locked for 5 minutes for security.`,
          locked: true,
          remainingSeconds: 300,
          remainingMinutes: 5
        });
      }

      await db.run('UPDATE users SET failed_login_attempts = $1, locked_until = NULL WHERE id = $2', [attempts, user.id]);

      const attemptsLeft = MAX_FAILED_ATTEMPTS - attempts;
      logAudit({
        userId: user.id,
        actorName: user.full_name,
        action: 'FAILED_LOGIN',
        resource: 'AUTH',
        details: { phone: user.phone, attemptsLeft }
      });

      return res.status(401).json({
        error: `Invalid phone number or password credentials. (${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining before 5-minute lockout)`
      });
    }

    // ---- 3. Success: clear the lockout state ----------------------------
    // Also clears an expired lock so a correct password is never rejected
    // because of a stale timer.
    if ((user.failed_login_attempts || 0) > 0 || user.locked_until) {
      await db.run(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
        [user.id]
      );
    }

    let merchant = null;
    if (user.role === 'MERCHANT') {
      merchant = await db.get('SELECT * FROM merchants WHERE user_id = $1', [user.id]);
    }

    let customerProfile = null;
    if (user.role === 'CUSTOMER') {
      customerProfile = await db.get('SELECT * FROM customer_profiles WHERE user_id = $1 OR phone = $2', [user.id, user.phone]);
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        fullName: user.full_name, 
        phone: user.phone, 
        role: user.role,
        merchantId: merchant ? merchant.id : null,
        customerId: customerProfile ? customerProfile.id : null
      }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    logAudit({
      userId: user.id,
      actorName: user.full_name,
      action: 'LOGIN_SUCCESS',
      resource: 'AUTH',
      details: { role: user.role }
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        phone: user.phone,
        role: user.role,
        faydaId: user.fayda_id,
        photo_url: user.photo_url,
        photoUrl: user.photo_url,
        merchant,
        customerProfile
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Server error during user login.' });
  }
}

async function getMe(req, res) {
  try {
    const user = await db.get('SELECT id, full_name, phone, email, role, fayda_id, photo_url FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let merchant = null;
    let customerProfile = null;

    if (user.role === 'MERCHANT') {
      merchant = await db.get('SELECT * FROM merchants WHERE user_id = $1', [user.id]);
    } else if (user.role === 'CUSTOMER') {
      customerProfile = await db.get('SELECT * FROM customer_profiles WHERE user_id = $1 OR phone = $2', [user.id, user.phone]);
    }

    res.json({ user: { id: user.id, fullName: user.full_name, phone: user.phone, email: user.email, role: user.role, faydaId: user.fayda_id, photo_url: user.photo_url, photoUrl: user.photo_url, merchant, customerProfile } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Issue a password-reset OTP.
 *
 * Delivery order is email first, SMS second, and email is mandatory at
 * registration precisely because it is the recovery path. The phone number is the
 * login identity but it is also replaceable — a customer who loses their SIM can
 * never receive anything again, including the code that would let them back in —
 * so the email captured at registration is the durable factor.
 *
 * The SMS branch is now a safety net rather than a normal path: users.email is
 * NOT NULL, so every account has somewhere to receive a code. It still matters
 * for rows predating that constraint, and as a fallback when the mail relay is
 * down — a customer who cannot get in at all is worse than one who waits for a
 * text. The audit log records which channel was actually used.
 *
 * The code is stored bcrypt-hashed, so a dump of the users table does not hand
 * over a live reset code for any account.
 */
async function forgotPassword(req, res) {
  const { phone, email } = req.body;
  const identifier = String(email || phone || '').trim();
  let user = null;
  
  if (identifier.includes('@')) {
    const normalizedEmail = identifier.toLowerCase();
    user = await db.get(
      'SELECT * FROM users WHERE lower(trim(email)) = $1 OR lower(btrim(email)) = $1',
      [normalizedEmail]
    );
  } else {
    user = await findUserByPhone(identifier);
  }

  if (!user) {
    return res.status(404).json({ error: 'No account found with this phone number or email.' });
  }

  try {
    // Rate-limit by account so a lost phone cannot be used to drain SMS/email
    // credit by hammering this endpoint. Read from the users row, so the window
    // survives a restart and is the same for every replica.
    const now = Date.now();
    const lastSentAt = user.reset_token_sent_at ? new Date(user.reset_token_sent_at).getTime() : null;
    if (lastSentAt && now - lastSentAt < RESET_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESET_COOLDOWN_MS - (now - lastSentAt)) / 1000);
      return res.status(429).json({
        error: `Please wait ${waitSeconds} second${waitSeconds > 1 ? 's' : ''} before requesting another verification code.`,
        retryAfterSeconds: waitSeconds
      });
    }

    // 6-digit code from a CSPRNG. Math.random() was the old source, which is
    // predictable enough to matter for a value that grants account access.
    const resetToken = require('crypto').randomInt(100000, 1000000).toString();
    const expiresAt = new Date(now + OTP_TTL_MS);

    // One column holds one code, so writing the new hash here is what makes the
    // previous code invalid: the old bcrypt hash is gone, and a stale code can
    // no longer compare equal to anything. There is no window in which two codes
    // are both accepted.
    const tokenHash = bcrypt.hashSync(resetToken, 10);
    await db.run(
      `UPDATE users
       SET reset_token = $1,
           reset_token_expires = $2,
           reset_token_sent_at = $3,
           reset_token_attempts = 0
       WHERE id = $4`,
      [tokenHash, expiresAt.toISOString(), new Date(now).toISOString(), user.id]
    );

    // ---- Deliver ------------------------------------------------------
    const { sendOtpEmail, canExposeOtpInResponse } = require('../services/emailService');
    const hasEmail = !!(user.email && String(user.email).trim());

    let delivery = null;
    let channel = null;

    if (hasEmail) {
      delivery = await sendOtpEmail({ to: user.email, fullName: user.full_name, otpCode: resetToken, expiresInMinutes: OTP_TTL_MINUTES });
      channel = 'EMAIL';
      if (delivery && delivery.success) {
        logAudit({
          userId: user.id,
          actorName: user.full_name,
          action: 'PASSWORD_RESET_REQUESTED',
          resource: 'AUTH',
          details: { phone: user.phone, channel: 'EMAIL', simulated: !!delivery.simulated }
        });

        // With no provider configured there is no way to hand the code to its owner,
        // so it is returned in the response instead. canExposeOtpInResponse() gates
        // that, because this endpoint is unauthenticated: anyone who knows a phone
        // number could otherwise read that account's reset code and take the account
        // over. Set EXPOSE_OTP_IN_RESPONSE=true to opt in locally; never on Render.
        const exposeOtp = delivery.simulated && canExposeOtpInResponse();

        if (delivery.simulated && !exposeOtp) {
          console.error(
            `[AUTH] Reset code for user ${user.id} was NOT sent and NOT returned: no email provider is configured.`
          );
        }

        return res.json({
          message: exposeOtp
            ? `Email delivery is not configured, so your code is shown here instead. Enter ${resetToken} to continue.`
            : delivery.simulated
              // Nothing was sent and the code cannot be shown, so do not claim it was.
              // Telling a customer to wait for a code that will never arrive is worse
              // than saying plainly that this is broken on our side.
              ? 'Email delivery is temporarily unavailable, so we could not send a verification code. Please contact support to reset your password.'
              : `A 6-digit verification code has been sent to your registered email (${maskEmail(user.email)}). It expires in ${OTP_TTL_MINUTES} minutes.`,
          channel: 'EMAIL',
          destination: maskEmail(user.email),
          expiresInMinutes: OTP_TTL_MINUTES,
          ...(exposeOtp ? { _demoOTP: resetToken } : {})
        });
      }

      console.warn(
        `[AUTH] Email OTP delivery failed for user ${user.id}: ${delivery ? (delivery.hint || delivery.error || 'unknown') : 'no delivery result'}`
      );
      await db.run(
        'UPDATE users SET reset_token = NULL, reset_token_expires = NULL, reset_token_sent_at = NULL WHERE id = $1',
        [user.id]
      );
      return res.status(503).json({
        // The relay endpoint is named in `error` because a bare "Connection
        // timeout" cannot be acted on by whoever reads this. The customer-facing
        // half stays non-technical: a reset that fails because of a server-side
        // mail problem is not something they caused or can fix.
        error: delivery && delivery.error
          ? `We could not send a verification code: ${delivery.error}. This is a problem on our side, not with your account — please try again in a few minutes.`
          : 'We could not send a verification code to your registered email. Please try again in a few minutes.'
      });
    }

    await db.run(
      'UPDATE users SET reset_token = NULL, reset_token_expires = NULL, reset_token_sent_at = NULL WHERE id = $1',
      [user.id]
    );
    return res.status(400).json({
      error: 'No email is associated with this account. Please contact support to reset your password.'
    });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    res.status(500).json({ error: 'Server error during password reset request.' });
  }
}

/** Show only enough of an email to let the user recognise it. */
function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return 'your email';
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${'*'.repeat(Math.max(local.length - head.length, 1))}@${domain}`;
}

/** Show only the last four digits of a phone number. */
function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length <= 4 ? 'your phone' : `••••• ${digits.slice(-4)}`;
}

async function resetPassword(req, res) {
  const { phone, otpCode, newPassword } = req.body;

  try {
    const user = await findUserByPhone(phone);
    if (!user) {
      return res.status(400).json({ error: 'Invalid verification code or phone number. Please request a new code.' });
    }

    if (!user.reset_token) {
      return res.status(400).json({ error: 'No verification code is pending for this account. Please request a new code.' });
    }

    // Bounded guesses. The token is destroyed once the cap is exceeded so the
    // 1,000,000 combinations cannot simply be enumerated within the 5-minute
    // window.
    const attempts = (user.reset_token_attempts || 0) + 1;
    if (attempts > MAX_OTP_ATTEMPTS) {
      await db.run(
        'UPDATE users SET reset_token = NULL, reset_token_expires = NULL, reset_token_sent_at = NULL, reset_token_attempts = 0 WHERE id = $1',
        [user.id]
      );
      return res.status(429).json({
        error: 'Too many incorrect verification codes. Please request a new code and try again.'
      });
    }

    const tokenMatches = bcrypt.compareSync(
      String(otpCode || '').slice(0, RESET_ATTEMPT_BODY_LIMIT),
      user.reset_token
    );

    if (!tokenMatches) {
      await db.run('UPDATE users SET reset_token_attempts = $1 WHERE id = $2', [attempts, user.id]);

      logAudit({
        userId: user.id,
        actorName: user.full_name,
        action: 'PASSWORD_RESET_INVALID_OTP',
        resource: 'AUTH',
        details: { phone: user.phone, attemptsRemaining: MAX_OTP_ATTEMPTS - attempts }
      });

      return res.status(400).json({
        error: `Incorrect verification code. ${MAX_OTP_ATTEMPTS - attempts} attempt${MAX_OTP_ATTEMPTS - attempts > 1 ? 's' : ''} remaining before a new code is required.`
      });
    }

    // Check expiry only after the code is known good, so an invalid code cannot
    // be used to probe whether a live one exists.
    if (user.reset_token_expires && new Date(user.reset_token_expires) < new Date()) {
      await db.run(
        'UPDATE users SET reset_token = NULL, reset_token_expires = NULL, reset_token_sent_at = NULL, reset_token_attempts = 0 WHERE id = $1',
        [user.id]
      );
      return res.status(400).json({ error: 'That verification code has expired. Please request a new one.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);

    // This one UPDATE is the whole reason the reset flow used to dead-end. It
    // clears the password, the spent code AND the login lockout in a single
    // write. Previously the lockout lived in a separate in-memory Map that this
    // function knew nothing about, so a customer who reset their password while
    // locked out was still locked out and the new password appeared not to work.
    await db.run(`
      UPDATE users
      SET password_hash = $1,
          reset_token = NULL,
          reset_token_expires = NULL,
          reset_token_sent_at = NULL,
          reset_token_attempts = 0,
          failed_login_attempts = 0,
          locked_until = NULL
      WHERE id = $2
    `, [newHash, user.id]);

    logAudit({
      userId: user.id,
      actorName: user.full_name,
      action: 'PASSWORD_RESET_SUCCESS',
      resource: 'AUTH',
      details: { phone: user.phone, lockoutCleared: true }
    });

    // Issue new JWT token so user is instantly logged in
    const token = jwt.sign(
      { id: user.id, fullName: user.full_name, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Password reset successful! You are now logged in.',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ error: 'Server error during password reset.' });
  }
}

/**
 * Change the password of a signed-in user.
 *
 * This is separate from the OTP reset on purpose. The reset proves control of
 * the registered email or phone; this proves the session is genuinely the
 * account holder. The UI used to reach for the reset endpoint with the current
 * password typed into the OTP field, which could not work — the reset route
 * matches against a stored reset code, and a password is never one — so
 * in-app password changes always failed with "Invalid OTP code".
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await db.get(
      'SELECT id, full_name, phone, password_hash, failed_login_attempts, locked_until FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    if (!bcrypt.compareSync(String(currentPassword || ''), user.password_hash)) {
      logAudit({
        userId: user.id,
        actorName: user.full_name,
        action: 'PASSWORD_CHANGE_REJECTED',
        resource: 'AUTH',
        details: { phone: user.phone, reason: 'current password did not match' }
      });
      return res.status(401).json({ error: 'Your current password is incorrect.' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'Your new password must be different from the current one.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);

    // A deliberate password change is also the clearest possible signal that the
    // holder is back in control, so it clears any lockout.
    await db.run(
      'UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE id = $2',
      [newHash, user.id]
    );

    logAudit({
      userId: user.id,
      actorName: user.full_name,
      action: 'PASSWORD_CHANGED',
      resource: 'AUTH',
      details: { phone: user.phone }
    });

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change Password Error:', err);
    res.status(500).json({ error: 'Server error while changing your password.' });
  }
}

module.exports = {
  registerUser,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword
};
