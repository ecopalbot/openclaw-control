/**
 * Seed script — bootstraps organization + BMAD agents in Supabase
 * Run once: node supabase/seed.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function seed() {
  // 1. Organization
  const { data: org, error: e1 } = await supabase
    .from('organizations')
    .insert({
      name: process.env.ORG_NAME,
      owner_identity: process.env.ORG_OWNER_IDENTITY,
      values_manifest: process.env.ORG_VALUES_MANIFEST,
    })
    .select().single();
  if (e1) throw e1;
  console.log(`Org: ${org.name} (${org.id})`);

  // 2. Organization settings
  await supabase.from('organization_settings').insert({
    organization_id: org.id,
    daily_spend_limit: 10.00,
    default_model: 'anthropic/claude-sonnet-4-20250514',
  });
  console.log('Settings created');

  // 3. BMAD agents — openclaw_agent_id maps to agents.list[].id in openclaw.json
  const agents = [
    { openclaw_agent_id: 'analyst',   name: 'Analyst',   role: 'pm',       personality_profile: 'Strategic product thinker. Breaks down requirements methodically. Cost-aware. Asks clarifying questions before committing.' },
    { openclaw_agent_id: 'architect', name: 'Architect', role: 'architect', personality_profile: 'Systems designer. Favors simplicity and proven patterns. Avoids over-engineering. Documents decisions.' },
    { openclaw_agent_id: 'builder',   name: 'Builder',   role: 'developer', personality_profile: 'Pragmatic engineer. Ships working code. Follows existing patterns. Tests before declaring done.' },
    { openclaw_agent_id: 'reviewer',  name: 'Reviewer',  role: 'qa',        personality_profile: 'Thorough but fair. Focuses on correctness, security, maintainability. Finds edge cases.' },
    { openclaw_agent_id: 'ops',       name: 'Ops',       role: 'devops',    personality_profile: 'Infrastructure-focused. Automates everything. Security-conscious. Monitors cost.' },
    { openclaw_agent_id: 'scrum',     name: 'Scrum',     role: 'scrum',     personality_profile: 'Keeps tasks on track. Manages priorities. Reports status. Flags blockers early.' },
  ];

  for (const a of agents) {
    await supabase.from('bmad_agents').insert({
      organization_id: org.id,
      ...a,
      autonomy_level: 1,
      daily_token_limit: 100000,
      task_token_limit: 50000,
      active: true,
    });
    console.log(`  Agent: ${a.name} (${a.role}) → ${a.openclaw_agent_id}`);
  }

  console.log(`\nDone. Org ID: ${org.id}`);
}

seed().catch(e => { console.error('Seed failed:', e); process.exit(1); });
