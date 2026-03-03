This repository defines the architecture and deployment model
for a production-grade OpenClaw + BMAD system.

Goals:

1. OpenClaw runs on a VPS with Tailscale-only access.
2. No public ports exposed.
3. BMAD v6 used as orchestration layer.
4. Long-term persistent memory via Supabase.
5. Telegram integration for multi-room interaction.
6. Visualization layer for:
   - Token usage
   - Disk usage
   - Cron jobs
   - Active tasks
   - Agent execution logs
7. Fully autonomous upgradeable architecture.
8. All configuration changes should be generated here,
   then deployed safely to the VPS.

Antigravity should:
- Generate clean openclaw.json
- Generate BMAD integration steps
- Generate Supabase memory adapter design
- Generate Telegram bot integration plan
- Generate monitoring architecture
- Avoid duplicating BMAD internal roles