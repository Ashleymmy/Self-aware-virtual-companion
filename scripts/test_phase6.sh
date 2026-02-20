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
  "savc-core/orchestrator/live2d.mjs" \
  "savc-core/orchestrator/voice.mjs" \
  "tests/orchestrator/live2d.test.mjs" \
  "tests/orchestrator/live2d-voice-chain.test.mjs" \
  "openclaw/extensions/savc-orchestrator/src/tool-live2d-signal.ts" \
  "openclaw/extensions/savc-orchestrator/src/tool-live2d-signal.test.ts" \
  "openclaw/extensions/savc-orchestrator/src/tool-voice-call.ts" \
  "savc-ui/src/ui/live2d-runtime.ts" \
  "savc-ui/src/ui/live2d-channel.ts" \
  "savc-ui/src/ui/views/chat.ts"; do
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
done

if (cd "${REPO_ROOT}" && pnpm --dir savc-ui build) >/tmp/phase6_savc_ui_build.log 2>&1; then
  pass "savc-ui build passed"
else
  fail "savc-ui build failed (see /tmp/phase6_savc_ui_build.log)"
fi

if node "${REPO_ROOT}/tests/orchestrator/live2d.test.mjs" >/tmp/phase6_live2d.log 2>&1; then
  pass "live2d orchestrator test passed"
else
  fail "live2d orchestrator test failed (see /tmp/phase6_live2d.log)"
fi

if node "${REPO_ROOT}/tests/orchestrator/live2d-voice-chain.test.mjs" >/tmp/phase6_live2d_chain.log 2>&1; then
  pass "live2d+voice orchestration chain test passed"
else
  fail "live2d+voice orchestration chain test failed (see /tmp/phase6_live2d_chain.log)"
fi

if node - <<'NODE'
import assert from 'node:assert/strict';
import { spawnAgent, waitForAgent } from './savc-core/orchestrator/lifecycle.mjs';

const runId = await spawnAgent(
  { name: 'voice', limits: { timeout_seconds: 3 } },
  '继续语音播报一下今天的安排',
  {},
);
const done = await waitForAgent(runId, 5000);
assert.equal(done.status, 'completed');
const output = String(done.output || '');
assert.equal(output.includes('live2dEmotion='), true);
assert.equal(output.includes('lipSyncFrames='), true);
console.log('ok');
NODE
then
  pass "voice lifecycle emits live2d signal markers"
else
  fail "voice lifecycle live2d marker check failed"
fi

if node - <<'NODE'
import assert from 'node:assert/strict';
import { spawnAgent, waitForAgent } from './savc-core/orchestrator/lifecycle.mjs';

const runId = await spawnAgent(
  { name: 'live2d', limits: { timeout_seconds: 3 } },
  '点击模型并开心挥手',
  {},
);
const done = await waitForAgent(runId, 5000);
assert.equal(done.status, 'completed');
const output = String(done.output || '');
assert.equal(output.includes('source=interaction'), true);
assert.equal(output.includes('live2dInteractionType='), true);
assert.equal(output.includes('live2dEmotion='), true);
console.log('ok');
NODE
then
  pass "live2d lifecycle emits interaction signal markers"
else
  fail "live2d lifecycle marker check failed"
fi

if node - <<'NODE'
import assert from 'node:assert/strict';
import { analyze } from './savc-core/orchestrator/decomposer.mjs';

const plan = await analyze('点击模型并语音播报一句欢迎回来', {
  agentsDir: 'savc-core/agents',
});
assert.equal(plan.type, 'compound');
assert.equal(plan.execution, 'sequential');
assert.equal(plan.tasks.length, 2);
assert.equal(plan.tasks[0].agent, 'live2d');
assert.equal(plan.tasks[1].agent, 'voice');
assert.equal(Array.isArray(plan.tasks[1].dependsOn), true);
assert.equal(plan.tasks[1].dependsOn[0], 'task-1');
console.log('ok');
NODE
then
  pass "decomposer emits live2d->voice chain for interaction+voice task"
else
  fail "decomposer live2d->voice chain check failed"
fi

if (cd "${REPO_ROOT}/openclaw" && pnpm exec vitest run extensions/savc-orchestrator/src/*.test.ts) >/tmp/phase6_plugin_vitest.log 2>&1; then
  pass "plugin vitest suite passed"
else
  fail "plugin vitest suite failed (see /tmp/phase6_plugin_vitest.log)"
fi

TMP_ROOT="$(mktemp -d /tmp/savc_phase6.XXXXXX)"
TMP_CONFIG="${TMP_ROOT}/openclaw.json"
TMP_VOICE="${TMP_ROOT}/live2d_voice.json"
TMP_INTERACTION="${TMP_ROOT}/live2d_interaction.json"
TMP_TASK_SIGNAL="${TMP_ROOT}/live2d_task.json"
TMP_SPAWN_SIGNAL="${TMP_ROOT}/live2d_spawn.json"
TMP_AGENT_STATUS="${TMP_ROOT}/live2d_agent_status.json"
TMP_VOICECALL="${TMP_ROOT}/voicecall_live2d.json"
TMP_VOICECALL_END="${TMP_ROOT}/voicecall_end.json"
TMP_VOICE_STORE="${TMP_ROOT}/voice-store"
BASE_PORT="${PHASE6_GATEWAY_PORT:-18807}"
BASE_VOICE_WEBHOOK_PORT="${PHASE6_VOICE_WEBHOOK_PORT:-3336}"
PORT=""
VOICE_WEBHOOK_PORT=""
TOKEN="phase6-token"
GATEWAY_PID=""

find_free_port() {
  local preferred="$1"
  local avoid="${2:-}"
  python3 - "${preferred}" "${avoid}" <<'PY'
from __future__ import annotations
import socket
import sys

preferred = int(sys.argv[1])
avoid = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else None

def bindable(port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("127.0.0.1", port))
    except OSError:
        sock.close()
        return False
    sock.close()
    return True

if preferred > 0 and preferred != avoid and bindable(preferred):
    print(preferred)
    raise SystemExit(0)

for port in range(max(1024, preferred + 1), preferred + 500):
    if port != avoid and bindable(port):
        print(port)
        raise SystemExit(0)

for _ in range(32):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    if port != avoid:
        print(port)
        raise SystemExit(0)

raise SystemExit(1)
PY
}

PORT="$(find_free_port "${BASE_PORT}")" || {
  fail "failed to allocate gateway port near ${BASE_PORT}"
  exit 1
}
VOICE_WEBHOOK_PORT="$(find_free_port "${BASE_VOICE_WEBHOOK_PORT}" "${PORT}")" || {
  fail "failed to allocate voice webhook port near ${BASE_VOICE_WEBHOOK_PORT}"
  exit 1
}
if [[ "${PORT}" != "${BASE_PORT}" ]]; then
  echo "[INFO] gateway port ${BASE_PORT} is busy, using ${PORT}"
fi
if [[ "${VOICE_WEBHOOK_PORT}" != "${BASE_VOICE_WEBHOOK_PORT}" ]]; then
  echo "[INFO] voice webhook port ${BASE_VOICE_WEBHOOK_PORT} is busy, using ${VOICE_WEBHOOK_PORT}"
fi

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

if bash "${REPO_ROOT}/scripts/phase5_enable_plugins.sh" --config "${TMP_CONFIG}" --spawn-mode mock --sync-agents >/tmp/phase6_enable.log 2>&1; then
  pass "phase5/6 enable script applied"
else
  fail "phase5/6 enable script failed (see /tmp/phase6_enable.log)"
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
  fail "failed to patch temp config for voice webhook/store"
fi

OPENCLAW_CONFIG_PATH="${TMP_CONFIG}" OPENCLAW_GATEWAY_TOKEN="${TOKEN}" \
  node "${REPO_ROOT}/openclaw/openclaw.mjs" gateway --port "${PORT}" --token "${TOKEN}" --allow-unconfigured --force \
  >/tmp/phase6_gateway.log 2>&1 &
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
  fail "gateway did not start on port ${PORT} (see /tmp/phase6_gateway.log)"
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

if invoke_tool_retry "${TMP_VOICE}" '{"tool":"savc_live2d_signal","sessionKey":"main","args":{"source":"voice","message":"你好呀，我们继续今天的计划。","emotion":"comfort","energy":0.85}}' 20; then
  pass "savc_live2d_signal voice invoke succeeded"
else
  fail "savc_live2d_signal voice invoke failed"
fi

if invoke_tool_retry "${TMP_INTERACTION}" '{"tool":"savc_live2d_signal","sessionKey":"main","args":{"source":"interaction","interactionType":"tap","intensity":1.1}}' 20; then
  pass "savc_live2d_signal interaction invoke succeeded"
else
  fail "savc_live2d_signal interaction invoke failed"
fi

if invoke_tool_retry "${TMP_TASK_SIGNAL}" '{"tool":"savc_live2d_signal","sessionKey":"main","args":{"task":"请语音播报一句欢迎回来","emotion":"comfort"}}' 20; then
  pass "savc_live2d_signal task inference invoke succeeded"
else
  fail "savc_live2d_signal task inference invoke failed"
fi

if invoke_tool_ok_retry "${TMP_SPAWN_SIGNAL}" '{"tool":"savc_spawn_expert","sessionKey":"main","args":{"agent":"technical","task":"请语音播报一句欢迎回来","wait":true}}' 20; then
  pass "savc_spawn_expert live2d bridge invoke succeeded"
else
  fail "savc_spawn_expert live2d bridge invoke failed"
fi

SPAWN_RUN_ID="$(python3 - "${TMP_SPAWN_SIGNAL}" <<'PY'
from __future__ import annotations
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
assert payload.get("ok") is True
details = ((payload.get("result") or {}).get("details") or {})
assert details.get("ok") is True
data = details.get("data") or {}
result = data.get("result") or {}
run_id = result.get("runId")
assert isinstance(run_id, str) and run_id
print(run_id)
PY
)"
pass "spawn runId captured=${SPAWN_RUN_ID}"

if invoke_tool_ok_retry "${TMP_AGENT_STATUS}" "{\"tool\":\"savc_agent_status\",\"sessionKey\":\"main\",\"args\":{\"runId\":\"${SPAWN_RUN_ID}\"}}" 20; then
  pass "savc_agent_status live2d bridge invoke succeeded"
else
  fail "savc_agent_status live2d bridge invoke failed"
fi

if invoke_tool_ok_retry "${TMP_VOICECALL}" '{"tool":"savc_voice_call","sessionKey":"main","args":{"action":"initiate","to":"+15550001234","message":"你好，我们开始通话","mode":"conversation","emotion":"empathetic"}}' 20; then
  pass "savc_voice_call invoke succeeded"
else
  fail "savc_voice_call invoke failed"
fi

VOICE_CALL_ID="$(python3 - "${TMP_VOICECALL}" <<'PY'
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
pass "voice call initiated callId=${VOICE_CALL_ID}"

if invoke_tool_ok_retry "${TMP_VOICECALL_END}" "{\"tool\":\"savc_voice_call\",\"sessionKey\":\"main\",\"args\":{\"action\":\"end\",\"callId\":\"${VOICE_CALL_ID}\"}}" 20; then
  pass "savc_voice_call end succeeded"
else
  fail "savc_voice_call end failed"
fi

if python3 - "${TMP_VOICE}" "${TMP_INTERACTION}" "${TMP_TASK_SIGNAL}" "${TMP_SPAWN_SIGNAL}" "${TMP_AGENT_STATUS}" "${TMP_VOICECALL}" "${TMP_VOICECALL_END}" <<'PY'
from __future__ import annotations
import json
import sys

voice = json.load(open(sys.argv[1], "r", encoding="utf-8"))
interaction = json.load(open(sys.argv[2], "r", encoding="utf-8"))
task_signal = json.load(open(sys.argv[3], "r", encoding="utf-8"))
spawn_signal = json.load(open(sys.argv[4], "r", encoding="utf-8"))
agent_status = json.load(open(sys.argv[5], "r", encoding="utf-8"))
voicecall = json.load(open(sys.argv[6], "r", encoding="utf-8"))
voicecall_end = json.load(open(sys.argv[7], "r", encoding="utf-8"))

for payload in [voice, interaction, task_signal]:
    assert payload.get("ok") is True
    details = ((payload.get("result") or {}).get("details") or {})
    assert details.get("ok") is True
    data = details.get("data") or {}
    signal = data.get("signal") or {}
    assert signal.get("version") == "phase6-v1"
    assert signal.get("motion")

voice_signal = ((((voice.get("result") or {}).get("details") or {}).get("data") or {}).get("signal") or {})
assert voice_signal.get("source") == "voice"
assert isinstance(voice_signal.get("lipSync"), list) and len(voice_signal.get("lipSync")) > 0

interaction_signal = ((((interaction.get("result") or {}).get("details") or {}).get("data") or {}).get("signal") or {})
assert interaction_signal.get("source") == "interaction"
assert interaction_signal.get("interaction", {}).get("type") == "tap"

task_data = (((task_signal.get("result") or {}).get("details") or {}).get("data") or {})
task_out = task_data.get("signal") or {}
assert task_data.get("source") == "voice"
assert task_out.get("source") == "voice"
assert isinstance(task_out.get("lipSync"), list) and len(task_out.get("lipSync")) > 0

assert spawn_signal.get("ok") is True
spawn_details = ((spawn_signal.get("result") or {}).get("details") or {})
assert spawn_details.get("ok") is True
spawn_data = spawn_details.get("data") or {}
spawn_live2d = spawn_data.get("live2d") or {}
assert spawn_live2d.get("attempted") is True
spawn_live2d_signal = spawn_live2d.get("signal") or {}
assert spawn_live2d_signal.get("version") == "phase6-v1"
assert spawn_live2d_signal.get("source") == "voice"

assert agent_status.get("ok") is True
status_details = ((agent_status.get("result") or {}).get("details") or {})
assert status_details.get("ok") is True
status_data = status_details.get("data") or {}
assert status_data.get("status") == "completed"
status_live2d = status_data.get("live2d") or {}
assert status_live2d.get("attempted") is True
status_live2d_signal = status_live2d.get("signal") or {}
assert status_live2d_signal.get("version") == "phase6-v1"

assert voicecall.get("ok") is True
voicecall_details = ((voicecall.get("result") or {}).get("details") or {})
assert voicecall_details.get("ok") is True
voicecall_data = voicecall_details.get("data") or {}
live2d_signal = voicecall_data.get("live2dSignal") or {}
assert live2d_signal.get("version") == "phase6-v1"
assert live2d_signal.get("source") == "voice"
assert live2d_signal.get("emotion") in {"comfort", "neutral", "happy", "calm", "focused", "thinking", "sad", "excited"}

assert voicecall_end.get("ok") is True
end_details = ((voicecall_end.get("result") or {}).get("details") or {})
assert end_details.get("ok") is True

print("ok")
PY
then
  pass "phase6 signal payload assertions passed"
else
  fail "phase6 signal payload assertion failed"
fi

echo "=== Phase 6 Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
