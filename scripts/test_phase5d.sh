#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

pass_count=0
fail_count=0

pass() {
  echo "[PASS] $*"
  pass_count=$((pass_count + 1))
}

fail() {
  echo "[FAIL] $*"
  fail_count=$((fail_count + 1))
}

for file in \
  "savc-core/agents/voice.yaml" \
  "savc-core/orchestrator/voice.mjs" \
  "tests/orchestrator/voice.test.mjs" \
  "openclaw/extensions/savc-orchestrator/src/tool-voice-call.ts" \
  "openclaw/extensions/savc-orchestrator/src/tool-voice-call.test.ts" \
  "scripts/phase5_enable_plugins.sh"; do
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
done

if node "${REPO_ROOT}/tests/orchestrator/voice.test.mjs" >/tmp/phase5d_voice.log 2>&1; then
  pass "voice orchestrator test passed"
else
  fail "voice orchestrator test failed (see /tmp/phase5d_voice.log)"
fi

if (cd "${REPO_ROOT}/openclaw" && pnpm exec vitest run extensions/savc-orchestrator/src/*.test.ts) >/tmp/phase5d_plugin_vitest.log 2>&1; then
  pass "plugin vitest suite passed"
else
  fail "plugin vitest suite failed (see /tmp/phase5d_plugin_vitest.log)"
fi

TMP_ROOT="$(mktemp -d /tmp/savc_phase5d.XXXXXX)"
TMP_CONFIG="${TMP_ROOT}/openclaw.json"
TMP_INIT="${TMP_ROOT}/voice_init.json"
TMP_SPEAK="${TMP_ROOT}/voice_speak.json"
TMP_CONTINUE="${TMP_ROOT}/voice_continue.json"
TMP_STATUS="${TMP_ROOT}/voice_status.json"
TMP_END="${TMP_ROOT}/voice_end.json"
TMP_VOICE_STORE="${TMP_ROOT}/voice-store"
PORT="${PHASE5D_GATEWAY_PORT:-18805}"
VOICE_WEBHOOK_PORT="${PHASE5D_VOICE_WEBHOOK_PORT:-3334}"
TOKEN="phase5d-token"
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

if bash "${REPO_ROOT}/scripts/phase5_enable_plugins.sh" --config "${TMP_CONFIG}" --spawn-mode mock --sync-agents >/tmp/phase5d_enable.log 2>&1; then
  pass "phase5 enable script applied"
else
  fail "phase5 enable script failed (see /tmp/phase5d_enable.log)"
fi

if python3 - "${TMP_CONFIG}" "${VOICE_WEBHOOK_PORT}" "${TMP_VOICE_STORE}" <<'PY'
from __future__ import annotations
import json
import sys

path = sys.argv[1]
port = int(sys.argv[2])
store_path = sys.argv[3]
cfg = json.load(open(path, "r", encoding="utf-8"))
voice = cfg.setdefault("plugins", {}).setdefault("entries", {}).setdefault("voice-call", {})
voice["enabled"] = True
vcfg = voice.setdefault("config", {})
vcfg.setdefault("provider", "mock")
vcfg["serve"] = {"port": port, "bind": "127.0.0.1", "path": "/voice/webhook"}
vcfg["store"] = store_path
open(path, "w", encoding="utf-8").write(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n")
print("ok")
PY
then
  pass "temp config patched with voice webhook/store"
else
  fail "failed to patch temp config for voice webhook"
fi

OPENCLAW_CONFIG_PATH="${TMP_CONFIG}" OPENCLAW_GATEWAY_TOKEN="${TOKEN}" \
  node "${REPO_ROOT}/openclaw/openclaw.mjs" gateway --port "${PORT}" --token "${TOKEN}" --allow-unconfigured --force \
  >/tmp/phase5d_gateway.log 2>&1 &
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
  fail "gateway did not start on port ${PORT} (see /tmp/phase5d_gateway.log)"
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

invoke_tool_ok_retry() {
  local output_file="$1"
  local payload="$2"
  local attempts="${3:-20}"
  local i=0
  while (( i < attempts )); do
    if invoke_tool "${output_file}" "${payload}"; then
      if python3 - "${output_file}" <<'PY'
from __future__ import annotations
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
details = ((payload.get("result") or {}).get("details") or {})
assert payload.get("ok") is True
assert details.get("ok") is True
print("ok")
PY
      then
        return 0
      fi
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

if invoke_tool_ok_retry "${TMP_INIT}" '{"tool":"savc_voice_call","sessionKey":"main","args":{"action":"initiate","to":"+15550001234","message":"你好，我们开始语音会话","mode":"conversation","emotion":"empathetic"}}' 20; then
  pass "savc_voice_call initiate succeeded"
else
  fail "savc_voice_call initiate failed"
fi

CALL_ID="$(python3 - "${TMP_INIT}" <<'PY'
from __future__ import annotations
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
assert payload.get("ok") is True
details = ((payload.get("result") or {}).get("details") or {})
assert details.get("ok") is True
data = details.get("data") or {}
result = data.get("result") or {}
call_id = result.get("callId")
assert isinstance(call_id, str) and call_id
print(call_id)
PY
)"
pass "voice call initiated callId=${CALL_ID}"

if invoke_tool_ok_retry "${TMP_SPEAK}" "{\"tool\":\"savc_voice_call\",\"sessionKey\":\"main\",\"args\":{\"action\":\"speak\",\"callId\":\"${CALL_ID}\",\"message\":\"我先说一句欢迎词\"}}" 20; then
  pass "savc_voice_call speak succeeded"
else
  fail "savc_voice_call speak failed"
fi

(
  sleep 1
  curl -fsS "http://127.0.0.1:${VOICE_WEBHOOK_PORT}/voice/webhook" \
    -H "content-type: application/json" \
    --data "{\"event\":{\"type\":\"call.speech\",\"callId\":\"${CALL_ID}\",\"transcript\":\"我打断一下\",\"isFinal\":true}}" \
    >/tmp/phase5d_voice_webhook.log 2>&1 || true
) &

if invoke_tool_ok_retry "${TMP_CONTINUE}" "{\"tool\":\"savc_voice_call\",\"sessionKey\":\"main\",\"args\":{\"action\":\"continue\",\"callId\":\"${CALL_ID}\",\"message\":\"继续说说你的问题\"}}" 20; then
  pass "savc_voice_call continue succeeded"
else
  fail "savc_voice_call continue failed"
fi

if invoke_tool_ok_retry "${TMP_STATUS}" "{\"tool\":\"savc_voice_call\",\"sessionKey\":\"main\",\"args\":{\"action\":\"status\",\"callId\":\"${CALL_ID}\"}}" 20; then
  pass "savc_voice_call status succeeded"
else
  fail "savc_voice_call status failed"
fi

if invoke_tool_ok_retry "${TMP_END}" "{\"tool\":\"savc_voice_call\",\"sessionKey\":\"main\",\"args\":{\"action\":\"end\",\"callId\":\"${CALL_ID}\"}}" 20; then
  pass "savc_voice_call end succeeded"
else
  fail "savc_voice_call end failed"
fi

if python3 - "${TMP_SPEAK}" "${TMP_CONTINUE}" "${TMP_STATUS}" "${TMP_END}" <<'PY'
from __future__ import annotations
import json
import sys

speak = json.load(open(sys.argv[1], "r", encoding="utf-8"))
cont = json.load(open(sys.argv[2], "r", encoding="utf-8"))
status = json.load(open(sys.argv[3], "r", encoding="utf-8"))
end = json.load(open(sys.argv[4], "r", encoding="utf-8"))

for payload in [speak, cont, status, end]:
    assert payload.get("ok") is True
    details = ((payload.get("result") or {}).get("details") or {})
    assert details.get("ok") is True

cont_data = (((cont.get("result") or {}).get("details") or {}).get("data") or {})
cont_result = cont_data.get("result") or {}
transcript = cont_result.get("transcript")
assert isinstance(transcript, str) and transcript.strip() == "我打断一下"

status_data = (((status.get("result") or {}).get("details") or {}).get("data") or {})
status_result = status_data.get("result") or {}
assert "found" in status_result

print("ok")
PY
then
  pass "voice payload assertions passed (M-D1~M-D5 mapped)"
else
  fail "voice payload assertion failed"
fi

echo "=== Phase 5d Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
