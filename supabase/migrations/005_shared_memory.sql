-- ═══════════════════════════════════════════════════════════════
-- Migration 005: Collective Brain (Shared Memory & Fact Storage)
-- ═══════════════════════════════════════════════════════════════

-- Shared high-level facts for common visibility across all agents
CREATE TABLE IF NOT EXISTS collective_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             TEXT UNIQUE NOT NULL,
    value           JSONB NOT NULL DEFAULT '{}'::jsonb,
    category        TEXT NOT NULL DEFAULT 'general', -- e.g. 'infrastructure', 'security', 'identity', 'discovery'
    agent_id        UUID REFERENCES bmad_agents(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by key
CREATE INDEX IF NOT EXISTS idx_memory_key ON collective_memory(key);
CREATE INDEX IF NOT EXISTS idx_memory_category ON collective_memory(category);

-- Enable RLS
ALTER TABLE collective_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_write_memory" ON collective_memory FOR ALL USING (true);
CREATE POLICY "anon_read_memory" ON collective_memory FOR SELECT USING (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_collective_memory_modtime
    BEFORE UPDATE ON collective_memory
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- Populate with some initial "Common Visibility" facts
INSERT INTO collective_memory (key, category, value) VALUES 
('github_identity', 'identity', '{"user": "ecopalbot", "author": "Peter Wachira", "auth_method": "SSH"}'),
('system_vitals', 'infrastructure', '{"vps_ip": "100.92.21.72", "dashboard_port": 3001, "gateway_port": 18789}'),
('execution_policy', 'governance', '{"root_dir": "/home/droid/projects/", "allow_main_push": false, "require_pr": true}')
ON CONFLICT (key) DO NOTHING;
