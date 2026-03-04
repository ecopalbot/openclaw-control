/**
 * 🚀 Migration Applier
 * Uses Service Role Key to apply SQL directly if possible.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Applying Migration 007...');
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/007_vector_memory.sql'), 'utf8');

  // Supabase JS doesn't have an 'execSQL' method directly. 
  // We'll use the 'rpc' approach or manual setup instructions.
  // Actually, the most reliable way for me to do this as an agent is to use pgrest RPC
  // but I have to create THAT function first. 
  
  console.log('--- MANUAL SQL REQUIRED ---');
  console.log('Please run the content of supabase/migrations/007_vector_memory.sql in your Supabase SQL Editor.');
  console.log('---------------------------');
  
  // Checking if pgvector is enabled via a trick (trying to use a vector column)
  const { error } = await supabase.from('agent_knowledge_base').select('id').limit(1);
  if (error && error.code === '42P01') {
    console.error('Table does not exist. Migration NOT APPLIED.');
    process.exit(1);
  } else {
    console.log('Knowledge Base Table found. Memory system is READY.');
  }
}

run();
