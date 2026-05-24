-- ================================================================
-- UmojaSACCO — Migration 003
-- Adds: multi-NOK (up to 5), member-no renumbering from 1000,
--       user groups/permissions, activity log (45-day rolling),
--       member_no_prefix setting, mpesa_code on transactions,
--       project contribution channel
-- ================================================================

-- ─── 1. MEMBER NUMBER RENUMBERING ────────────────────────────────────────
-- Renumber all non-custom members starting at MBR-1000
-- "Custom" = any member_no that doesn't match MBR-NNNN pattern
DO $$
DECLARE
  r RECORD;
  seq INT := 1000;
  prefix TEXT := 'MBR';
BEGIN
  FOR r IN
    SELECT id, member_no FROM users
    WHERE member_no ~ '^MBR-[0-9]+$'
    ORDER BY created_at ASC
  LOOP
    UPDATE users SET member_no = prefix || '-' || LPAD(seq::text, 4, '0')
    WHERE id = r.id;
    seq := seq + 1;
  END LOOP;
END;
$$;

-- ─── 2. NOK TABLE (replaces inline columns — support up to 5) ────────────
CREATE TABLE IF NOT EXISTS member_nok (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order   INT DEFAULT 1,        -- 1=primary, 2-5=additional
  nok_name     VARCHAR(150) NOT NULL,
  relationship VARCHAR(50)  NOT NULL,
  phone        VARCHAR(20),
  id_number    VARCHAR(20),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nok_user ON member_nok(user_id);
CREATE TRIGGER IF NOT EXISTS trg_nok_updated
  BEFORE UPDATE ON member_nok FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Migrate existing NOK data from profiles into member_nok
INSERT INTO member_nok (id, user_id, sort_order, nok_name, relationship, phone, id_number)
SELECT uuid_generate_v4(), p.user_id, 1,
       COALESCE(p.nok_name, 'Unknown'),
       COALESCE(p.nok_relationship, 'Other'),
       p.nok_phone, p.nok_id_number
FROM profiles p
WHERE p.nok_name IS NOT NULL AND p.nok_name != ''
ON CONFLICT DO NOTHING;

-- Migrate nok2 if present
INSERT INTO member_nok (id, user_id, sort_order, nok_name, relationship, phone, id_number)
SELECT uuid_generate_v4(), p.user_id, 2,
       p.nok2_name,
       COALESCE(p.nok2_relationship, 'Other'),
       p.nok2_phone, p.nok2_id_number
FROM profiles p
WHERE p.nok2_name IS NOT NULL AND p.nok2_name != ''
ON CONFLICT DO NOTHING;

-- ─── 3. USER GROUPS (Shopify-style permission groups) ────────────────────
CREATE TABLE IF NOT EXISTS user_groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  -- permissions keys: "members.view","members.create","members.edit",
  --   "loans.view","loans.approve","savings.view","savings.record",
  --   "welfare.view","welfare.approve","reports.view","audit.view",
  --   "settings.view","settings.edit","penalties.view","penalties.waive",
  --   "transactions.view","projects.view","projects.manage","import.run",
  --   "factory_reset" (system_admin only)
  is_system   BOOLEAN DEFAULT FALSE,  -- system groups cannot be deleted
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_group_members (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_ugm_user  ON user_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ugm_group ON user_group_members(group_id);

-- ─── 4. ACTIVITY LOG (45-day rolling, compressed) ────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  user_name   VARCHAR(150),
  user_role   VARCHAR(50),
  action      VARCHAR(100) NOT NULL,   -- e.g. PAGE_VIEW, FORM_SUBMIT, LOGIN, LOGOUT
  entity_type VARCHAR(50),
  entity_id   UUID,
  description TEXT,
  metadata    JSONB,                   -- extra context (search term, filters used, etc.)
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  session_id  VARCHAR(100),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);

-- Auto-purge: rows older than 45 days are deleted by a scheduled job
-- (done via cron or Render cron job calling DELETE WHERE created_at < NOW()-45days)

-- ─── 5. MPESA/BANK CODE on transactions ──────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(50),   -- 'mpesa','bank','cash','cheque'
  ADD COLUMN IF NOT EXISTS payment_ref     VARCHAR(100);  -- Mpesa code / bank ref / cheque no

-- ─── 6. MEMBER NUMBER PREFIX SETTING ─────────────────────────────────────
INSERT INTO sacco_settings (key, value, description)
VALUES ('member_no_prefix', 'MBR', 'Prefix for auto-generated member numbers (e.g. MBR, YISH, MEMBR)')
ON CONFLICT (key) DO NOTHING;

-- ─── 7. WELFARE MINIMUM SETTING ──────────────────────────────────────────
-- Override default to 100 (open, not enforced per type)
INSERT INTO sacco_settings (key, value, description)
VALUES ('min_welfare', '100', 'Minimum welfare contribution per transaction (KES)')
ON CONFLICT (key) DO UPDATE SET value = '100';

-- ─── 8. SEED DEFAULT GROUPS ──────────────────────────────────────────────
INSERT INTO user_groups (id, name, description, permissions, is_system)
VALUES
  (uuid_generate_v4(), 'System Admin', 'Full access including factory reset',
   '{"members.view":true,"members.create":true,"members.edit":true,"loans.view":true,"loans.approve":true,"savings.view":true,"savings.record":true,"welfare.view":true,"welfare.approve":true,"reports.view":true,"audit.view":true,"settings.view":true,"settings.edit":true,"penalties.view":true,"penalties.waive":true,"transactions.view":true,"projects.view":true,"projects.manage":true,"import.run":true,"factory_reset":true}'::jsonb,
   true),
  (uuid_generate_v4(), 'Finance', 'View and record financial transactions',
   '{"members.view":true,"loans.view":true,"loans.approve":true,"savings.view":true,"savings.record":true,"welfare.view":true,"welfare.approve":true,"reports.view":true,"transactions.view":true,"projects.view":true,"penalties.view":true}'::jsonb,
   true),
  (uuid_generate_v4(), 'Member Services', 'Manage member records and KYC',
   '{"members.view":true,"members.create":true,"members.edit":true,"savings.view":true,"loans.view":true,"welfare.view":true,"penalties.view":true,"transactions.view":true,"projects.view":true}'::jsonb,
   true),
  (uuid_generate_v4(), 'Auditor', 'Read-only access to all records',
   '{"members.view":true,"loans.view":true,"savings.view":true,"welfare.view":true,"reports.view":true,"audit.view":true,"transactions.view":true,"projects.view":true,"penalties.view":true}'::jsonb,
   true),
  (uuid_generate_v4(), 'Helpdesk', 'View members and handle queries',
   '{"members.view":true,"loans.view":true,"savings.view":true,"welfare.view":true,"transactions.view":true}'::jsonb,
   true)
ON CONFLICT (name) DO NOTHING;
