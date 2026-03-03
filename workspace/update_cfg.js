const fs = require('fs'); 
const p = '/home/droid/.openclaw/openclaw.json'; 
let d = JSON.parse(fs.readFileSync(p, 'utf8')); 

d.agents.list.forEach(a => { 
  let name = a.workspace ? a.workspace.split('/').pop() : null; 
  if (name === 'executive' || name === 'architect') a.model = 'openai/gpt-4o'; 
  if (name === 'builder') a.model = 'openai/moonshot-v1-32k';
  if (name === 'ops') a.model = 'openai/moonshot-v1-8k';
  if (name === 'research' || name === 'marketing') a.model = 'openai/grok-beta';
  if (['kofi', 'anna', 'donna', 'reviewer'].includes(name)) a.model = 'openrouter/google/gemini-2.0-flash-lite-preview-02-05:free';
}); 

fs.writeFileSync(p, JSON.stringify(d, null, 2)); 
console.log('OpenClaw Config updated successfully according to Proposal');
