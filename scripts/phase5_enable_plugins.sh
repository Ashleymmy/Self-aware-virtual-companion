#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"
SPAWN_MODE="mock"
SYNC_AGENTS=1
DRY_RUN=0
VOICE_PROVIDER="mock"

usage() {
  cat <<USAGE
Usage: bash scripts/phase5_enable_plugins.sh [--config <path>] [--spawn-mode <mock|real>] [--sync-agents] [--dry-run] [--voice-provider <mock|twilio|telnyx|plivo>]

Options:
  --config <path>          Target OpenClaw config file. Default: \$OPENCLAW_CONFIG_PATH or ~/.openclaw/openclaw.json
  --spawn-mode <v>         savc-orchestrator spawn mode: mock (default) or real
  --sync-agents            Sync agents.list and allowAgents from savc-core/agents (default enabled)
  --no-sync-agents         Disable agent sync
  --voice-provider <v>     voice-call provider to set when missing (default: mock)
  --dry-run                Print final patched JSON to stdout without writing file
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
    --voice-provider)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --voice-provider requires a value" >&2
        exit 1
      fi
      VOICE_PROVIDER="$2"
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

if [[ "${SPAWN_MODE}" != "mock" && "${SPAWN_MODE}" != "real" ]]; then
  echo "[ERROR] invalid --spawn-mode value: ${SPAWN_MODE} (expected mock|real)" >&2
  exit 1
fi

if [[ "${VOICE_PROVIDER}" != "mock" && "${VOICE_PROVIDER}" != "twilio" && "${VOICE_PROVIDER}" != "telnyx" && "${VOICE_PROVIDER}" != "plivo" ]]; then
  echo "[ERROR] invalid --voice-provider value: ${VOICE_PROVIDER}" >&2
  exit 1
fi

run_phase4b_patch() {
  local target_config="$1"
  local -a args=(
    "--config" "${target_config}"
    "--spawn-mode" "${SPAWN_MODE}"
  )
  if [[ ${SYNC_AGENTS} -eq 1 ]]; then
    args+=("--sync-agents")
  else
    args+=("--no-sync-agents")
  fi
  bash "${REPO_ROOT}/scripts/phase4b_enable_plugin.sh" "${args[@]}"
}

patch_phase5() {
  local target_config="$1"
  local emit_stdout="$2"
  python3 - "${target_config}" "${emit_stdout}" "${VOICE_PROVIDER}" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
emit_stdout = sys.argv[2] == "1"
voice_provider = sys.argv[3]

TOOL_ADDITIONS = ["savc_voice_call", "savc_image_generate", "savc_live2d_signal"]

def load_json(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8") if path.exists() else "{}"
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

voice_entry = ensure_obj(entries, "voice-call")
voice_entry["enabled"] = True
voice_cfg = ensure_obj(voice_entry, "config")
if not isinstance(voice_cfg.get("provider"), str) or not str(voice_cfg.get("provider")).strip():
    voice_cfg["provider"] = voice_provider
if "enabled" not in voice_cfg:
    voice_cfg["enabled"] = True

allow = plugins.get("allow")
if isinstance(allow, list):
    plugins["allow"] = merge_unique(allow, ["voice-call"])

tools = ensure_obj(cfg, "tools")
also_allow = tools.get("alsoAllow")
if not isinstance(also_allow, list):
    also_allow = []
tools["alsoAllow"] = merge_unique(also_allow, TOOL_ADDITIONS)

output = json.dumps(cfg, ensure_ascii=False, indent=2) + "\n"
if emit_stdout:
    sys.stdout.write(output)
else:
    config_path.write_text(output, encoding="utf-8")
    print(f"[OK] updated config: {config_path}")
PY
}

if [[ ${DRY_RUN} -eq 1 ]]; then
  tmp_root="$(mktemp -d /tmp/savc_phase5_enable.XXXXXX)"
  tmp_config="${tmp_root}/openclaw.json"
  if [[ -f "${CONFIG_PATH}" ]]; then
    cp -f "${CONFIG_PATH}" "${tmp_config}"
  else
    echo "{}" > "${tmp_config}"
  fi
  run_phase4b_patch "${tmp_config}" >/tmp/phase5_enable_phase4b.log 2>&1
  patch_phase5 "${tmp_config}" "1"
  rm -rf "${tmp_root}"
  echo "[OK] dry-run complete"
  exit 0
fi

mkdir -p "$(dirname -- "${CONFIG_PATH}")"
if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "{}" > "${CONFIG_PATH}"
fi

run_phase4b_patch "${CONFIG_PATH}"
patch_phase5 "${CONFIG_PATH}" "0"
