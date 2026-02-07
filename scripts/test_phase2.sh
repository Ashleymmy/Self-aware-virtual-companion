#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
RUNTIME_SCRIPT="${REPO_ROOT}/scripts/proactive_runtime.mjs"
DAEMON_SCRIPT="${REPO_ROOT}/scripts/proactive_daemon.mjs"
DISPATCH_SCRIPT="${REPO_ROOT}/scripts/proactive_dispatcher.mjs"

TMP_ROOT="/tmp/savc_phase2_runtime"
STATE_FILE="${TMP_ROOT}/state.json"
WORKSPACE="${TMP_ROOT}/savc-core"

if [[ -f "${REPO_ROOT}/config/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/config/.env.local"
  set +a
fi

pass_count=0
fail_count=0
warn_count=0

pass() {
  echo "[PASS] $*"
  pass_count=$((pass_count + 1))
}

fail() {
  echo "[FAIL] $*"
  fail_count=$((fail_count + 1))
}

warn() {
  echo "[WARN] $*"
  warn_count=$((warn_count + 1))
}

require_file() {
  local target="$1"
  if [[ -f "${REPO_ROOT}/${target}" ]]; then
    pass "file exists: ${target}"
  else
    fail "missing file: ${target}"
  fi
}

rm -rf "${TMP_ROOT}"
mkdir -p "${TMP_ROOT}"
mkdir -p "${WORKSPACE}"
cp -R "${REPO_ROOT}/savc-core/memory" "${WORKSPACE}/memory"

# 0) Required files
require_file "scripts/proactive_runtime.mjs"
require_file "scripts/proactive_daemon.mjs"
require_file "scripts/proactive_dispatcher.mjs"
require_file "scripts/phase2_run_once.sh"
require_file "scripts/phase2_cron_install.sh"
require_file "scripts/phase2_cron_remove.sh"
require_file "config/proactive.yaml"

# 1) Quiet hours guard
node "${RUNTIME_SCRIPT}" evaluate \
  --now "2026-02-07T23:30:00" \
  --quiet-start "23:00" \
  --quiet-end "07:00" \
  --state "${STATE_FILE}" > "${TMP_ROOT}/quiet.json"

python3 - "${TMP_ROOT}/quiet.json" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert payload['quietHours'] is True
assert payload['allowed'] is False
PY
pass "quiet hours block enforced"

# 2) Daily limit
cat > "${STATE_FILE}" <<'JSON'
{
  "date": "2026-02-07",
  "dailyCount": 5,
  "lastInteraction": "2026-02-07T10:00:00",
  "lastIdlePing": "2026-02-07T10:00:00"
}
JSON

node "${RUNTIME_SCRIPT}" evaluate \
  --now "2026-02-07T12:00:00" \
  --max-daily 5 \
  --state "${STATE_FILE}" > "${TMP_ROOT}/limit.json"

python3 - "${TMP_ROOT}/limit.json" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert payload['allowed'] is False
assert payload['dailyCount'] >= payload['maxDaily']
PY
pass "daily limit enforced"

# 3) Idle trigger
cat > "${STATE_FILE}" <<'JSON'
{
  "date": "2026-02-07",
  "dailyCount": 0,
  "lastInteraction": "2026-02-07T08:00:00",
  "lastIdlePing": "2026-02-07T08:00:00"
}
JSON

node "${RUNTIME_SCRIPT}" evaluate \
  --now "2026-02-07T13:10:00" \
  --idle-threshold-hours 4 \
  --state "${STATE_FILE}" > "${TMP_ROOT}/idle.json"

python3 - "${TMP_ROOT}/idle.json" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert payload['idleTrigger'] is True
PY
pass "idle trigger detected"

# 4) Message generation
node "${RUNTIME_SCRIPT}" generate --trigger morning_greeting > "${TMP_ROOT}/msg.json"
python3 - "${TMP_ROOT}/msg.json" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert payload['message'].strip()
PY
pass "message generation non-empty"

# 5) Event trigger fixture (file change)
node "${DAEMON_SCRIPT}" tick \
  --repo "${REPO_ROOT}" \
  --workspace "${WORKSPACE}" \
  --config "${REPO_ROOT}/config/proactive.yaml" \
  --channels "${REPO_ROOT}/config/channels.yaml" \
  --state "${TMP_ROOT}/daemon-state.json" \
  --trigger "file_change" \
  --now "2026-02-07T06:00:00Z" \
  --channel "web" \
  --dry-run true > "${TMP_ROOT}/file_change.json"

python3 - "${TMP_ROOT}/file_change.json" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert payload['trigger'] == 'file_change'
assert payload['shouldSend'] is True
assert payload['dispatch'] is not None
assert payload['dispatch']['code'] == 0
PY
pass "file-change trigger dispatched"

# 6) Emotional trigger fixture
cat >> "${WORKSPACE}/memory/emotional/mood-log.md" <<'MD'

| 2026-02-05 | 1 | 压力较高 | 降低任务粒度 |
| 2026-02-06 | 2 | 焦虑 | 优先级拆分 |
| 2026-02-07 | 1 | 低落 | 先完成最小闭环 |
MD

node "${DAEMON_SCRIPT}" tick \
  --repo "${REPO_ROOT}" \
  --workspace "${WORKSPACE}" \
  --config "${REPO_ROOT}/config/proactive.yaml" \
  --channels "${REPO_ROOT}/config/channels.yaml" \
  --state "${TMP_ROOT}/daemon-state.json" \
  --trigger "emotion_support" \
  --now "2026-02-07T06:05:00Z" \
  --channel "web" \
  --dry-run true > "${TMP_ROOT}/emotion.json"

python3 - "${TMP_ROOT}/emotion.json" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert payload['trigger'] == 'emotion_support'
assert payload['shouldSend'] is True
assert payload['mood'] and payload['mood']['lowMood'] is True
PY
pass "emotional trigger dispatched"

# 7) Real API smoke (default strict fail when env missing)
strict_live="${PHASE2_LIVE_STRICT:-1}"
missing=0
for key in GOOGLE_CALENDAR_ID GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON OPENWEATHER_API_KEY OPENWEATHER_LAT OPENWEATHER_LON; do
  if [[ -z "${!key:-}" ]]; then
    echo "[MISSING_ENV] ${key}" >> "${TMP_ROOT}/live_missing.log"
    missing=$((missing + 1))
  fi
done

if (( missing > 0 )); then
  if [[ "${strict_live}" == "1" ]]; then
    fail "live smoke env missing (${missing})"
  else
    warn "live smoke skipped due to missing env (${missing})"
  fi
else
  node "${DAEMON_SCRIPT}" tick \
    --repo "${REPO_ROOT}" \
    --workspace "${WORKSPACE}" \
    --config "${REPO_ROOT}/config/proactive.yaml" \
    --channels "${REPO_ROOT}/config/channels.yaml" \
    --state "${TMP_ROOT}/daemon-state-live.json" \
    --trigger "weather_change" \
    --now "2026-02-07T06:10:00Z" \
    --channel "web" \
    --dry-run true > "${TMP_ROOT}/live_weather.json"

  python3 - "${TMP_ROOT}/live_weather.json" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert payload['weather'] and payload['weather']['ok'] is True
PY
  pass "openweather live smoke passed"

  node "${DAEMON_SCRIPT}" tick \
    --repo "${REPO_ROOT}" \
    --workspace "${WORKSPACE}" \
    --config "${REPO_ROOT}/config/proactive.yaml" \
    --channels "${REPO_ROOT}/config/channels.yaml" \
    --state "${TMP_ROOT}/daemon-state-live.json" \
    --trigger "calendar_event" \
    --now "2026-02-07T06:15:00Z" \
    --channel "web" \
    --dry-run true > "${TMP_ROOT}/live_calendar.json"

  python3 - "${TMP_ROOT}/live_calendar.json" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert payload['calendar'] and payload['calendar']['ok'] is True
PY
  pass "google calendar live smoke passed"
fi

# 8) Optional delivery test
if [[ "${PHASE2_SEND:-}" == "1" ]]; then
  if [[ -z "${DISCORD_CHANNEL_ID:-}" ]]; then
    fail "PHASE2_SEND=1 but DISCORD_CHANNEL_ID missing"
  else
    if node "${DISPATCH_SCRIPT}" send \
      --repo "${REPO_ROOT}" \
      --workspace "${WORKSPACE}" \
      --channels "${REPO_ROOT}/config/channels.yaml" \
      --channel "discord" \
      --target "${DISCORD_CHANNEL_ID}" \
      --session-id "phase2-proactive" \
      --message "[Phase2] proactive-engine test ping" >/tmp/phase2_send.log 2>&1; then
      pass "discord delivery attempted"
    else
      fail "discord delivery failed (see /tmp/phase2_send.log)"
    fi
  fi
else
  warn "delivery test skipped (set PHASE2_SEND=1 to send a real message)"
fi

echo
if (( fail_count > 0 )); then
  echo "=== Phase 2 Test Summary ==="
  echo "PASS: ${pass_count}"
  echo "WARN: ${warn_count}"
  echo "FAIL: ${fail_count}"
  exit 1
fi

echo "=== Phase 2 Test Summary ==="
echo "PASS: ${pass_count}"
echo "WARN: ${warn_count}"
echo "FAIL: ${fail_count}"
