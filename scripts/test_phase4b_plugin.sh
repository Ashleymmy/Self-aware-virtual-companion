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
  "openclaw/extensions/savc-orchestrator/package.json" \
  "openclaw/extensions/savc-orchestrator/openclaw.plugin.json" \
  "openclaw/extensions/savc-orchestrator/index.ts" \
  "openclaw/extensions/savc-orchestrator/src/tool-route.ts" \
  "openclaw/extensions/savc-orchestrator/src/tool-decompose.ts" \
  "openclaw/extensions/savc-orchestrator/src/tool-spawn-expert.ts" \
  "openclaw/extensions/savc-orchestrator/src/tool-agent-status.ts" \
  "scripts/phase4b_enable_plugin.sh"; do
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
done

if (cd "${REPO_ROOT}/openclaw" && pnpm exec vitest run extensions/savc-orchestrator/src/*.test.ts) >/tmp/phase4b_plugin_vitest.log 2>&1; then
  pass "plugin vitest suite passed"
else
  fail "plugin vitest suite failed (see /tmp/phase4b_plugin_vitest.log)"
fi

TMP_ROOT="$(mktemp -d /tmp/savc_phase4b_plugin.XXXXXX)"
TMP_CONFIG="${TMP_ROOT}/openclaw.json"
TMP_PLUGIN_LIST="${TMP_ROOT}/plugins-list.json"

cat > "${TMP_CONFIG}" <<JSON
{
  "agents": {
    "defaults": {
      "workspace": "${REPO_ROOT}/savc-core",
      "model": {
        "primary": "anthropic/claude-sonnet-4"
      }
    }
  }
}
JSON

if bash "${REPO_ROOT}/scripts/phase4b_enable_plugin.sh" --config "${TMP_CONFIG}" >/tmp/phase4b_enable_once.log 2>&1; then
  pass "phase4b enable script first run passed"
else
  fail "phase4b enable script first run failed (see /tmp/phase4b_enable_once.log)"
fi

if bash "${REPO_ROOT}/scripts/phase4b_enable_plugin.sh" --config "${TMP_CONFIG}" >/tmp/phase4b_enable_twice.log 2>&1; then
  pass "phase4b enable script second run passed (idempotent)"
else
  fail "phase4b enable script second run failed (see /tmp/phase4b_enable_twice.log)"
fi

if OPENCLAW_CONFIG_PATH="${TMP_CONFIG}" node "${REPO_ROOT}/openclaw/openclaw.mjs" plugins list --json >"${TMP_PLUGIN_LIST}" 2>/tmp/phase4b_plugin_list.err; then
  pass "plugins list command succeeded with temp config"
else
  fail "plugins list command failed (see /tmp/phase4b_plugin_list.err)"
fi

if python3 - "${TMP_CONFIG}" <<'PY'
from __future__ import annotations
import json
import sys

cfg = json.load(open(sys.argv[1], "r", encoding="utf-8"))

entry = cfg["plugins"]["entries"]["savc-orchestrator"]
assert entry["enabled"] is True
assert entry["config"]["spawnMode"] == "mock"

assert cfg["tools"]["agentToAgent"]["enabled"] is True
allow = cfg["tools"]["agentToAgent"]["allow"]
for agent in ["main", "orchestrator", "companion", "technical", "creative", "tooling", "memory", "vibe-coder", "voice", "vision"]:
    assert agent in allow

also_allow = cfg["tools"]["alsoAllow"]
for key in [
    "savc-orchestrator",
    "savc_route",
    "savc_decompose",
    "savc_spawn_expert",
    "savc_agent_status",
]:
    assert key in also_allow

agents_list = cfg.get("agents", {}).get("list", [])
ids = {item.get("id") for item in agents_list if isinstance(item, dict)}
for agent in ["main", "orchestrator", "companion", "technical", "creative", "tooling", "memory", "vibe-coder", "voice", "vision"]:
    assert agent in ids

main = next(item for item in agents_list if isinstance(item, dict) and item.get("id") == "main")
allow_agents = main.get("subagents", {}).get("allowAgents", [])
for agent in ["orchestrator", "companion", "technical", "creative", "tooling", "memory", "vibe-coder", "voice", "vision"]:
    assert agent in allow_agents

print("ok")
PY
then
  pass "config patch contains required plugin and tool policy fields"
else
  fail "config patch missing required fields"
fi

if python3 - "${TMP_PLUGIN_LIST}" <<'PY'
from __future__ import annotations
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
plugins = payload.get("plugins", [])
item = next((p for p in plugins if p.get("id") == "savc-orchestrator"), None)
assert item is not None
assert item.get("status") == "loaded"
assert item.get("enabled") is True
print("ok")
PY
then
  pass "savc-orchestrator plugin is loaded"
else
  fail "savc-orchestrator plugin not loaded"
fi

rm -rf "${TMP_ROOT}"

echo "=== Phase 4b Plugin Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
