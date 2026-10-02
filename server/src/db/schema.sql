-- Smart Dube normalized PostgreSQL schema (3NF)
--
-- NOTE: this script CREATES tables only. It deliberately has no DROP
-- statements. The previous version dropped every table, which meant any
-- startup path that ran this file erased production data. Recreating a
-- database from scratch should be an explicit, manual act.

-- 1. users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    -- Mandatory, not optional. The email is the channel the password-reset OTP is
    -- delivered to, so an account without one is an account its owner can never
    -- recover: they would be locked out permanently after forgetting the
    -- password. Uniqueness is enforced case-insensitively by
    -- idx_users_email_unique below, since Gmail treats Foo@x.com and
    -- foo@x.com as one mailbox.
    email VARCHAR(200) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'MERCHANT', 'CUSTOMER')),
    password_hash TEXT NOT NULL,
    fayda_id VARCHAR(50),
    photo_url TEXT,
    -- Holds a bcrypt hash of the 6-digit reset code, not the code itself, so a
    -- dump of this table yields no usable reset codes. 60 chars fits
    -- bcrypt's output; VARCHAR(10) only ever fitted the plaintext PIN.
    reset_token VARCHAR(72),
    reset_token_expires TIMESTAMPTZ,
    -- When the current code was emailed. The resend cooldown is enforced
    -- against this column rather than against a process-local Map: an
    -- in-memory timer is erased by a deploy, which makes restarting the app a
    -- way around the limit, and each replica behind a load balancer would
    -- otherwise enforce its own separate window.
    reset_token_sent_at TIMESTAMPTZ,
    -- Wrong OTP codes submitted against reset_token. The token is destroyed
    -- once this hits MAX so a 6-digit code cannot be brute-forced.
    reset_token_attempts INT NOT NULL DEFAULT 0,
    -- Consecutive failed logins. Kept in the database rather than in process
    -- memory so the lockout survives a restart and is shared by every replica.
    failed_login_attempts INT NOT NULL DEFAULT 0,
    -- Set when failed_login_attempts trips the limit. NULL means not locked.
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. merchants
CREATE TABLE IF NOT EXISTS merchants (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_name VARCHAR(200) NOT NULL,
    business_license_no VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    kyc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    verified_at TIMESTAMPTZ,
    kyc_notes TEXT,
    bank_name VARCHAR(100),
    account_name VARCHAR(200),
    account_number VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. customer_profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
    id SERIAL PRIMARY KEY,
    merchant_id INT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    fayda_id VARCHAR(50) NOT NULL,
    photo_url TEXT,
    credit_limit DECIMAL(12, 2) NOT NULL DEFAULT 5000.00,
    current_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESTRICTED', 'BLOCKED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_merchant_customer_phone UNIQUE (merchant_id, phone)
);

-- 4. credit_transactions
CREATE TABLE IF NOT EXISTS credit_transactions (
    id SERIAL PRIMARY KEY,
    transaction_ref VARCHAR(100) UNIQUE NOT NULL,
    customer_id INT NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
    merchant_id INT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    items_json TEXT NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIALLY_PAID', 'SETTLED', 'OVERDUE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. repayments
CREATE TABLE IF NOT EXISTS repayments (
    id SERIAL PRIMARY KEY,
    repayment_ref VARCHAR(100) UNIQUE NOT NULL,
    transaction_id INT REFERENCES credit_transactions(id) ON DELETE SET NULL,
    customer_id INT NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
    merchant_id INT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    payment_gateway VARCHAR(30) NOT NULL CHECK (payment_gateway IN ('TELEBIRR', 'CBE_BIRR', 'CHAPA', 'CASH', 'RECEIPT_UPLOAD')),
    reference_code VARCHAR(100) NOT NULL,
    receipt_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'REJECTED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. sms_notifications
CREATE TABLE IF NOT EXISTS sms_notifications (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customer_profiles(id) ON DELETE SET NULL,
    phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('CREDIT_ISSUED', 'REMINDER', 'OVERDUE_ALERT', 'PAYMENT_RECEIPT', 'COURT_LETTER')),
status VARCHAR(20) NOT NULL DEFAULT 'SIMULATED' CHECK (status IN ('PENDING', 'SIMULATED', 'DELIVERED', 
'FAILED')),
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. payment_gateway_logs
CREATE TABLE IF NOT EXISTS payment_gateway_logs (
    id SERIAL PRIMARY KEY,
    gateway_name VARCHAR(30) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload_json TEXT NOT NULL,
    response_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(200) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(200) NOT NULL,
    details_json TEXT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. customer_schedules
CREATE TABLE IF NOT EXISTS customer_schedules (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    user_id INTEGER,
    total_amount NUMERIC(12, 2) NOT NULL,
    frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
    salary_day INTEGER NOT NULL,
    duration_months INTEGER NOT NULL DEFAULT 2,
    installments_json TEXT NOT NULL,
    transaction_id INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. escalation_cases
-- Debt escalation ladder: a Dube that passes due_date opens a case, the case
-- gets a WARNING, and if it is still unpaid WARNING_PERIOD_DAYS later it is
-- escalated to a COURT_LETTER. court_letter_body / court_letter_ref are a
-- snapshot written once when the letter is issued, so the legal notice the
-- customer was shown cannot change if the store or amount is later edited.
CREATE TABLE IF NOT EXISTS escalation_cases (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
    merchant_id INT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    transaction_id INT REFERENCES credit_transactions(id) ON DELETE SET NULL,
    escalation_type VARCHAR(20) NOT NULL CHECK (escalation_type IN ('WARNING', 'COURT_LETTER')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'RESPONDED', 'RESOLVED', 'CLOSED')),
    amount DECIMAL(12, 2) NOT NULL,
    due_date DATE NOT NULL,
    warning_period_days INT NOT NULL DEFAULT 7,
    warning_sent_at TIMESTAMPTZ,
    court_letter_ref VARCHAR(60),
    court_letter_body TEXT,
    -- The structured form of the same letter: the exact fields the PNG renderer
    -- draws. Stored alongside court_letter_body so the image served to Twilio and
    -- the image shown on the portal can never disagree with the text snapshot,
    -- even if the store name, address or customer phone is edited later.
    court_letter_doc JSONB,
    court_letter_sent_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalation_cases_customer ON escalation_cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_escalation_cases_merchant ON escalation_cases(merchant_id);
CREATE INDEX IF NOT EXISTS idx_escalation_cases_status ON escalation_cases(status);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_due ON credit_transactions(due_date, status);

-- Email is the OTP recovery channel, so it must identify exactly one account.
-- Indexed on lower(email) rather than declared UNIQUE in the table so the rule
-- survives rows stored with mixed case. Deduplication runs before this in
-- migrate_email_required.js.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (lower(email));
