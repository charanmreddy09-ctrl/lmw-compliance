-- ===========================================================================
-- GLOBAL COMPLIANCE MANAGEMENT PLATFORM (GCMP) — blank template
-- Postgres schema. Normalised, foreign-keyed, indexed, soft-delete, audited.
-- Safe to run repeatedly.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- reference
CREATE TABLE IF NOT EXISTS countries (
  code            CHAR(2)      PRIMARY KEY,
  name            TEXT         NOT NULL,
  currency        CHAR(3)      NOT NULL,
  fy_end          TEXT         NOT NULL,
  timezone        TEXT         NOT NULL,
  portal          TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Jurisdiction hierarchy: country -> state/province -> (extensible).
-- A NULL parent_code means the federal/national level of that country.
CREATE TABLE IF NOT EXISTS jurisdictions (
  id              TEXT         PRIMARY KEY,
  country_code    CHAR(2)      NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  parent_id       TEXT         REFERENCES jurisdictions(id) ON DELETE CASCADE,
  level           TEXT         NOT NULL CHECK (level IN ('federal','state','province','municipal')),
  code            TEXT         NOT NULL,
  name            TEXT         NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (country_code, code)
);
CREATE INDEX IF NOT EXISTS idx_juris_country ON jurisdictions(country_code);
CREATE INDEX IF NOT EXISTS idx_juris_parent  ON jurisdictions(parent_id);

CREATE TABLE IF NOT EXISTS divisions (
  id              TEXT         PRIMARY KEY,
  name            TEXT         NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS categories (
  id              TEXT         PRIMARY KEY,
  name            TEXT         NOT NULL,
  sort_order      INT          NOT NULL DEFAULT 100
);

-- ---------------------------------------------------------------- entities
CREATE TABLE IF NOT EXISTS entities (
  id              TEXT         PRIMARY KEY,
  name            TEXT         NOT NULL,
  short_name      TEXT         NOT NULL,
  country_code    CHAR(2)      NOT NULL REFERENCES countries(code),
  jurisdiction_id TEXT         REFERENCES jurisdictions(id),
  division_id     TEXT         REFERENCES divisions(id),
  parent_id       TEXT         REFERENCES entities(id),
  entity_type     TEXT         NOT NULL,
  city            TEXT,
  currency        CHAR(3)      NOT NULL,
  fy_end          TEXT         NOT NULL,
  employees       INT          NOT NULL DEFAULT 0,
  is_listed       BOOLEAN      NOT NULL DEFAULT FALSE,
  has_factory     BOOLEAN      NOT NULL DEFAULT FALSE,
  is_importer     BOOLEAN      NOT NULL DEFAULT FALSE,
  statutory_auditor TEXT,
  local_advisor   TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entities_country ON entities(country_code) WHERE deleted_at IS NULL;

-- Entities can operate in additional states (e.g. a US entity registered in
-- Michigan and Ohio) which is what drives state-level applicability.
CREATE TABLE IF NOT EXISTS entity_jurisdictions (
  entity_id       TEXT         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  jurisdiction_id TEXT         NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  registered_on   DATE,
  PRIMARY KEY (entity_id, jurisdiction_id)
);

-- ---------------------------------------------------------------- security
CREATE TABLE IF NOT EXISTS roles (
  id              TEXT         PRIMARY KEY,
  name            TEXT         NOT NULL,
  description     TEXT,
  permissions     JSONB        NOT NULL DEFAULT '[]'::jsonb,
  is_system       BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS users (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT         NOT NULL UNIQUE,
  full_name       TEXT         NOT NULL,
  role_id         TEXT         NOT NULL REFERENCES roles(id),
  password_hash   TEXT,
  status          TEXT         NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','active','disabled')),
  invited_by      UUID         REFERENCES users(id),
  invite_token    TEXT,
  must_reset      BOOLEAN      NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(lower(email)) WHERE deleted_at IS NULL;

-- Which entities a user may see / act on. A row with entity_id = '*' grants all.
CREATE TABLE IF NOT EXISTS user_entities (
  user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id       TEXT         NOT NULL,
  can_file        BOOLEAN      NOT NULL DEFAULT FALSE,
  can_review      BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, entity_id)
);

-- CFO delegates review authority; the platform honours active delegations.
CREATE TABLE IF NOT EXISTS delegations (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type      TEXT         NOT NULL CHECK (scope_type IN ('all','country','entity','category')),
  scope_value     TEXT,
  valid_from      DATE         NOT NULL,
  valid_to        DATE,
  note            TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by      UUID         REFERENCES users(id),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deleg_to ON delegations(to_user_id) WHERE is_active;

-- ---------------------------------------------------- compliance library
-- Fully dynamic. Nothing about a compliance lives in application code.
CREATE TABLE IF NOT EXISTS compliances (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT         NOT NULL UNIQUE,
  country_code    CHAR(2)      NOT NULL REFERENCES countries(code),
  jurisdiction_id TEXT         REFERENCES jurisdictions(id),
  category_id     TEXT         NOT NULL REFERENCES categories(id),
  title           TEXT         NOT NULL,
  applicable_law  TEXT,
  form_reference  TEXT,
  authority       TEXT,
  government_site TEXT,
  frequency       TEXT         NOT NULL CHECK (frequency IN
                    ('Monthly','Quarterly','Half-yearly','Annual','Event Based','Continuous','Periodic')),
  due_rule        TEXT,
  due_day         INT,
  due_month       INT,
  evidence_required JSONB      NOT NULL DEFAULT '[]'::jsonb,
  penalty         TEXT,
  risk_level      TEXT         NOT NULL DEFAULT 'Medium'
                               CHECK (risk_level IN ('Critical','High','Medium','Low')),
  applies_if_listed   BOOLEAN  NOT NULL DEFAULT FALSE,
  applies_if_factory  BOOLEAN  NOT NULL DEFAULT FALSE,
  applies_if_importer BOOLEAN  NOT NULL DEFAULT FALSE,
  verified        BOOLEAN      NOT NULL DEFAULT FALSE,
  verified_by     TEXT,
  verified_on     DATE,
  is_archived     BOOLEAN      NOT NULL DEFAULT FALSE,
  -- admin-reviewed due-date sync: where to check, and what the last check found.
  -- government_site doubles as the default source if due_source_url is blank.
  due_source_url        TEXT,
  due_last_checked_at   TIMESTAMPTZ,
  due_last_check_note   TEXT,
  deleted_at      TIMESTAMPTZ,
  created_by      UUID         REFERENCES users(id),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
ALTER TABLE compliances ADD COLUMN IF NOT EXISTS due_source_url TEXT;
ALTER TABLE compliances ADD COLUMN IF NOT EXISTS due_last_checked_at TIMESTAMPTZ;
ALTER TABLE compliances ADD COLUMN IF NOT EXISTS due_last_check_note TEXT;
CREATE INDEX IF NOT EXISTS idx_comp_country  ON compliances(country_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comp_juris    ON compliances(jurisdiction_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comp_category ON compliances(category_id) WHERE deleted_at IS NULL;

-- Full version history of every library change, so a due-date change is provable
CREATE TABLE IF NOT EXISTS compliance_history (
  id              BIGSERIAL    PRIMARY KEY,
  compliance_id   UUID         NOT NULL REFERENCES compliances(id) ON DELETE CASCADE,
  changed_by      UUID         REFERENCES users(id),
  changed_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  change_type     TEXT         NOT NULL,
  before_data     JSONB,
  after_data      JSONB,
  note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_comphist ON compliance_history(compliance_id, changed_at DESC);

-- ------------------------------------------------------ obligation instances
-- One row per entity x compliance x period. This is the live register.
CREATE TABLE IF NOT EXISTS obligations (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       TEXT         NOT NULL UNIQUE,
  compliance_id   UUID         NOT NULL REFERENCES compliances(id) ON DELETE CASCADE,
  entity_id       TEXT         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period_label    TEXT         NOT NULL,
  period_start    DATE,
  period_end      DATE,
  /* The FY (Apr-Mar) this obligation's period belongs to, as its starting
     calendar year — e.g. 2026 for FY2026-27. Stored explicitly rather than
     derived from due_date, since a Q4 due date can fall in the FY's second
     calendar year (e.g. a May due date for the preceding March quarter). */
  fy_start_year   SMALLINT     NOT NULL,
  due_date        DATE         NOT NULL,
  original_due_date DATE,
  filed_date      DATE,
  status          TEXT         NOT NULL DEFAULT 'Not Started' CHECK (status IN
                    ('Not Started','Evidence Pending','Submitted','Under Review',
                     'Query Raised','Approved','Rejected','Overdue','Not Applicable')),
  workflow_stage  TEXT         NOT NULL DEFAULT 'preparer' CHECK (workflow_stage IN
                    ('preparer','reviewer','country_head','closed')),
  assigned_to     UUID         REFERENCES users(id),
  reviewer_id     UUID         REFERENCES users(id),
  delay_days      INT          NOT NULL DEFAULT 0,
  penalty_exposure TEXT,
  notes           TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (compliance_id, entity_id, period_label)
);
CREATE INDEX IF NOT EXISTS idx_obl_entity   ON obligations(entity_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_obl_status   ON obligations(status)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_obl_due      ON obligations(due_date)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_obl_reviewer ON obligations(reviewer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_obl_assigned ON obligations(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_obl_fy       ON obligations(fy_start_year) WHERE deleted_at IS NULL;

-- Due-date change log. Drives the country-specific popup notification.
CREATE TABLE IF NOT EXISTS due_date_changes (
  id              BIGSERIAL    PRIMARY KEY,
  obligation_id   UUID         REFERENCES obligations(id) ON DELETE CASCADE,
  compliance_id   UUID         REFERENCES compliances(id) ON DELETE CASCADE,
  country_code    CHAR(2)      NOT NULL REFERENCES countries(code),
  entity_id       TEXT         REFERENCES entities(id) ON DELETE CASCADE,
  old_due_date    DATE,
  new_due_date    DATE         NOT NULL,
  reason          TEXT,
  source          TEXT         NOT NULL DEFAULT 'manual',
  -- 'pending' rows are proposals from the due-date sync check awaiting an
  -- Admin/CFO decision; only 'applied' ones have actually changed a due date.
  status          TEXT         NOT NULL DEFAULT 'applied'
                               CHECK (status IN ('pending','applied','rejected')),
  changed_by      UUID         REFERENCES users(id),
  changed_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
ALTER TABLE due_date_changes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'applied';
DO $$ BEGIN
  ALTER TABLE due_date_changes ADD CONSTRAINT due_date_changes_status_check
    CHECK (status IN ('pending','applied','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_ddc_country ON due_date_changes(country_code, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ddc_status  ON due_date_changes(status) WHERE status = 'pending';

-- ---------------------------------------------------------------- evidence
-- Files are stored in Postgres as bytea so the platform needs exactly one
-- credential and uploads cannot fail on a misconfigured storage bucket.
CREATE TABLE IF NOT EXISTS evidence (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id   UUID         NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
  file_name       TEXT         NOT NULL,
  mime_type       TEXT         NOT NULL,
  size_bytes      BIGINT       NOT NULL,
  checksum        TEXT,
  version         INT          NOT NULL DEFAULT 1,
  doc_type        TEXT,
  period_label    TEXT,
  filed_date      DATE,
  content         BYTEA        NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'Submitted'
                               CHECK (status IN ('Submitted','Approved','Rejected','Superseded')),
  validation      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  is_nil          BOOLEAN      NOT NULL DEFAULT FALSE,
  uploaded_by     UUID         REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  reviewed_by     UUID         REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS is_nil BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_ev_obl ON evidence(obligation_id) WHERE deleted_at IS NULL;

-- A compliance a Reviewer has decided genuinely does not apply to a given
-- entity (e.g. cost audit for a non-manufacturing subsidiary). Excluding one
-- flips its non-approved obligations to 'Not Applicable', which every score/
-- dashboard query already excludes — see src/lib/score.ts and
-- src/app/api/dashboard/route.ts.
CREATE TABLE IF NOT EXISTS compliance_exclusions (
  id              BIGSERIAL    PRIMARY KEY,
  compliance_id   UUID         NOT NULL REFERENCES compliances(id) ON DELETE CASCADE,
  entity_id       TEXT         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  reason          TEXT,
  excluded_by     UUID         REFERENCES users(id),
  excluded_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (compliance_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_ce_entity ON compliance_exclusions(entity_id);

-- ---------------------------------------------------------------- workflow
CREATE TABLE IF NOT EXISTS review_actions (
  id              BIGSERIAL    PRIMARY KEY,
  obligation_id   UUID         NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
  evidence_id     UUID         REFERENCES evidence(id) ON DELETE SET NULL,
  action          TEXT         NOT NULL CHECK (action IN
                    ('submit','approve','reject','query','comment','reassign',
                     'delegate','escalate','resubmit','reopen')),
  actor_id        UUID         REFERENCES users(id),
  actor_role      TEXT,
  from_status     TEXT,
  to_status       TEXT,
  target_user_id  UUID         REFERENCES users(id),
  comment         TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ra_obl ON review_actions(obligation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         UUID         REFERENCES users(id) ON DELETE CASCADE,
  country_code    CHAR(2),
  entity_id       TEXT,
  kind            TEXT         NOT NULL,
  title           TEXT         NOT NULL,
  body            TEXT,
  link            TEXT,
  severity        TEXT         NOT NULL DEFAULT 'info'
                               CHECK (severity IN ('info','warning','critical')),
  is_popup        BOOLEAN      NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, created_at DESC);

-- ------------------------------------------------------------- audit trail
CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGSERIAL    PRIMARY KEY,
  actor_id        UUID         REFERENCES users(id),
  actor_email     TEXT,
  actor_role      TEXT,
  action          TEXT         NOT NULL,
  object_type     TEXT         NOT NULL,
  object_id       TEXT,
  detail          TEXT,
  meta            JSONB,
  ip              TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_object  ON audit_log(object_type, object_id);

-- ------------------------------------------------------------- score cache
CREATE TABLE IF NOT EXISTS score_snapshots (
  id              BIGSERIAL    PRIMARY KEY,
  entity_id       TEXT         REFERENCES entities(id) ON DELETE CASCADE,
  country_code    CHAR(2),
  as_of           DATE         NOT NULL,
  total           INT          NOT NULL,
  approved        INT          NOT NULL,
  overdue         INT          NOT NULL,
  score           NUMERIC(5,2) NOT NULL,
  breakdown       JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (entity_id, as_of)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key             TEXT         PRIMARY KEY,
  value           JSONB        NOT NULL,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- --------------------------------------------------------- updated_at hook
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['entities','users','compliances','obligations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s
                    FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t);
  END LOOP;
END $$;
