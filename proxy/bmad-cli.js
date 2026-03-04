#!/usr/bin/env node
/**
 * BMAD Collective Intelligence CLI — bmad-cli.js
 * 
 * Provides agents with tools for:
 * 1. Shared Memory & Key-Fact storage (resolving fragmented memory)
 * 2. Task Tracking & Dashboard synchronization (showing progress on port 3001)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const [,, cmd, ...args] = process.argv;

  if (!cmd || cmd === 'help') {
    console.log(`
BMAD Collective Intelligence CLI
    
Usage:
  bmad memo get <key>                 - Retrieve a shared fact
  bmad memo set <key> <val> [cat]     - Store fact. Categories: CORE (perm), FACT (std), TEMP (2h)
  bmad memo list                      - List all shared facts
  
  bmad task start "<title>" "<desc>"  - Launch a new task visible on dashboard
  bmad task update <id> <progress_%>  - Update progress (0-100)
  bmad task done <id>                 - Complete a task
  
  bmad maintenance cleanup            - Prune expired memory/archive tasks
  bmad delegate <agent> <msg>         - Send internal message to another agent
    `);
    process.exit(0);
  }

  try {
    switch (cmd) {
      case 'memo':
        await handleMemo(args);
        break;
      case 'task':
        await handleTask(args);
        break;
      case 'delegate':
        await handleDelegate(args);
        break;
      case 'maintenance':
        await handleMaintenance(args);
        break;
      case 'audit':
        await handleAudit(args);
        break;
      case 'setup':
        await handleSetup();
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function handleSetup() {
  console.log("Initializing Collective Memory system...");
  // Note: Standard Supabase client doesn't support raw SQL. 
  // We'll use the 'rpc' method if the user has created the 'exec_sql' helper,
  // otherwise we'll guide them.
  console.log("This CLI requires 'collective_memory' table in Supabase.");
  console.log("Please run the migration 005_shared_memory.sql and 006_memory_pruning.sql in your Supabase SQL Editor.");
}

async function handleMaintenance([sub]) {
  if (sub === 'cleanup') {
    console.log("Pruning expired memory...");
    const { error: e1 } = await supabase.from('collective_memory').delete().lt('expires_at', new Date().toISOString());
    if (e1) console.error("Pruning Error:", e1.message);

    console.log("Archiving old completed tasks...");
    const { error: e2 } = await supabase.from('task_state')
      .delete()
      .eq('status', 'completed')
      .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // 7 days
    if (e2) console.error("Archiving Error:", e2.message);
    
    console.log("Cleanup complete.");
  }
}

async function handleDelegate([targetAgent, ...msgArgs]) {
  const message = msgArgs.join(' ');
  const roomMap = {
    kofi: 'product', anna: 'ux', donna: 'governance', architect: 'architecture',
    builder: 'engineering', ops: 'ops', reviewer: 'qa', marketing: 'marketing', research: 'research'
  };
  const targetRoom = roomMap[targetAgent.toLowerCase()] || 'general';
  
  const { error } = await supabase.from('room_messages').insert({
    room_id: targetRoom,
    sender: `Delegation System`,
    message: `[DELEGATION TO ${targetAgent.toUpperCase()}]: ${message}`
  });
  
  if (error) throw error;
  console.log(`✅ Delegation sent to ${targetAgent} in room ${targetRoom}.`);
}

async function handleMemo([sub, key, val, cat]) {
  const fs = require('fs');
  const path = require('path');
  const FALLBACK_FILE = '/home/droid/openclaw-control/collective_memory.json';
  
  if (sub === 'get') {
    try {
      const { data } = await supabase.from('collective_memory').select('value').eq('key', key).single();
      if (data) return console.log(JSON.stringify(data.value, null, 2));
    } catch (e) {}
    
    // Fallback to file
    if (fs.existsSync(FALLBACK_FILE)) {
      const mem = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8'));
      console.log(JSON.stringify(mem[key]?.value || null, null, 2));
    } else {
      console.log('null');
    }
  } else if (sub === 'set') {
    const value = JSON.parse(val);
    const updates = { key, value, updated_at: new Date().toISOString() };
    
    // Tiered TTL logic
    if (cat === 'TEMP') {
      updates.expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      updates.importance_level = 0;
      updates.category = 'transient';
    } else if (cat === 'CORE') {
      updates.expires_at = null;
      updates.importance_level = 3;
      updates.category = 'core';
    } else {
      updates.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      updates.importance_level = 1;
      updates.category = 'fact';
    }

    // Try DB
    try {
      const { error } = await supabase.from('collective_memory').upsert(updates, { onConflict: 'key' });
      if (!error) return console.log(`Memory set (DB): ${key} [Tier: ${cat || 'FACT'}]`);
    } catch (e) {}

    // Fallback to file
    let mem = {};
    if (fs.existsSync(FALLBACK_FILE)) mem = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8'));
    mem[key] = { value, updates };
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(mem, null, 2));
    console.log(`Memory set (FILE): ${key} [Tier: ${cat || 'FACT'}]`);
  } else if (sub === 'list') {
    try {
      const { data } = await supabase.from('collective_memory').select('key, category, importance_level, expires_at');
      if (data) return console.table(data);
    } catch (e) {}
    if (fs.existsSync(FALLBACK_FILE)) {
      const mem = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8'));
      console.table(Object.keys(mem).map(k => ({ key: k, category: mem[k].updates.category, expires: mem[k].updates.expires_at })));
    }
  }
}

async function handleTask([sub, arg1, arg2, arg3]) {
  if (sub === 'start') {
    const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
    
    // Resolve agent UUID if provided
    let agentUuid = null;
    if (arg3) {
      const { data: agent } = await supabase.from('bmad_agents')
        .select('id')
        .or(`openclaw_agent_id.eq.${arg3},name.ilike.${arg3}`)
        .limit(1).single();
      agentUuid = agent?.id;
    }

    const { data, error } = await supabase.from('task_state').insert({
      organization_id: org?.id,
      title: arg1,
      kanban_column: 'in_progress',
      status: 'in_progress',
      assigned_agent_id: agentUuid,
      agent_id: agentUuid, // Populate both for compatibility
      checkpoint: { description: arg2 || '' }
    }).select('id, title').single();
    if (error) throw error;
    console.log(`Task Started. ID: ${data.id}`);
  } else if (sub === 'update') {
    const { error } = await supabase.from('task_state').update({ 
      progress_pct: parseInt(arg2), 
      last_activity: new Date() 
    }).eq('id', arg1);
    if (error) throw error;
    console.log(`Task ${arg1} updated to ${arg2}%`);
  } else if (sub === 'done') {
    const { error } = await supabase.from('task_state').update({ 
      status: 'completed', 
      kanban_column: 'done', 
      progress_pct: 100,
      last_activity: new Date()
    }).eq('id', arg1);
    if (error) throw error;
    console.log(`Task ${arg1} marked as DONE`);
  } else if (sub === 'list') {
    const { data } = await supabase.from('task_state').select('id, title, progress_pct, status').neq('status', 'completed').limit(10);
    console.table(data);
  }
}

async function handleAudit([action, reason]) {
  const { error } = await supabase.from('decision_log').insert({
    action: 'infra_change', 
    reason: `${action}: ${reason}`,
    details: { original_action: action }
  });
  if (error) throw error;
  console.log(`Decision audited: ${action}`);
}

main();
