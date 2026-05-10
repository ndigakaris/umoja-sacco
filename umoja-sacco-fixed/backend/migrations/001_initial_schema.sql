-- ================================================================
-- UmojaSACCO — PostgreSQL Schema
-- SASRA-compliant, fully normalized
-- Run with: npm run migrate
-- ================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUMS ───────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('admin', 'treasurer', 'auditor', 'member');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending');
CREATE TYPE kyc_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE account_type AS ENUM ('savings', 'shares', 'welfare');
CREATE TYPE transaction_type AS ENUM ('savings', 'shares', 'welfare', 'loan', 'repayment', 'penalty', 'dividend', 'expenditure');
CREATE TYPE loan_status AS ENUM ('draft', 'pending', 'under_review', 'approved', 'rejected', 'active', 'completed', 'defaulted');
CREATE TYPE interest_method AS ENUM ('reducing', 'flat');
CREATE TYPE welfare_category AS ENUM ('bereavement', 'illness', 'emergency', 'disability', 'education');
CREATE TYPE welfare_status AS ENUM ('pending', 'approved', 'rejected', 'disbursed');
CREATE TYPE penalty_type AS ENUM ('late_repayment', 'missed_contribution', 'rule_violation', 'other');
CREATE TYPE penalty_status AS ENUM ('pending', 'paid', 'waived');
CREATE TYPE approval_action AS ENUM ('approved', 'rejected', 'referred');

-- ─── USERS ───────────────────────────────────────────────────────────────

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_no       VARCHAR(20) UNIQUE NOT NULL,  -- e.g. MBR-2041
  full_name       VARCHAR(150) NOT NULL,
  email           VARCHAR(254) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            user_role NOT NULL DEFAULT 'member',
  status          user_status NOT NULL DEFAULT 'pending',
  email_verified  BOOLEAN DEFAULT FALSE,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PROFILES (KYC) ──────────────────────────────────────────────────────

CREATE TABLE profiles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_number         VARCHAR(20) UNIQUE,          -- National ID
  phone             VARCHAR(20),
  date_of_birth     DATE,
  gender            VARCHAR(10),
  occupation        VARCHAR(100),
  employer          VARCHAR(150),
  physical_address  TEXT,
  photo_url         VARCHAR(500),
  -- Next of Kin (SASRA required)
  nok_name          VARCHAR(150),
  nok_relationship  VARCHAR(50),
  nok_phone         VARCHAR(20),
  nok_id_number     VARCHAR(20),
  -- KYC
  kyc_status        kyc_status DEFAULT 'pending',
  kyc_verified_at   TIMESTAMPTZ,
  kyc_verified_by   UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─── ACCOUNTS ─────────────────────────────────────────────────────────────

CREATE TABLE accounts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        account_type NOT NULL,
  balance     NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type)   -- One account per type per member
);

-- ─── TRANSACTIONS ─────────────────────────────────────────────────────────

CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference       VARCHAR(30) UNIQUE NOT NULL,   -- e.g. TXN-20250115-9841
  user_id         UUID NOT NULL REFERENCES users(id),
  account_id      UUID REFERENCES accounts(id),
  type            transaction_type NOT NULL,
  debit           NUMERIC(15, 2) DEFAULT 0.00,
  credit          NUMERIC(15, 2) DEFAULT 0.00,
  balance_after   NUMERIC(15, 2),                -- Snapshot after transaction
  description     TEXT NOT NULL,
  related_id      UUID,                          -- Loan ID, penalty ID, etc.
  recorded_by     UUID REFERENCES users(id),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
  -- Note: transactions are IMMUTABLE — no UPDATE or DELETE
);

-- ─── LOAN PRODUCTS ────────────────────────────────────────────────────────

CREATE TABLE loan_products (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(100) NOT NULL,      -- e.g. "Development Loan"
  description         TEXT,
  interest_rate       NUMERIC(5, 2) NOT NULL,     -- Annual % rate
  interest_method     interest_method DEFAULT 'reducing',
  min_amount          NUMERIC(15, 2) NOT NULL,
  max_amount          NUMERIC(15, 2) NOT NULL,
  min_term_months     INT NOT NULL,
  max_term_months     INT NOT NULL,
  max_multiplier      NUMERIC(4, 1) DEFAULT 4.0,  -- e.g. 4x savings
  guarantors_required INT DEFAULT 2,
  processing_fee_pct  NUMERIC(4, 2) DEFAULT 1.0,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LOANS ────────────────────────────────────────────────────────────────

CREATE TABLE loans (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference         VARCHAR(30) UNIQUE NOT NULL,  -- e.g. LN-2041-01
  user_id           UUID NOT NULL REFERENCES users(id),
  product_id        UUID REFERENCES loan_products(id),
  principal         NUMERIC(15, 2) NOT NULL,
  interest_rate     NUMERIC(5, 2) NOT NULL,
  interest_method   interest_method NOT NULL,
  term_months       INT NOT NULL,
  monthly_payment   NUMERIC(15, 2),
  total_payable     NUMERIC(15, 2),
  total_interest    NUMERIC(15, 2),
  processing_fee    NUMERIC(15, 2) DEFAULT 0,
  outstanding       NUMERIC(15, 2) NOT NULL,      -- Current balance
  total_paid        NUMERIC(15, 2) DEFAULT 0,
  status            loan_status DEFAULT 'draft',
  disbursed_at      TIMESTAMPTZ,
  disbursed_by      UUID REFERENCES users(id),
  due_date          DATE,                          -- Final repayment date
  purpose           TEXT,
  application_date  DATE DEFAULT CURRENT_DATE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LOAN GUARANTORS ──────────────────────────────────────────────────────

CREATE TABLE loan_guarantors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id     UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES users(id),
  amount      NUMERIC(15, 2),   -- Amount guaranteed
  accepted    BOOLEAN DEFAULT FALSE,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LOAN APPROVALS (Maker-Checker) ───────────────────────────────────────

CREATE TABLE loan_approvals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id     UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  step        INT NOT NULL,              -- 1 = Treasurer, 2 = Admin
  actor_id    UUID REFERENCES users(id),
  action      approval_action,
  comment     TEXT,
  acted_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── REPAYMENTS ───────────────────────────────────────────────────────────

CREATE TABLE repayments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference       VARCHAR(30) UNIQUE NOT NULL,
  loan_id         UUID NOT NULL REFERENCES loans(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  amount          NUMERIC(15, 2) NOT NULL,
  principal_paid  NUMERIC(15, 2),
  interest_paid   NUMERIC(15, 2),
  penalty_paid    NUMERIC(15, 2) DEFAULT 0,
  balance_after   NUMERIC(15, 2),
  recorded_by     UUID REFERENCES users(id),
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── WELFARE CASES ────────────────────────────────────────────────────────

CREATE TABLE welfare_cases (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference     VARCHAR(30) UNIQUE NOT NULL,   -- e.g. WF-088
  user_id       UUID NOT NULL REFERENCES users(id),
  category      welfare_category NOT NULL,
  amount        NUMERIC(15, 2) NOT NULL,
  description   TEXT,
  documents_url VARCHAR(500),
  status        welfare_status DEFAULT 'pending',
  reviewed_by   UUID REFERENCES users(id),
  review_note   TEXT,
  reviewed_at   TIMESTAMPTZ,
  disbursed_at  TIMESTAMPTZ,
  filed_date    DATE DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PENALTIES ────────────────────────────────────────────────────────────

CREATE TABLE penalties (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference     VARCHAR(30) UNIQUE NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id),
  loan_id       UUID REFERENCES loans(id),   -- NULL for contribution penalties
  type          penalty_type NOT NULL,
  amount        NUMERIC(15, 2) NOT NULL,
  description   TEXT,
  status        penalty_status DEFAULT 'pending',
  is_auto       BOOLEAN DEFAULT TRUE,         -- True = auto-generated by system
  waived_by     UUID REFERENCES users(id),
  waived_at     TIMESTAMPTZ,
  waive_reason  TEXT,
  paid_at       TIMESTAMPTZ,
  period_date   DATE,                         -- Month/period the penalty is for
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PENALTY RULES (Configurable) ─────────────────────────────────────────

CREATE TABLE penalty_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        penalty_type UNIQUE NOT NULL,
  rate        NUMERIC(8, 2) NOT NULL,       -- Amount or percentage
  is_percent  BOOLEAN DEFAULT FALSE,        -- True = %, False = fixed KES
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EXPENDITURES ─────────────────────────────────────────────────────────

CREATE TABLE expenditures (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference     VARCHAR(30) UNIQUE NOT NULL,
  category      VARCHAR(100) NOT NULL,       -- e.g. "Staff Salaries", "Office Rent"
  description   TEXT NOT NULL,
  amount        NUMERIC(15, 2) NOT NULL,
  recorded_by   UUID REFERENCES users(id),
  approved_by   UUID REFERENCES users(id),
  expense_date  DATE NOT NULL,
  receipt_url   VARCHAR(500),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  message     TEXT NOT NULL,
  type        VARCHAR(50),      -- 'loan', 'penalty', 'welfare', 'system'
  is_read     BOOLEAN DEFAULT FALSE,
  related_id  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AUDIT LOGS (Immutable — no UPDATE/DELETE) ───────────────────────────

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID REFERENCES users(id),
  actor_name  VARCHAR(150),               -- Denormalized for immutability
  actor_role  VARCHAR(50),
  action      VARCHAR(100) NOT NULL,      -- e.g. LOAN_DISBURSE, MEMBER_CREATE
  entity_type VARCHAR(50),               -- e.g. 'loan', 'member'
  entity_id   UUID,
  description TEXT,
  old_values  JSONB,                      -- Before state (for edits)
  new_values  JSONB,                      -- After state
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SACCO SETTINGS ───────────────────────────────────────────────────────

CREATE TABLE sacco_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── REFRESH TOKENS ───────────────────────────────────────────────────────

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_member_no ON users(member_no);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- Profiles
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_id_number ON profiles(id_number);

-- Accounts
CREATE INDEX idx_accounts_user_id ON accounts(user_id);

-- Transactions
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_related ON transactions(related_id);

-- Loans
CREATE INDEX idx_loans_user_id ON loans(user_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loans_due_date ON loans(due_date);

-- Repayments
CREATE INDEX idx_repayments_loan_id ON repayments(loan_id);
CREATE INDEX idx_repayments_user_id ON repayments(user_id);
CREATE INDEX idx_repayments_date ON repayments(payment_date);

-- Welfare
CREATE INDEX idx_welfare_user_id ON welfare_cases(user_id);
CREATE INDEX idx_welfare_status ON welfare_cases(status);

-- Penalties
CREATE INDEX idx_penalties_user_id ON penalties(user_id);
CREATE INDEX idx_penalties_status ON penalties(status);
CREATE INDEX idx_penalties_period ON penalties(period_date);

-- Audit logs
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity_id);

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);

-- ─── TRIGGERS — auto-update updated_at ───────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_loans_updated BEFORE UPDATE ON loans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_welfare_updated BEFORE UPDATE ON welfare_cases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_penalties_updated BEFORE UPDATE ON penalties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
