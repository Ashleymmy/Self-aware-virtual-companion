#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"
ACPX_CONFIG_PATH="${HOME}/.acpx/config.json"
WORKSPACE_CWD="${REPO_ROOT}"
AGENT_ID="${YUANYUAN_CODEX_ACP_AGENT:-codex}"
ACPX_COMMAND="${YUANYUAN_CODEX_ACP_COMMAND:-codex-acp}"
PERMISSION_MODE="${YUANYUAN_CODEX_ACP_PERMISSION_MODE:-approve-all}"
NON_INTERACTIVE_PERMISSIONS="${YUANYUAN_CODEX_ACP_NON_INTERACTIVE:-fail}"
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/yuanyuan_enable_codex_acp.sh [options]

Options:
  --config <path>                  OpenClaw config path (default: ~/.openclaw/openclaw.json)
  --acpx-config <path>             acpx config path (default: ~/.acpx/config.json)
  --workspace <path>               Default workspace cwd for codex ACP turns
  --agent <id>                     ACP default agent id (default: codex)
  --command <cmd>                  acpx codex agent command override (default: codex-acp)
  --permission-mode <mode>         approve-all|approve-reads|deny-all (default: approve-all)
  --non-interactive <mode>         fail|deny (default: fail)
  --dry-run                        Print patched config to stdout without writing files
  -h, --help                       Show help
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
    --acpx-config)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --acpx-config requires a value" >&2
        exit 1
      fi
      ACPX_CONFIG_PATH="$2"
      shift 2
      ;;
    --workspace)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --workspace requires a value" >&2
        exit 1
      fi
      WORKSPACE_CWD="$2"
      shift 2
      ;;
    --agent)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --agent requires a value" >&2
        exit 1
      fi
      AGENT_ID="$2"
      shift 2
      ;;
    --command)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --command requires a value" >&2
        exit 1
      fi
      ACPX_COMMAND="$2"
      shift 2
      ;;
    --permission-mode)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --permission-mode requires a value" >&2
        exit 1
      fi
      PERMISSION_MODE="$2"
      shift 2
      ;;
    --non-interactive)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --non-interactive requires a value" >&2
        exit 1
      fi
      NON_INTERACTIVE_PERMISSIONS="$2"
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
if [[ "${ACPX_CONFIG_PATH}" == ~/* ]]; then
  ACPX_CONFIG_PATH="${HOME}/${ACPX_CONFIG_PATH#~/}"
fi

if [[ "${WORKSPACE_CWD}" != /* ]]; then
  WORKSPACE_CWD="${REPO_ROOT}/${WORKSPACE_CWD#./}"
fi
WORKSPACE_CWD="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "${WORKSPACE_CWD}")"

case "${PERMISSION_MODE}" in
  approve-all|approve-reads|deny-all) ;;
  *)
    echo "[ERROR] unsupported permission mode: ${PERMISSION_MODE}" >&2
    exit 1
    ;;
esac

case "${NON_INTERACTIVE_PERMISSIONS}" in
  fail|deny) ;;
  *)
    echo "[ERROR] unsupported non-interactive mode: ${NON_INTERACTIVE_PERMISSIONS}" >&2
    exit 1
    ;;
esac

mkdir -p "$(dirname -- "${CONFIG_PATH}")"
if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "{}" > "${CONFIG_PATH}"
fi

python3 - "${CONFIG_PATH}" "${AGENT_ID}" "${WORKSPACE_CWD}" "${PERMISSION_MODE}" "${NON_INTERACTIVE_PERMISSIONS}" "${DRY_RUN}" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
agent_id = (sys.argv[2] or "codex").strip() or "codex"
workspace_cwd = (sys.argv[3] or "").strip()
permission_mode = (sys.argv[4] or "approve-all").strip()
non_interactive = (sys.argv[5] or "fail").strip()
dry_run = sys.argv[6] == "1"


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
    raise ValueError("config root must be an object")


def ensure_obj(parent: dict, key: str) -> dict:
    value = parent.get(key)
    if not isinstance(value, dict):
        value = {}
        parent[key] = value
    return value


def merge_unique(existing: list[str] | object, additions: list[str]) -> list[str]:
    base = existing if isinstance(existing, list) else []
    out: list[str] = []
    seen: set[str] = set()
    for item in [*base, *additions]:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


cfg = load_json(config_path)

acp = ensure_obj(cfg, "acp")
acp["enabled"] = True
dispatch = ensure_obj(acp, "dispatch")
dispatch["enabled"] = True
acp["backend"] = "acpx"
acp["defaultAgent"] = agent_id
acp["allowedAgents"] = merge_unique(acp.get("allowedAgents"), [agent_id])
if not isinstance(acp.get("maxConcurrentSessions"), int) or int(acp.get("maxConcurrentSessions") or 0) <= 0:
    acp["maxConcurrentSessions"] = 4
stream = ensure_obj(acp, "stream")
stream.setdefault("coalesceIdleMs", 300)
stream.setdefault("maxChunkChars", 1200)
runtime = ensure_obj(acp, "runtime")
runtime.setdefault("ttlMinutes", 180)

plugins = ensure_obj(cfg, "plugins")
plugins["enabled"] = True
entries = ensure_obj(plugins, "entries")
acpx_entry = ensure_obj(entries, "acpx")
acpx_entry["enabled"] = True
acpx_cfg = ensure_obj(acpx_entry, "config")
if workspace_cwd:
    acpx_cfg["cwd"] = workspace_cwd
acpx_cfg["permissionMode"] = permission_mode
acpx_cfg["nonInteractivePermissions"] = non_interactive

if isinstance(plugins.get("allow"), list):
    plugins["allow"] = merge_unique(plugins.get("allow"), ["acpx"])

output = json.dumps(cfg, ensure_ascii=False, indent=2) + "\n"
if dry_run:
    sys.stdout.write(output)
else:
    config_path.write_text(output, encoding="utf-8")
    print(f"[OK] updated config: {config_path}")
    print(
        json.dumps(
            {
                "acpEnabled": True,
                "backend": "acpx",
                "defaultAgent": agent_id,
                "cwd": acpx_cfg.get("cwd"),
                "permissionMode": acpx_cfg.get("permissionMode"),
                "nonInteractivePermissions": acpx_cfg.get("nonInteractivePermissions"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
PY

if [[ "${DRY_RUN}" -eq 1 ]]; then
  exit 0
fi

mkdir -p "$(dirname -- "${ACPX_CONFIG_PATH}")"

python3 - "${ACPX_CONFIG_PATH}" "${AGENT_ID}" "${ACPX_COMMAND}" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
agent_id = (sys.argv[2] or "codex").strip() or "codex"
command = (sys.argv[3] or "codex-acp").strip() or "codex-acp"


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
    raise ValueError("acpx config root must be an object")


def ensure_obj(parent: dict, key: str) -> dict:
    value = parent.get(key)
    if not isinstance(value, dict):
        value = {}
        parent[key] = value
    return value


cfg = load_json(config_path)
agents = ensure_obj(cfg, "agents")
entry = ensure_obj(agents, agent_id)
entry["command"] = command

config_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"[OK] updated acpx config: {config_path}")
print(json.dumps({"agent": agent_id, "command": entry.get("command")}, ensure_ascii=False, indent=2))
PY

mkdir -p "${HOME}/.codex"
