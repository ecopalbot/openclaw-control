#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# System Metrics Collector — cron every 15 min
# Writes CPU, memory, disk to Supabase system_metrics
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# Load env
if [ -f "$(dirname "$0")/../.env" ]; then
  set -a; source "$(dirname "$0")/../.env"; set +a
fi

SUPABASE_URL="${SUPABASE_URL:?required}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?required}"

insert() {
  local type="$1" value="$2"
  curl -sS -X POST "${SUPABASE_URL}/rest/v1/system_metrics" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"metric_type\":\"${type}\",\"value_numeric\":${value}}" > /dev/null
}

insert_json() {
  local type="$1" json="$2"
  curl -sS -X POST "${SUPABASE_URL}/rest/v1/system_metrics" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"metric_type\":\"${type}\",\"value_json\":${json}}" > /dev/null
}

# CPU load (1-min)
CPU=$(awk '{print $1}' /proc/loadavg)
insert "cpu_load" "$CPU"

# Memory %
MEM_TOTAL=$(grep MemTotal /proc/meminfo | awk '{print $2}')
MEM_AVAIL=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
MEM_PCT=$(awk "BEGIN {printf \"%.1f\", (1 - ${MEM_AVAIL}/${MEM_TOTAL}) * 100}")
insert "memory_pct" "$MEM_PCT"

# Disk %
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
insert "disk_pct" "$DISK_PCT"

# Disk detail
DISK_JSON=$(df -h / | tail -1 | awk '{printf "{\"size\":\"%s\",\"used\":\"%s\",\"avail\":\"%s\",\"pct\":\"%s\"}", $2, $3, $4, $5}')
insert_json "disk_detail" "$DISK_JSON"

# Log cron activity
curl -sS -X POST "${SUPABASE_URL}/rest/v1/cron_activity" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"job_name\":\"collect-metrics\",\"status\":\"completed\"}" > /dev/null

echo "[$(date -Iseconds)] cpu=${CPU} mem=${MEM_PCT}% disk=${DISK_PCT}%"
