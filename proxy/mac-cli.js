#!/usr/bin/env node
/**
 * 🍏 OpenClaw MAC-CLI [Zero-Dependency]
 * ═══════════════════════════════════════════════════════════════
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env manually to avoid 'dotenv' dependency
const envPath = path.resolve(__dirname, '../.env');
const env = {};
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const [k, v] = line.split('=');
        if (k && v) env[k.trim()] = v.trim();
    });
}

const IP = env.MAC_TAILSCALE_IP || '100.124.207.71';
const PORT = 5555;
const TOKEN = env.BRIDGE_TOKEN;

function request(method, path, body = null, isBinary = false) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: IP,
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                if (res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString()}`));
                } else {
                    resolve(isBinary ? buffer : JSON.parse(buffer.toString()));
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    const [,, command, ...args] = process.argv;

    if (!command || command === 'help') {
        return console.log(`
OpenClaw Mac-CLI [Zero-Dependency]

Available Commands:
  mac screenshot            Capture the Mac's current screen
  mac open <App Name>       Open an application
  mac exec <shell command>  Run a shell command on Mac
  mac click <x> <y>         Click coordinates
  mac type <text>           Type text
  mac agent <full task>     Delegate a natural language task to Mac worker
  mac delegate <task>       Same as agent, used for handing off execution
        `);
    }

    try {
        switch (command) {
            case 'open':
                const app = args.join(' ');
                console.log(`[MAC] Opening ${app}...`);
                await request('POST', '/exec', { cmd: `open -a "${app}"` });
                console.log('✅ OK');
                break;

            case 'exec':
                const cmdTxt = args.join(' ');
                const res = await request('POST', '/exec', { cmd: cmdTxt });
                if (res.stdout) process.stdout.write(res.stdout);
                if (res.stderr) process.stderr.write(res.stderr);
                break;

            case 'screenshot':
                console.log(`[MAC] Capturing...`);
                const img = await request('GET', '/screenshot', null, true);
                const ssPath = `/tmp/mac_screen_${Date.now()}.png`;
                fs.writeFileSync(ssPath, img);
                console.log(`✅ Saved to: ${ssPath}`);
                break;

            case 'click':
                await request('POST', '/gui/click', { x: parseInt(args[0]), y: parseInt(args[1]) });
                console.log('✅ Clicked');
                break;

            case 'type':
                await request('POST', '/gui/type', { text: args.join(' ') });
                console.log('✅ Typed');
                break;

            case 'agent':
            case 'delegate':
                const task = args.join(' ');
                console.log(`[MAC] Delegating: "${task.substring(0, 50)}..."`);
                const agentRes = await request('POST', '/agent', { message: task });
                if (agentRes.stdout) process.stdout.write(agentRes.stdout);
                if (agentRes.stderr) process.stderr.write(agentRes.stderr);
                if (!agentRes.ok) console.error(`❌ Agent Error: ${agentRes.error}`);
                break;

            default:
                console.log(`❌ Unknown: ${command}`);
        }
    } catch (e) {
        console.error(`❌ Bridge Error: ${e.message}`);
    }
}

main();
