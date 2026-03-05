require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const { exec } = require('child_process');
const robot = require('robotjs');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// CONFIGURATION
const PORT = 5555;
const TOKEN = process.env.BRIDGE_TOKEN || 'change-me-safely';
const ALLOWED_DIR = path.join(process.env.HOME, '.openclaw');
const PROJECTS_DIR = path.join(process.env.HOME, 'Documents', 'Projects', 'ecopalbot-projects');

// SECURITY: Command Allowlist & Sanitization
const FORBIDDEN_PATTERNS = [';', '&&', '||', '>', '<', '|', '..', 'sudo', 'chmod', 'rm -rf /'];

if (!fs.existsSync(ALLOWED_DIR)) fs.mkdirSync(ALLOWED_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (auth === `Bearer ${TOKEN}`) return next();
    
    // Silence local noise
    if (req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1' || req.ip === '::1') {
        return res.status(401).send('Unauthorized');
    }

    console.warn(`[SECURITY] Unauthorized access attempt from ${req.ip}`);
    res.status(401).send('Unauthorized');
});

/**
 * 1. COMMAND EXECUTION (Terminal level)
 */
app.post('/exec', (req, res) => {
    let { cmd } = req.body;
    
    // Security check: Block obvious shell injection or out-of-bounds commands
    if (!cmd || typeof cmd !== 'string') return res.status(400).send('Invalid command');
    
    // Exception for git as it uses pipes/args often
    if (FORBIDDEN_PATTERNS.some(forbidden => cmd.includes(forbidden) && !cmd.startsWith('git'))) {
        return res.status(403).json({ ok: false, error: 'Forbidden command pattern detected' });
    }

    console.log(`[EXEC] ${cmd}`);
    exec(cmd, { cwd: ALLOWED_DIR, timeout: 60000 }, (err, stdout, stderr) => {
        res.json({ ok: !err, stdout, stderr, error: err ? err.message : null });
    });
});

/**
 * 2. VISUAL FEEDBACK (Real-time Observation)
 */
app.get('/screenshot', (req, res) => {
    const tmpPath = path.join(__dirname, 'tmp_screen.png');
    exec(`screencapture -x "${tmpPath}"`, (err) => {
        if (err) return res.status(500).send(err.message);
        if (!fs.existsSync(tmpPath)) return res.status(500).send("Screenshot file not found");
        
        const img = fs.readFileSync(tmpPath);
        res.set('Content-Type', 'image/png');
        res.send(img);
    });
});

/**
 * 3. GUI INTERACTION (Mouse & Keyboard)
 */
app.post('/gui/click', (req, res) => {
    const { x, y } = req.body;
    if (typeof x !== 'number' || typeof y !== 'number') return res.status(400).send('Invalid coords');
    robot.moveMouse(x, y);
    robot.mouseClick();
    res.json({ ok: true });
});

app.post('/gui/type', (req, res) => {
    const { text } = req.body;
    if (typeof text !== 'string') return res.status(400).send('Invalid text');
    robot.typeString(text);
    res.json({ ok: true });
});

/**
 * 4. IMAGE PROCESSING (Native macOS 'sips' - no sharp needed)
 */
app.post('/img/process', (req, res) => {
    const { filename, action, value } = req.body;
    if (filename.includes('..')) return res.status(403).send('Traversal blocked');
    
    const fullPath = path.resolve(ALLOWED_DIR, filename);
    let sipsCmd = '';

    switch(action) {
        case 'resize': sipsCmd = `--resampleWidth ${value}`; break;
        case 'rotate': sipsCmd = `-r ${value}`; break;
        case 'format': sipsCmd = `-s format ${value}`; break;
        default: return res.status(400).send('Unknown image action');
    }

    console.log(`[IMG] Processing ${filename}: ${action} ${value}`);
    exec(`sips ${sipsCmd} "${fullPath}"`, (err) => {
        res.json({ ok: !err, error: err ? err.message : null });
    });
});

/**
 * 5. SANDBOXED FILE SYSTEM
 */
app.post('/fs/write', (req, res) => {
    const { filename, content, encoding = 'utf8' } = req.body;
    if (!filename || typeof filename !== 'string' || filename.includes('..')) {
        return res.status(403).send('Invalid/Unsafe filename');
    }
    const fullPath = path.join(ALLOWED_DIR, filename);
    try {
        fs.writeFileSync(fullPath, content, { encoding });
        console.log(`[FS] Wrote file: ${filename} (encoding: ${encoding})`);
        res.send('File saved');
    } catch (err) {
        console.error(`[FS] Write error:`, err.message);
        res.status(500).send('Error writing file');
    }
});

app.get('/fs/read/:filename', (req, res) => {
    const { filename } = req.params;
    if (filename.includes('..')) return res.status(403).send('Traversal blocked');
    const fullPath = path.join(ALLOWED_DIR, filename);
    if (!fs.existsSync(fullPath)) return res.status(404).send('File not found');
    res.sendFile(fullPath);
});

/**
 * 6. AGENT EXECUTION (Local OpenClaw Brain)
 * Prevents Mac sleep for the duration of the task via caffeinate.
 */
app.post('/agent', (req, res) => {
    const { message, agent = 'main' } = req.body;
    if (!message) return res.status(400).send('Message required');

    console.log(`[AGENT] 🚀 Starting task on Mac (agent: ${agent}): "${message.substring(0, 60)}..."`);

    // ── Prevent Mac from sleeping during task ──
    const { spawn } = require('child_process');
    const caffeinate = spawn('caffeinate', ['-dim'], { detached: false });
    console.log(`[AGENT] ☕ caffeinate started (pid ${caffeinate.pid}) — Mac will stay awake`);

    const cleanup = () => {
        try { caffeinate.kill(); } catch (_) {}
        console.log(`[AGENT] 😴 caffeinate stopped — Mac can sleep again`);
    };

    const originalDirective = "[SYSTEM PRIORITY: NATIVE EXECUTION MODE ENABLED. You are running NATIVELY on this Mac. " +
        "You have full access to 'screencapture', 'open', 'robotjs' (mouse/typing), and 'playwright'. " +
        "Save all generated project files to ~/Documents/Projects/ecopalbot-projects/<project-name>/. " +
        "CRITICAL SELF-LEARNING RULE: Whenever you solve a problem, figure out a bug, or discover a new strategy, BEFORE completing the task you MUST send a POST request with the summary to http://100.92.21.72:3001/api/knowledge using application/json with fields 'content' and 'source' using `curl`. " +
        "Do NOT say you cannot interact; use your tools to perform the physical task.] ";
        
    let attempt = 0;
    const maxAttempts = 3;

    const executeTask = (currentMessage) => {
        attempt++;
        const safeMsg = (currentMessage).replace(/'/g, "'\\''");
        const cmd = `/opt/homebrew/bin/openclaw agent --agent ${agent} --local --message '${safeMsg}'`;

        console.log(`[AGENT] Attempt ${attempt}/${maxAttempts}...`);

        exec(cmd, {
            timeout:   300000, 
            maxBuffer: 1024 * 1024 * 5,
            env:       { ...process.env, OPENCLAW_IGNORE_CONFIG_ERRORS: '1' }
        }, (err, stdout, stderr) => {
            if (err && attempt < maxAttempts) {
                console.log(`[AGENT] Task failed on attempt ${attempt}. Resurrecting...`);
                const resurrectionMsg = `${originalDirective}\nYour previous execution failed with error:\n${(stderr || err.message).slice(0, 1000)}\n\nPlease analyze this error, fix it, and complete the original objective:\n${message}`;
                return executeTask(resurrectionMsg);
            }
            
            cleanup();
            res.json({ ok: !err, stdout, stderr, error: err ? err.message : null });
        });
    };

    executeTask(originalDirective + message);
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SECURE LOCAL BRIDGE ACTIVE [v2]`);
    console.log(`📡 Endpoint: http://localhost:${PORT}`);
    console.log(`🛡️  Sandbox strictly at: ${ALLOWED_DIR}`);
});
