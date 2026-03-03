# System Overview

## What This Is

A production-grade autonomous AI agent system running **OpenClaw** with **BMAD v6** orchestration on a private VPS. BMAD extends OpenClaw with organization identity, agile task lifecycle, persistent long-term memory, financial cost tracking, and a configuration dashboard.

## What OpenClaw Handles (DO NOT DUPLICATE)

- Chat UI (WebChat)
- Telegram, Discord, Slack channels
- Session management
- Agent routing
- Model selection + failover
- Skills platform (ClawHub)
- Cron + automation
- Chat commands (/status, /usage, /model)
- Tailscale integration

## What BMAD Adds (This Repo)

- **Organization model** — identity, values manifest, owner
- **BMAD agents** — personality profiles, autonomy levels, role assignments (metadata over OpenClaw agents)
- **Task lifecycle** — phases (brainstorm → deploy), status tracking, checkpointing
- **Persistent memory** — survives session resets, semantic recall via pgvector
- **Cost enforcement** — two-tier budget system with hard limits + adjustable limits
- **Token cost tracking** — $ amounts per call, per agent, per task
- **VPS health monitoring** — CPU, memory, disk via cron → Supabase
- **BMAD Dashboard** — visualization + configuration (does NOT duplicate OpenClaw UI)
- **Audit logging** — all config changes tracked

## Component Map

| Component        | Location              | Port            |
| ---------------- | --------------------- | --------------- |
| OpenClaw Gateway | VPS                   | 127.0.0.1:18789 |
| BMAD Dashboard   | VPS                   | 127.0.0.1:3001  |
| Telegram         | Via OpenClaw (native) | —               |
| Supabase         | External cloud        | HTTPS           |
| LLM providers    | External cloud        | HTTPS           |
| Antigravity      | Developer machine     | N/A             |
