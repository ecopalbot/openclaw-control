/**
 * Organization Sync Service — Pulls bmad_agents from Supabase -> ORG_SNAPSHOT.json
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// We need to write this to the main agent's workspace
// Since we are running on VPS, we'll write to ~/.openclaw/workspaces/main/ORG_SNAPSHOT.json
const MAIN_WORKSPACE_PATH = process.env.MAIN_WORKSPACE_PATH || path.join(require('os').homedir(), '.openclaw', 'workspaces', 'main');

async function syncOrgSnapshot() {
  console.log('Fetching active agents from Supabase...');
  const { data: agents, error } = await supabase
    .from('bmad_agents')
    .select('openclaw_agent_id, name, role, autonomy_level, daily_token_limit, task_token_limit, escalation_rules')
    .eq('active', true);

  if (error) {
    console.error('Failed to fetch agents:', error);
    return;
  }

  const snapshot = {
    updated_at: new Date().toISOString(),
    total_agents: agents.length,
    agents: agents.map(a => ({
      id: a.openclaw_agent_id,
      name: a.name,
      role: a.role,
      autonomy_tier: `L${a.autonomy_level}`,
      limits: {
        daily_tokens: a.daily_token_limit,
        task_tokens: a.task_token_limit
      },
      escalation_rules: a.escalation_rules || {}
    }))
  };

  const snapshotPath = path.join(MAIN_WORKSPACE_PATH, 'ORG_SNAPSHOT.json');
  
  try {
    if (!fs.existsSync(MAIN_WORKSPACE_PATH)) {
      // Local testing or not setup yet, just fall back
      console.log(`Workspace path not found: ${MAIN_WORKSPACE_PATH}. Make sure run on VPS or folder exists.`);
    } else {
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
      console.log(`Saved ORG_SNAPSHOT.json with ${agents.length} agents to ${snapshotPath}`);
    }
  } catch (err) {
    console.error('Failed to write ORG_SNAPSHOT.json:', err);
  }
}

if (require.main === module) {
  syncOrgSnapshot().catch(console.error);
}

module.exports = { syncOrgSnapshot };
