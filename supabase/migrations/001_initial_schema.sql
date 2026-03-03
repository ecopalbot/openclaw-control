-- ═══════════════════════════════════════════════════════════════
-- OpenClaw + BMAD v6 — Extension Schema
-- EXTENDS OpenClaw — does NOT duplicate core features.
--
-- OpenClaw handles: sessions, channels (Telegram/Discord),
-- agent routing, skills, usage display, model management.
--
-- This schema adds: org identity, BMAD task lifecycle,
-- persistent memory, cost tracking ($), system health,
-- audit logging, and adjustable budget controls.
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;

-- ════════════════════════════════════════════════════════════
-- 1. ORGANIZATIONS
-- ════════════════════════════════════════════════════════════
CREATE TABLE organizations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    owner_identity    TEXT NOT NULL,
    values_manifest   TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════
-- 2. ORGANIZATION SETTINGS (Tier 2 — adjustable cost limits)
-- ════════════════════════════════════════════════════════════
CREATE TABLE organization_settings (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    daily_spend_limit         NUMERIC(10,2) NOT NULL DEFAULT 10.00,
    warning_threshold_percent INTEGER NOT NULL DEFAULT 80,
    anomaly_multiplier        NUMERIC(4,1) NOT NULL DEFAULT 3.0,
    default_model             TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4-20250514',
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id)
);

-- ════════════════════════════════════════════════════════════
-- 3. BMAD AGENTS — metadata layer over OpenClaw agents
--    Maps to agents.list entries in openclaw.json.
--    Stores BMAD-specific fields: personality, phase role, budgets.
--    OpenClaw handles agent routing, sessions, tools.
-- ════════════════════════════════════════════════════════════
CREATE TABLE bmad_agents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    openclaw_agent_id   TEXT NOT NULL,             -- matches agents.list[].id in openclaw.json
    name                TEXT NOT NULL,
    role                TEXT NOT NULL,              -- BMAD role: pm, architect, developer, qa, devops, etc.
    personality_profile TEXT NOT NULL DEFAULT '',   -- injected into SOUL.md at startup
    autonomy_level      INTEGER NOT NULL DEFAULT 1 CHECK (autonomy_level BETWEEN 0 AND 3),
    daily_token_limit   INTEGER NOT NULL DEFAULT 100000,
    task_token_limit    INTEGER NOT NULL DEFAULT 50000,
    active              BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(openclaw_agent_id)
);

CREATE INDEX idx_bmad_agents_org ON bmad_agents(organization_id);

-- ════════════════════════════════════════════════════════════
-- 4. TASK STATE — BMAD lifecycle tracking
-- ════════════════════════════════════════════════════════════
CREATE TABLE task_state (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id          UUID REFERENCES bmad_agents(id) ON DELETE SET NULL,
    title             TEXT NOT NULL,
    phase             TEXT CHECK (phase IN ('brainstorm','requirements','architecture','implementation','testing','deployment')),
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_progress','paused','completed','failed','cancelled')),
    token_budget      INTEGER,
    tokens_used       INTEGER NOT NULL DEFAULT 0,
    checkpoint        JSONB DEFAULT '{}'::jsonb,
    error_log         TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_task_status ON task_state(status);
CREATE INDEX idx_task_org ON task_state(organization_id);
CREATE INDEX idx_task_agent ON task_state(agent_id);
CREATE INDEX idx_task_resumable ON task_state(status) WHERE status IN ('in_progress','paused');

-- ════════════════════════════════════════════════════════════
-- 5. AGENT MEMORY — persistent beyond OpenClaw sessions
-- ════════════════════════════════════════════════════════════
CREATE TABLE agent_memory (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id      UUID NOT NULL REFERENCES bmad_agents(id) ON DELETE CASCADE,
    memory_type   TEXT NOT NULL DEFAULT 'general'
                  CHECK (memory_type IN ('general','decision','learned','skill','pattern','summary')),
    content       TEXT NOT NULL,
    embedding     VECTOR(1536),
    version       INTEGER NOT NULL DEFAULT 1,
    tags          TEXT[] DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_agent ON agent_memory(agent_id);
CREATE INDEX idx_memory_type ON agent_memory(memory_type);
CREATE INDEX idx_memory_tags ON agent_memory USING gin(tags);
CREATE INDEX idx_memory_embedding ON agent_memory
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ════════════════════════════════════════════════════════════
-- 6. TOKEN USAGE — cost tracking in $USD
--    OpenClaw tracks tokens natively, but not $ cost.
--    This adds financial tracking for budget enforcement.
-- ════════════════════════════════════════════════════════════
CREATE TABLE token_usage (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
    agent_id          UUID REFERENCES bmad_agents(id) ON DELETE SET NULL,
    task_id           UUID REFERENCES task_state(id) ON DELETE SET NULL,
    model             TEXT NOT NULL,
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens      INTEGER NOT NULL DEFAULT 0,
    cost_usd          NUMERIC(10,6) NOT NULL DEFAULT 0,
    blocked           BOOLEAN NOT NULL DEFAULT false,
    block_reason      TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_date ON token_usage(created_at);
CREATE INDEX idx_usage_org ON token_usage(organization_id, created_at);
CREATE INDEX idx_usage_agent ON token_usage(agent_id, created_at);

-- ════════════════════════════════════════════════════════════
-- 7. SYSTEM METRICS — VPS health (no OpenClaw equivalent)
-- ════════════════════════════════════════════════════════════
CREATE TABLE system_metrics (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type   TEXT NOT NULL,
    value_numeric NUMERIC,
    value_json    JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metrics_type_date ON system_metrics(metric_type, created_at);

-- ════════════════════════════════════════════════════════════
-- 8. CRON ACTIVITY — monitoring script execution log
-- ════════════════════════════════════════════════════════════
CREATE TABLE cron_activity (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name    TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('started','completed','failed')),
    output      TEXT,
    duration_ms INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cron_job ON cron_activity(job_name, created_at);

-- ════════════════════════════════════════════════════════════
-- 9. AUDIT LOG — tracks all destructive/config changes
-- ════════════════════════════════════════════════════════════
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    target      TEXT,
    details     JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_date ON audit_log(created_at);

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — anon read for dashboard
-- ════════════════════════════════════════════════════════════
ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bmad_agents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_state            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory          ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage           ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_metrics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_activity         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log             ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read" ON organizations         FOR SELECT USING (true);
CREATE POLICY "anon_read" ON organization_settings FOR SELECT USING (true);
CREATE POLICY "anon_read" ON bmad_agents           FOR SELECT USING (true);
CREATE POLICY "anon_read" ON task_state            FOR SELECT USING (true);
CREATE POLICY "anon_read" ON agent_memory          FOR SELECT USING (true);
CREATE POLICY "anon_read" ON token_usage           FOR SELECT USING (true);
CREATE POLICY "anon_read" ON system_metrics        FOR SELECT USING (true);
CREATE POLICY "anon_read" ON cron_activity         FOR SELECT USING (true);
CREATE POLICY "anon_read" ON audit_log             FOR SELECT USING (true);

-- ════════════════════════════════════════════════════════════
-- TRIGGERS — auto updated_at
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated BEFORE UPDATE ON organization_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated BEFORE UPDATE ON bmad_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated BEFORE UPDATE ON task_state FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated BEFORE UPDATE ON agent_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at();
