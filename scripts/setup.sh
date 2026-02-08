#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/config/.env.local"
WORKSPACE_DIR_DEFAULT="${REPO_ROOT}/savc-core"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

generate_local_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    python3 -c 'import secrets; print(secrets.token_hex(16))'
  fi
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [[ -z "${value}" ]]; then
    return 0
  fi

  mkdir -p "$(dirname -- "${file}")"
  touch "${file}"
  chmod 600 "${file}" 2>/dev/null || true

  python3 - "${file}" "${key}" "${value}" <<'PY'
from __future__ import annotations
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]

try:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
except FileNotFoundError:
    lines = []

out: list[str] = []
replaced = False
prefix = f"{key}="
for line in lines:
    if line.startswith(prefix) and not replaced:
        out.append(prefix + value)
        replaced = True
    else:
        out.append(line)

if not replaced:
    if out and out[-1].strip():
        out.append("")
    out.append(prefix + value)

path.write_text("\n".join(out).rstrip("\n") + "\n", encoding="utf-8")
PY
}

OPENCLAW_DIR="${HOME}/.openclaw"
OPENCLAW_CONFIG="${OPENCLAW_DIR}/openclaw.json"
OPENCLAW_GLOBAL_ENV="${OPENCLAW_DIR}/.env"

mkdir -p "${OPENCLAW_DIR}"

# Ensure a local token exists when ~/.openclaw/openclaw.json uses env substitution.
if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  OPENCLAW_GATEWAY_TOKEN="$(generate_local_token)"
  export OPENCLAW_GATEWAY_TOKEN
  upsert_env_var "${ENV_FILE}" "OPENCLAW_GATEWAY_TOKEN" "${OPENCLAW_GATEWAY_TOKEN}"
fi

# Sync common vars into OpenClaw global env so `openclaw ...` works without sourcing repo env.
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "OPENCLAW_GATEWAY_TOKEN" "${OPENCLAW_GATEWAY_TOKEN:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "ANTHROPIC_API_KEY" "${ANTHROPIC_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "OPENAI_API_KEY" "${OPENAI_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "OPENAI_BASE_URL" "${OPENAI_BASE_URL:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "DISCORD_BOT_TOKEN" "${DISCORD_BOT_TOKEN:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "BRAVE_API_KEY" "${BRAVE_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "SILICON_EMBEDDING_API_KEY" "${SILICON_EMBEDDING_API_KEY:-}"

if [[ -n "${OPENCLAW_WORKSPACE:-}" ]]; then
  if [[ "${OPENCLAW_WORKSPACE}" = /* ]]; then
    WORKSPACE_DIR="${OPENCLAW_WORKSPACE}"
  else
    # In docs, OPENCLAW_WORKSPACE is set relative to config/.env.local (e.g. ../savc-core).
    WORKSPACE_DIR="${REPO_ROOT}/config/${OPENCLAW_WORKSPACE}"
  fi
else
  WORKSPACE_DIR="${WORKSPACE_DIR_DEFAULT}"
fi

if [[ ! -d "${WORKSPACE_DIR}" ]]; then
  echo "[ERROR] Workspace directory not found: ${WORKSPACE_DIR}" >&2
  echo "Run this script from the SAVC repo after scaffolding is created." >&2
  exit 1
fi

WORKSPACE_DIR_ABS="$(realpath "${WORKSPACE_DIR}")"

if [[ -f "${OPENCLAW_CONFIG}" ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  backup="${OPENCLAW_CONFIG}.savc-backup-${ts}"
  cp -f "${OPENCLAW_CONFIG}" "${backup}"
  echo "[INFO] Backed up existing OpenClaw config to: ${backup}"
fi

OPENCLAW_PORT_EFFECTIVE="${OPENCLAW_PORT:-18789}"

if [[ -n "${SILICON_EMBEDDING_API_KEY:-}" ]]; then
  MEMORY_SEARCH_REMOTE_BLOCK="$(cat <<'JSON'
        "remote": {
          "baseUrl": "https://api.siliconflow.cn/v1",
          "apiKey": "${SILICON_EMBEDDING_API_KEY}"
        },
JSON
)"
else
  MEMORY_SEARCH_REMOTE_BLOCK="$(cat <<'JSON'
        "remote": {
          "baseUrl": "https://api.siliconflow.cn/v1"
        },
JSON
)"
fi

cat > "${OPENCLAW_CONFIG}" <<JSON
{
  "gateway": {
    "mode": "local",
    "port": ${OPENCLAW_PORT_EFFECTIVE},
    "auth": {
      "mode": "token",
      "token": "\${OPENCLAW_GATEWAY_TOKEN}"
    }
  },
  "agents": {
    "defaults": {
      "workspace": "${WORKSPACE_DIR_ABS}",
      "model": {
        "primary": "anthropic/claude-sonnet-4",
        "fallbacks": []
      },
      "memorySearch": {
        "enabled": true,
        "provider": "openai",
${MEMORY_SEARCH_REMOTE_BLOCK}
        "model": "Qwen/Qwen3-Embedding-8B",
        "fallback": "none"
      }
    }
  }
}
JSON

mkdir -p "${OPENCLAW_DIR}/agents/main/sessions"
mkdir -p "${OPENCLAW_DIR}/credentials"

# Tighten permissions (recommended by `openclaw doctor`).
chmod 700 "${OPENCLAW_DIR}" || true
chmod 600 "${OPENCLAW_CONFIG}" || true

echo "[OK] Wrote OpenClaw config: ${OPENCLAW_CONFIG}"
echo "[OK] Synced OpenClaw env: ${OPENCLAW_GLOBAL_ENV}"
echo "[OK] Workspace set to: ${WORKSPACE_DIR_ABS}"
