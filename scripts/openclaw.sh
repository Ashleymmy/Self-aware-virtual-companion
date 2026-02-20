#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/config/.env.local"

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

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 16)"
  else
    OPENCLAW_GATEWAY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
  fi
  export OPENCLAW_GATEWAY_TOKEN

  if [[ -f "${ENV_FILE}" ]]; then
    upsert_env_var "${ENV_FILE}" "OPENCLAW_GATEWAY_TOKEN" "${OPENCLAW_GATEWAY_TOKEN}"
  fi
fi

# Keep OpenClaw CLI usable outside this repo by syncing required vars to ~/.openclaw/.env.
OPENCLAW_GLOBAL_ENV="${HOME}/.openclaw/.env"
mkdir -p "${HOME}/.openclaw"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "OPENCLAW_GATEWAY_TOKEN" "${OPENCLAW_GATEWAY_TOKEN:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "BRAVE_API_KEY" "${BRAVE_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "SILICON_EMBEDDING_API_KEY" "${SILICON_EMBEDDING_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "ANYROUTER_API_KEY" "${ANYROUTER_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "WZW_API_KEY" "${WZW_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "GGBOOM_API_KEY" "${GGBOOM_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "LAOYOU_API_KEY" "${LAOYOU_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "CODE_API_KEY" "${CODE_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "OPENAI_API_KEY" "${OPENAI_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "OPENAI_BASE_URL" "${OPENAI_BASE_URL:-}"

exec openclaw "$@"
