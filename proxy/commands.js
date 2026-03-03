/**
 * Slash Command Handler — Routes commands to agents
 * 
 * Commands:
 *   /brainstorm <topic>     → kofi + architect + anna
 *   /scan-market <industry> → research + kofi + marketing
 *   /new-project <idea>     → architect + builder + reviewer
 *   /analyze-repo <url>     → architect + reviewer + builder
 *   /continue-project <repo>→ builder + reviewer
 *   /ship-feature <branch>  → ops + reviewer → executive
 *   /scan-kenya <industry>  → research + kofi + marketing
 *   /trend-report           → research
 *   /opportunity-brief      → research + kofi + marketing
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const COMMANDS = {
  '/brainstorm': {
    primary: 'kofi',
    supporting: ['architect', 'anna'],
    description: 'Brainstorm and ideate on a topic',
    requiresExec: false,
  },
  '/scan-market': {
    primary: 'research',
    supporting: ['kofi', 'marketing'],
    description: 'Scan market for opportunities in an industry',
    requiresExec: false,
  },
  '/new-project': {
    primary: 'architect',
    supporting: ['builder', 'reviewer'],
    description: 'Start a new project from idea',
    requiresExec: false,
  },
  '/analyze-repo': {
    primary: 'architect',
    supporting: ['reviewer', 'builder'],
    description: 'Analyze a repository for architecture and quality',
    requiresExec: false,
  },
  '/continue-project': {
    primary: 'builder',
    supporting: ['reviewer'],
    description: 'Continue work on an existing project',
    requiresExec: false,
  },
  '/ship-feature': {
    primary: 'ops',
    supporting: ['reviewer'],
    description: 'Ship a feature branch to production',
    requiresExec: true, // needs executive approval
  },
  '/scan-kenya': {
    primary: 'research',
    supporting: ['kofi', 'marketing'],
    description: 'Scan Kenya market for opportunities',
    requiresExec: false,
  },
  '/trend-report': {
    primary: 'research',
    supporting: [],
    description: 'Generate current trend report',
    requiresExec: false,
  },
  '/opportunity-brief': {
    primary: 'research',
    supporting: ['kofi', 'marketing'],
    description: 'Generate scored opportunity brief',
    requiresExec: false,
  },
};

/**
 * Parse and route a slash command
 * @param {string} message - Raw message text
 * @param {string} source - 'telegram' | 'chat' | 'standup'
 * @returns {object|null} - Command routing info or null
 */
function parseCommand(message, source = 'telegram') {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  if (!COMMANDS[cmd]) return null;

  const spec = COMMANDS[cmd];
  return {
    command: cmd,
    args,
    primary: spec.primary,
    supporting: spec.supporting,
    description: spec.description,
    requiresExec: spec.requiresExec,
    source,
  };
}

/**
 * Log command execution to Supabase
 */
async function logCommand(parsed, status = 'pending') {
  const { data, error } = await supabase.from('command_log').insert({
    command: parsed.command,
    args: parsed.args,
    triggered_by: parsed.source,
    primary_agent: parsed.primary,
    supporting_agents: parsed.supporting,
    status,
  }).select().single();
  return data;
}

/**
 * Update command status
 */
async function updateCommand(id, updates) {
  await supabase.from('command_log').update(updates).eq('id', id);
}

/**
 * Build agent prompt for a command
 */
function buildPrompt(parsed) {
  const agentList = [parsed.primary, ...parsed.supporting].join(', ');
  let prompt = `[COMMAND: ${parsed.command}]\n`;
  prompt += `Topic: ${parsed.args}\n`;
  prompt += `Agents: ${agentList}\n`;
  prompt += `You are the primary agent (${parsed.primary}).`;

  if (parsed.command === '/scan-kenya') {
    prompt += `\nFocus: Kenya market. Scan Reddit, X, Google Trends for industry: "${parsed.args}".`;
    prompt += `\nDeliver: Pain points, opportunity ranking, traffic estimates, monetization paths.`;
  } else if (parsed.command === '/opportunity-brief') {
    prompt += `\nDeliver: Scored brief with market_demand, monetization, complexity, alignment (0-100 each).`;
  } else if (parsed.command === '/brainstorm') {
    prompt += `\nUse brainstorm skill. Generate diverse ideas. No filtering yet.`;
  } else if (parsed.command === '/ship-feature') {
    prompt += `\n⚠️ REQUIRES EXECUTIVE APPROVAL before deployment.`;
  }

  return prompt;
}

/**
 * Get list of available commands
 */
function getCommandList() {
  return Object.entries(COMMANDS).map(([cmd, spec]) => ({
    command: cmd,
    description: spec.description,
    primary: spec.primary,
    supporting: spec.supporting,
    requiresExec: spec.requiresExec,
  }));
}

module.exports = {
  parseCommand,
  logCommand,
  updateCommand,
  buildPrompt,
  getCommandList,
  COMMANDS,
};
