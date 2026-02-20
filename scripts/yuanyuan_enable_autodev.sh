#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"
CHANNEL="${YUANYUAN_AUTODEV_CHANNEL:-telegram}"
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/yuanyuan_enable_autodev.sh [options]

Options:
  --config <path>     OpenClaw config path (default: ~/.openclaw/openclaw.json)
  --channel <name>    Session channel hint for autodev calls (default: telegram)
  --dry-run           Print patched JSON without writing file
  -h, --help          Show help
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
    --channel)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --channel requires a value" >&2
        exit 1
      fi
      CHANNEL="$2"
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
  backup="${CONFIG_PATH}.autodev-backup-${ts}"
  cp -f "${CONFIG_PATH}" "${backup}"
  echo "[INFO] backup created: ${backup}"
fi

python3 - "${CONFIG_PATH}" "${CHANNEL}" "${DRY_RUN}" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
channel = (sys.argv[2] or "telegram").strip().lower() or "telegram"
dry_run = sys.argv[3] == "1"
supported_channels = {
    "telegram",
    "discord",
    "imessage",
    "whatsapp",
    "signal",
    "slack",
    "googlechat",
    "feishu",
}
if channel not in supported_channels:
    raise ValueError(f"unsupported channel: {channel}")


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
    raise ValueError("config root must be object")


def ensure_obj(parent: dict, key: str) -> dict:
    value = parent.get(key)
    if not isinstance(value, dict):
        value = {}
        parent[key] = value
    return value


def ensure_list(parent: dict, key: str) -> list:
    value = parent.get(key)
    if not isinstance(value, list):
        value = []
        parent[key] = value
    return value


def ensure_unique_strings(items: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = str(item).strip()
        if not text:
            continue
        if text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


cfg = load_json(config_path)

# Keep deterministic DM isolation.
session = ensure_obj(cfg, "session")
session["dmScope"] = "per-channel-peer"

channels = ensure_obj(cfg, "channels")
# Some OpenClaw builds do not support a "web" channel in config schema.
channels.pop("web", None)
chosen = ensure_obj(channels, channel)
chosen["enabled"] = True

agents = ensure_obj(cfg, "agents")
defaults = ensure_obj(agents, "defaults")
default_sandbox = ensure_obj(defaults, "sandbox")
default_sandbox["mode"] = str(default_sandbox.get("mode") or "off")
default_sandbox["workspaceAccess"] = "rw"
default_sandbox["scope"] = str(default_sandbox.get("scope") or "session")

agent_list = agents.get("list")
if not isinstance(agent_list, list):
    agent_list = []
    agents["list"] = agent_list

main_agent: dict | None = None
for item in agent_list:
    if isinstance(item, dict) and str(item.get("id") or "").strip() == "main":
        main_agent = item
        break
if main_agent is None:
    main_agent = {
        "id": "main",
        "subagents": {"allowAgents": ["*"]},
    }
    agent_list.insert(0, main_agent)

main_tools = ensure_obj(main_agent, "tools")
main_tools["profile"] = "coding"
main_also_allow = [
    *(
        [
            x
            for x in main_tools.get("alsoAllow", [])
            if isinstance(x, str) and str(x).strip().lower() != "group:memory"
        ]
        if isinstance(main_tools.get("alsoAllow"), list)
        else []
    ),
    "savc-orchestrator",
    "group:sessions",
    "group:runtime",
    "group:fs",
    "image",
]
main_tools["alsoAllow"] = ensure_unique_strings(main_also_allow)

# Top-level tool policy: allow coding chain, keep risky infra controls denied.
tools = ensure_obj(cfg, "tools")
tools["profile"] = "coding"
also_allow = [
    *([x for x in tools.get("alsoAllow", []) if isinstance(x, str)] if isinstance(tools.get("alsoAllow"), list) else []),
    "savc-orchestrator",
    "group:sessions",
]
tools["alsoAllow"] = ensure_unique_strings(also_allow)
tools_exec = ensure_obj(tools, "exec")
tools_apply_patch = ensure_obj(tools_exec, "applyPatch")
tools_apply_patch["enabled"] = True

tools_sandbox = ensure_obj(ensure_obj(tools, "sandbox"), "tools")
allow = [
    *(
        [
            x
            for x in tools_sandbox.get("allow", [])
            if isinstance(x, str) and str(x).strip().lower() != "group:memory"
        ]
        if isinstance(tools_sandbox.get("allow"), list)
        else []
    ),
    "group:messaging",
    "group:sessions",
    "group:runtime",
    "group:fs",
    "image",
]
tools_sandbox["allow"] = ensure_unique_strings(allow)

deny_existing = [x for x in tools_sandbox.get("deny", []) if isinstance(x, str)] if isinstance(tools_sandbox.get("deny"), list) else []
blocked = {"group:runtime", "group:fs"}
deny = [item for item in deny_existing if item.strip().lower() not in blocked]
for item in ["group:ui", "nodes", "cron", "gateway"]:
    if item not in deny:
        deny.append(item)
tools_sandbox["deny"] = ensure_unique_strings(deny)

# Remove non-schema keys that break strict validation on some OpenClaw builds.
cfg.pop("routing", None)
cfg.pop("savc", None)

output = json.dumps(cfg, ensure_ascii=False, indent=2) + "\n"
if dry_run:
    sys.stdout.write(output)
else:
    config_path.write_text(output, encoding="utf-8")
    summary = {
        "config": str(config_path),
        "autodevEnabled": True,
        "channelHint": channel,
        "workspaceAccess": default_sandbox.get("workspaceAccess"),
        "mainProfile": main_tools.get("profile"),
        "allow": tools_sandbox.get("allow"),
        "deny": tools_sandbox.get("deny"),
    }
    print("[OK] yuanyuan autodev enabled")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
PY

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "[OK] dry-run complete"
fi
