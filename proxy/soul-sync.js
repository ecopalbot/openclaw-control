/**
 * ═══════════════════════════════════════════════════════════════
 * Soul Sync — Hybrid Architecture
 *
 * Keeps the instructions (SOUL.md) and tools (main_TOOLS.md)
 * synchronized between the VPS General and the Mac Soldier.
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_WS = path.resolve(__dirname, '../workspace');
const LOCAL_OC_WS = path.join(process.env.HOME, '.openclaw/workspace');
const MAC_IP = process.env.MAC_TAILSCALE_IP || '100.124.207.71';

/**
 * Push local project workspace to the OpenClaw system workspace.
 */
function syncToMacSystem() {
  console.log(`[soul-sync] Syncing Project Workspace -> Mac OpenClaw (~/.openclaw/workspace)`);
  try {
    if (!fs.existsSync(LOCAL_OC_WS)) fs.mkdirSync(LOCAL_OC_WS, { recursive: true });
    
    const files = ['SOUL.md', 'main_TOOLS.md', 'PHYSICAL_MANUAL.md'];
    files.forEach(f => {
      const src = path.join(PROJECT_WS, f);
      const dest = path.join(LOCAL_OC_WS, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`  ✓ Synced ${f}`);
      }
    });
  } catch (err) {
    console.error('[soul-sync] Mac local sync failed:', err.message);
  }
}

/**
 * Pushes the project workspace from the CURRENT machine (if VPS) to the Mac.
 * Or if on Mac, this is handled by syncToMacSystem.
 */
function pushToRemoteMac() {
  console.log(`[soul-sync] Pushing instructions to remote Mac @ ${MAC_IP}`);
  try {
    const cmd = `scp -i /home/droid/.ssh/mac_key -r ${PROJECT_WS}/* mac@${MAC_IP}:~/.openclaw/workspace/`;
    execSync(cmd, { stdio: 'inherit' });
    console.log(`  ✓ Remote sync complete.`);
  } catch (err) {
    console.warn('[soul-sync] Remote push failed (Mac might be offline):', err.message);
  }
}

// Simple CLI runner
const mode = process.argv[2] || 'local';

if (mode === 'local') {
  syncToMacSystem();
} else if (mode === 'push') {
  pushToRemoteMac();
} else if (mode === 'all') {
  syncToMacSystem();
  pushToRemoteMac();
}
