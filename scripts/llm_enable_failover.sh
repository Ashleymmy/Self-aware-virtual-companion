#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"
DRY_RUN=0

usage() {
  cat <<USAGE
Usage: bash scripts/llm_enable_failover.sh [--config <path>] [--dry-run]

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
    --)
      shift
      continue
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
  backup="${CONFIG_PATH}.llm-failover-backup-${ts}"
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

PRIMARY = "anyrouter/claude-opus-4-6"
FALLBACKS = [
    "anyrouter/claude-sonnet-4-5-20250929",
    "wzw/claude-sonnet-4-5-20250929",
    "wzw/claude-sonnet-4-20250514",
    "wzw/claude-haiku-4-5-20251001",
]

ANYROUTER_MODELS = [
    {
        "id": "claude-opus-4-6",
        "name": "Claude Opus 4.6",
        "reasoning": True,
        "input": ["text", "image"],
        "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
        "contextWindow": 200000,
        "maxTokens": 8192,
    },
    {
        "id": "claude-sonnet-4-5-20250929",
        "name": "Claude Sonnet 4.5",
        "reasoning": True,
        "input": ["text", "image"],
        "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
        "contextWindow": 200000,
        "maxTokens": 8192,
    },
]

WZW_MODELS = [
    {
        "id": "claude-sonnet-4-5-20250929",
        "name": "Claude Sonnet 4.5 (wzw)",
        "reasoning": True,
        "input": ["text", "image"],
        "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
        "contextWindow": 200000,
        "maxTokens": 8192,
    },
    {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4 (wzw)",
        "reasoning": True,
        "input": ["text", "image"],
        "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
        "contextWindow": 200000,
        "maxTokens": 8192,
    },
    {
        "id": "claude-haiku-4-5-20251001",
        "name": "Claude Haiku 4.5 (wzw)",
        "reasoning": False,
        "input": ["text", "image"],
        "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
        "contextWindow": 200000,
        "maxTokens": 8192,
    },
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
    raise ValueError("config root must be an object")


def ensure_obj(parent: dict, key: str) -> dict:
    value = parent.get(key)
    if not isinstance(value, dict):
        value = {}
        parent[key] = value
    return value


def ensure_model_alias(entry_map: dict, key: str, alias: str | None) -> None:
    existing = entry_map.get(key)
    if not isinstance(existing, dict):
        existing = {}
    if alias:
        existing["alias"] = alias
    entry_map[key] = existing


def build_provider(existing: object, *, base_url: str, api_key: str, api: str, models: list[dict]) -> dict:
    provider = existing if isinstance(existing, dict) else {}
    provider["baseUrl"] = base_url
    provider["apiKey"] = api_key
    provider["api"] = api
    provider["models"] = models
    return provider


cfg = load_json(config_path)

agents = ensure_obj(cfg, "agents")
defaults = ensure_obj(agents, "defaults")

heartbeat = defaults.get("heartbeat")
if not isinstance(heartbeat, dict):
    heartbeat = {}
heartbeat["session"] = "heartbeat-main"
defaults["heartbeat"] = heartbeat

model = defaults.get("model")
if isinstance(model, str):
    model = {"primary": model}
elif not isinstance(model, dict):
    model = {}
model["primary"] = PRIMARY
model["fallbacks"] = FALLBACKS
defaults["model"] = model

defaults_models = defaults.get("models")
if not isinstance(defaults_models, dict):
    defaults_models = {}
ensure_model_alias(defaults_models, "anyrouter/claude-opus-4-6", "opus")
ensure_model_alias(defaults_models, "anyrouter/claude-sonnet-4-5-20250929", "sonnet")
ensure_model_alias(defaults_models, "wzw/claude-sonnet-4-5-20250929", "wzw-sonnet")
ensure_model_alias(defaults_models, "wzw/claude-sonnet-4-20250514", None)
ensure_model_alias(defaults_models, "wzw/claude-haiku-4-5-20251001", "haiku")
defaults["models"] = defaults_models

models_cfg = ensure_obj(cfg, "models")
models_cfg["mode"] = "merge"
providers = ensure_obj(models_cfg, "providers")
providers["anyrouter"] = build_provider(
    providers.get("anyrouter"),
    base_url="https://anyrouter.top",
    api_key="${ANYROUTER_API_KEY}",
    api="anthropic-messages",
    models=ANYROUTER_MODELS,
)
providers["wzw"] = build_provider(
    providers.get("wzw"),
    base_url="https://wzw.pp.ua/v1",
    api_key="${WZW_API_KEY}",
    api="anthropic-messages",
    models=WZW_MODELS,
)

session_cfg = ensure_obj(cfg, "session")
session_cfg["dmScope"] = "per-channel-peer"

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
