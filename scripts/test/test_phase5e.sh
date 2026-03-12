#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

cd "${REPO_ROOT}"

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
  "packages/core/agents/vision.yaml" \
  "packages/core/orchestrator/vision.mjs" \
  "tests/orchestrator/vision.test.mjs" \
  "packages/plugin/src/tool-image-generate.ts" \
  "packages/plugin/src/tool-image-generate.test.ts"; do
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
done

if node "${REPO_ROOT}/tests/orchestrator/vision.test.mjs" >/tmp/phase5e_vision.log 2>&1; then
  pass "vision orchestrator test passed"
else
  fail "vision orchestrator test failed (see /tmp/phase5e_vision.log)"
fi

if node "${REPO_ROOT}/tests/orchestrator/router.test.mjs" >/tmp/phase5e_router.log 2>&1; then
  pass "router test passed"
else
  fail "router test failed (see /tmp/phase5e_router.log)"
fi

if node "${REPO_ROOT}/tests/orchestrator/decomposer.test.mjs" >/tmp/phase5e_decomposer.log 2>&1; then
  pass "decomposer test passed"
else
  fail "decomposer test failed (see /tmp/phase5e_decomposer.log)"
fi

if (cd "${REPO_ROOT}/packages/plugin" && pnpm exec vitest run src/*.test.ts) >/tmp/phase5e_plugin_vitest.log 2>&1; then
  pass "plugin vitest suite passed"
else
  fail "plugin vitest suite failed (see /tmp/phase5e_plugin_vitest.log)"
fi

if savc_ensure_openclaw_ready >/tmp/phase5e_openclaw_ready.log 2>&1; then
  pass "openclaw readiness passed"
else
  fail "openclaw readiness failed (see /tmp/phase5e_openclaw_ready.log)"
fi

TMP_ROOT="$(mktemp -d /tmp/savc_phase5e.XXXXXX)"
TMP_CONFIG="${TMP_ROOT}/openclaw.json"
TMP_MOCK="${TMP_ROOT}/image_mock.json"
TMP_REAL="${TMP_ROOT}/image_real.json"
BASE_PORT="${PHASE5E_GATEWAY_PORT:-18806}"
PORT=""
TOKEN="phase5e-token"
GATEWAY_PID=""

find_free_port() {
  local preferred="$1"
  python3 - "${preferred}" <<'PY'
from __future__ import annotations
import socket
import sys

preferred = int(sys.argv[1])

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

if preferred > 0 and bindable(preferred):
    print(preferred)
    raise SystemExit(0)

for port in range(max(1024, preferred + 1), preferred + 500):
    if bindable(port):
        print(port)
        raise SystemExit(0)

for _ in range(32):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    print(port)
    raise SystemExit(0)

raise SystemExit(1)
PY
}

PORT="$(find_free_port "${BASE_PORT}")" || {
  fail "failed to allocate gateway port near ${BASE_PORT}"
  exit 1
}
if [[ "${PORT}" != "${BASE_PORT}" ]]; then
  echo "[INFO] gateway port ${BASE_PORT} is busy, using ${PORT}"
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
      "workspace": "${REPO_ROOT}/packages/core",
      "model": {
        "primary": "anthropic/claude-sonnet-4"
      }
    }
  },
  "gateway": {
    "port": ${PORT},
    "bind": "loopback"
  }
}
JSON

if bash "${REPO_ROOT}/scripts/lifecycle/phase5_enable_plugins.sh" --config "${TMP_CONFIG}" --spawn-mode mock --sync-agents >/tmp/phase5e_enable.log 2>&1; then
  pass "phase5 enable script applied"
else
  fail "phase5 enable script failed (see /tmp/phase5e_enable.log)"
fi

OPENCLAW_CONFIG_PATH="${TMP_CONFIG}" OPENCLAW_GATEWAY_TOKEN="${TOKEN}" \
  node "${OPENCLAW_ROOT}/openclaw.mjs" gateway --port "${PORT}" --bind loopback --token "${TOKEN}" --allow-unconfigured \
  >/tmp/phase5e_gateway.log 2>&1 &
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
  fail "gateway did not start on port ${PORT} (see /tmp/phase5e_gateway.log)"
fi

invoke_tool() {
  local output_file="$1"
  local payload="$2"
  savc_local_curl -fsS "http://127.0.0.1:${PORT}/tools/invoke" \
    -H "authorization: Bearer ${TOKEN}" \
    -H "content-type: application/json" \
    --data "${payload}" >"${output_file}"
}

if invoke_tool "${TMP_MOCK}" '{"tool":"savc_image_generate","sessionKey":"main","args":{"prompt":"A minimalist SAVC logo","size":"1024x1024","quality":"standard","mode":"mock"}}'; then
  pass "savc_image_generate mock invoke succeeded"
else
  fail "savc_image_generate mock invoke failed"
fi

if python3 - "${TMP_MOCK}" <<'PY'
from __future__ import annotations
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
assert payload.get("ok") is True
details = ((payload.get("result") or {}).get("details") or {})
assert details.get("ok") is True
data = details.get("data") or {}
assert data.get("mode") == "mock"
result = data.get("result") or {}
assert result.get("mode") == "mock"
image = result.get("image") or {}
assert isinstance(image.get("url"), str) and image.get("url").startswith("mock://")
print("ok")
PY
then
  pass "mock image payload assertions passed (M-E4)"
else
  fail "mock image payload assertion failed"
fi

if node - <<'NODE'
import assert from 'node:assert/strict';
import { analyze } from './packages/core/orchestrator/decomposer.mjs';

const plan = await analyze('这个报错截图帮我排障 <media:image>', { agentsDir: 'packages/core/agents' });
assert.equal(plan.type, 'compound');
assert.equal(plan.execution, 'sequential');
assert.equal(plan.tasks[0].agent, 'vision');
assert.equal(plan.tasks[1].agent, 'technical');
console.log('ok');
NODE
then
  pass "vision -> technical collaboration decomposition passed (M-E5)"
else
  fail "vision -> technical decomposition check failed"
fi

if [[ "${PHASE5E_IMAGE_LIVE:-0}" == "1" ]]; then
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    warn "live image smoke skipped (PHASE5E_IMAGE_LIVE=1 but OPENAI_API_KEY missing)"
  else
    if invoke_tool "${TMP_REAL}" '{"tool":"savc_image_generate","sessionKey":"main","args":{"prompt":"A simple SAVC mascot icon","size":"1024x1024","quality":"standard","mode":"real"}}'; then
      if python3 - "${TMP_REAL}" <<'PY'
from __future__ import annotations
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
assert payload.get("ok") is True
details = ((payload.get("result") or {}).get("details") or {})
assert details.get("ok") is True
data = details.get("data") or {}
assert data.get("mode") == "real"
result = data.get("result") or {}
assert result.get("mode") == "real"
image = result.get("image") or {}
assert image.get("url") or image.get("b64_json")
print("ok")
PY
      then
        pass "real image live smoke passed"
      else
        fail "real image live smoke assertion failed"
      fi
    else
      fail "real image live smoke invoke failed"
    fi
  fi
else
  warn "live image smoke skipped (PHASE5E_IMAGE_LIVE!=1)"
fi

echo "=== Phase 5e Test Summary ==="
echo "PASS: ${pass_count}"
echo "WARN: ${warn_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
