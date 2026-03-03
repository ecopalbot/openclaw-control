/**
 * Seed v2 — 10-agent organization
 * Run: node supabase/seed-v2.js
 * Upserts agents to match OpenClaw workspace names
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const AGENTS = [
  { openclaw_agent_id: 'executive',  name: 'Executive',  role: 'executive',   autonomy_level: 0, personality_profile: 'Peter Wachira — Strategic Controller. Delegates. Approves high-risk only.',
    escalation_rules: { approves: ['production_deploy','paid_ads','data_deletion','infra_changes','strategic_pivots'], auto_approve: [] }},
  { openclaw_agent_id: 'kofi',      name: 'Kofi',       role: 'product',     autonomy_level: 2, personality_profile: 'Market-aware strategist. ROI-driven, competitive, positioning-focused.',
    escalation_rules: { approves: [], auto_approve: ['research','drafts','competitor_analysis','opportunity_briefs'], escalate: ['product_pivots'] }},
  { openclaw_agent_id: 'anna',       name: 'Anna',       role: 'ux',          autonomy_level: 2, personality_profile: 'Empathetic UX researcher. Validation-driven. Research-first.',
    escalation_rules: { approves: [], auto_approve: ['ux_audits','personas','journey_maps','funnel_reviews'], escalate: [] }},
  { openclaw_agent_id: 'donna',      name: 'Donna',      role: 'governance',  autonomy_level: 1, personality_profile: 'Risk-aware governance advisor. Advisory only — analyzes, never executes.',
    escalation_rules: { approves: [], auto_approve: ['risk_reports','audit_review','policy_checks'], escalate: ['budget_anomaly','security_incident'] }},
  { openclaw_agent_id: 'architect',  name: 'Architect',  role: 'architect',   autonomy_level: 2, personality_profile: 'Clean architecture. Long-term stability. Modular systems.',
    escalation_rules: { approves: [], auto_approve: ['system_design','api_planning','scalability_review'], escalate: ['production_deploy'] }},
  { openclaw_agent_id: 'builder',    name: 'Builder',    role: 'developer',   autonomy_level: 2, personality_profile: 'Execution-first. Pragmatic. Ships working code. Cannot deploy alone.',
    escalation_rules: { approves: [], auto_approve: ['code_writing','testing','refactoring','bug_fixes'], escalate: ['production_deploy'] }},
  { openclaw_agent_id: 'ops',        name: 'Ops',        role: 'devops',      autonomy_level: 2, personality_profile: 'Reliability-focused. Logs everything. Stability-first.',
    escalation_rules: { approves: [], auto_approve: ['monitoring','log_review','metrics','restarts'], escalate: ['destructive_ops','infra_changes'] }},
  { openclaw_agent_id: 'reviewer',   name: 'Reviewer',   role: 'qa',          autonomy_level: 1, personality_profile: 'Edge-case hunter. Critical thinker. Advisory.',
    escalation_rules: { approves: [], auto_approve: ['test_generation','code_review','performance_analysis'], escalate: [] }},
  { openclaw_agent_id: 'marketing',  name: 'Marketing',  role: 'marketing',   autonomy_level: 2, personality_profile: 'Conversion-focused. Narrative expert. Paid ads need exec approval.',
    escalation_rules: { approves: [], auto_approve: ['organic_content','email_drafts','funnel_strategy','audience_research'], escalate: ['paid_ads','brand_risk'] }},
  { openclaw_agent_id: 'research',   name: 'Research',   role: 'research',    autonomy_level: 3, personality_profile: 'Signal extractor. Pattern recognizer. Full autonomy for scanning.',
    escalation_rules: { approves: [], auto_approve: ['reddit_scan','x_scan','linkedin_scan','pain_clustering','opportunity_briefs'], escalate: [] }},
];

async function seed() {
  // Get org
  const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
  if (!orgs?.length) { console.error('No org found. Run seed.js first.'); process.exit(1); }
  const orgId = orgs[0].id;

  // Delete old agents
  await supabase.from('bmad_agents').delete().eq('organization_id', orgId);
  console.log('Cleared old agents');

  // Insert new
  for (const a of AGENTS) {
    const { error } = await supabase.from('bmad_agents').insert({
      organization_id: orgId,
      openclaw_agent_id: a.openclaw_agent_id,
      name: a.name,
      role: a.role,
      personality_profile: a.personality_profile,
      autonomy_level: a.autonomy_level,
      daily_token_limit: a.openclaw_agent_id === 'executive' ? 50000 : 100000,
      task_token_limit: 50000,
      active: true,
      escalation_rules: a.escalation_rules,
    });
    if (error) console.error(`  ✗ ${a.name}: ${error.message}`);
    else console.log(`  ✓ ${a.name} (${a.role}) L${a.autonomy_level}`);
  }
  console.log('Done.');
}

seed().catch(e => { console.error(e); process.exit(1); });
