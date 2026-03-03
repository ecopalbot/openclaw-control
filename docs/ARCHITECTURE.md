# System Architecture

## Design Principle

**BMAD extends OpenClaw — it never competes with it.**

OpenClaw handles: sessions, channels (Telegram/Discord/Slack), agent routing, skills, usage display, model management, cron, chat commands, WebChat UI, and Tailscale.

BMAD adds: organization identity, agile task lifecycle, persistent memory, $ cost tracking, budget enforcement, VPS health monitoring, and a configuration dashboard.

## Layers

| Layer         | Owner            | Components                                                    |
| ------------- | ---------------- | ------------------------------------------------------------- |
| Runtime       | OpenClaw         | Gateway, sessions, channels, agent routing, tools             |
| Orchestration | BMAD v6          | Task phases, agent roles, workflow files (SOUL.md, AGENTS.md) |
| Memory        | Supabase         | agent_memory, task_state, token_usage                         |
| Cost Control  | Proxy middleware | Two-tier: .env hard limits + Supabase adjustable limits       |
| Monitoring    | Cron scripts     | system_metrics, cron_activity → Supabase                      |
| Visualization | Dashboard        | BMAD views only (127.0.0.1, Tailscale)                        |
| Engineering   | Antigravity      | Config generation in openclaw-control repo (local only)       |

## Data Flow

```
User → Telegram/WebChat → OpenClaw Gateway → Agent Session
                                    ↓
                            BMAD Phase Routing
                                    ↓
                         LLM Call → Cost Middleware → Provider
                                    ↓
                            Supabase (token_usage, task_state, agent_memory)
                                    ↓
                            Dashboard reads Supabase
```

## Security

- All services bind `127.0.0.1`
- Access via Tailscale only
- UFW default deny inbound
- Secrets in `.env`, never committed
- Supabase RLS: anon key read-only, service role for writes
- Dashboard writes audited to `audit_log`

## Cost Control (Two-Tier)

| Tier          | Source                                                                             | Enforcement                          |
| ------------- | ---------------------------------------------------------------------------------- | ------------------------------------ |
| T1 Hard       | `.env` (MAX_DAILY_SPEND_HARD, MAX_PER_AGENT_TOKENS_HARD, MAX_PER_TASK_TOKENS_HARD) | Cannot be exceeded at runtime        |
| T2 Adjustable | Supabase `organization_settings`                                                   | Editable via dashboard, capped by T1 |

Alerts sent to Telegram owner at: warning threshold, limit reached, anomaly spike.
