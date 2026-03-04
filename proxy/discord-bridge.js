/**
 * Discord Auto-Respond Bridge
 * 
 * Listens to ALL messages in bound channels using discord.js WebSocket.
 * Responds WITHOUT requiring @cosmicflare mention.
 * 
 * Features:
 * - Auto-respond to any message in bound channels
 * - When @everyone is mentioned, route to all agents and collect responses
 * - Works with text messages (openclaw handles per-agent routing)
 * - Ignores bot messages and system messages
 * 
 * Channel → Agent mapping (matches openclaw bindings):
 *   #executive    → executive
 *   #product      → kofi  
 *   #ux           → anna
 *   #governance   → donna
 *   #architecture → architect
 *   #engineering  → builder
 *   #ops          → ops
 *   #qa           → reviewer
 *   #marketing    → marketing
 *   #research     → research
 *   #standup      → main
 *   #general      → main (all agents)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');

const { routeAndExecute } = require('./task-router');

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DISCORD_TOKEN) {
  console.error('DISCORD_BOT_TOKEN must be set in .env');
  process.exit(1);
}

// Channel ID → agent name mapping
const CHANNEL_AGENT_MAP = {
  '1477979816656506960': 'executive',
  '1477979822163759249': 'kofi',
  '1477979827343589398': 'anna',
  '1477979832515301396': 'donna',
  '1477979837502066830': 'architect',
  '1477979842279379121': 'builder',
  '1477979847941951612': 'ops',
  '1477979853000019968': 'reviewer',
  '1477979857987178556': 'marketing',
  '1477979863246962749': 'research',
  '1477979868405829686': 'main',
  '1475926298059866115': 'main'  // #general - main orchestrates
};

// All specialized agents for @everyone scenarios
const ALL_AGENTS = ['executive', 'architect', 'builder', 'ops', 'reviewer', 'marketing', 'research', 'kofi', 'anna', 'donna'];

// Track in-progress to avoid double-responding
const processing = new Set();

async function transcribeAudio(audioBuffer) {
  const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
  const form = new FormData();
  form.append('file', blob, 'voice.ogg');
  form.append('model', 'whisper-1');
  form.append('language', 'en');
  form.append('response_format', 'text');
  form.append('temperature', '0');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: form
  });
  if (!resp.ok) throw new Error(`Whisper error: ${await resp.text()}`);
  return (await resp.text()).trim();
}

async function callAgent(agent, message) {
  try {
    const result = await routeAndExecute(agent, message);
    console.log(`[discord] Routed to ${result.target.toUpperCase()}`);
    
    // Clean escape codes and OpenClaw noise
    const cleaned = (result.output || '').replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    const lines = cleaned.split('\n').filter(l => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('[') && !t.startsWith('Config') && !t.startsWith('│') && !t.startsWith('◇') && !t.startsWith('🦞');
    });
    return lines.join('\n').trim() || "Done.";
  } catch (err) {
    return `[${agent}] Error: ${err.message.slice(0, 100)}`;
  }
}


function chunkMessage(text, maxLen = 1900) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

client.once(Events.ClientReady, (c) => {
  console.log(`[discord-bridge] Ready as ${c.user.tag}`);
  console.log(`[discord-bridge] Monitoring ${Object.keys(CHANNEL_AGENT_MAP).length} channels`);
});

client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from bots (including ourselves) and system messages
  if (message.author.bot || message.system) return;
  
  // Only handle messages in bound channels
  const channelId = message.channelId;
  if (!CHANNEL_AGENT_MAP[channelId]) return;

  const msgKey = `${channelId}-${message.id}`;
  if (processing.has(msgKey)) return;
  processing.add(msgKey);

  let content = message.content.trim();
  
  // Handle Attachments (Voice / Images)
  if (message.attachments.size > 0) {
    for (const attachment of message.attachments.values()) {
      const isVoice = attachment.contentType?.includes('audio');
      const isImage = attachment.contentType?.includes('image');
      
      try {
        const resp = await fetch(attachment.url);
        const buffer = Buffer.from(await resp.arrayBuffer());
        
        if (isVoice) {
          console.log(`[discord] Transcribing voice note...`);
          const transcript = await transcribeAudio(buffer);
          if (transcript) {
            // Updated: Summarize the command before executing
            const targetAgent = CHANNEL_AGENT_MAP[channelId]; // Define targetAgent here
            await message.reply(`🎙️ **Summarized Command:** "${transcript}"\n⏳ *Executing on ${targetAgent.toUpperCase()}...*`);
            content = (content ? content + "\n" : "") + transcript;
          }
        } else if (isImage) {
          const localPath = path.resolve(__dirname, '../workspace/incoming_discord.jpg');
          fs.writeFileSync(localPath, buffer);
          content = (content ? content + "\n" : "") + `[System: I have shared an image at incoming_discord.jpg. Please interpret it.]`;
        }
      } catch (err) {
        console.error('[discord] Attachment error:', err.message);
      }
    }
  }

  if (!content || content.length === 0) {
    processing.delete(msgKey);
    return;
  }


  const isEveryoneMention = content.includes('@everyone') || content.includes('@here');
  const agent = CHANNEL_AGENT_MAP[channelId];

  console.log(`[discord-bridge] ${message.author.username} in #${message.channel.name}: "${content.slice(0, 80)}"`);

  // Show typing indicator
  try { await message.channel.sendTyping(); } catch (_) {}

  try {
    if (isEveryoneMention) {
      // Route to main agent which orchestrates, then also get 2-3 specialist responses
      const mainResponse = await callAgent('main', content);
      if (mainResponse) {
        for (const chunk of chunkMessage(`🤖 **Main Agent:**\n${mainResponse}`)) {
          await message.channel.send(chunk);
        }
      }

      // Pick relevant specialists based on channel context or rotate
      const specialists = agent === 'main' 
        ? ['architect', 'executive', 'ops'] 
        : [agent];

      for (const spec of specialists) {
        try { await message.channel.sendTyping(); } catch (_) {}
        const resp = await callAgent(spec, content);
        if (resp) {
          for (const chunk of chunkMessage(`🎭 **${spec.charAt(0).toUpperCase() + spec.slice(1)}:**\n${resp}`)) {
            await message.channel.send(chunk);
          }
        }
      }
    } else {
      // Normal message — route to the bound agent for this channel
      const response = await callAgent(agent, content);
      if (response) {
        for (const chunk of chunkMessage(response)) {
          await message.channel.send(chunk);
        }
      }
    }
  } catch (err) {
    console.error('[discord-bridge] Error:', err.message);
    try {
      await message.channel.send(`⚠️ Error processing message: ${err.message.slice(0, 200)}`);
    } catch (_) {}
  } finally {
    processing.delete(msgKey);
  }
});

client.login(DISCORD_TOKEN).catch(err => {
  console.error('[discord-bridge] Login failed:', err.message);
  process.exit(1);
});
