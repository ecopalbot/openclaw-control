/**
 * ═══════════════════════════════════════════════════════════════
 * Cost Enforcement Middleware
 *
 * Two-tier budget system that wraps OpenClaw's LLM calls.
 * Tier 1: Hard limits from .env (immutable)
 * Tier 2: Adjustable limits from Supabase (editable via dashboard)
 *
 * OpenClaw handles: model selection, failover, usage display.
 * This module adds: $ cost tracking, budget enforcement, alerts.
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Tier 1: Hard limits (from .env, immutable at runtime)
const HARD = {
  dailySpend:    parseFloat(process.env.MAX_DAILY_SPEND_HARD || '25'),
  perAgentTokens: parseInt(process.env.MAX_PER_AGENT_TOKENS_HARD || '500000', 10),
  perTaskTokens:  parseInt(process.env.MAX_PER_TASK_TOKENS_HARD || '200000', 10),
};

// Cost per 1K tokens by model
const PRICING = {
  'anthropic/claude-sonnet-4-20250514':    { in: 0.003,   out: 0.015 },
  'anthropic/claude-3-5-haiku-20241022': { in: 0.001,   out: 0.005 },
  'openai/gpt-4o':                       { in: 0.0025,  out: 0.01 },
  'openai/gpt-4o-mini':                  { in: 0.00015, out: 0.0006 },
  'moonshot-v1-8k':                      { in: 0.0012,  out: 0.0012 },
  'moonshot-v1-32k':                     { in: 0.0024,  out: 0.0024 },
  'grok-beta':                           { in: 0.005,   out: 0.015 },
  'grok-2':                              { in: 0.002,   out: 0.010 },
  'google/gemini-2.0-flash-lite-preview-02-05:free': { in: 0, out: 0 },
  'meta-llama/llama-3.1-8b-instruct:free': { in: 0, out: 0 }
};

function calcCost(model, promptTok, compTok) {
  const p = PRICING[model] || { in: 0.01, out: 0.03 };
  return (promptTok / 1000) * p.in + (compTok / 1000) * p.out;
}

// ── Supabase queries ───────────────────────────────────────

async function todaySpend(orgId) {
  const t = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
  const { data } = await supabase
    .from('token_usage').select('cost_usd')
    .eq('organization_id', orgId).gte('created_at', t).eq('blocked', false);
  return (data || []).reduce((s, r) => s + Number(r.cost_usd), 0);
}

async function agentDailyTokens(agentId) {
  const t = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
  const { data } = await supabase
    .from('token_usage').select('total_tokens')
    .eq('agent_id', agentId).gte('created_at', t).eq('blocked', false);
  return (data || []).reduce((s, r) => s + r.total_tokens, 0);
}

async function taskTokens(taskId) {
  const { data } = await supabase
    .from('token_usage').select('total_tokens')
    .eq('task_id', taskId).eq('blocked', false);
  return (data || []).reduce((s, r) => s + r.total_tokens, 0);
}

async function orgSettings(orgId) {
  const { data } = await supabase
    .from('organization_settings').select('*')
    .eq('organization_id', orgId).single();
  return data || { daily_spend_limit: 10, warning_threshold_percent: 80, anomaly_multiplier: 3 };
}

async function agentLimits(agentId) {
  const { data } = await supabase
    .from('bmad_agents').select('daily_token_limit, task_token_limit')
    .eq('id', agentId).single();
  return data || { daily_token_limit: 100000, task_token_limit: 50000 };
}

// ── Telegram alert ─────────────────────────────────────────

async function alert(msg) {
  const tok = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_OWNER_ID;
  if (!tok || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: msg, parse_mode: 'Markdown' }),
    });
  } catch (_) {}
}

// ── Agent UUID Lookup ──────────────────────────────────────

async function getAgentId(nameOrId) {
  if (!nameOrId) return null;
  if (/^[0-9a-f]{8}-/.test(nameOrId)) return nameOrId;
  const { data } = await supabase
    .from('bmad_agents')
    .select('id')
    .or(`name.ilike.${nameOrId},openclaw_agent_id.ilike.${nameOrId}`)
    .limit(1).single();
  return data ? data.id : null;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  checkBudget,
  recordUsage,
  getAgentId,
  logDecision,
  calcCost, HARD, PRICING
};

async function logDecision({ orgId, agentId, action, reason, details }) {
  try {
    await supabase.from('decision_log').insert({
      organization_id: orgId || null,
      agent_id: agentId || null,
      action, reason, details: details || {}
    });
  } catch (err) {
    console.error('Failed to log decision:', err);
  }
}

/** Pre-call: check all budget limits. Returns { ok, reason, pct } */
async function checkBudget({ orgId, agentId, taskId }) {
  const spent = await todaySpend(orgId);
  const settings = await orgSettings(orgId);
  const pct = (spent / settings.daily_spend_limit) * 100;

  // T1: hard daily spend
  if (spent >= HARD.dailySpend) {
    await alert(`🛑 *HARD LIMIT*: $${spent.toFixed(2)} / $${HARD.dailySpend}`);
    return { ok: false, reason: 'Hard daily spend limit' };
  }

  // T1: hard per-agent
  if (agentId) {
    const aTok = await agentDailyTokens(agentId);
    if (aTok >= HARD.perAgentTokens)
      return { ok: false, reason: `Hard per-agent limit (${aTok}/${HARD.perAgentTokens})` };
  }

  // T1: hard per-task
  if (taskId) {
    const tTok = await taskTokens(taskId);
    if (tTok >= HARD.perTaskTokens)
      return { ok: false, reason: `Hard per-task limit (${tTok}/${HARD.perTaskTokens})` };
  }

  // T2: org daily spend
  if (spent >= settings.daily_spend_limit) {
    await alert(`🔴 *Budget reached*: $${spent.toFixed(2)} / $${settings.daily_spend_limit}`);
    return { ok: false, reason: 'Organization daily limit', pct };
  }
  if (pct >= settings.warning_threshold_percent) {
    await alert(`🟡 *Budget warning* (${pct.toFixed(2)}%): $${spent.toFixed(2)}`);
  }

  // T2: per-agent soft limit
  if (agentId) {
    const limits = await agentLimits(agentId);
    const aTok = await agentDailyTokens(agentId);
    if (aTok >= limits.daily_token_limit)
      return { ok: false, reason: `Agent daily limit (${aTok}/${limits.daily_token_limit})` };
  }

  // T2: per-task soft limit
  if (taskId && agentId) {
    const limits = await agentLimits(agentId);
    const tTok = await taskTokens(taskId);
    if (tTok >= limits.task_token_limit)
      return { ok: false, reason: `Task limit (${tTok}/${limits.task_token_limit})` };
  }

  return { ok: true, pct };
}

/** Post-call: record token usage and $ cost */
async function recordUsage({ orgId, agentId, taskId, model, promptTokens, completionTokens }) {
  const total = promptTokens + completionTokens;
  const cost = calcCost(model, promptTokens, completionTokens);

  await supabase.from('token_usage').insert({
    organization_id: orgId, agent_id: agentId, task_id: taskId,
    model, prompt_tokens: promptTokens, completion_tokens: completionTokens,
    total_tokens: total, cost_usd: cost, blocked: false,
  });

  // Increment task tokens_used
  if (taskId) {
    const { data: task } = await supabase
      .from('task_state').select('tokens_used').eq('id', taskId).single();
    if (task) {
      await supabase.from('task_state')
        .update({ tokens_used: task.tokens_used + total })
        .eq('id', taskId);
    }
  }

  return { total, cost };
}

