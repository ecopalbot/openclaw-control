-- ═══════════════════════════════════════════════════════════════
-- Migration 002: Multi-Agent Organization
-- Adds: escalation_rules, fx_rates, standup_entries
-- Updates: bmad_agents to support 10 org roles
-- ═══════════════════════════════════════════════════════════════

-- Add escalation rules column
ALTER TABLE bmad_agents ADD COLUMN IF NOT EXISTS escalation_rules JSONB DEFAULT '{}'::jsonb;

-- FX rates for KES conversion
CREATE TABLE IF NOT EXISTS fx_rates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_ccy    TEXT NOT NULL DEFAULT 'USD',
    to_ccy      TEXT NOT NULL DEFAULT 'KES',
    rate        NUMERIC(12,4) NOT NULL,
    source      TEXT NOT NULL DEFAULT 'manual',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fx_date ON fx_rates(from_ccy, to_ccy, created_at DESC);

ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON fx_rates FOR SELECT USING (true);

-- Standup entries
CREATE TABLE IF NOT EXISTS standup_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    UUID REFERENCES bmad_agents(id) ON DELETE SET NULL,
    agent_name  TEXT NOT NULL,
    done        TEXT[] DEFAULT '{}',
    in_progress TEXT[] DEFAULT '{}',
    blockers    TEXT[] DEFAULT '{}',
    risk_flags  TEXT[] DEFAULT '{}',
    standup_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_standup_date ON standup_entries(standup_date DESC);
CREATE INDEX IF NOT EXISTS idx_standup_agent ON standup_entries(agent_id);

ALTER TABLE standup_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON standup_entries FOR SELECT USING (true);

-- Seed initial FX rate (approximate)
INSERT INTO fx_rates (from_ccy, to_ccy, rate, source)
VALUES ('USD', 'KES', 129.50, 'seed');
