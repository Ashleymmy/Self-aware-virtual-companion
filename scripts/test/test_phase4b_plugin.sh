#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

cd "${REPO_ROOT}"

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
  "packages/plugin/package.json" \
  "packages/plugin/openclaw.plugin.json" \
  "packages/plugin/index.ts" \
  "packages/plugin/src/tool-route.ts" \
  "packages/plugin/src/tool-decompose.ts" \
  "packages/plugin/src/tool-spawn-expert.ts" \
  "packages/plugin/src/tool-agent-status.ts" \
  "scripts/lifecycle/phase4b_enable_plugin.sh"; do
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
done

if savc_ensure_openclaw_ready >/tmp/phase4b_plugin_openclaw_ready.log 2>&1; then
  pass "openclaw readiness passed"
else
  fail "openclaw readiness failed (see /tmp/phase4b_plugin_openclaw_ready.log)"
fi

if (cd "${REPO_ROOT}/packages/plugin" && pnpm exec vitest run src/*.test.ts) >/tmp/phase4b_plugin_vitest.log 2>&1; then
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
      "workspace": "${REPO_ROOT}/packages/core",
      "model": {
        "primary": "anthropic/claude-sonnet-4"
      }
    }
  }
}
JSON

if bash "${REPO_ROOT}/scripts/lifecycle/phase4b_enable_plugin.sh" --config "${TMP_CONFIG}" >/tmp/phase4b_enable_once.log 2>&1; then
  pass "phase4b enable script first run passed"
else
  fail "phase4b enable script first run failed (see /tmp/phase4b_enable_once.log)"
fi

if bash "${REPO_ROOT}/scripts/lifecycle/phase4b_enable_plugin.sh" --config "${TMP_CONFIG}" >/tmp/phase4b_enable_twice.log 2>&1; then
  pass "phase4b enable script second run passed (idempotent)"
else
  fail "phase4b enable script second run failed (see /tmp/phase4b_enable_twice.log)"
fi

if OPENCLAW_CONFIG_PATH="${TMP_CONFIG}" node "${OPENCLAW_ROOT}/openclaw.mjs" plugins list --json >"${TMP_PLUGIN_LIST}" 2>/tmp/phase4b_plugin_list.err; then
  pass "plugins list command succeeded with temp config"
else
  fail "plugins list command failed (see /tmp/phase4b_plugin_list.err)"
fi

if python3 - "${TMP_CONFIG}" "${REPO_ROOT}" <<'PY'
from __future__ import annotations
import json
import sys
from pathlib import Path

cfg = json.load(open(sys.argv[1], "r", encoding="utf-8"))
repo_root = Path(sys.argv[2])
agents_dir = repo_root / "packages" / "core" / "agents"
core_agents = sorted(path.stem for path in agents_dir.glob("*.y*ml"))
expected_agents = ["main", *core_agents]

entry = cfg["plugins"]["entries"]["savc-orchestrator"]
assert entry["enabled"] is True
assert entry["config"]["spawnMode"] == "mock"

assert cfg["tools"]["agentToAgent"]["enabled"] is True
allow = cfg["tools"]["agentToAgent"]["allow"]
for agent in expected_agents:
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
for agent in expected_agents:
    assert agent in ids

main = next(item for item in agents_list if isinstance(item, dict) and item.get("id") == "main")
allow_agents = main.get("subagents", {}).get("allowAgents", [])
for agent in core_agents:
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
