# OPENCLAW-CONTROL (BMAD v6)

## 🏗️ SYSTEM ARCHITECTURE

The system uses a **Hybrid Cloud Architecture** to combine the power of a VPS with the local interaction capabilities of a Mac.

1.  **VPS (The Brain)**: Runs OpenClaw, BMAD orchestrators, and Telegram/Discord bots. It handles logic, task delegation, and long-term memory.
2.  **Mac (The Hands)**: Runs the **Local Bridge** (`proxy/local-bridge.js`). It allows OpenClaw to perform GUI-based tasks (Android Studio, Browsing) and local system commands.
3.  **Tailscale VPN**: Encapsulates the entire system in a private, encrypted network. The VPS only talks to the Mac over Tailscale.

---

## 🚀 GETTING STARTED (LOCAL SETUP)

### 1. Run the Local Bridge

On your Mac, navigate to the project root and run:

```bash
# Set your token (from VPS .env)
export BRIDGE_TOKEN="your-secure-token"
node proxy/local-bridge.js
```

The bridge will listen on port `5555`.

### 2. Tailscale Config

Ensure both the VPS and your Mac are on the same Tailscale account. You should be able to `ping` your Mac's Tailscale IP from the VPS.

---

## 🛠️ INTERACTING WITH THE SYSTEM

### Command Execution

You can ask OpenClaw to perform tasks on your Mac via Telegram/Discord:

- _"Clone this repo on my Mac and build it"_
- _"Open Android Studio and show me a screenshot"_
- _"Help me edit this poster"_

### Dashboard & Monitoring

OpenClaw provides real-time feedback through multiple channels:

1.  **Live Desktop View**: Open `workspace/live_view.html` on your Mac to watch OpenClaw's screen updates in real-time (Glassmorphism UI).
2.  **Dashboard Messages**: Check the `room_messages` table in Supabase or the BMAD Dashboard for agent thought logs.
3.  **Chat Feed**: Agents reply directly on Telegram/Discord with progress and screenshots.

---

## 🛡️ SECURITY MODEL

The system is hardened with several layers:

- **Network Isolation**: All VPS-to-Mac traffic is routed inside **Tailscale**.
- **Authorization**: Every request to the Local Bridge requires a **Bearer Token**.
- **Sandboxing**: Commands are executed within a dedicated `~/OpenClawSpace` directory.
- **Guardrails**: The bridge blocks destructive shell patterns and path traversal attempts.

---

## 🎨 IMAGE PROCESSING & POSTER EDITING

The system is now integrated with **Multi-Modal AI**:

- **Vision**: When you share images on Telegram/Discord, the agents (GPT-4o) can "see" and interpret them.
- **Generation/Editing**: Agents can automatically use DALL-E 3 or stable diffusion tools for generating assets or providing edit suggestions.

_(To add more image editing models, see the instruction in `VISION.md`)_
