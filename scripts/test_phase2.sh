#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
RUNTIME_SCRIPT="${REPO_ROOT}/scripts/proactive_runtime.mjs"

TMP_ROOT="/tmp/savc_phase2_runtime"
STATE_FILE="${TMP_ROOT}/state.json"

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

mkdir -p "${TMP_ROOT}"

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

# 5) Optional delivery test
if [[ "${PHASE2_SEND:-}" == "1" ]]; then
  # shellcheck disable=SC1090
  source "${REPO_ROOT}/config/.env.local"
  if [[ -z "${DISCORD_CHANNEL_ID:-}" ]]; then
    warn "PHASE2_SEND=1 but DISCORD_CHANNEL_ID missing; skipping send"
  else
    if bash "${REPO_ROOT}/scripts/openclaw.sh" agent --local \
      --session-id "phase2-proactive" \
      --message "[Phase2] proactive-engine test ping" \
      --deliver \
      --reply-channel discord \
      --reply-to "channel:${DISCORD_CHANNEL_ID}" \
      --json >/tmp/phase2_send.log 2>&1; then
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
