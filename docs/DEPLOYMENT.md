# Deployment Guide

## Prerequisites

- Ubuntu VPS (Hostinger)
- Node.js 22+
- Tailscale installed and connected
- UFW configured: default deny inbound
- OpenClaw installed globally (`npm i -g openclaw`)

## Step 1: Clone Repository

```bash
cd /opt
git clone https://github.com/YOUR_USER/openclaw-control.git openclaw
cd openclaw
npm install
```

## Step 2: Configure Environment

```bash
# Copy template
cp .env.example ~/.openclaw/.env

# Edit with real values
nano ~/.openclaw/.env
```

Required values:

- `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`
- `OPENCLAW_GATEWAY_TOKEN` — generate with `openssl rand -hex 32`
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `TELEGRAM_OWNER_ID` — your Telegram user ID
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`

## Step 3: Deploy OpenClaw Config

```bash
cp config/openclaw/openclaw.json ~/.openclaw/openclaw.json
cp workspace/SOUL.md ~/.openclaw/workspace/SOUL.md
cp workspace/AGENTS.md ~/.openclaw/workspace/AGENTS.md
```

## Step 4: Run Supabase Migration

Go to your Supabase project SQL editor and paste `supabase/migrations/001_initial_schema.sql`.

## Step 5: Seed Organization

```bash
node supabase/seed.js
```

## Step 6: Install systemd Services

```bash
sudo cp config/systemd/openclaw.service /etc/systemd/system/
sudo cp config/systemd/openclaw-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw openclaw-dashboard
```

## Step 7: Install Monitoring Cron

```bash
chmod +x monitoring/collect-metrics.sh monitoring/daily-cost-report.sh
crontab monitoring/crontab
```

## Step 8: Verify

```bash
# OpenClaw running
sudo systemctl status openclaw

# Dashboard accessible via Tailscale
curl http://127.0.0.1:3001

# Telegram responding
# Send /status to your bot
```
