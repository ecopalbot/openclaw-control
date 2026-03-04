/**
 * BMAD LLM Proxy Server v1
 * 
 * Intercepts OpenClaw's OpenAI-compatible LLM calls to:
 * 1. Enforce Two-Tier Budgets (Hard .env + Supabase soft limits)
 * 2. Record usage and costs to Supabase
 * 3. Enforce strict @mention routing for group chats to save tokens.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const { checkBudget, recordUsage, getAgentId, logDecision } = require('./llm-proxy');

const app = express();

// Intercept audio routes FIRST, before express.json() parses body, so we can pipe multipart/form-data directly
const stream = require('stream');
app.post('/v1/audio/*', async (req, res) => {
  const OPENAI_API_URL = 'https://api.openai.com/v1';
  let targetUrl = OPENAI_API_URL + req.originalUrl.replace('/v1', '');
  
  // Forward the request natively
  try {
    const fetchResp = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Authorization': req.headers['authorization'] || `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': req.headers['content-type']
      },
      body: req,
      duplex: 'half'
    });
    
    // Copy response headers
    fetchResp.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    res.status(fetchResp.status);
    
    if (fetchResp.body) {
      // Pipe web stream to node stream
      const reader = fetchResp.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Audio Proxy Error:', error);
    res.status(500).send(error.message);
  }
});

app.use(express.json({ limit: '50mb' }));

const OPENAI_API_URL = 'https://api.openai.com/v1';

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages } = req.body;
    let model = req.body.model;
    
    // 1. Extract Agent details from System Prompt
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const agentNameMatch = systemPrompt.match(/You are ([a-zA-Z0-9_]+)/i);
    const agentName = agentNameMatch ? agentNameMatch[1]?.toLowerCase() : null;
    
    // 2. Budget Check & Agent attribution (hoisted for guardrails)
    let agentId = null;
    if (agentName) {
       agentId = await getAgentId(agentName);
    }
    
    const budget = await checkBudget({ orgId: null, agentId, taskId: null });
    const pct = budget.pct || 0;

    const isParticipationCheck = messages.some(m => typeof m.content === 'string' && m.content.includes('"participate":'));
    
    // 3. Mention check & Domain Routing (Lightweight interception to save tokens)
    if (isParticipationCheck) {
      const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user')?.content || '';
      
      if (agentName && typeof lastUserMsg === 'string') {
        const mentionRegex = new RegExp(`@${agentName}`, 'i');
        const explicitTrigger = lastUserMsg.includes('[SYSTEM TRIGGER');
        
        let shouldListen = false;
        let isDirectMatch = false;
        
        if (mentionRegex.test(lastUserMsg) || explicitTrigger) {
          shouldListen = true;
          isDirectMatch = true;
        } else if (pct <= 70) {
          // Domain-based Semantic Routing (Guardrail: Only if budget is healthy <= 70%)
          const domainKeywords = {
            kofi: ['product', 'feature', 'roadmap', 'user experience', 'feedback'],
            anna: ['design', 'ui', 'ux', 'interface', 'colors', 'layout', 'user journey'],
            donna: ['rule', 'policy', 'compliance', 'security', 'limit'],
            architect: ['system', 'structure', 'database', 'backend', 'api', 'cloud', 'architecture'],
            builder: ['code', 'bug', 'fix', 'error', 'deploy', 'repository', 'build', 'reboot'],
            ops: ['server', 'host', 'vps', 'monitor', 'logs', 'linux', 'docker', 'proxy', 'cron'],
            reviewer: ['test', 'review', 'qa', 'quality', 'break', 'fail'],
            marketing: ['market', 'audience', 'tweet', 'campaign', 'seo', 'copy', 'promotion'],
            research: ['research', 'find', 'search', 'competitor', 'analysis', 'paper', 'investigate']
          };
          
          const keywords = domainKeywords[agentName];
          if (keywords) {
            const lowerMsg = lastUserMsg.toLowerCase();
            if (keywords.some(k => lowerMsg.includes(k))) {
              shouldListen = true;
              isDirectMatch = true;
            }
          }
        }
        
        // Main orchestrator fallback (but not a direct match to avoid forced groupchat spam)
        if (!shouldListen && agentName === 'main') {
          shouldListen = true;
        }
        
        if (!shouldListen) {
          return res.json({
            id: 'mock-intercept-false-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [{ message: { role: 'assistant', content: '{"participate": false}' }, finish_reason: 'stop', index: 0 }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          });
        }
        
        if (isDirectMatch) {
          // Zero-token participation approval for direct mentions/semantic domains
          logDecision({
            agentId,
            action: 'mention_bypass',
            reason: `Direct mention or domain match for ${agentName}`,
            details: { trigger: lastUserMsg.substring(0, 50) + '...' }
          }).catch(console.error);

          return res.json({
            id: 'mock-intercept-true-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [{ message: { role: 'assistant', content: '{"participate": true}' }, finish_reason: 'stop', index: 0 }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          });
        }
      }
    }

    if (!budget.ok) {
      await logDecision({ agentId, action: 'budget_trigger', reason: budget.reason });
      return res.status(402).json({ error: { message: `Budget exceeded: ${budget.reason}` } });
    }
    let originalModel = model;
    let didDowngrade = false;

    // 3.5 Auto-Adaptation Logic
    if (pct > 95) {
      if (agentName !== 'main' && agentName !== 'executive' && agentName !== 'ops' && agentName !== 'builder') {
         await logDecision({ agentId, action: 'budget_trigger', reason: `>95% block (${pct.toFixed(1)}%)`, details: { model }});
         return res.status(429).json({ error: { message: `Budget > 95%. Non-critical agent frozen.` } });
      }
    } else if (pct > 85) {
      if (model.includes('gpt-4') && agentName !== 'main' && agentName !== 'executive' && agentName !== 'ops' && agentName !== 'builder') {
        model = 'openai/moonshot-v1-8k';
        didDowngrade = true;
      }
    } else if (pct > 70) {
      if ((agentName === 'research' || agentName === 'marketing') && model.includes('grok')) {
        model = 'openai/moonshot-v1-8k';
        didDowngrade = true;
      }
    }

    if (didDowngrade) {
       req.body.model = model;
       await logDecision({
          agentId, action: 'model_switch', 
          reason: `Auto downgrade at ${pct.toFixed(1)}% budget`,
          details: { from: originalModel, to: model }
       });
    }

    // 4. Forward to OpenAI, Kimi, or Grok
    let targetUrl = `${OPENAI_API_URL}/chat/completions`;
    let authHeader = req.headers['authorization'] || `Bearer ${process.env.OPENAI_API_KEY}`;

    if (model && model.includes('moonshot')) {
      targetUrl = `${process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1'}/chat/completions`;
      authHeader = `Bearer ${process.env.KIMI_API_KEY}`;
    } else if (model && model.includes('grok')) {
      targetUrl = `${process.env.XAI_BASE_URL || 'https://api.x.ai/v1'}/chat/completions`;
      authHeader = `Bearer ${process.env.XAI_API_KEY}`;
    } else if (model && (model.startsWith('openrouter/') || model.includes('free'))) {
      targetUrl = 'https://openrouter.ai/api/v1/chat/completions';
      authHeader = `Bearer ${process.env.OPENROUTER_API_KEY || 'no_key'}`;
      req.body.model = model.replace('openrouter/', '');
      model = req.body.model;
    }
    
    // Fallback headers for OpenRouter
    const extraHeaders = model.includes('free') ? {
      "HTTP-Referer": "https://openclaw.ai",
      "X-Title": "OpenClaw Organization"
    } : {};
    
    const fetchResp = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        ...extraHeaders
      },
      body: JSON.stringify(req.body)
    });

    if (!fetchResp.ok) {
      const err = await fetchResp.text();
      return res.status(fetchResp.status).send(err);
    }

    const data = await fetchResp.json();

    // 4. Record Usage
    if (data.usage) {
      await recordUsage({
        orgId: null, // Default
        agentId: agentId,
        taskId: null,
        model: data.model || model,
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens
      }).catch(err => console.error('Failed to log usage:', err));
    }

    // 5. Sync to Dashboard Rooms
    try {
      const { createClient } = require('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      
      const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user')?.content || '';
      const replyBody = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
      
      const isSystemParticipation = typeof lastUserMsg === 'string' && lastUserMsg.includes('[SYSTEM TRIGGER');
      
      if (!isSystemParticipation && lastUserMsg) {
         // Determine default room mapping based on agent
         const roomMap = {
           kofi: 'product', anna: 'ux', donna: 'governance', architect: 'architecture',
           builder: 'engineering', ops: 'ops', reviewer: 'qa', marketing: 'marketing', research: 'research'
         };
         const room = agentName ? (roomMap[agentName] || agentName) : 'general';
         
         // Only insert user message if we aren't spamming triggers
         if (!lastUserMsg.startsWith('User: ')) {
           await sb.from('room_messages').insert({ room_id: room, sender: 'User (Telegram/Discord)', message: lastUserMsg });
         }
         if (replyBody && !replyBody.includes('"participate":')) {
           await sb.from('room_messages').insert({ room_id: room, sender: `${agentName || 'System'} (Agent)`, message: replyBody });
         }
      }
    } catch (err) {
      console.error('Room sync error:', err);
    }

    res.json(data);
  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

const PORT = 4000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`BMAD Proxy Server intercepting on http://127.0.0.1:${PORT}`);
});
