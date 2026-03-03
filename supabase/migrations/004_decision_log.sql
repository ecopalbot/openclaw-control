-- ═══════════════════════════════════════════════════════════════
-- Migration 004: Self-Optimizing Autonomy (Decision Logs & Scoring)
-- ═══════════════════════════════════════════════════════════════

-- Decision Audit Log
CREATE TABLE IF NOT EXISTS decision_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id        UUID REFERENCES bmad_agents(id) ON DELETE SET NULL,
    action          TEXT NOT NULL CHECK (action IN ('model_switch', 'budget_trigger', 'escalation', 'session_spawn', 'repo_merge', 'infra_change', 'policy_violation')),
    reason          TEXT NOT NULL,
    details         JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS & Policies
ALTER TABLE decision_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_write_decision" ON decision_log FOR ALL USING (true);
CREATE POLICY "anon_read_decision" ON decision_log FOR SELECT USING (true);

-- Extension to bmad_agents for Performance Scoring
ALTER TABLE bmad_agents ADD COLUMN IF NOT EXISTS efficiency_score NUMERIC(5,2) DEFAULT 100.00;
ALTER TABLE bmad_agents ADD COLUMN IF NOT EXISTS tasks_completed INTEGER DEFAULT 0;
ALTER TABLE bmad_agents ADD COLUMN IF NOT EXISTS tasks_failed INTEGER DEFAULT 0;
ALTER TABLE bmad_agents ADD COLUMN IF NOT EXISTS escalation_count INTEGER DEFAULT 0;

-- Extension to task_state for Outcome Scoring
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS completion_time_seconds INTEGER DEFAULT 0;
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS roi_potential INTEGER DEFAULT 0 CHECK (roi_potential BETWEEN 0 AND 100);
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS lessons_learned TEXT DEFAULT '';
ALTER TABLE task_state ADD COLUMN IF NOT EXISTS final_outcome TEXT CHECK (final_outcome IN ('success', 'partial', 'failed'));
