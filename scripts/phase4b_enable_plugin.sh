#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"
DRY_RUN=0
SPAWN_MODE="mock"
SYNC_AGENTS=1
SAVC_AGENTS_DIR="${REPO_ROOT}/savc-core/agents"

usage() {
  cat <<USAGE
Usage: bash scripts/phase4b_enable_plugin.sh [--config <path>] [--spawn-mode <mock|real>] [--sync-agents] [--dry-run]

Options:
  --config <path>   Target OpenClaw config file. Default: \$OPENCLAW_CONFIG_PATH or ~/.openclaw/openclaw.json
  --spawn-mode <v>  Plugin spawn mode: mock (default) or real
  --sync-agents     Sync agents.list and main.subagents.allowAgents from savc-core/agents (default enabled)
  --no-sync-agents  Disable agent sync
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
    --spawn-mode)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --spawn-mode requires a value" >&2
        exit 1
      fi
      SPAWN_MODE="$2"
      shift 2
      ;;
    --sync-agents)
      SYNC_AGENTS=1
      shift
      ;;
    --no-sync-agents)
      SYNC_AGENTS=0
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

if [[ "${SPAWN_MODE}" != "mock" && "${SPAWN_MODE}" != "real" ]]; then
  echo "[ERROR] invalid --spawn-mode value: ${SPAWN_MODE} (expected mock|real)" >&2
  exit 1
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

python3 - "${CONFIG_PATH}" "${DRY_RUN}" "${SPAWN_MODE}" "${SYNC_AGENTS}" "${SAVC_AGENTS_DIR}" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
dry_run = sys.argv[2] == "1"
spawn_mode = sys.argv[3]
sync_agents = sys.argv[4] == "1"
agents_dir = Path(sys.argv[5])

PLUGIN_ID = "savc-orchestrator"
OPTIONAL_TOOLS = [
    PLUGIN_ID,
    "savc_route",
    "savc_decompose",
    "savc_spawn_expert",
    "savc_agent_status",
]
DEFAULT_CORE_AGENTS = ["orchestrator", "companion", "technical", "creative", "tooling", "memory"]


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


def normalize_agent_id(value: object) -> str:
    text = str(value or "").strip().lower()
    return text


def discover_core_agents(path: Path) -> list[str]:
    if not path.is_dir():
        return DEFAULT_CORE_AGENTS[:]
    out: list[str] = []
    seen: set[str] = set()
    for item in sorted(path.iterdir()):
        if not item.is_file():
            continue
        if item.suffix.lower() not in {".yaml", ".yml"}:
            continue
        agent_id = normalize_agent_id(item.stem)
        if not agent_id or agent_id in seen:
            continue
        seen.add(agent_id)
        out.append(agent_id)
    return out or DEFAULT_CORE_AGENTS[:]


def ensure_list_of_objects(parent: dict, key: str) -> list[dict]:
    value = parent.get(key)
    if not isinstance(value, list):
        value = []
    normalized: list[dict] = []
    for item in value:
        if isinstance(item, dict):
            normalized.append(item)
    parent[key] = normalized
    return normalized


def upsert_agent(agent_list: list[dict], agent_id: str) -> dict:
    normalized_id = normalize_agent_id(agent_id)
    for item in agent_list:
        if normalize_agent_id(item.get("id")) == normalized_id:
            item["id"] = normalized_id
            return item
    entry = {"id": normalized_id}
    agent_list.append(entry)
    return entry


cfg = load_json(config_path)
plugins = ensure_obj(cfg, "plugins")
plugins["enabled"] = True

entries = ensure_obj(plugins, "entries")
entry = ensure_obj(entries, PLUGIN_ID)
entry["enabled"] = True
entry_cfg = ensure_obj(entry, "config")
entry_cfg["spawnMode"] = spawn_mode

allow = plugins.get("allow")
if isinstance(allow, list):
    plugins["allow"] = merge_unique(allow, [PLUGIN_ID])

tools = ensure_obj(cfg, "tools")
agent_to_agent = ensure_obj(tools, "agentToAgent")
agent_to_agent["enabled"] = True

core_agents = discover_core_agents(agents_dir)
allowed_agents = ["main", *core_agents]

allow_agents = agent_to_agent.get("allow")
if not isinstance(allow_agents, list):
    allow_agents = []
agent_to_agent["allow"] = merge_unique(allow_agents, allowed_agents)

also_allow = tools.get("alsoAllow")
if not isinstance(also_allow, list):
    also_allow = []
tools["alsoAllow"] = merge_unique(also_allow, OPTIONAL_TOOLS)

if sync_agents:
    agents = ensure_obj(cfg, "agents")
    agent_list = ensure_list_of_objects(agents, "list")

    main_entry = upsert_agent(agent_list, "main")
    for agent_id in core_agents:
        upsert_agent(agent_list, agent_id)

    has_default = any(
        isinstance(item, dict) and item.get("default") is True for item in agent_list
    )
    if not has_default:
        main_entry["default"] = True

    subagents = ensure_obj(main_entry, "subagents")
    allow_main = subagents.get("allowAgents")
    if not isinstance(allow_main, list):
        allow_main = []
    subagents["allowAgents"] = merge_unique(allow_main, core_agents)

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
