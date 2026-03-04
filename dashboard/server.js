/**
 * BMAD Dashboard Server v2 — Multi-Agent Organization
 * 
 * API routes for 10-agent autonomous org with KES currency,
 * standup system, and escalation governance.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const HOST = process.env.DASHBOARD_HOST || '0.0.0.0';
const PORT = process.env.DASHBOARD_PORT || 3001;

// ── Org ──
app.get('/api/org', async (req, res) => {
  const { data } = await supabase.from('organizations').select('*').limit(1).single();
  const org = data || { name: 'Mission Control', owner_identity: 'Peter Wachira' };
  res.json({ ...org, name: 'Mission Control' }); // Enforce Mission Control naming
});

// ── Learned Skills (Vector Memory) ──
app.get('/api/knowledge', async (req, res) => {
  const { data } = await supabase.from('agent_knowledge_base')
    .select('id, content, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  res.json(data || []);
});

// ── Documentation ──
app.get('/api/docs', async (req, res) => {
  const fs = require('fs');
  const docsDir = path.resolve(__dirname, '../workspace');
  try {
    const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
    const contents = files.map(f => ({
      name: f,
      content: fs.readFileSync(path.join(docsDir, f), 'utf8')
    }));
    res.json(contents);
  } catch (e) {
    res.json([]);
  }
});

// ── Agents ──
app.get('/api/agents', async (req, res) => {
  const { data } = await supabase.from('bmad_agents').select('*').order('name');
  res.json(data || []);
});

app.put('/api/agents/:id', async (req, res) => {
  const allowed = ['personality_profile', 'autonomy_level', 'daily_token_limit', 'task_token_limit', 'active', 'escalation_rules'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  const { data, error } = await supabase.from('bmad_agents').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  // Audit
  await supabase.from('audit_log').insert({ action: 'agent_update', entity_type: 'bmad_agents', entity_id: req.params.id, changes: updates, actor: 'dashboard' });
  res.json(data);
});

// ── FX Rate ──
app.get('/api/fx-rate', async (req, res) => {
  const { data } = await supabase.from('fx_rates').select('*').eq('from_ccy', 'USD').eq('to_ccy', 'KES').order('created_at', { ascending: false }).limit(1).single();
  res.json(data || { rate: 129.50 });
});

// ── Cost ──
app.get('/api/cost/today', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from('token_usage')
    .select('cost_usd, total_tokens')
    .gte('created_at', today + 'T00:00:00Z');
  const total_cost = (data || []).reduce((s, r) => s + parseFloat(r.cost_usd || 0), 0);
  const total_tokens = (data || []).reduce((s, r) => s + (r.total_tokens || 0), 0);
  res.json({ total_cost: total_cost.toFixed(6), total_tokens, call_count: (data || []).length });
});

app.get('/api/cost/by-agent', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from('token_usage')
    .select('agent_id, cost_usd, total_tokens, bmad_agents(name)')
    .gte('created_at', today + 'T00:00:00Z');
  // Group by agent
  const byAgent = {};
  for (const r of (data || [])) {
    const name = r.bmad_agents?.name || 'unknown';
    if (!byAgent[name]) byAgent[name] = { tokens: 0, cost: 0 };
    byAgent[name].tokens += r.total_tokens || 0;
    byAgent[name].cost += parseFloat(r.cost_usd || 0);
  }
  res.json(byAgent);
});

// ── Predictive Cost Engine ──
app.get('/api/cost/projection', async (req, res) => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: usage } = await supabase.from('token_usage')
    .select('cost_usd, total_tokens')
    .gte('created_at', yesterday);
  
  const cost_24h = (usage || []).reduce((s, r) => s + parseFloat(r.cost_usd || 0), 0);
  const tokens_24h = (usage || []).reduce((s, r) => s + (r.total_tokens || 0), 0);
  
  const cost_per_hour = cost_24h / 24;
  const tokens_per_hour = Math.round(tokens_24h / 24);
  
  const proj_7d = cost_24h * 7;
  const proj_30d = cost_24h * 30;

  const { data: settings } = await supabase.from('organization_settings').select('daily_spend_limit').limit(1).single();
  const daily_budget = settings?.daily_spend_limit || 25;
  const usage_pct = (cost_24h / daily_budget) * 100;

  res.json({
    cost_per_hour: cost_per_hour.toFixed(4),
    tokens_per_hour,
    proj_7d: proj_7d.toFixed(2),
    proj_30d: proj_30d.toFixed(2),
    usage_pct: usage_pct.toFixed(1)
  });
});

app.get('/api/cost/decisions', async (req, res) => {
  const { data } = await supabase.from('decision_log')
    .select('*, bmad_agents(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  res.json((data || []).map(d => ({ ...d, agent_name: d.bmad_agents?.name })));
});

// ── Agent Efficiency ──
app.get('/api/agents/efficiency', async (req, res) => {
  const { data } = await supabase.from('bmad_agents')
    .select('id, name, openclaw_agent_id, efficiency_score, tasks_completed, tasks_failed, escalation_count')
    .order('efficiency_score', { ascending: false });
  res.json(data || []);
});

// ── Tasks ──
app.get('/api/tasks', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  
  let query = supabase.from('task_state')
    .select('*, agent:bmad_agents!task_state_agent_id_fkey(name), assigned:bmad_agents!task_state_assigned_agent_id_fkey(name)')
    .order('last_activity', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
    
  if (req.query.agent_id) query = query.or(`agent_id.eq.${req.query.agent_id},assigned_agent_id.eq.${req.query.agent_id}`);
  if (req.query.status) query = query.eq('status', req.query.status);
  if (req.query.search) query = query.ilike('title', `%${req.query.search}%`);

  const { data } = await query;
  res.json((data || []).map(t => ({ 
    ...t, 
    agent_name: t.assigned?.name || t.agent?.name || 'System' 
  })));
});

app.patch('/api/tasks/:id/status', async (req, res) => {
  const { status } = req.body;
  const updates = { status, last_activity: new Date().toISOString() };
  if (status === 'completed') updates.progress_pct = 100;
  
  const { data, error } = await supabase.from('task_state')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
    
  if (error) return res.status(400).json({ error: error.message });
  await supabase.from('audit_log').insert({ action: 'task_status_change', entity_type: 'task_state', entity_id: req.params.id, changes: updates, actor: 'dashboard' });
  res.json(data);
});

// ── Standup ──
app.get('/api/standup', async (req, res) => {
  const { data } = await supabase.from('standup_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);
  res.json(data || []);
});

// ── System Health ──
app.get('/api/system/health', async (req, res) => {
  const { data } = await supabase.from('system_metrics')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(15);
    
  const sys = { cpu: '—', memory: '—', disk: '—' };
  if (data && data.length > 0) {
    const cpu = data.find(d => d.metric_type === 'cpu_load');
    const mem = data.find(d => d.metric_type === 'memory_pct');
    const disk = data.find(d => d.metric_type === 'disk_pct');
    if (cpu) sys.cpu = `${cpu.value_numeric}`;
    if (mem) sys.memory = `${mem.value_numeric}%`;
    if (disk) sys.disk = `${disk.value_numeric}%`;
  }
  res.json(sys);
});

// ── Kanban (task drag-and-drop) ──
app.patch('/api/tasks/:id/column', async (req, res) => {
  const { kanban_column, progress_pct } = req.body;
  const updates = { kanban_column, last_activity: new Date().toISOString() };
  if (progress_pct !== undefined) updates.progress_pct = progress_pct;
  if (kanban_column === 'done') updates.progress_pct = 100;
  const { data, error } = await supabase.from('task_state').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await supabase.from('audit_log').insert({ action: 'kanban_move', entity_type: 'task_state', entity_id: req.params.id, changes: updates, actor: 'dashboard' });
  res.json(data);
});

app.post('/api/tasks', async (req, res) => {
  const { title, description, assigned_agent_id, kanban_column } = req.body;
  const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
  
  let agentIdUuid = null;
  if (assigned_agent_id) {
     if (/^[0-9a-f]{8}-/.test(assigned_agent_id)) {
       agentIdUuid = assigned_agent_id;
     } else {
       const { data: agent } = await supabase.from('bmad_agents').select('id').or(`name.ilike.${assigned_agent_id},openclaw_agent_id.ilike.${assigned_agent_id}`).limit(1).single();
       if (agent) agentIdUuid = agent.id;
     }
  }

  const { data, error } = await supabase.from('task_state').insert({
    organization_id: org?.id,
    title,
    agent_id: agentIdUuid,
    kanban_column: kanban_column || 'backlog',
    status: 'in_progress',
    checkpoint: { description: description || '' }
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── Commands ──
app.get('/api/commands', async (req, res) => {
  const { data } = await supabase.from('command_log').select('*').order('created_at', { ascending: false }).limit(50);
  res.json(data || []);
});

app.get('/api/commands/available', (req, res) => {
  const { getCommandList } = require('../proxy/commands');
  res.json(getCommandList());
});

// ── Opportunity Briefs ──
app.get('/api/briefs', async (req, res) => {
  const { data } = await supabase.from('opportunity_briefs').select('*, bmad_agents(name)').order('score', { ascending: false }).limit(30);
  res.json(data || []);
});

// ── Rooms ──
app.get('/api/rooms', async (req, res) => {
  const rooms = [
    { id: 'executive', name: 'Executive', agents: ['executive'] },
    { id: 'product', name: 'Product', agents: ['kofi'] },
    { id: 'ux', name: 'UX', agents: ['anna'] },
    { id: 'governance', name: 'Governance', agents: ['donna'] },
    { id: 'architecture', name: 'Architecture', agents: ['architect'] },
    { id: 'engineering', name: 'Engineering', agents: ['builder'] },
    { id: 'ops', name: 'Ops', agents: ['ops'] },
    { id: 'qa', name: 'QA', agents: ['reviewer'] },
    { id: 'marketing', name: 'Marketing', agents: ['marketing'] },
    { id: 'research', name: 'Research', agents: ['research'] },
    { id: 'standup', name: 'Standup', agents: ['all'] },
  ];
  // Get recent activity per agent
  const { data: agents } = await supabase.from('bmad_agents').select('openclaw_agent_id, name, active');
  const agentMap = {};
  for (const a of (agents || [])) agentMap[a.openclaw_agent_id] = a;
  res.json(rooms.map(r => ({
    ...r,
    agentDetails: r.agents.map(a => agentMap[a] || { name: a, active: true }),
  })));
});

app.get('/api/rooms/:id/messages', async (req, res) => {
  const { data } = await supabase.from('room_messages')
    .select('*')
    .eq('room_id', req.params.id)
    .order('created_at', { ascending: true })
    .limit(100);
  res.json(data || []);
});

app.post('/api/rooms/:id/messages', async (req, res) => {
  const { sender, message } = req.body;
  const { data, error } = await supabase.from('room_messages').insert({
    room_id: req.params.id,
    sender: sender || 'Executive',
    message
  }).select().single();
  
  if (error) {
    // Graceful fallback for demo if table doesn't exist yet
    if (error.code === '42P01') return res.json({ id: Date.now(), room_id: req.params.id, sender, message, created_at: new Date() });
    return res.status(400).json({ error: error.message });
  }
  res.json(data);

  // Background dispatch if human sent it
  if (sender !== 'System' && !sender.endsWith('(Agent)')) {
    const { exec } = require('child_process');
    const targetAgentMap = {
      'executive': 'main', 'product': 'kofi', 'ux': 'anna', 'governance': 'donna',
      'architecture': 'architect', 'engineering': 'builder', 'ops': 'ops',
      'qa': 'reviewer', 'marketing': 'marketing', 'research': 'research', 'standup': 'main'
    };
    const agent = targetAgentMap[req.params.id] || 'main';
    const cmd = `export PATH=$PATH:$(npm config get prefix)/bin && openclaw agent --agent ${agent} --message "[IN ROOM ${req.params.id}]: ${message.replace(/"/g, '\\"')}"`;
    
    exec(cmd, async (err, stdout) => {
       if (!err && stdout) {
         // Openclaw outputs progress; we'll take the last line or generic success
         const lines = stdout.trim().split('\n').filter(l => l.trim().length > 0);
         const reply = lines.length > 0 ? lines[lines.length - 1] : 'Understood and processed.';
         
         // Clean output of ansi codes just in case
         const finalReply = reply.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

         await supabase.from('room_messages').insert({
           room_id: req.params.id,
           sender: `${agent} (Agent)`,
           message: finalReply
         });
       }
    });
  }
});

// ── Skills Registry ──
app.get('/api/skills', async (req, res) => {
  const fs = require('fs');
  const skillsDir = '/home/droid/.openclaw/workspace/skills';
  try {
    const skills = fs.readdirSync(skillsDir).filter(f => fs.statSync(`${skillsDir}/${f}`).isDirectory());
    res.json(skills.map(s => ({ name: s, installed: true })));
  } catch (e) {
    res.json([]);
  }
});

app.listen(PORT, HOST, () => {
  console.log(`BMAD Dashboard v3 listening on http://${HOST}:${PORT}`);
});
