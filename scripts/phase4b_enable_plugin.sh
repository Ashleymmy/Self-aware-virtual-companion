#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"
DRY_RUN=0

usage() {
  cat <<USAGE
Usage: bash scripts/phase4b_enable_plugin.sh [--config <path>] [--dry-run]

Options:
  --config <path>   Target OpenClaw config file. Default: \$OPENCLAW_CONFIG_PATH or ~/.openclaw/openclaw.json
  --dry-run         Print patched JSON to stdout without writing file
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --config requires a value" >&2
        exit 1
      fi
      CONFIG_PATH="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${CONFIG_PATH}" == ~/* ]]; then
  CONFIG_PATH="${HOME}/${CONFIG_PATH#~/}"
fi

mkdir -p "$(dirname -- "${CONFIG_PATH}")"
if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "{}" > "${CONFIG_PATH}"
fi

if [[ ${DRY_RUN} -eq 0 ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  backup="${CONFIG_PATH}.phase4b-backup-${ts}"
  cp -f "${CONFIG_PATH}" "${backup}"
  echo "[INFO] backup created: ${backup}"
fi

python3 - "${CONFIG_PATH}" "${DRY_RUN}" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
dry_run = sys.argv[2] == "1"

PLUGIN_ID = "savc-orchestrator"
ALLOWED_AGENTS = ["orchestrator", "companion", "technical", "creative", "tooling", "memory"]
OPTIONAL_TOOLS = [
    PLUGIN_ID,
    "savc_route",
    "savc_decompose",
    "savc_spawn_expert",
    "savc_agent_status",
]


def load_json(path: Path) -> dict:
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    if not raw.strip():
        return {}
    data = json.loads(raw)
    if isinstance(data, dict):
        return data
    raise ValueError(f"Config root must be object: {path}")


def ensure_obj(parent: dict, key: str) -> dict:
    value = parent.get(key)
    if not isinstance(value, dict):
        value = {}
        parent[key] = value
    return value


def merge_unique(existing: list[str], additions: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in existing + additions:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


cfg = load_json(config_path)
plugins = ensure_obj(cfg, "plugins")
plugins["enabled"] = True

entries = ensure_obj(plugins, "entries")
entry = ensure_obj(entries, PLUGIN_ID)
entry["enabled"] = True
entry_cfg = ensure_obj(entry, "config")
entry_cfg["spawnMode"] = "mock"

allow = plugins.get("allow")
if isinstance(allow, list):
    plugins["allow"] = merge_unique(allow, [PLUGIN_ID])

tools = ensure_obj(cfg, "tools")
agent_to_agent = ensure_obj(tools, "agentToAgent")
agent_to_agent["enabled"] = True

allow_agents = agent_to_agent.get("allow")
if not isinstance(allow_agents, list):
    allow_agents = []
agent_to_agent["allow"] = merge_unique(allow_agents, ALLOWED_AGENTS)

also_allow = tools.get("alsoAllow")
if not isinstance(also_allow, list):
    also_allow = []
tools["alsoAllow"] = merge_unique(also_allow, OPTIONAL_TOOLS)

output = json.dumps(cfg, ensure_ascii=False, indent=2) + "\n"
if dry_run:
    sys.stdout.write(output)
else:
    config_path.write_text(output, encoding="utf-8")
    print(f"[OK] updated config: {config_path}")
PY

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "[OK] dry-run complete"
fi
