-- ═══════════════════════════════════════════════════════════════
-- Migration 007: Semantic Vector Memory (The Learning Brain)
-- ═══════════════════════════════════════════════════════════════

-- 1. Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the Knowledge Base table
CREATE TABLE IF NOT EXISTS agent_knowledge_base (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content         TEXT NOT NULL,                       -- The "Lesson Learned" or "Solution"
    slug            TEXT UNIQUE,                         -- Technical key for direct reference (e.g. 'android-studio-launch-fix')
    embedding       VECTOR(1536),                        -- Semantic coordinates (OpenAI 1536-dim)
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { "agent": "ops", "tool": "playwright", "tags": ["fix", "browser"] }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding ON agent_knowledge_base 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. Vector Search Function
CREATE OR REPLACE FUNCTION match_knowledge (
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  slug TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    agent_knowledge_base.id,
    agent_knowledge_base.content,
    agent_knowledge_base.slug,
    agent_knowledge_base.metadata,
    1 - (agent_knowledge_base.embedding <=> query_embedding) AS similarity
  FROM agent_knowledge_base
  WHERE 1 - (agent_knowledge_base.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- 5. Permissions
ALTER TABLE agent_knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_knowledge" ON agent_knowledge_base FOR ALL USING (true);
CREATE POLICY "anon_read_knowledge" ON agent_knowledge_base FOR SELECT USING (true);
