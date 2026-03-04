/**
 * ═══════════════════════════════════════════════════════════════
 * Task Router — Hybrid Architecture
 *
 * Decides whether a task requires the Mac's GUI or can run on
 * the VPS, then routes to the correct OpenClaw installation.
 *
 * VPS (Ears/Brain) → Task Router → Mac (Hands/Eyes)
 *                                → VPS (Text-only tasks)
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { expandInstruction } = require('./semantic');

const MAC_TAILSCALE_IP = process.env.MAC_TAILSCALE_IP || '100.124.207.71';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
const OPENCLAW_BIN = '/home/droid/.npm-global/bin/openclaw';

// Keywords that indicate a task needs the Mac's GUI
const GUI_KEYWORDS = [
  'screenshot', 'screen', 'capture', 'open app', 'open application',
  'android studio', 'vscode', 'visual studio', 'xcode',
  'browser', 'chrome', 'safari', 'firefox', 'opera',
  'click', 'type', 'mouse', 'keyboard', 'gui',
  'poster', 'design', 'image', 'edit photo', 'edit image',
  'discord', 'telegram app', 'slack app', 'zoom',
  'desktop', 'window', 'finder', 'dock', 'macbook',
  'what is on my screen', 'what do you see', 'look at',
  'describe my screen', 'show me', 'watch',
  'android', 'ios', 'simulator', 'emulator', 'phone',
  'inspect', 'visually', 'visual', 'ui', 'ux',
  'documents', 'downloads', 'projects', 'terminal',
  'login', 'sign in', 'navigate to', '.com', '.io', '.net', 'http'
];

const VPS_KEYWORDS = [
  'research', 'search', 'find info', 'summarize', 'read the news',
  'email', 'draft', 'write', 'compose', 'blog',
  'analyze', 'calculate', 'compare', 'math',
  'status', 'report', 'brief', 'briefing',
  'task list', 'standup', 'checklist', 'plan',
  'architecture', 'governance', 'policy'
];

/**
 * Classify whether a message needs Mac GUI or can run on VPS.
 * @param {string} message - The user's message
 * @returns {'mac' | 'vps'} - Target execution environment
 */
function classifyTask(message) {
  const lower = message.toLowerCase();
  
  // Check for explicit GUI keywords
  for (const keyword of GUI_KEYWORDS) {
    if (lower.includes(keyword)) {
      return 'mac';
    }
  }
  
  // Check for VPS-only keywords
  for (const keyword of VPS_KEYWORDS) {
    if (lower.includes(keyword)) {
      return 'vps';
    }
  }
  
  // Default: run on VPS (cheaper, no GUI overhead)
  return 'vps';
}

/**
 * Detect filenames in a message and sync them from VPS to Mac workspace.
 * @param {string} message 
 */
async function syncFilesToMac(message) {
  // Regex to find things like "incoming_tg.jpg" or "project.js"
  const matches = message.match(/[a-zA-Z0-9_\-]+\.(jpg|png|pdf|txt|md|js|py|json|ogg|mp3)/g) || [];
  const WSPACE = path.resolve(__dirname, '../workspace');

  for (const filename of matches) {
    const localPath = path.join(WSPACE, filename);
    if (fs.existsSync(localPath)) {
      console.log(`[router] Syncing ${filename} to Mac...`);
      try {
        const content = fs.readFileSync(localPath, { encoding: 'base64' });
        await fetch(`http://${MAC_TAILSCALE_IP}:5555/fs/write`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BRIDGE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ filename, content, encoding: 'base64' })
        });
      } catch (err) {
        console.warn(`[router] Sync failed for ${filename}:`, err.message);
      }
    }
  }
}

/**
 * Execute a task on the local Mac via the Bridge over Tailscale.
 * @param {string} agent - Agent ID
 * @param {string} message - Task message
 * @returns {Promise<{output: string, exitCode: number}>}
 */
async function executeOnMac(agent, message) {
  try {
    // 1. Pre-sync any files mentioned in the prompt
    await syncFilesToMac(message);

    const url = `http://${MAC_TAILSCALE_IP}:5555/agent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BRIDGE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message, agent }),
      signal: AbortSignal.timeout(300000)
    });

    if (!response.ok) {
      const text = await response.text();
      return { output: `Bridge error (${response.status}): ${text}`, exitCode: response.status };
    }

    const data = await response.json();
    return { 
      output: data.stdout || data.error || 'Execution finished.', 
      exitCode: data.ok ? 0 : 1 
    };
  } catch (err) {
    return {
      output: `Connection failure to Mac: ${err.message}`,
      exitCode: 1
    };
  }
}


/**
 * Execute a task on the VPS using the local OpenClaw installation.
 * @param {string} agent - Agent ID
 * @param {string} message - Task message
 * @returns {Promise<{output: string, exitCode: number}>}
 */
async function executeOnVps(agent, message) {
  const { execSync } = require('child_process');
  
  const escapedMsg = message.replace(/'/g, "'\\''");
  const cmd = `${OPENCLAW_BIN} agent --agent ${agent} --message '${escapedMsg}'`;
  
  try {
    const output = execSync(cmd, {
      timeout: 120000,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 5
    });
    return { output: output.trim(), exitCode: 0 };
  } catch (err) {
    return {
      output: err.stdout ? err.stdout.trim() : err.message,
      exitCode: err.status || 1
    };
  }
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Log task to Supabase Mission Control.
 */
async function logTaskToSupabase(agent, message, target) {
  try {
    const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
    await supabase.from('task_state').insert({
      organization_id: org?.id,
      title: message.substring(0, 100),
      assigned_agent_id: null, // We'll look up UUID later if needed
      kanban_column: 'in_progress',
      status: 'in_progress',
      metadata: { target, agent_name: agent },
      last_activity: new Date().toISOString()
    });
  } catch (err) {
    console.warn('[task-router] Supabase logging failed:', err.message);
  }
}

/**
 * Route and execute a task.
 * @param {string} agent - Agent ID
 * @param {string} message - Task message
 * @returns {Promise<{target: string, output: string, exitCode: number}>}
 */
async function routeAndExecute(agent, message) {
  let target = classifyTask(message);
  
  // Safeguard: Allow manual override in prompt to save tokens
  const lower = message.toLowerCase();
  
  // 1. Technical flags (--mode text/gui)
  if (message.includes('--mode text')) {
    target = 'vps';
    message = message.replace('--mode text', '').trim();
  } else if (message.includes('--mode gui')) {
    target = 'mac';
    message = message.replace('--mode gui', '').trim();
  } 
  // 2. Voice-friendly semantic cues ("use ui", "use text")
  else if (lower.endsWith('use text') || lower.endsWith('using text')) {
    target = 'vps';
    message = message.replace(/use(ing)? text/gi, '').trim();
  } else if (lower.endsWith('use ui') || lower.endsWith('use gui') || lower.endsWith('using gui')) {
    target = 'mac';
    message = message.replace(/use(ing)? (ui|gui)/gi, '').trim();
  }
  
  // SYNC: Log the task to Mission Control so it updates the UI immediately
  await logTaskToSupabase(agent, message, target);

  // Expand instruction semantically (Attach memory + Native prompts)
  const expandedMessage = await expandInstruction(message, target);
  
  console.log(`[task-router] Routing to ${target.toUpperCase()} | Agent: ${agent} | Message: "${message.substring(0, 60)}..."`);
  
  let result;
  if (target === 'mac') {
    result = await executeOnMac(agent, expandedMessage);
  } else {
    result = await executeOnVps(agent, expandedMessage);
  }
  
  return { target, ...result };
}

module.exports = {
  classifyTask,
  executeOnMac,
  executeOnVps,
  routeAndExecute
};

// CLI mode: node task-router.js <agent> <message>
if (require.main === module) {
  const agent = process.argv[2] || 'main';
  const message = process.argv[3] || 'Hello';
  
  routeAndExecute(agent, message).then(result => {
    console.log(`\n[Result] Target: ${result.target} | Exit: ${result.exitCode}`);
    console.log(result.output);
  }).catch(err => {
    console.error('[task-router] Fatal:', err);
    process.exit(1);
  });
}
