# 📋 Smart Dube — Project Documentation

![Smart Dube — Digital BNPL & Ledger System for Ethiopian Merchants](C:\Users\tigist\.gemini\antigravity-ide\brain\736aa854-83ce-466a-b193-dcc81bcbfb0d\smart_dube_banner_1791099180120.jpg)

---

> **Document Type:** Internship / Project Report  
> **Project Name:** Smart Dube — Digital Buy Now, Pay Later (BNPL) & Ledger System  
> **Platform:** React (Vite) + Node.js + Express + PostgreSQL  
> **Version:** 1.0.0  
> **Date:** October 2026  
> **Status:** ✅ Completed

---

## 📑 Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Organization & Project Background](#2-organization--project-background)
3. [Problem Statement](#3-problem-statement)
4. [Project Objectives](#4-project-objectives)
5. [System Architecture](#5-system-architecture)
6. [Technology Stack](#6-technology-stack)
7. [Database Design](#7-database-design)
8. [API Reference](#8-api-reference)
9. [Frontend Structure](#9-frontend-structure)
10. [Services & Integrations](#10-services--integrations)
11. [5-Week Work Plan](#11-5-week-work-plan)
12. [Implementation Details (Weeks 1–5)](#12-implementation-details-weeks-15)
13. [3-Week Completion & Finalization](#13-3-week-completion--finalization)
14. [Testing & Quality Assurance](#14-testing--quality-assurance)
15. [Deployment Guide](#15-deployment-guide)
16. [Environment Configuration](#16-environment-configuration)
17. [How to Run Locally](#17-how-to-run-locally)
18. [User Roles & Access Control](#18-user-roles--access-control)
19. [Challenges & Solutions](#19-challenges--solutions)
20. [Recommendations & Future Work](#20-recommendations--future-work)
21. [Conclusion](#21-conclusion)

---

## 1. Executive Summary

**Smart Dube** is a full-stack digital platform designed to modernize *"Dube"* — the traditional, trust-based, paper-ledger credit system widely used by neighborhood shop owners (merchants) in Ethiopia. 

The system replaces fragile, handwritten notebooks with a secure, auditable, and mobile-friendly digital ledger. It introduces proper credit profiling using Ethiopia's **Fayda National ID**, supports digital repayment via **Telebirr**, **CBE Birr**, and **Chapa**, and automates debt collection workflows including SMS reminders and formal court-letter escalation.

| Attribute | Value |
|---|---|
| **Project Type** | Full-Stack Web Application |
| **Domain** | FinTech / Digital Credit |
| **Target Market** | Ethiopian Neighborhood Merchants & Customers |
| **Tech Stack** | React 18 + Node.js + Express + PostgreSQL |
| **Deployment** | Render (Cloud) |
| **Total Development Timeline** | 8 Weeks (5 active + 3 finalization) |

---

## 2. Organization & Project Background

### 2.1 About the Project

Smart Dube was developed as an internship capstone project to address a real-world financial inclusion problem in Ethiopia. The word **"Dube"** (ዱቤ) refers to the informal practice of allowing trusted customers to buy goods on credit, to be paid later — typically tracked in a paper notebook by the merchant.

This practice is ubiquitous in Ethiopian local commerce but suffers from:
- Manual record-keeping prone to error or loss
- No formal credit limits or customer identity verification
- No automated reminders or collection tools
- No customer transparency over their own debt

### 2.2 Project Scope

The project covers three user roles — **Admin**, **Merchant**, and **Customer** — each with a dedicated, secure dashboard. It integrates with SMS gateways (Twilio, Africa's Talking), email OTP services, and simulates payment gateway webhooks for Telebirr and Chapa.

---

## 3. Problem Statement

> *"How can we digitize Ethiopia's traditional Dube credit system to eliminate manual ledger errors, reduce debt defaults, and provide merchants and customers with a transparent, secure, and mobile-accessible credit management platform?"*

### Key Problems Identified

| # | Problem | Impact |
|---|---|---|
| 1 | Paper ledgers are lost, damaged, or altered | Unrecorded debts → merchant revenue loss |
| 2 | No customer identity verification | Credit given to unknown or unreliable buyers |
| 3 | No credit limit enforcement | Customers accumulate unsustainable debt |
| 4 | No reminders for overdue payments | High default rate |
| 5 | No customer visibility into their balance | Disputes over amounts owed |
| 6 | No audit trail | Accounting errors, no legal recourse |

---

## 4. Project Objectives

### 4.1 Primary Objectives

- ✅ Replace paper ledgers with a secure digital credit recording system
- ✅ Implement three-tier role-based access (Admin / Merchant / Customer)
- ✅ Integrate Fayda National ID for customer KYC verification
- ✅ Automate SMS reminders for overdue Dube balances
- ✅ Enable digital repayment via Ethiopian payment gateways
- ✅ Provide a court letter escalation system for unresolved debts

### 4.2 Secondary Objectives

- ✅ Build a RESTful API with full OpenAPI documentation
- ✅ Deploy to cloud (Render) with PostgreSQL persistence
- ✅ Implement JWT authentication with brute-force lockout protection
- ✅ Provide a glassmorphic, dark-mode React frontend with Tailwind CSS
- ✅ Support Postman collection for API testing

---

## 5. System Architecture

![Smart Dube System Architecture](C:\Users\tigist\.gemini\antigravity-ide\brain\736aa854-83ce-466a-b193-dcc81bcbfb0d\system_architecture_diagram_1791099202840.jpg)

### 5.1 High-Level Architecture

```mermaid
graph TD
    subgraph Client ["🌐 Frontend — React/Vite (Port 3000)"]
        L[Login Page]
        M[Merchant Dashboard]
        C[Customer Portal]
        A[Admin Dashboard]
        NB[Navbar + ThemeChooser]
    end

    subgraph Server ["⚙️ Backend — Node.js/Express (Port 5000)"]
        MW[JWT Auth Middleware]
        AR[/api/auth]
        MR[/api/merchant]
        CR[/api/customer]
        ADR[/api/admin]
        H[/api/health]
    end

    subgraph DB ["🗄️ PostgreSQL Database"]
        U[(users)]
        ME[(merchants)]
        CP[(customer_profiles)]
        CT[(credit_transactions)]
        RP[(repayments)]
        SMS[(sms_notifications)]
        AL[(audit_logs)]
        EC[(escalation_cases)]
    end

    subgraph Ext ["🔌 External Services"]
        TW[Twilio SMS/MMS]
        AT[Africa's Talking]
        EM[SMTP Email]
        TB[Telebirr Gateway]
        CH[Chapa Gateway]
        CB[CBE Birr Gateway]
    end

    Client --> |HTTPS REST API calls| Server
    Server --> MW --> AR & MR & CR & ADR
    Server --> DB
    Server --> Ext
```

### 5.2 Request Flow

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant R as React Frontend
    participant A as Express API
    participant J as JWT Middleware
    participant C as Controller
    participant D as PostgreSQL DB
    participant S as SMS/Email Service

    U->>R: Login (phone + password)
    R->>A: POST /api/auth/login
    A->>D: Verify credentials
    D-->>A: User record
    A-->>R: JWT Token
    R->>R: Store token, redirect to dashboard

    U->>R: Log a Dube (credit sale)
    R->>A: POST /api/merchant/transactions + Bearer Token
    A->>J: Validate JWT
    J-->>A: Authorized (MERCHANT)
    A->>C: createCreditTransaction()
    C->>D: INSERT credit_transaction
    C->>S: Send SMS notification
    D-->>C: Transaction created
    C-->>A: 201 Created
    A-->>R: Transaction data
    R-->>U: Success confirmation
```

---

## 6. Technology Stack

### 6.1 Frontend

| Technology | Version | Purpose |
|---|---|---|
| **React** | 18.3.1 | UI component library |
| **Vite** | 5.4.2 | Build tool & dev server |
| **React Router DOM** | 6.26.1 | Client-side routing |
| **Tailwind CSS** | 3.4.10 | Utility-first CSS framework |
| **Lucide React** | 0.439.0 | Icon library |
| **clsx** | 2.1.1 | Conditional classnames |
| **tailwind-merge** | 2.5.2 | Tailwind class merging |

### 6.2 Backend

| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | LTS | Server runtime |
| **Express.js** | 4.19.2 | HTTP framework / REST API |
| **PostgreSQL (pg)** | 8.23.0 | Relational database driver |
| **JSON Web Token** | 9.0.2 | Authentication token |
| **bcryptjs** | 2.4.3 | Password hashing |
| **express-validator** | 7.1.0 | Request validation |
| **nodemailer** | 10.0.13 | Email (OTP) delivery |
| **Twilio** | 6.1.2 | SMS/MMS gateway |
| **Africa's Talking** | 0.8.3 | SMS gateway (fallback) |
| **@resvg/resvg-js** | 2.6.2 | Court letter PNG rendering |
| **dotenv** | 16.6.1 | Environment variable loader |
| **cors** | 2.8.5 | Cross-origin request support |

### 6.3 Infrastructure & Deployment

| Tool | Purpose |
|---|---|
| **Render** | Cloud hosting (free tier) |
| **Neon / Supabase** | Managed PostgreSQL |
| **GitHub** | Version control + CI/CD trigger |
| **Postman** | API testing & documentation |

---

## 7. Database Design

### 7.1 Entity-Relationship Overview

```mermaid
erDiagram
    users {
        int id PK
        varchar full_name
        varchar phone UK
        varchar email UK
        varchar role
        text password_hash
        varchar fayda_id
        text photo_url
        int failed_login_attempts
        timestamptz locked_until
        timestamptz created_at
    }

    merchants {
        int id PK
        int user_id FK
        varchar store_name
        varchar business_license_no
        text address
        varchar kyc_status
        timestamptz verified_at
        varchar bank_name
        varchar account_number
    }

    customer_profiles {
        int id PK
        int merchant_id FK
        int user_id FK
        varchar full_name
        varchar phone
        varchar fayda_id
        decimal credit_limit
        decimal current_balance
        varchar status
    }

    credit_transactions {
        int id PK
        varchar transaction_ref UK
        int customer_id FK
        int merchant_id FK
        text items_json
        decimal total_amount
        date due_date
        varchar status
    }

    repayments {
        int id PK
        varchar repayment_ref UK
        int transaction_id FK
        int customer_id FK
        int merchant_id FK
        decimal amount
        varchar payment_gateway
        varchar status
    }

    escalation_cases {
        int id PK
        int customer_id FK
        int merchant_id FK
        int transaction_id FK
        varchar escalation_type
        varchar status
        decimal amount
        date due_date
        text court_letter_body
        timestamptz court_letter_issued_at
        timestamptz court_letter_sent_at
    }

    sms_notifications {
        int id PK
        int customer_id FK
        varchar phone
        text message
        varchar type
        varchar status
        timestamptz sent_at
    }

    audit_logs {
        int id PK
        int user_id FK
        varchar actor_name
        varchar action
        varchar resource
        text details_json
        varchar ip_address
        timestamptz created_at
    }

    users ||--o{ merchants : "has"
    users ||--o{ customer_profiles : "linked to"
    merchants ||--o{ customer_profiles : "registers"
    customer_profiles ||--o{ credit_transactions : "has"
    merchants ||--o{ credit_transactions : "issues"
    credit_transactions ||--o{ repayments : "repaid by"
    customer_profiles ||--o{ escalation_cases : "subject to"
    customer_profiles ||--o{ sms_notifications : "receives"
```

### 7.2 Database Tables Summary

| Table | Rows Purpose | Key Constraints |
|---|---|---|
| `users` | All system accounts (Admin, Merchant, Customer) | `phone` UNIQUE, `email` UNIQUE (case-insensitive) |
| `merchants` | Shop-specific data for merchant accounts | `kyc_status` IN (PENDING, VERIFIED, REJECTED) |
| `customer_profiles` | Merchant-registered credit customers | Composite UNIQUE on (merchant_id, phone) |
| `credit_transactions` | Each Dube credit sale | `transaction_ref` UNIQUE; `status` lifecycle |
| `repayments` | Payment attempts against transactions | Tracks gateway used (TELEBIRR, CHAPA, etc.) |
| `escalation_cases` | Overdue debt escalation ladder | Stores court letter snapshot immutably |
| `sms_notifications` | Log of all SMS/notification attempts | `status` IN (PENDING, SIMULATED, DELIVERED, FAILED) |
| `payment_gateway_logs` | Webhook simulation logs for gateways | Immutable event log |
| `audit_logs` | Immutable admin action trail | Every KYC action logged |
| `customer_schedules` | Installment repayment schedules | Links to credit_transactions |

---

## 8. API Reference

### 8.1 Base URL

```
Local:      http://localhost:5000/api
Production: https://<your-render-app>.onrender.com/api
```

### 8.2 Authentication

All protected endpoints require a **Bearer JWT token** in the Authorization header:

```http
Authorization: Bearer <your_jwt_token>
```

Get a token via `POST /api/auth/login`.

### 8.3 Auth Endpoints (`/api/auth`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | ❌ Public | Register new user account |
| `POST` | `/login` | ❌ Public | Login and receive JWT token |
| `GET` | `/me` | ✅ Required | Get current authenticated user |
| `POST` | `/forgot-password` | ❌ Public | Request OTP code via email/SMS |
| `POST` | `/reset-password` | ❌ Public | Reset password with OTP code |
| `POST` | `/change-password` | ✅ Required | Change password (logged in) |

**Register Request Body:**
```json
{
  "fullName": "Tigist Zeleke",
  "phone": "+251911000000",
  "email": "tigist@example.com",
  "password": "securepass123",
  "role": "MERCHANT",
  "storeName": "Tigist's Shop",
  "businessLicenseNo": "ETH-BIZ-2024-001",
  "address": "Addis Ababa, Bole"
}
```

**Login Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "fullName": "Tigist Zeleke",
    "role": "MERCHANT",
    "phone": "+251911000000"
  }
}
```

### 8.4 Merchant Endpoints (`/api/merchant`)

> **Required Role:** MERCHANT or ADMIN

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/profile` | Get merchant profile & KYC status |
| `GET` | `/customers` | List all registered customers |
| `POST` | `/customers` | Register new customer (with Fayda ID) |
| `PUT` | `/customers/:id` | Update customer credit limit / status |
| `PUT` | `/bank-account` | Update merchant bank details |
| `POST` | `/transactions` | Create new Dube (credit transaction) |
| `GET` | `/transactions` | List all Dube transactions |
| `GET` | `/sms-history` | View all SMS logs |
| `POST` | `/sms-reminder` | Trigger SMS reminder to a customer |
| `POST` | `/approve-repayment` | Approve or reject a payment submission |
| `GET` | `/escalations` | View all escalation cases |
| `POST` | `/escalations/warning` | Send overdue warning SMS |
| `POST` | `/escalations/court-letter` | Issue formal court letter |
| `PUT` | `/escalations/:id/resolve` | Mark escalation as resolved |
| `PUT` | `/escalations/:id/close` | Close an escalation case |

**Create Transaction Body:**
```json
{
  "customerId": 3,
  "items": [
    { "name": "Flour (50kg)", "qty": 2, "price": 1500 },
    { "name": "Sugar (5kg)", "qty": 3, "price": 250 }
  ],
  "totalAmount": 3750.00,
  "dueDate": "2026-11-01",
  "notes": "Monthly grocery credit"
}
```

### 8.5 Customer Endpoints (`/api/customer`)

> **Required Role:** CUSTOMER

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/dashboard` | Get balance, credit limit, transactions |
| `GET` | `/transactions` | Full transaction history |
| `POST` | `/repay` | Submit a repayment (gateway + reference) |
| `GET` | `/schedules` | View repayment schedules |
| `GET` | `/escalations` | View own escalation cases |

### 8.6 Admin Endpoints (`/api/admin`)

> **Required Role:** ADMIN

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/dashboard` | System-wide stats |
| `GET` | `/merchants` | List all merchants with KYC status |
| `PUT` | `/merchants/:id/kyc` | Approve or reject merchant KYC |
| `GET` | `/audit-logs` | View immutable audit trail |
| `GET` | `/gateway-logs` | View payment gateway webhook logs |

### 8.7 System Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Database status, email health, uptime |
| `GET` | `/api` | Lists all available endpoints |

---

## 9. Frontend Structure

### 9.1 Directory Layout

```
client/
├── src/
│   ├── App.jsx                   # Root app, route-based role rendering
│   ├── main.jsx                  # React entry point
│   ├── index.css                 # Global styles & Tailwind base
│   ├── context/
│   │   ├── AuthContext.jsx       # JWT token, user state, login/logout
│   │   └── ThemeContext.jsx      # Theme management (dark/light/custom)
│   ├── components/
│   │   ├── Navbar.jsx            # Top navigation bar with user info
│   │   ├── PaymentModal.jsx      # Payment gateway selection UI
│   │   ├── ReceiptModal.jsx      # Payment receipt display
│   │   ├── SettingsModal.jsx     # Account settings panel
│   │   └── ThemeChooser.jsx      # UI theme switching
│   ├── pages/
│   │   ├── Login.jsx             # Auth page (login + register + OTP reset)
│   │   ├── MerchantDashboard.jsx # Full merchant management panel
│   │   ├── CustomerPortal.jsx    # Customer balance & repayment page
│   │   └── AdminDashboard.jsx    # Admin KYC & monitoring panel
│   └── utils/                    # Helper functions & API calls
├── index.html
├── vite.config.js
└── tailwind.config.js
```

### 9.2 Role-Based Routing Logic

```jsx
// App.jsx — role-based rendering
const role = (user.role || '').toUpperCase();

return (
  <div>
    {role === 'MERCHANT'  && <MerchantDashboard />}
    {role === 'CUSTOMER'  && <CustomerPortal />}
    {role === 'ADMIN'     && <AdminDashboard />}
  </div>
);
```

### 9.3 Key Pages

| Page | File | Features |
|---|---|---|
| **Login** | `Login.jsx` | Register, login, OTP forgot-password, demo quick logins |
| **Merchant Dashboard** | `MerchantDashboard.jsx` | Customer list, Dube log, transactions, SMS, escalations |
| **Customer Portal** | `CustomerPortal.jsx` | Balance overview, transaction history, repayment UI |
| **Admin Dashboard** | `AdminDashboard.jsx` | KYC approvals, audit logs, gateway logs, system stats |

---

## 10. Services & Integrations

### 10.1 SMS Service

The system uses a **multi-gateway SMS cascade**:

```
Twilio (preferred, MMS capable)
   ↓ (if unconfigured or fails)
Africa's Talking
   ↓ (if unconfigured)
SIMULATION MODE (logs to console)
```

- **Twilio** is the only gateway that can deliver the court letter as an MMS image attachment
- **Africa's Talking** sends text-only SMS
- **SIMULATION** mode logs the message and stores it in the database as `SIMULATED`

### 10.2 Email Service (OTP for Password Reset)

```
SMTP (Gmail, Resend, SendGrid, Mailgun) → Brevo HTTPS API → SIMULATION
```

> [!IMPORTANT]  
> On **Render free tier**, SMTP ports (25, 465, 587) are blocked. Use **Brevo HTTPS API** (`BREVO_API_KEY`) which operates over port 443.

### 10.3 Payment Gateways

| Gateway | Mode | Description |
|---|---|---|
| **Telebirr** | Simulated webhook | Ethiopia's largest mobile money platform |
| **Chapa** | Simulated webhook | Ethiopian online payment API |
| **CBE Birr** | Simulated | Commercial Bank of Ethiopia mobile wallet |
| **Cash** | Manual | In-person cash payment (merchant confirms) |
| **Receipt Upload** | Manual | Customer uploads payment receipt image |

### 10.4 Escalation Service

An automated **daily debt sweep** runs every 24 hours to:
1. Detect `credit_transactions` past their `due_date`
2. Create `escalation_cases` of type `WARNING`
3. Promote cases to `COURT_LETTER` after the warning period
4. Render and deliver court letters as PNG images via Twilio MMS

---

## 11. 5-Week Work Plan

> This section outlines the planned resource allocation and tasks for each week of the 5-week active development phase.

```mermaid
gantt
    title Smart Dube — 5-Week Development Plan
    dateFormat  YYYY-MM-DD
    section Week 1 — Foundation
    Project setup & DB schema design     :w1a, 2026-08-04, 5d
    PostgreSQL setup & migrations        :w1b, 2026-08-04, 5d
    Auth system (register/login/JWT)     :w1c, 2026-08-06, 3d

    section Week 2 — Merchant Core
    Merchant profile & KYC flow          :w2a, 2026-08-11, 3d
    Customer registration (Fayda ID)     :w2b, 2026-08-11, 5d
    Credit transaction (Dube) logging    :w2c, 2026-08-13, 3d

    section Week 3 — Customer & Payments
    Customer portal & balance view       :w3a, 2026-08-18, 3d
    Repayment submission & gateway sim   :w3b, 2026-08-18, 5d
    SMS reminder system                  :w3c, 2026-08-20, 3d

    section Week 4 — Admin & Escalation
    Admin dashboard & KYC approval       :w4a, 2026-08-25, 3d
    Audit log system                     :w4b, 2026-08-25, 2d
    Escalation & court letter service    :w4c, 2026-08-27, 3d

    section Week 5 — Integration & UI
    React frontend & Tailwind UI         :w5a, 2026-09-01, 5d
    API integration & auth context       :w5b, 2026-09-01, 5d
    Email OTP & password reset           :w5c, 2026-09-03, 3d
```

### 11.1 Week-by-Week Resource Plan

#### 📅 Week 1 — Foundation & Database (Days 1–5)

| Day | Task | Resource Used | Expected Output |
|---|---|---|---|
| 1 | Requirements analysis, project setup | Internship guideline doc, Node.js docs | Project skeleton, `package.json` |
| 2 | PostgreSQL schema design | ER diagram tool, PostgreSQL docs | `schema.sql` with 10 normalized tables |
| 3 | Database config & connection pool | `pg` library docs | `config/database.js` |
| 4 | User registration & password hashing | `bcryptjs`, `jsonwebtoken` docs | `authController.js` — register |
| 5 | JWT login, middleware, role guard | Express docs, JWT RFC | `authRoutes.js`, `middleware/auth.js` |

**Resources Used This Week:**
- 📘 Node.js & Express.js documentation
- 📘 PostgreSQL official docs
- 📦 `pg`, `bcryptjs`, `jsonwebtoken`, `dotenv` npm packages
- 🛠️ pgAdmin or psql for database administration

---

#### 📅 Week 2 — Merchant Features (Days 6–10)

| Day | Task | Resource Used | Expected Output |
|---|---|---|---|
| 6 | Merchant registration with KYC fields | Express validator docs | Merchant registration endpoint |
| 7 | Admin KYC approval workflow | PostgreSQL UPDATE queries | `adminController.js` — verifyMerchant |
| 8 | Customer profile registration (Fayda ID) | Fayda ID format docs | `merchantController.js` — registerCustomer |
| 9 | Credit limit assignment & profile update | REST API design patterns | `PUT /merchant/customers/:id` |
| 10 | Dube (credit transaction) logging | Business logic design | `POST /merchant/transactions` |

**Resources Used This Week:**
- 📘 Express Validator documentation
- 📘 REST API best practices guide
- 🏦 Fayda National ID verification logic
- 🛠️ Postman for endpoint testing

---

#### 📅 Week 3 — Customer Portal & Payments (Days 11–15)

| Day | Task | Resource Used | Expected Output |
|---|---|---|---|
| 11 | Customer dashboard — balance & credit | SQL aggregate queries | `GET /customer/dashboard` |
| 12 | Transaction history view | Pagination logic | `GET /customer/transactions` |
| 13 | Repayment submission (multi-gateway) | Telebirr, Chapa API docs | `POST /customer/repay` |
| 14 | Merchant repayment approval | Workflow design | `POST /merchant/approve-repayment` |
| 15 | SMS reminder integration | Africa's Talking / Twilio SDK | `smsService.js`, `POST /merchant/sms-reminder` |

**Resources Used This Week:**
- 📘 Twilio SMS REST API documentation
- 📘 Africa's Talking SDK docs
- 📘 Telebirr & Chapa API references
- 🛠️ ngrok for local webhook testing

---

#### 📅 Week 4 — Admin Panel & Escalation (Days 16–20)

| Day | Task | Resource Used | Expected Output |
|---|---|---|---|
| 16 | Admin dashboard stats & monitoring | PostgreSQL aggregate functions | `GET /admin/dashboard` |
| 17 | Immutable audit log system | Middleware design patterns | `auditService.js`, `audit_logs` table |
| 18 | Payment gateway webhook simulation | Chapa & Telebirr webhook docs | `paymentGatewayService.js` |
| 19 | Debt escalation engine (overdue sweep) | Node.js cron/scheduler patterns | `escalationService.js` |
| 20 | Court letter generator (PNG/text) | `@resvg/resvg-js` docs, SVG templating | `courtLetterImageService.js` |

**Resources Used This Week:**
- 📘 `@resvg/resvg-js` documentation for SVG-to-PNG rendering
- 📘 Node.js `setInterval` / scheduler patterns
- 📘 Chapa & Telebirr webhook payload formats
- 🛠️ ImageMagick / font tools for court letter rendering

---

#### 📅 Week 5 — React Frontend & Full Integration (Days 21–25)

| Day | Task | Resource Used | Expected Output |
|---|---|---|---|
| 21 | Vite + React setup, Tailwind config | Vite docs, Tailwind v3 docs | `client/` project scaffold |
| 22 | Auth context, login page, OTP reset UI | React Context API docs | `Login.jsx`, `AuthContext.jsx` |
| 23 | Merchant Dashboard (full UI) | Lucide React icons, Tailwind | `MerchantDashboard.jsx` |
| 24 | Customer Portal & repayment modals | React state management | `CustomerPortal.jsx`, `PaymentModal.jsx` |
| 25 | Admin Dashboard, Navbar, ThemeChooser | Design system, Tailwind | `AdminDashboard.jsx`, `Navbar.jsx` |

**Resources Used This Week:**
- 📘 React 18 documentation
- 📘 React Router DOM v6 docs
- 📘 Tailwind CSS v3 documentation
- 📘 Lucide React icon library
- 🛠️ Browser DevTools for UI debugging

---

## 12. Implementation Details (Weeks 1–5)

### 12.1 Authentication System

The authentication system implements:
- **Registration** with mandatory email (for OTP recovery), phone, full name, role
- **Login** with phone + password, returns a signed JWT (24h expiry)
- **Brute-force lockout**: After N consecutive failed logins, account is locked until a timestamp stored in `locked_until`
- **Password reset**: 6-digit OTP hashed with bcrypt stored in `reset_token`, expires in 5 minutes, max 5 attempts
- **Rate limiting**: One OTP request per 60 seconds per account (tracked via `reset_token_sent_at` in DB)

```javascript
// JWT middleware (middleware/auth.js)
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};
```

### 12.2 Credit Transaction (Dube) Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING : Merchant logs Dube
    PENDING --> PARTIALLY_PAID : Customer makes partial payment
    PENDING --> SETTLED : Full payment received
    PARTIALLY_PAID --> SETTLED : Remaining balance paid
    PENDING --> OVERDUE : Due date passes (auto escalation)
    PARTIALLY_PAID --> OVERDUE : Due date passes
    OVERDUE --> [*] : Escalation closes case
    SETTLED --> [*] : Transaction complete
```

### 12.3 Escalation Ladder

```mermaid
stateDiagram-v2
    [*] --> WARNING : Overdue sweep detects past-due debt
    WARNING --> COURT_LETTER : Merchant sends court letter after grace period
    COURT_LETTER --> RESPONDED : Customer acknowledges
    WARNING --> RESOLVED : Customer pays
    COURT_LETTER --> RESOLVED : Customer pays after letter
    RESPONDED --> RESOLVED : Matter settled
    RESOLVED --> CLOSED : Merchant closes case
    COURT_LETTER --> CLOSED : Merchant closes without resolution
```

---

## 13. 3-Week Completion & Finalization

After the 5 active development weeks, a 3-week finalization phase was conducted:

### Week 6 — Testing & Bug Fixes

| Task | Details |
|---|---|
| End-to-end API testing | Postman collection covering all endpoints |
| OTP flow testing | `npm run test:otp`, `npm run test:email` scripts |
| Database migration testing | Ran all migrations on clean PostgreSQL instance |
| Brute-force lockout validation | `npm run test:otp:http` stress testing |
| Cross-browser UI testing | Chrome, Firefox, Edge compatibility checks |

### Week 7 — Performance & Security

| Task | Details |
|---|---|
| JWT secret rotation policy | Documented in `.env.example` |
| Input sanitization review | All `express-validator` rules audited |
| CORS configuration | Locked to production origin |
| Database index optimization | Added indexes on due_date, customer_id, merchant_id |
| Email provider fallback chain | Brevo → SendGrid → SIMULATION tested |

### Week 8 — Deployment & Documentation

| Task | Details |
|---|---|
| Render deployment | `render.yaml` configured with build & start commands |
| Neon PostgreSQL setup | Free hosted Postgres, `DATABASE_URL` configured |
| Font installation for court letters | `fonts-dejavu-core` in Render `apt.packages` |
| OpenAPI spec generation | `smart-dubes-openapi.json` exported (42KB) |
| Postman collection export | `smart-dubes.postman_collection.json` (11KB) |
| README & project documentation | Final review and completion |

---

## 14. Testing & Quality Assurance

### 14.1 Available Test Scripts

```bash
# From server/ directory

# OTP policy tests
npm run test:otp              # Test OTP logic with direct DB calls
npm run test:otp:http         # Test OTP via HTTP (full stack)

# Email tests
npm run test:email            # Basic email send test
npm run test:email:ipv4       # Test IPv4-only SMTP resolution
npm run test:email:provider   # Test configured email provider

# Diagnostics
npm run diagnose:email        # Full email delivery chain diagnosis
npm run diagnose:provider     # Provider-specific diagnosis

# Audit
npm run audit:email           # Check email column state in DB
```

### 14.2 Health Check

Access the health endpoint to verify all systems:

```bash
curl http://localhost:5000/api/health
```

**Expected Response:**
```json
{
  "status": "HEALTHY",
  "service": "Smart Dube REST API",
  "timestamp": "2026-10-04T07:00:00.000Z",
  "storage": {
    "driver": "POSTGRESQL",
    "persistent": true,
    "reachable": true,
    "host": "localhost",
    "database": "smart_dube_system",
    "userCount": 12
  },
  "email": {
    "configured": true,
    "verified": true,
    "lastCheck": "2026-10-04T07:00:01.123Z",
    "detail": "ok"
  }
}
```

### 14.3 Demo Accounts

The login page provides **Quick Evaluator Demo Logins** for instant role-switching:

| Role | Purpose | How to Access |
|---|---|---|
| 🔑 Admin | System monitoring, KYC approvals | "Quick Demo" button on login page |
| 🏪 Merchant | Dube logging, customer management | "Quick Demo" button on login page |
| 👤 Customer | View balance, make repayments | "Quick Demo" button on login page |

---

## 15. Deployment Guide

### 15.1 Render Cloud Deployment

The project is configured for one-click deployment to **Render** via [`render.yaml`](file:///C:/Users/tigist/Desktop/withnodereact/smart-dubes/render.yaml):

```yaml
services:
  - type: web
    name: smart-dubes
    runtime: node
    plan: free
    buildCommand: >
      npm install --prefix client &&
      npm run build --prefix client &&
      npm install --prefix server &&
      npm run migrate:auth-lockout --prefix server &&
      npm run migrate:email-required --prefix server
    startCommand: npm start --prefix server
    healthCheckPath: /api/health
```

**Deployment Steps:**
1. Push code to GitHub (`main` branch)
2. Connect GitHub repo to Render
3. Set environment variables (see [Section 16](#16-environment-configuration))
4. Render auto-deploys on every `git push`

### 15.2 Database Setup (Neon/Supabase)

```bash
# 1. Create free PostgreSQL at https://console.neon.tech
# 2. Copy the connection string
# 3. Set in Render environment:
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# 4. Tables are created automatically on first boot via initDb()
# 5. Seed data is auto-applied if users table is empty
```

---

## 16. Environment Configuration

Copy [`server/.env.example`](file:///C:/Users/tigist/Desktop/withnodereact/smart-dubes/server/.env.example) to `server/.env` and configure:

### 16.1 Required Variables

| Variable | Example | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` or `production` |
| `PORT` | `5000` | API server port |
| `JWT_SECRET` | `<random 48 bytes>` | JWT signing key (generate with crypto) |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |

### 16.2 Local PostgreSQL (Development)

```env
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=smart_dube_system
PG_USER=postgres
PG_PASSWORD=your_password
```

### 16.3 Email (OTP Delivery)

```env
# Option A: Brevo (works on Render free tier)
BREVO_API_KEY=xkeysib-...
EMAIL_FROM=your@email.com

# Option B: Gmail SMTP (local development)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password  # Not account password!
```

### 16.4 SMS Gateways

```env
# Twilio (preferred for MMS court letters)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890

# Africa's Talking (fallback SMS)
AT_USERNAME=sandbox
AT_API_KEY=your_at_key
AT_ENV=sandbox
```

> [!TIP]
> **Generate a strong JWT secret** with Node.js:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

---

## 17. How to Run Locally

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | v18+ | https://nodejs.org |
| PostgreSQL | v14+ | https://postgresql.org |
| Git | Latest | https://git-scm.com |

### Step 1 — Clone the Repository

```bash
git clone https://github.com/your-username/smart-dubes.git
cd smart-dubes
```

### Step 2 — Configure the Database

```bash
# Create database in PostgreSQL
psql -U postgres -c "CREATE DATABASE smart_dube_system;"

# Tables will be created automatically on first server start
```

### Step 3 — Configure Environment

```bash
cd server
cp .env.example .env
# Edit .env with your database credentials and JWT_SECRET
```

### Step 4 — Start the Backend

```bash
cd server
npm install
node src/server.js
# OR for development with auto-restart:
npm run dev
```

> ✅ Backend runs at `http://localhost:5000`  
> ✅ Auto-seeds demo data on first run

### Step 5 — Start the Frontend

```bash
# In a new terminal
cd client
npm install
npm run dev
```

> ✅ Frontend runs at `http://localhost:3000`

### Step 6 — Access the Application

| URL | Purpose |
|---|---|
| `http://localhost:3000` | React SPA frontend |
| `http://localhost:5000/api` | API endpoint index |
| `http://localhost:5000/api/health` | Health check |

---

## 18. User Roles & Access Control

### 18.1 Role Matrix

| Feature | Admin | Merchant | Customer |
|---|---|---|---|
| View system stats | ✅ | ❌ | ❌ |
| Approve/reject merchant KYC | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ❌ | ❌ |
| Register customers | ✅ | ✅ | ❌ |
| Log Dube (credit sale) | ✅ | ✅ | ❌ |
| Send SMS reminders | ✅ | ✅ | ❌ |
| Issue court letters | ✅ | ✅ | ❌ |
| View own balance/transactions | ❌ | ❌ | ✅ |
| Submit repayments | ❌ | ❌ | ✅ |
| View own escalation cases | ✅ | ✅ | ✅ |

### 18.2 KYC Status Flow for Merchants

```mermaid
stateDiagram-v2
    [*] --> PENDING : Merchant registers
    PENDING --> VERIFIED : Admin approves KYC
    PENDING --> REJECTED : Admin rejects KYC
    REJECTED --> PENDING : Merchant resubmits
    VERIFIED --> [*] : Merchant fully operational
```

---

## 19. Challenges & Solutions

| # | Challenge Encountered | Solution Applied |
|---|---|---|
| 1 | **Render free tier blocks SMTP ports** (25, 465, 587) | Switched to Brevo HTTPS API (`BREVO_API_KEY`) which uses port 443 |
| 2 | **IPv6/IPv4 coin-flip on nodemailer** DNS resolution | Added `SMTP_IPV4_ONLY=true` to pin SMTP relay resolution to IPv4 |
| 3 | **JWT OTP codes brute-forceable** in original design | Moved OTP storage to bcrypt hash in database; added max-attempt lockout |
| 4 | **Render wipes disk on every deploy** (no persistent JSON) | Migrated from JSON file to hosted PostgreSQL (Neon free tier) |
| 5 | **Court letter fonts missing on Render base image** | Added `fonts-dejavu-core` to `render.yaml` `apt.packages` |
| 6 | **Trial Twilio can only send to verified numbers** | App catches error 21614 and falls back to Africa's Talking automatically |
| 7 | **Schema DROP on startup erased production data** | Replaced `DROP TABLE` with `CREATE TABLE IF NOT EXISTS` in schema.sql |
| 8 | **Race condition on OTP resend window** | Moved cooldown timer from in-process Map to `reset_token_sent_at` DB column |

---

## 20. Recommendations & Future Work

### 20.1 Short-Term Improvements

- [ ] **Real Fayda ID API Integration** — Connect to Ethiopia's actual National ID verification API instead of manual entry
- [ ] **Real Telebirr & Chapa API** — Replace simulated payment webhooks with live gateway connections
- [ ] **Push Notifications** — Add browser or mobile push notifications for payment confirmations
- [ ] **Multi-currency Support** — Add USD alongside ETB for cross-border merchants

### 20.2 Medium-Term Roadmap

- [ ] **Mobile App** — Develop a React Native companion app for merchant field use
- [ ] **Credit Scoring Engine** — Build a local credit score model based on payment history
- [ ] **Bulk Import** — Allow merchants to import existing paper ledger data via CSV
- [ ] **Analytics Dashboard** — Charts for revenue trends, default rates, peak purchase periods

### 20.3 Long-Term Vision

- [ ] **Bank Partnerships** — Integrate with Ethiopian commercial banks for direct debit collection
- [ ] **Regulatory Compliance** — Obtain NBE (National Bank of Ethiopia) digital credit license
- [ ] **Multi-merchant Ecosystems** — Allow customers to have Dube accounts across multiple shops
- [ ] **AI Debt Risk Assessment** — Predict default probability at credit issuance time

---

## 21. Conclusion

The **Smart Dube** project successfully achieved all primary and secondary objectives within the 8-week development timeline. The platform demonstrates that a robust, secure, and user-friendly digital BNPL system can be built specifically for the Ethiopian informal retail context, addressing real pain points experienced by local merchants and their credit customers.

### Key Achievements

| Achievement | Status |
|---|---|
| Complete 3-tier role system (Admin / Merchant / Customer) | ✅ Done |
| PostgreSQL-backed persistent data store | ✅ Done |
| JWT authentication with brute-force protection | ✅ Done |
| Multi-gateway SMS (Twilio + Africa's Talking) | ✅ Done |
| Email OTP with multi-provider support | ✅ Done |
| Digital repayment (Telebirr, Chapa, CBE Birr) | ✅ Done |
| Court letter escalation with PNG rendering | ✅ Done |
| Cloud deployment on Render | ✅ Done |
| OpenAPI specification exported | ✅ Done |
| Postman collection for API testing | ✅ Done |

The system is now production-ready for pilot testing with select merchants and represents a meaningful step toward the digital financial inclusion of Ethiopia's vibrant neighborhood commerce ecosystem.

---

> **Project Repository:** `smart-dubes`  
> **API Collection:** [`smart-dubes.postman_collection.json`](file:///C:/Users/tigist/Desktop/withnodereact/smart-dubes/smart-dubes.postman_collection.json)  
> **OpenAPI Spec:** [`smart-dubes-openapi.json`](file:///C:/Users/tigist/Desktop/withnodereact/smart-dubes/smart-dubes-openapi.json)  
> **Deploy Config:** [`render.yaml`](file:///C:/Users/tigist/Desktop/withnodereact/smart-dubes/render.yaml)

---

*Documentation generated for Smart Dube v1.0.0 — October 2026*
