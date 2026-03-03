# openclaw-control

Production deployment artifacts for **OpenClaw + BMAD v6** — an autonomous AI agent system on a private VPS.

BMAD **extends** OpenClaw. It does not duplicate core features.

## Structure

```
openclaw-control/
├── config/
│   ├── openclaw/openclaw.json     # OpenClaw config (Telegram, models, auth)
│   └── systemd/                   # openclaw.service, openclaw-dashboard.service
├── workspace/
│   ├── SOUL.md                    # Org identity → injected into agent prompts
│   └── AGENTS.md                  # BMAD roles + task lifecycle
├── supabase/
│   ├── migrations/001_initial_schema.sql  # 9 tables (org, agents, tasks, memory, cost, metrics, audit)
│   └── seed.js                    # Bootstrap org + 6 BMAD agents
├── proxy/
│   └── llm-proxy.js               # Two-tier cost enforcement middleware
├── monitoring/
│   ├── collect-metrics.sh          # CPU/mem/disk → Supabase (cron)
│   ├── daily-cost-report.sh        # Cost summary → Telegram (cron)
│   └── crontab                     # Cron schedule
├── dashboard/
│   ├── server.js                   # Express API (127.0.0.1, service role writes)
│   └── public/index.html           # SPA (6 pages, anon key reads)
└── docs/
    ├── ARCHITECTURE.md
    ├── DEPLOYMENT.md
    ├── SECRETS_SETUP.md
    └── SYSTEM_OVERVIEW.md
```

## Quick Start

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full deployment steps.

## Security

- All services bind `127.0.0.1` — Tailscale only
- Secrets in `.env`, never committed
- Two-tier cost control prevents runaway spending
- All dashboard writes audited
