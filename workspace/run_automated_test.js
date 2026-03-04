const BRIDGE_URL = 'http://localhost:5555';
const TOKEN = 'antigravity-test-token';

async function runTest() {
    console.log("--- Starting Automation Test ---");

    // 1. Exec: Open a fresh TextEdit window
    console.log("1. Opening TextEdit...");
    await fetch(`${BRIDGE_URL}/exec`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cmd: 'open -e' })
    });

    await new Promise(r => setTimeout(r, 2000));

    // 2. GUI Type: Type a message
    console.log("2. Typing message...");
    await fetch(`${BRIDGE_URL}/gui/type`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: "Hello! This is an automated test from OpenClaw via the Mac Bridge. I am typing this autonomously on your desktop. No VPS storage was used for this heavy lifting." })
    });

    console.log("3. Verifying with screenshot...");
    const resp = await fetch(`${BRIDGE_URL}/screenshot`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (resp.ok) {
        console.log("SUCCESS: Test completed and screenshot captured.");
    } else {
        console.error("FAILED to capture screenshot");
    }
}

runTest();
