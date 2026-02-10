#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

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

for file in \
  "openclaw/extensions/savc-orchestrator/src/real-session-adapter.ts" \
  "openclaw/extensions/savc-orchestrator/src/run-store.ts" \
  "scripts/phase4b_enable_plugin.sh"; do
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
done

if (cd "${REPO_ROOT}/openclaw" && pnpm exec vitest run extensions/savc-orchestrator/src/*.test.ts) >/tmp/phase4b_plugin_real_vitest.log 2>&1; then
  pass "plugin vitest suite passed"
else
  fail "plugin vitest suite failed (see /tmp/phase4b_plugin_real_vitest.log)"
fi

TMP_ROOT="$(mktemp -d /tmp/savc_phase4b_plugin_real.XXXXXX)"
TMP_CONFIG="${TMP_ROOT}/openclaw.json"
TMP_ROUTE="${TMP_ROOT}/route.json"
TMP_DECOMPOSE="${TMP_ROOT}/decompose.json"
TMP_SPAWN="${TMP_ROOT}/spawn.json"
TMP_STATUS="${TMP_ROOT}/status.json"

PORT="${PHASE4B_PLUGIN_REAL_PORT:-18795}"
TOKEN="phase4b-real-token"
GATEWAY_PID=""

cleanup() {
  if [[ -n "${GATEWAY_PID}" ]]; then
    kill "${GATEWAY_PID}" >/dev/null 2>&1 || true
    wait "${GATEWAY_PID}" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_ROOT}"
}
trap cleanup EXIT INT TERM

cat > "${TMP_CONFIG}" <<JSON
{
  "agents": {
    "defaults": {
      "workspace": "${REPO_ROOT}/savc-core",
      "model": {
        "primary": "anthropic/claude-sonnet-4"
      }
    }
  },
  "gateway": {
    "port": ${PORT}
  }
}
JSON

if bash "${REPO_ROOT}/scripts/phase4b_enable_plugin.sh" --config "${TMP_CONFIG}" --spawn-mode real --sync-agents >/tmp/phase4b_enable_real.log 2>&1; then
  pass "phase4b enable script applied for real mode"
else
  fail "phase4b enable script failed for real mode (see /tmp/phase4b_enable_real.log)"
fi

OPENCLAW_CONFIG_PATH="${TMP_CONFIG}" OPENCLAW_GATEWAY_TOKEN="${TOKEN}" \
  node "${REPO_ROOT}/openclaw/openclaw.mjs" gateway --port "${PORT}" --token "${TOKEN}" --allow-unconfigured --force \
  >/tmp/phase4b_plugin_real_gateway.log 2>&1 &
GATEWAY_PID=$!

ready=0
for _ in $(seq 1 60); do
  if (echo >"/dev/tcp/127.0.0.1/${PORT}") >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "${ready}" == "1" ]]; then
  pass "gateway started on port ${PORT}"
else
  fail "gateway did not start on port ${PORT} (see /tmp/phase4b_plugin_real_gateway.log)"
fi

invoke_tool() {
  local output_file="$1"
  local payload="$2"
  curl -fsS "http://127.0.0.1:${PORT}/tools/invoke" \
    -H "authorization: Bearer ${TOKEN}" \
    -H "content-type: application/json" \
    --data "${payload}" >"${output_file}"
}

invoke_tool_retry() {
  local output_file="$1"
  local payload="$2"
  local attempts="${3:-20}"
  local i=0
  while (( i < attempts )); do
    if invoke_tool "${output_file}" "${payload}"; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

if invoke_tool_retry "${TMP_ROUTE}" '{"tool":"savc_route","sessionKey":"main","args":{"message":"抱抱我"}}' 20; then
  pass "savc_route invoke succeeded"
else
  fail "savc_route invoke failed"
fi

if invoke_tool_retry "${TMP_DECOMPOSE}" '{"tool":"savc_decompose","sessionKey":"main","args":{"message":"帮我写代码，顺便记住偏好"}}' 20; then
  pass "savc_decompose invoke succeeded"
else
  fail "savc_decompose invoke failed"
fi

if invoke_tool_retry "${TMP_SPAWN}" '{"tool":"savc_spawn_expert","sessionKey":"main","args":{"agent":"technical","task":"请给出一个简短实现建议","wait":false,"useSessionsSend":true}}' 20; then
  pass "savc_spawn_expert invoke succeeded"
else
  fail "savc_spawn_expert invoke failed"
fi

RUN_ID="$(python3 - "${TMP_SPAWN}" <<'PY'
from __future__ import annotations
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
assert payload.get("ok") is True
result = payload.get("result") or {}
details = result.get("details") or {}
assert details.get("ok") is True
data = details.get("data") or {}
spawn = data.get("spawn") or {}
assert spawn.get("mode") == "real"
assert isinstance(spawn.get("childSessionKey"), str) and spawn.get("childSessionKey")
sessions_send = spawn.get("sessionsSend") or {}
assert sessions_send.get("attempted") is True
assert sessions_send.get("status") in {"accepted", "ok", "timeout", "error"}
run = data.get("result") or {}
run_id = run.get("runId")
assert isinstance(run_id, str) and run_id
print(run_id)
PY
)"
pass "savc_spawn_expert returned real runId=${RUN_ID}"

if invoke_tool_retry "${TMP_STATUS}" "{\"tool\":\"savc_agent_status\",\"sessionKey\":\"main\",\"args\":{\"runId\":\"${RUN_ID}\"}}" 20; then
  pass "savc_agent_status invoke succeeded"
else
  fail "savc_agent_status invoke failed"
fi

if python3 - "${TMP_ROUTE}" "${TMP_DECOMPOSE}" "${TMP_STATUS}" <<'PY'
from __future__ import annotations
import json
import sys

route = json.load(open(sys.argv[1], "r", encoding="utf-8"))
decompose = json.load(open(sys.argv[2], "r", encoding="utf-8"))
status = json.load(open(sys.argv[3], "r", encoding="utf-8"))

assert route.get("ok") is True
route_details = (route.get("result") or {}).get("details") or {}
assert route_details.get("ok") is True
route_agent = ((route_details.get("data") or {}).get("agent"))
assert isinstance(route_agent, str) and route_agent

assert decompose.get("ok") is True
decompose_details = (decompose.get("result") or {}).get("details") or {}
assert decompose_details.get("ok") is True
decompose_data = decompose_details.get("data") or {}
assert decompose_data.get("type") in {"simple", "compound"}

assert status.get("ok") is True
status_details = (status.get("result") or {}).get("details") or {}
assert status_details.get("ok") is True
status_data = status_details.get("data") or {}
value = status_data.get("status")
assert value in {"running", "completed", "failed", "timeout"}
print("ok")
PY
then
  pass "tool payloads contain valid structured details"
else
  fail "tool payload assertion failed"
fi

strict="${PHASE4B_DISCORD_STRICT:-0}"
if [[ -z "${DISCORD_BOT_TOKEN:-}" || -z "${DISCORD_CHANNEL_ID:-}" ]]; then
  if [[ "${strict}" == "1" ]]; then
    fail "discord env missing while PHASE4B_DISCORD_STRICT=1"
  else
    warn "discord e2e skipped (missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID)"
  fi
else
  if OPENCLAW_CONFIG_PATH="${TMP_CONFIG}" OPENCLAW_GATEWAY_TOKEN="${TOKEN}" \
    node "${REPO_ROOT}/openclaw/openclaw.mjs" message send --channel discord --target "${DISCORD_CHANNEL_ID}" \
    --message "[Phase4b real] discord probe ping" >/tmp/phase4b_plugin_real_discord_probe.log 2>&1; then
    pass "discord probe message sent"
  else
    fail "discord probe message failed (see /tmp/phase4b_plugin_real_discord_probe.log)"
  fi

  if OPENCLAW_CONFIG_PATH="${TMP_CONFIG}" OPENCLAW_GATEWAY_TOKEN="${TOKEN}" \
    node "${REPO_ROOT}/openclaw/openclaw.mjs" message send --channel discord --target "${DISCORD_CHANNEL_ID}" \
    --message "[Phase4b real] runId=${RUN_ID} status check ready" >/tmp/phase4b_plugin_real_discord_chain.log 2>&1; then
    pass "discord chain summary message sent"
  else
    fail "discord chain summary message failed (see /tmp/phase4b_plugin_real_discord_chain.log)"
  fi
fi

echo "=== Phase 4b Plugin Real Test Summary ==="
echo "PASS: ${pass_count}"
echo "WARN: ${warn_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
