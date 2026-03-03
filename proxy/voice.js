/**
 * Voice Integration — OpenAI Whisper (STT) + TTS
 * 
 * Pipeline: Voice → STT → OpenClaw → Response → TTS → Telegram
 * Uses OpenAI API for both STT and TTS.
 * All usage logged through proxy.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = 'https://api.openai.com/v1';

/**
 * Speech-to-Text via OpenAI Whisper
 * @param {Buffer} audioBuffer - Audio file buffer (mp3, ogg, wav, m4a)
 * @param {string} language - ISO language code (e.g., 'en', 'sw')
 * @returns {Promise<{text: string, duration: number}>}
 */
async function speechToText(audioBuffer, language = 'en') {
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file', audioBuffer, { filename: 'audio.ogg', contentType: 'audio/ogg' });
  form.append('model', 'whisper-1');
  form.append('language', language);
  form.append('response_format', 'json');

  const response = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`STT error ${response.status}: ${err}`);
  }

  const result = await response.json();
  return { text: result.text, duration: result.duration || 0 };
}

/**
 * Text-to-Speech via OpenAI TTS
 * @param {string} text - Text to synthesize
 * @param {string} voice - Voice ID: alloy, echo, fable, onyx, nova, shimmer
 * @param {string} format - Output format: mp3, opus, aac, flac
 * @returns {Promise<Buffer>} - Audio buffer
 */
async function textToSpeech(text, voice = 'nova', format = 'opus') {
  const response = await fetch(`${OPENAI_BASE}/audio/speech`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice,
      response_format: format,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`TTS error ${response.status}: ${err}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Estimate TTS cost (USD)
 * tts-1: $15/1M chars
 */
function estimateTTSCost(text) {
  return (text.length / 1_000_000) * 15;
}

/**
 * Estimate STT cost (USD)
 * whisper-1: $0.006/minute
 */
function estimateSTTCost(durationSeconds) {
  return (durationSeconds / 60) * 0.006;
}

module.exports = {
  speechToText,
  textToSpeech,
  estimateTTSCost,
  estimateSTTCost,
};
