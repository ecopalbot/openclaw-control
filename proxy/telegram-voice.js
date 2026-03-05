/**
 * Telegram Gateway v4 — Sole Telegram handler (ALL message types)
 *
 * Since only ONE process can consume getUpdates per bot token, this script
 * handles EVERYTHING and must not compete with openclaw's own poller.
 *
 * VOICE / AUDIO messages:
 *  1. Transcribe via Whisper (English forced, temperature=0)
 *  2. Echo transcript: 🎙️ "You said: ..."
 *  3. Call openclaw agent CLI with the transcript
 *  4. Send agent response as TEXT
 *  5. Synthesize TTS and send back as voice note
 *
 * TEXT messages:
 *  1. Call openclaw agent CLI with the text directly
 *  2. Send agent response as TEXT (no TTS for text-initiated chats)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const { routeAndExecute } = require('./task-router');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3001';

if (!BOT_TOKEN || !OPENAI_API_KEY) {
  console.error('TELEGRAM_BOT_TOKEN and OPENAI_API_KEY must be set in .env');
  process.exit(1);
}

let offset = 0;

async function getUpdates() {
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=25&allowed_updates=%5B%22message%22%5D`
    );
    const data = await resp.json();
    if (!data.ok) return [];
    return data.result || [];
  } catch (e) {
    return [];
  }
}

async function getFileUrl(fileId) {
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const data = await resp.json();
  if (!data.ok) throw new Error(data.description);
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`;
}

async function downloadBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function transcribeAudio(audioBuffer) {
  const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
  const form = new FormData();
  form.append('file', blob, 'voice.ogg');
  form.append('model', 'whisper-1');
  form.append('language', 'en');           // Force English
  form.append('response_format', 'text');
  form.append('temperature', '0');         // Most deterministic

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: form
  });
  if (!resp.ok) throw new Error(`Whisper error: ${await resp.text()}`);
  return (await resp.text()).trim();
}

async function textToSpeech(text) {
  // Use OpenAI TTS to convert response to audio
  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: 'alloy',
      input: text.slice(0, 4000), // TTS has a 4096 char limit
      response_format: 'mp3'
    })
  });
  if (!resp.ok) throw new Error(`TTS error: ${await resp.text()}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function callOpenClaw(message, agent = 'main') {
  try {
    const result = await routeAndExecute(agent, message);
    console.log(`[tg] Task routed to ${result.target.toUpperCase()}`);
    // Strip ANSI codes
    const cleaned = (result.output || '').replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    const lines = cleaned.split('\n').filter(l => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('[') && !t.startsWith('Config') && !t.startsWith('│') && !t.startsWith('◇') && !t.startsWith('🦞');
    });
    return lines.join('\n').trim() || 'Task acknowledged and in progress.';
  } catch (err) {
    console.error('[tg] Route error:', err.message);
    // Fallback: run on VPS only
    const safeMsg = message.replace(/'/g, "'\\''");
    const OPENCLAW_PATH = '/home/droid/.npm-global/bin/openclaw';
    const cmd = `${OPENCLAW_PATH} agent --agent ${agent} --message '${safeMsg}'`;
    const { stdout } = await execAsync(cmd, { timeout: 60000, shell: '/bin/bash', cwd: '/home/droid/openclaw-control' });
    return (stdout || '').trim() || 'Task processed.';
  }
}

async function sendText(chatId, text, replyTo) {
  const body = { chat_id: chatId, text: text.slice(0, 4096) };
  if (replyTo) body.reply_to_message_id = replyTo;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function sendVoice(chatId, mp3Buffer, replyTo) {
  // Use FormData to upload voice file
  const blob = new Blob([mp3Buffer], { type: 'audio/mpeg' });
  const form = new FormData();
  form.append('chat_id', chatId.toString());
  form.append('voice', blob, 'response.mp3');
  if (replyTo) form.append('reply_to_message_id', replyTo.toString());
  
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVoice`, {
    method: 'POST',
    body: form
  });
}

async function processVoiceMessage(msg) {
  const chatId = msg.chat.id;
  const msgId = msg.message_id;

  console.log(`[tg] 🎙️ Voice from chat ${chatId}`);
  try {
    // 1. Transcribe
    const fileUrl = await getFileUrl((msg.voice || msg.audio).file_id);
    const audioBuffer = await downloadBuffer(fileUrl);
    const transcript = await transcribeAudio(audioBuffer);
    console.log(`[tg] Transcript: "${transcript}"`);

    if (!transcript) {
      await sendText(chatId, '⚠️ Could not understand the audio. Please try again.', msgId);
      return;
    }

    // 2. Echo transcript back so user knows what was heard
    await sendText(chatId, `🎙️ You said:\n"${transcript}"\n\n⏳ Processing...`, msgId);

    // 3. Get openclaw response
    const agentResponse = await callOpenClaw(transcript);
    console.log(`[tg] Agent replied (${agentResponse.length} chars)`);

    // 4. Send text response
    await sendText(chatId, agentResponse);

    // 5. Send voice response (TTS)
    try {
      const voiceBuffer = await textToSpeech(agentResponse);
      await sendVoice(chatId, voiceBuffer, null);
      console.log(`[tg] Voice response sent`);
    } catch (ttsErr) {
      console.warn('[tg] TTS failed (text was still sent):', ttsErr.message);
    }

  } catch (err) {
    console.error('[tg] Voice error:', err.message);
    await sendText(chatId, `❌ Error: ${err.message.slice(0, 200)}`, msgId);
  }
}

async function processTextMessage(msg) {
  const chatId = msg.chat.id;
  const msgId = msg.message_id;
  const text = (msg.text || '').trim();

  if (!text) return;
  console.log(`[tg] 💬 Text from chat ${chatId}: "${text.slice(0, 80)}"`);

  try {
    const agentResponse = await callOpenClaw(text);
    console.log(`[tg] Agent replied (${agentResponse.length} chars)`);
    await sendText(chatId, agentResponse, msgId);
  } catch (err) {
    console.error('[tg] Text error:', err.message);
    await sendText(chatId, `❌ Error: ${err.message.slice(0, 200)}`, msgId);
  }
}

async function processPhotoMessage(msg) {
  const chatId = msg.chat.id;
  const msgId = msg.message_id;
  const photo = msg.photo[msg.photo.length - 1]; // Get highest res
  const caption = msg.caption || '';

  console.log(`[tg] 🖼️ Photo from chat ${chatId}`);
  try {
    const fileUrl = await getFileUrl(photo.file_id);
    const buffer = await downloadBuffer(fileUrl);
    const base64 = buffer.toString('base64');
    const mimeType = 'image/jpeg';

    await sendText(chatId, `🖼️ Analyzing image...`, msgId);

    // Use OpenAI Vision API directly
    const visionResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: caption ? `Analyze this image. Context: ${caption}` : 'Analyze this image in detail. Describe what you see.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'auto' } }
          ]
        }]
      })
    });

    if (!visionResp.ok) {
      const errBody = await visionResp.text();
      throw new Error(`Vision API ${visionResp.status}: ${errBody.slice(0, 200)}`);
    }

    const visionData = await visionResp.json();
    const analysis = visionData.choices?.[0]?.message?.content || 'Could not analyze image.';

    // If caption contains a command, route through OpenClaw with the vision context
    if (caption && caption.length > 5) {
      const enrichedPrompt = `Image analysis: ${analysis}\n\nUser request about this image: ${caption}`;
      const agentResponse = await callOpenClaw(enrichedPrompt);
      await sendText(chatId, agentResponse);
    } else {
      await sendText(chatId, analysis);
    }
  } catch (err) {
    console.error('[tg] Photo error:', err.message);
    await sendText(chatId, `❌ Image Error: ${err.message.slice(0, 200)}`, msgId);
  }
}

async function processDocumentMessage(msg) {
  const chatId = msg.chat.id;
  const msgId = msg.message_id;
  const doc = msg.document;

  console.log(`[tg] 📄 Document from chat ${chatId}: ${doc.file_name}`);
  try {
    const fileUrl = await getFileUrl(doc.file_id);
    const buffer = await downloadBuffer(fileUrl);
    
    const fs = require('fs');
    const path = require('path');
    const localPath = path.resolve(__dirname, `../workspace/${doc.file_name}`);
    fs.writeFileSync(localPath, buffer);

    await sendText(chatId, `📄 File received: ${doc.file_name}. Analyzing...`, msgId);

    const prompt = `I have shared a file named "${doc.file_name}". Please check it. Caption: ${msg.caption || ''}`;
    const agentResponse = await callOpenClaw(prompt);
    
    await sendText(chatId, agentResponse);
  } catch (err) {
    console.error('[tg] Document error:', err.message);
  }
}


async function poll() {
  console.log('[tg] Gateway active — handling ALL Telegram message types');
  console.log('[tg] Voice: Whisper EN + TTS reply | Text: direct openclaw CLI call');
  while (true) {
    const updates = await getUpdates();
    for (const update of updates) {
      offset = update.update_id + 1;
      const msg = update.message;
      if (!msg) continue;

      if (msg.voice || msg.audio) {
        processVoiceMessage(msg).catch(err => console.error('[tg] Voice handler error:', err));
      } else if (msg.text) {
        processTextMessage(msg).catch(err => console.error('[tg] Text handler error:', err));
      } else if (msg.photo) {
        processPhotoMessage(msg).catch(err => console.error('[tg] Photo handler error:', err));
      } else if (msg.document) {
        processDocumentMessage(msg).catch(err => console.error('[tg] Doc handler error:', err));
      }

    }
    if (updates.length === 0) await new Promise(r => setTimeout(r, 500));
  }
}

poll().catch(err => { console.error('Fatal:', err); process.exit(1); });
