#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Daily Cost Report — cron at 23:55 UTC
# Queries Supabase, sends summary to Telegram
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

if [ -f /etc/openclaw/env ]; then
  set -a; source /etc/openclaw/env; set +a
fi

SUPABASE_URL="${SUPABASE_URL:?required}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?required}"
TG_TOKEN="${TELEGRAM_BOT_TOKEN:?required}"
TG_CHAT="${TELEGRAM_ALERT_CHAT_ID:?required}"

TODAY=$(date -u +"%Y-%m-%dT00:00:00Z")

USAGE=$(curl -sS "${SUPABASE_URL}/rest/v1/token_usage?select=cost_usd,prompt_tokens,completion_tokens&created_at=gte.${TODAY}&blocked=eq.false" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}")

COST=$(echo "$USAGE" | jq '[.[].cost_usd | tonumber] | add // 0')
PROMPT=$(echo "$USAGE" | jq '[.[].prompt_tokens] | add // 0')
COMP=$(echo "$USAGE" | jq '[.[].completion_tokens] | add // 0')
COUNT=$(echo "$USAGE" | jq 'length')

MSG="📊 *Daily Cost Report*

💰 Total: \$${COST}
📤 Prompt: ${PROMPT} tokens
📥 Completion: ${COMP} tokens
🔢 Requests: ${COUNT}
📅 $(date -u +%Y-%m-%d)"

curl -sS -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\":\"${TG_CHAT}\",\"text\":\"${MSG}\",\"parse_mode\":\"Markdown\"}" > /dev/null

# Log cron
curl -sS -X POST "${SUPABASE_URL}/rest/v1/cron_activity" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"job_name\":\"daily-cost-report\",\"status\":\"completed\"}" > /dev/null

echo "[$(date -Iseconds)] Report sent: \$${COST}"
