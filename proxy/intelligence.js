/**
 * Adaptive Intelligence & Routine Scheduler
 * 
 * Implements: 
 * - Morning Brief (7 AM)
 * - Standup (9 AM)
 * - Evening Recap (8 PM)
 * - Self-Learning / Pattern Detection
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map of rooms/topics to message correctly via CLI
// e.g. discord or telegram targets
const STANDUP_TARGET = "-1003780521793"; // Telegram group where Standup thread is
const EXECUTIVE_TARGET = "-1003780521793"; // thread for exec? Actually, let's use direct agent dispatch.

function dispatchMessage(agentId, messageText) {
  // Uses OpenClaw CLI to run a silent agent turn, simulating an internal trigger
  try {
    const cmd = `export PATH=$PATH:$(npm config get prefix)/bin && openclaw agent --agent ${agentId} --message "${messageText.replace(/"/g, '\\"')}" --json`;
    execSync(cmd, { encoding: 'utf-8' });
  } catch (err) {
    console.error(`Failed to dispatch to ${agentId}:`, err.message);
  }
}

async function runMorningBrief() {
  console.log('--- Running Morning Brief (7 AM) ---');
  // Fetch active tasks, budgets
  const { data: tasks } = await supabase.from('task_state').select('*').in('kanban_column', ['backlog', 'in_progress', 'blocked']);
  
  const brief = `[SYSTEM TRIGGER: MORNING_BRIEF]\n\n` + 
    `Time: 07:00. Daily initialization.\n` +
    `Active Tasks: ${tasks?.length || 0}\n` +
    `Blocked Tasks: ${tasks?.filter(t => t.kanban_column === 'blocked').length || 0}\n\n` +
    `Please prepare the organizational priorities for today.`;
    
  dispatchMessage('executive', brief);
}

async function runStandup() {
  console.log('--- Running Standup (9 AM) ---');
  // Fetch all active agents
  const { data: agents } = await supabase.from('bmad_agents').select('openclaw_agent_id').eq('active', true);
  
  const standupPrompt = `[SYSTEM TRIGGER: DAILY_STANDUP]\n\n` +
    `Time: 09:00. It is time for the daily standup. Please summarize your current progress, blockers, and risks, and post it to the Standup room.`;

  for (const a of agents || []) {
    if (a.openclaw_agent_id !== 'main') {
      dispatchMessage(a.openclaw_agent_id, standupPrompt);
    }
  }
}

async function runEveningRecap() {
  console.log('--- Running Evening Recap (8 PM) ---');
  const today = new Date().toISOString().slice(0, 10);
  
  // Quick summation of token usage
  const { data: usage } = await supabase.from('token_usage')
    .select('cost_usd')
    .gte('created_at', today + 'T00:00:00Z');
    
  const totalCost = (usage || []).reduce((sum, r) => sum + parseFloat(r.cost_usd || 0), 0);

  const recap = `[SYSTEM TRIGGER: EVENING_RECAP]\n\n` +
    `Time: 20:00. End of day protocol.\n` +
    `Organization Cost Today: $${totalCost.toFixed(4)}\n\n` +
    `Please review the day's events in memory, generate lessons learned, and store any new reusable patterns in your vector memory for continuous improvement.`;

  dispatchMessage('main', recap);
  dispatchMessage('main', recap);
}

async function runMidday() {
  console.log('--- Running Midday Cost Check (12 PM) ---');
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase.from('token_usage').select('cost_usd').gte('created_at', today + 'T00:00:00Z');
  const totalCost = (usage || []).reduce((sum, r) => sum + parseFloat(r.cost_usd || 0), 0);
  
  const msg = `[SYSTEM TRIGGER: MIDDAY_COST_CHECK]\n\nTime: 12:00.\nCurrent burn: $${totalCost.toFixed(4)}.\nIf costs are tracking high, trigger optimizing measures internally.`;
  dispatchMessage('executive', msg);
}

async function runPerformance() {
  console.log('--- Running Performance Snapshot (6 PM) ---');
  const { data: agents } = await supabase.from('bmad_agents').select('name, efficiency_score').order('efficiency_score', { ascending: true }).limit(3);
  const bottom = agents?.filter(a => a.efficiency_score < 75).map(a => `${a.name}: ${a.efficiency_score}%`).join(', ');
  
  const msg = `[SYSTEM TRIGGER: PERFORMANCE_SNAPSHOT]\n\nTime: 18:00.\nLowest efficiency scores: ${bottom || 'None below 75%'}.\nPlease evaluate underlying bottlenecks and flag if an agent needs adjustment.`;
  dispatchMessage('executive', msg);
}

const args = process.argv.slice(2);
if (args[0] === 'morning') runMorningBrief();
else if (args[0] === 'standup') runStandup();
else if (args[0] === 'midday') runMidday();
else if (args[0] === 'performance') runPerformance();
else if (args[0] === 'evening') runEveningRecap();
else {
  console.log("Usage: node intelligence.js [morning|standup|midday|performance|evening]");
}
