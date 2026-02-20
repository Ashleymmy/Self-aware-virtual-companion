#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/config/.env.local"
OPENCLAW_CONFIG="${HOME}/.openclaw/openclaw.json"
CONTAINER_COMPOSE="${REPO_ROOT}/infra/docker/docker-compose.cloud.yml"
CONTAINER_ENV_EXAMPLE="${REPO_ROOT}/infra/docker/.env.example"

STRICT=0
if [[ "${1:-}" == "--strict" ]]; then
  STRICT=1
fi

pass_count=0
warn_count=0
fail_count=0

pass() {
  echo "[PASS] $*"
  pass_count=$((pass_count + 1))
}

warn() {
  echo "[WARN] $*"
  warn_count=$((warn_count + 1))
}

fail() {
  echo "[FAIL] $*"
  fail_count=$((fail_count + 1))
}

check_cmd() {
  local cmd="$1"
  if command -v "${cmd}" >/dev/null 2>&1; then
    pass "command found: ${cmd}"
  else
    fail "missing command: ${cmd}"
  fi
}

check_cmd node
check_cmd pnpm
check_cmd bash

if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ "${node_major}" -ge 22 ]]; then
    pass "node major version >= 22 (${node_major})"
  else
    fail "node version too low (require >=22, got ${node_major})"
  fi
fi

if command -v python3 >/dev/null 2>&1; then
  pass "python3 available"
else
  warn "python3 missing (部分脚本会受影响)"
fi

if [[ -f "${ENV_FILE}" ]]; then
  pass "env file exists: config/.env.local"
else
  fail "env file missing: config/.env.local (run: cp config/.env.example config/.env.local)"
fi

if [[ -f "${OPENCLAW_CONFIG}" ]]; then
  pass "openclaw config exists: ~/.openclaw/openclaw.json"
else
  warn "openclaw config missing (run: bash scripts/setup.sh)"
fi

if [[ -f "${OPENCLAW_CONFIG}" ]]; then
  if python3 - "${OPENCLAW_CONFIG}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    cfg = json.load(f)

channels = cfg.get("channels") if isinstance(cfg, dict) else {}
if not isinstance(channels, dict):
    channels = {}
candidates = ("telegram", "discord", "imessage", "whatsapp", "signal", "slack")
enabled = False
for key in candidates:
    item = channels.get(key)
    if isinstance(item, dict) and bool(item.get("enabled")):
        enabled = True
        break
sys.exit(0 if enabled else 1)
PY
  then
    pass "at least one supported channel is enabled in openclaw config"
  else
    warn "no supported channel enabled (建议启用 telegram/discord/imessage 之一)"
  fi

  if python3 - "${OPENCLAW_CONFIG}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    cfg = json.load(f)

agents = cfg.get("agents") if isinstance(cfg, dict) else {}
if not isinstance(agents, dict):
    agents = {}
defaults = agents.get("defaults")
if not isinstance(defaults, dict):
    defaults = {}
sandbox = defaults.get("sandbox")
if not isinstance(sandbox, dict):
    sandbox = {}
access = str(sandbox.get("workspaceAccess") or "").strip().lower()
sys.exit(0 if access == "rw" else 1)
PY
  then
    pass "agent workspaceAccess=rw (autodev writable)"
  else
    warn "agent workspaceAccess is not rw (yuanyuan 无法稳定写入项目文件)"
  fi

  if python3 - "${OPENCLAW_CONFIG}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    cfg = json.load(f)

tools = cfg.get("tools") if isinstance(cfg, dict) else {}
if not isinstance(tools, dict):
    tools = {}
sandbox = tools.get("sandbox")
if not isinstance(sandbox, dict):
    sandbox = {}
tool_sandbox = sandbox.get("tools")
if not isinstance(tool_sandbox, dict):
    tool_sandbox = {}
deny = tool_sandbox.get("deny")
if not isinstance(deny, list):
    deny = []
blocked = {str(item).strip().lower() for item in deny if isinstance(item, str)}
sys.exit(0 if "group:fs" not in blocked and "group:runtime" not in blocked else 1)
PY
  then
    pass "tools sandbox does not block group:fs/group:runtime"
  else
    warn "tools sandbox still blocks group:fs/group:runtime (coding tool链会受限)"
  fi

  if python3 - "${OPENCLAW_CONFIG}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    cfg = json.load(f)

agents = cfg.get("agents") if isinstance(cfg, dict) else {}
if not isinstance(agents, dict):
    agents = {}
items = agents.get("list")
if not isinstance(items, list):
    items = []
main_profile = ""
for item in items:
    if not isinstance(item, dict):
        continue
    if str(item.get("id") or "").strip() != "main":
        continue
    tools = item.get("tools")
    if isinstance(tools, dict):
        main_profile = str(tools.get("profile") or "").strip().lower()
    break
sys.exit(0 if main_profile == "coding" else 1)
PY
  then
    pass "main agent tools.profile=coding"
  else
    warn "main agent tools.profile is not coding (更容易只输出方案而不落地改代码)"
  fi
fi

if [[ -d "${REPO_ROOT}/openclaw" ]]; then
  pass "openclaw source directory exists"
else
  fail "openclaw directory missing"
fi

if [[ -f "${CONTAINER_COMPOSE}" ]]; then
  pass "container compose template exists: infra/docker/docker-compose.cloud.yml"
else
  warn "container compose template missing"
fi

if [[ -f "${CONTAINER_ENV_EXAMPLE}" ]]; then
  pass "container env example exists: infra/docker/.env.example"
else
  warn "container env example missing"
fi

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    pass "docker compose available"
  else
    warn "docker found but docker compose unavailable"
  fi
else
  warn "docker not found (容器化预留可后续补装)"
fi

if [[ -f "${ENV_FILE}" ]]; then
  if rg -n '^(OPENAI_API_KEY|ANTHROPIC_API_KEY|ANYROUTER_API_KEY|GGBOOM_API_KEY|CODE_API_KEY|LAOYOU_API_KEY)=[^[:space:]]+' "${ENV_FILE}" >/dev/null 2>&1; then
    pass "at least one LLM provider key appears configured"
  else
    warn "no non-empty LLM provider key found in config/.env.local"
  fi
fi

echo "=== Dev Preflight Summary ==="
echo "PASS: ${pass_count}"
echo "WARN: ${warn_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi

if (( STRICT == 1 && warn_count > 0 )); then
  echo "[FAIL] strict mode enabled and warnings present"
  exit 2
fi
