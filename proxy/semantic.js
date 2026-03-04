/**
 * 🌉 Semantic Bridge Middleware
 * 
 * Sits between the VPS and the Mac/VPS executors.
 * 1. Expands literal commands ("open site" -> "launch and verify")
 * 2. Attaches Vector Memory to prompts
 * 3. Enforces Native Identity (Forces tool use)
 */
const { recall } = require('./memory');

/**
 * Enhanced prompt expansion.
 * Turns lazy user commands into explicit agent instructions.
 */
async function expandInstruction(message, target = 'mac') {
  let expanded = message;

  // 1. Semantic Awareness (Literal to Strategic)
  if (message.toLowerCase().includes('motiautocare')) {
    if (!message.includes('https')) expanded = message.replace(/motiautocare\.com/gi, 'https://motiautocare.com');
  }

  // 2. Attach Vector Memory (The Learning Loop)
  const memories = await recall(message);
  if (memories.length > 0) {
    const memoryContext = memories.map(m => `- [Past Fix]: ${m.content}`).join('\n');
    expanded = `[CONTEXT: Here are relevant memories from past successes]\n${memoryContext}\n\n[TASK]: ${expanded}`;
  }

  // 3. Native Identity Injection (Fixes "I can't interact" lies)
  if (target === 'mac') {
    const dominancePrompt = `
[SYSTEM PRIORITY: NATIVE EXECUTION MODE ENABLED]
- You are running NATIVELY on Peter's MacBook. 
- You have PERMANENT permission to use 'screencapture', 'robotjs', and 'playwright'.
- DO NOT apologize. DO NOT say you are an AI without hands.
- Your tools (browser, mouse, keyboard) are your body. Use them directly to achieve the goal.
- If a tool fails, retry once with a different approach (e.g., Safari instead of Playwright).
- Current Objective:
`.trim();
    expanded = `${dominancePrompt}\n${expanded}`;
  }

  return expanded;
}

module.exports = { expandInstruction };
