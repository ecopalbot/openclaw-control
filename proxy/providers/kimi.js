/**
 * Kimi AI Provider Stub
 * 
 * Kimi uses its OWN API key (NOT OpenAI).
 * Compatible with OpenAI chat completions format.
 * 
 * TODO: User must provide:
 * - KIMI_API_KEY
 * - KIMI_BASE_URL (endpoint)
 * - Supported models list
 * - Streaming support confirmation
 */

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';
const KIMI_API_KEY = process.env.KIMI_API_KEY;

/**
 * Create a Kimi chat completion (OpenAI-compatible format)
 */
async function createChatCompletion(messages, options = {}) {
  if (!KIMI_API_KEY) {
    throw new Error('KIMI_API_KEY not configured. Set in .env');
  }

  const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model: options.model || 'moonshot-v1-8k',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: options.stream ?? false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Kimi API error ${response.status}: ${err}`);
  }

  return response.json();
}

/**
 * Available Kimi models (to be confirmed by user)
 */
const KIMI_MODELS = [
  { id: 'moonshot-v1-8k', alias: 'Kimi-8k', context: 8192 },
  { id: 'moonshot-v1-32k', alias: 'Kimi-32k', context: 32768 },
  { id: 'moonshot-v1-128k', alias: 'Kimi-128k', context: 131072 },
];

module.exports = { createChatCompletion, KIMI_MODELS, KIMI_BASE_URL };
