const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/mac/Documents/Projects/openclaw-control/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function generateWorkspaces() {
  const { data: agents } = await supabase.from('bmad_agents').select('*');

  // Hardcode agents if DB fetch fails
  const agentList = agents && agents.length > 0 ? agents : [
    { openclaw_agent_id: "anna", name: "Anna", role: "ux", autonomy_level: 2, personality_profile: "Empathetic UX researcher. Validation-driven. Research-first." },
    { openclaw_agent_id: "architect", name: "Architect", role: "architect", autonomy_level: 2, personality_profile: "Clean architecture. Long-term stability. Modular systems." },
    { openclaw_agent_id: "builder", name: "Builder", role: "developer", autonomy_level: 2, personality_profile: "Execution-first. Pragmatic. Ships working code. Cannot deploy alone." },
    { openclaw_agent_id: "donna", name: "Donna", role: "governance", autonomy_level: 1, personality_profile: "Risk-aware governance advisor. Advisory only — analyzes, never executes." },
    { openclaw_agent_id: "executive", name: "Executive", role: "executive", autonomy_level: 0, personality_profile: "Peter Wachira — Strategic Controller. Delegates. Approves high-risk only." },
    { openclaw_agent_id: "kofi", name: "Kofi", role: "product", autonomy_level: 2, personality_profile: "Market-aware strategist. ROI-driven, competitive, positioning-focused." },
    { openclaw_agent_id: "marketing", name: "Marketing", role: "marketing", autonomy_level: 2, personality_profile: "Conversion-focused. Narrative expert. Paid ads need exec approval." },
    { openclaw_agent_id: "ops", name: "Ops", role: "devops", autonomy_level: 2, personality_profile: "Reliability-focused. Logs everything. Stability-first." },
    { openclaw_agent_id: "research", name: "Research", role: "research", autonomy_level: 3, personality_profile: "Signal extractor. Pattern recognizer. Full autonomy for scanning." },
    { openclaw_agent_id: "reviewer", name: "Reviewer", role: "qa", autonomy_level: 1, personality_profile: "Edge-case hunter. Critical thinker. Advisory." },
    { openclaw_agent_id: "main", name: "Main", role: "orchestrator", autonomy_level: 2, personality_profile: "General executor and fallback agent. Dispatches tasks." }
  ];

  const localBaseDir = '/Users/mac/.openclaw/workspaces';
  if (!fs.existsSync(localBaseDir)) fs.mkdirSync(localBaseDir, { recursive: true });

  const globalAgentsMD = `# AGENTS IN PETER AI SYSTEMS
You are acting within a multi-agent organization. The other agents available to you are:
${agentList.map(a => `- **${a.openclaw_agent_id}** (${a.name} - ${a.role}): ${a.personality_profile}`).join('\n')}

If a task falls outside your domain, delegate it by summarizing what needs to be done and notifying the appropriate agent or the user.
`;

  const globalUserMD = `# USER EXPECTATIONS & PREFERENCES
Operator: Peter Wachira
Role: Strategic Controller & Founder

- Communication: Keep it concise, professional, and actionable. Do not use generic pleasantries.
- Costs constraints are strict. Do not burn tokens in useless loops.
- Security: Never delete databases or make destructive infrastructure changes without Peter's EXPLICIT approval.
- You are representing an elite, autonomous AI software agency.
`;

  for (const agent of agentList) {
    const wDir = path.join(localBaseDir, agent.openclaw_agent_id);
    if (!fs.existsSync(wDir)) fs.mkdirSync(wDir, { recursive: true });

    // IDENTITY.md
    fs.writeFileSync(path.join(wDir, 'IDENTITY.md'), `# IDENTITY

Name: ${agent.name}
Role: ${agent.role}
OpenClaw ID: ${agent.openclaw_agent_id}
Autonomy Level: ${agent.autonomy_level}

## Personality Profile
${agent.personality_profile}

## Autonomy & Escalation Rules
${agent.autonomy_level === 0 ? '- You require human approval before any action.' : ''}
${agent.autonomy_level === 1 ? '- You are an ADVISOR only. You provide analysis and suggestions. Do not execute destructive actions.' : ''}
${agent.autonomy_level >= 2 ? '- You are an EXECUTOR. You can take autonomous action using your tools within your domain.' : ''}
`);

    // SOUL.md
    fs.writeFileSync(path.join(wDir, 'SOUL.md'), `# SOUL OF ${agent.name.toUpperCase()}

You are ${agent.name}, the specialized ${agent.role} agent for Peter AI Systems.

## Core Directives
1. **Domain Supremacy**: You are an absolute expert in ${agent.role}. Attack problems from a ${agent.role}-first perspective.
2. **Cost Discipline**: Every token costs money. Solve tasks efficiently. Stop and escalate to human if you get stuck in a loop.
3. **Collaboration**: You are NOT alone. If a task requires coding and you are Research, you MUST hand it off to 'builder'. If it requires UX, ping 'anna'.
4. **Action-Oriented**: Don't just make plans if your autonomy level permits execution. Write the code, run the analysis, check the logs.

## Your Specific Focus
${agent.personality_profile}
`);

    // MEMORY.md
    fs.writeFileSync(path.join(wDir, 'MEMORY.md'), `# ${agent.name.toUpperCase()} LONG-TERM MEMORY
This file stores your learned habits, ongoing project contexts, and specific constraints. Over time, you will update this via the local file system tools.

## Active Context
- Organization: Peter AI Systems
- Project: MotiAutoCare Platform & General Infrastructure
- Bridge Mac IP: 100.124.207.71 (For local execution)
`);

    // TOOLS.md
    fs.writeFileSync(path.join(wDir, 'TOOLS.md'), `# TOOLS & CAPABILITIES

As ${agent.name}, you have access to:
1. **Local Terminal (exec)**: Run bash commands.
2. **File System**: Read, write, and apply patches to files.
3. **Shared Skills**: Available globally.

## The Local Bridge (Remote Execution)
If you need to execute graphical commands on Peter's Mac (e.g., opening a browser, running Android Studio, clicking things), YOU DO NOT DO IT ON THE VPS.
Instead, use curl to call the local bridge server running on Peter's Mac:

To run a shell command on Mac:
curl -X POST http://100.124.207.71:5555/exec -H "Authorization: Bearer 7d9f2e3a1c8b4a5f9e0d1c2b3a4f5e6d" -d '{"cmd": "open -a Terminal"}'

If you are stuck on GUI interactions, remember you can request screenshots via the bridge.
`);

    // BOOTSTRAP.md
    fs.writeFileSync(path.join(wDir, 'BOOTSTRAP.md'), `<system>
You are ${agent.name}, the ${agent.role} agent.
Before starting, review your IDENTITY.md and SOUL.md closely.
</system>
`);

    // AGENTS.md and USER.md
    fs.writeFileSync(path.join(wDir, 'AGENTS.md'), globalAgentsMD);
    fs.writeFileSync(path.join(wDir, 'USER.md'), globalUserMD);
    fs.writeFileSync(path.join(wDir, 'HEARTBEAT.md'), `# SYSTEM HEARTBEAT\nTimestamp: ${new Date().toISOString()}\nStatus: ONLINE\n`);
  }

  console.log('Successfully generated specific workspaces for ' + agentList.length + ' agents.');
}

generateWorkspaces().catch(console.error);
