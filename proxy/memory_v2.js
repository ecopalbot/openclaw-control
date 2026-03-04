/**
 * 🧠 BMAD Vector Memory System
 * 
 * Handles semantic embedding, storage, and retrieval of agent experiences.
 * Uses OpenAI 'text-embedding-3-small' (Cheap & Fast) and Supabase pgvector.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Generate embedding for a string using OpenAI.
 * @param {string} text 
 */
async function getEmbedding(text) {
  try {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small'
      })
    });
    const data = await resp.json();
    return data.data[0].embedding;
  } catch (err) {
    console.error('[memory] Embedding failed:', err.message);
    return null;
  }
}

/**
 * Find relevant past experiences.
 * @param {string} queryText 
 * @param {number} threshold 
 */
async function recall(queryText, threshold = 0.7) {
  const embedding = await getEmbedding(queryText);
  if (!embedding) return [];

  const { data, error } = await supabase.rpc('match_knowledge', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: 3
  });

  if (error) {
    console.warn('[memory] Recall error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Store a new lesson learned.
 * @param {string} content 
 * @param {object} metadata - e.g. { agent: 'ops', tag: 'fix' }
 */
async function learn(content, metadata = {}) {
  const embedding = await getEmbedding(content);
  if (!embedding) return false;

  const { error } = await supabase.from('agent_knowledge_base').insert({
    content,
    embedding,
    metadata
  });

  if (error) {
    console.error('[memory] Learning failed:', error.message);
    return false;
  }
  console.log('[memory] New knowledge stored.');
  return true;
}

module.exports = { recall, learn };

// CLI Test
if (require.main === module) {
  const cmd = process.argv[2];
  const text = process.argv[3];
  
  if (cmd === 'learn' && text) {
    learn(text, { source: 'manual' }).then(() => process.exit());
  } else if (cmd === 'recall' && text) {
    recall(text).then(res => {
      console.log('Recalled Memory:', res);
      process.exit();
    });
  }
}
