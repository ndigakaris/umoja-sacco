-- ================================================================
-- UmojaSACCO — Migration 002: New Features
-- Adds: Second NOK, Contribution %, Project Shares, Bulk Import log
-- Run with: npm run migrate (auto-applies new files)
-- ================================================================

-- ─── 1. SECOND NEXT OF KIN on profiles ───────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nok2_name         VARCHAR(150),
  ADD COLUMN IF NOT EXISTS nok2_relationship VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nok2_phone        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nok2_id_number    VARCHAR(20);

-- ─── 2. CONTRIBUTION PERCENTAGE (0–100) on profiles ─────────────────────
-- Tracks what % of standard contributions a member has paid
-- e.g. 100 = fully paid, 50 = half-paid, useful for partial contributors
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS contribution_pct NUMERIC(5,2) DEFAULT 100.00
    CONSTRAINT chk_contribution_pct CHECK (contribution_pct >= 0 AND contribution_pct <= 100);

-- ─── 3. PROJECTS (for project-level shares) ──────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(150) NOT NULL,         -- e.g. "Purchase of Land"
  description  TEXT,
  total_value  NUMERIC(15,2) DEFAULT 0.00,    -- Total project cost/value
  share_price  NUMERIC(15,2) DEFAULT 1.00,    -- Price per unit share
  is_active    BOOLEAN DEFAULT TRUE,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. PROJECT SHARE ALLOCATIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_share_allocations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  units       NUMERIC(12,2) NOT NULL DEFAULT 0.00,   -- Number of shares held
  amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0.00,   -- Amount paid so far
  notes       TEXT,
  recorded_by UUID REFERENCES users(id),
  alloc_date  DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)    -- One allocation row per member per project
);

-- ─── 5. BULK IMPORT LOG ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bulk_imports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_type   VARCHAR(50) NOT NULL,   -- savings|shares|welfare|loans|contributions|project_shares
  file_name     VARCHAR(255),
  total_rows    INT DEFAULT 0,
  success_rows  INT DEFAULT 0,
  failed_rows   INT DEFAULT 0,
  errors        JSONB,                  -- Array of {row, error} objects
  status        VARCHAR(20) DEFAULT 'pending',  -- pending|processing|done|failed
  imported_by   UUID REFERENCES users(id),
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS idx_proj_alloc_project ON project_share_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_alloc_user ON project_share_allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_imports_type ON bulk_imports(import_type);
CREATE INDEX IF NOT EXISTS idx_bulk_imports_by ON bulk_imports(imported_by);

-- ─── TRIGGERS ────────────────────────────────────────────────────────────
CREATE TRIGGER trg_projects_updated
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_proj_alloc_updated
  BEFORE UPDATE ON project_share_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── SEED: example projects ──────────────────────────────────────────────
INSERT INTO projects (id, name, description, total_value, share_price, is_active)
VALUES
  (uuid_generate_v4(), 'Purchase of Land', 'Sacco communal land purchase project', 5000000.00, 5000.00, true),
  (uuid_generate_v4(), 'Purchase of Tents', 'Event tents for member use', 300000.00, 1000.00, true)
ON CONFLICT DO NOTHING;
