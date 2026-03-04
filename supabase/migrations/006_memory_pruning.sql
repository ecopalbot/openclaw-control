-- ═══════════════════════════════════════════════════════════════
-- Migration 006: Tiered Memory & Auto-Pruning
-- ═══════════════════════════════════════════════════════════════

-- Add expiration and importance to collective memory
ALTER TABLE collective_memory ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE collective_memory ADD COLUMN IF NOT EXISTS importance_level INTEGER DEFAULT 1 CHECK (importance_level BETWEEN 0 AND 3); -- 3 = CORE, 0 = TEMP

-- Create a view for "Active Brain" (ignoring expired facts)
CREATE OR REPLACE VIEW active_collective_memory AS
SELECT * FROM collective_memory 
WHERE (expires_at IS NULL OR expires_at > now());

-- Initial cleanup of messy tasks: set those cancelled tasks to be archived or removed if very old
-- (Optional, but helps with the board clutter)
UPDATE task_state SET status = 'completed', kanban_column = 'done' 
WHERE status = 'cancelled' AND created_at < (now() - interval '24 hours');
