-- Smart Dube normalized PostgreSQL schema (3NF)

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS payment_gateway_logs CASCADE;
DROP TABLE IF EXISTS sms_notifications CASCADE;
DROP TABLE IF EXISTS repayments CASCADE;
DROP TABLE IF EXISTS credit_transactions CASCADE;
DROP TABLE IF EXISTS customer_profiles CASCADE;
DROP TABLE IF EXISTS merchants CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(200),
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'MERCHANT', 'CUSTOMER')),
    password_hash TEXT NOT NULL,
    fayda_id VARCHAR(50),
    reset_token VARCHAR(10),
    reset_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. merchants
CREATE TABLE merchants (
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
CREATE TABLE customer_profiles (
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
CREATE TABLE credit_transactions (
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
CREATE TABLE repayments (
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
CREATE TABLE sms_notifications (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customer_profiles(id) ON DELETE SET NULL,
    phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('CREDIT_ISSUED', 'REMINDER', 'OVERDUE_ALERT', 'PAYMENT_RECEIPT')),
    status VARCHAR(20) NOT NULL DEFAULT 'SIMULATED' CHECK (status IN ('SIMULATED', 'DELIVERED', 'FAILED')),
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. payment_gateway_logs
CREATE TABLE payment_gateway_logs (
    id SERIAL PRIMARY KEY,
    gateway_name VARCHAR(30) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload_json TEXT NOT NULL,
    response_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. audit_logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(200) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(200) NOT NULL,
    details_json TEXT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
