-- ═══════════════════════════════════════════════════════════════
-- Migration 003: Interactive Kanban + Market Intelligence
-- ═══════════════════════════════════════════════════════════════

-- Kanban columns on task_state
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS kanban_column TEXT NOT NULL DEFAULT 'backlog'
  CHECK (kanban_column IN ('backlog','in_progress','review','blocked','done'));
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES bmad_agents(id) ON DELETE SET NULL;
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS escalation_status TEXT DEFAULT NULL;
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS budget_consumed NUMERIC(10,6) NOT NULL DEFAULT 0;
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100);
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS estimated_completion TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS subtasks JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_task_kanban ON task_state(kanban_column);
CREATE INDEX IF NOT EXISTS idx_task_agent ON task_state(assigned_agent_id);

-- Opportunity briefs for market intelligence
CREATE TABLE IF NOT EXISTS opportunity_briefs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    industry        TEXT NOT NULL,
    market_demand   INTEGER NOT NULL DEFAULT 0 CHECK (market_demand BETWEEN 0 AND 100),
    monetization    INTEGER NOT NULL DEFAULT 0 CHECK (monetization BETWEEN 0 AND 100),
    complexity      INTEGER NOT NULL DEFAULT 0 CHECK (complexity BETWEEN 0 AND 100),
    alignment       INTEGER NOT NULL DEFAULT 0 CHECK (alignment BETWEEN 0 AND 100),
    score           NUMERIC(5,2) GENERATED ALWAYS AS (
      (market_demand * 0.30 + monetization * 0.25 + (100 - complexity) * 0.25 + alignment * 0.20)
    ) STORED,
    sources         JSONB DEFAULT '[]'::jsonb,
    summary         TEXT NOT NULL DEFAULT '',
    created_by      UUID REFERENCES bmad_agents(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','approved','rejected')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE opportunity_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_briefs" ON opportunity_briefs FOR SELECT USING (true);

-- Slash command log
CREATE TABLE IF NOT EXISTS command_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command         TEXT NOT NULL,
    args            TEXT DEFAULT '',
    triggered_by    TEXT NOT NULL DEFAULT 'telegram',
    primary_agent   TEXT NOT NULL,
    supporting_agents TEXT[] DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','failed')),
    result_summary  TEXT DEFAULT '',
    cost_usd        NUMERIC(10,6) DEFAULT 0,
    tokens_used     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ DEFAULT NULL
);

ALTER TABLE command_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_commands" ON command_log FOR SELECT USING (true);
