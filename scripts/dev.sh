#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

export PATH="${HOME}/.local/bin:${PATH}"

ENV_FILE="${REPO_ROOT}/config/.env.local"
OPENCLAW_CONFIG="${HOME}/.openclaw/openclaw.json"
OPENCLAW_SUBMODULE="${REPO_ROOT}/openclaw"

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

echo "[INFO] Running dev preflight checks..."
bash "${REPO_ROOT}/scripts/dev_preflight.sh"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
else
  echo "[ERROR] Missing ${ENV_FILE}" >&2
  echo "Create it with: cp config/.env.example config/.env.local" >&2
  exit 1
fi

if [[ ! -f "${OPENCLAW_CONFIG}" ]]; then
  echo "[ERROR] Missing ${OPENCLAW_CONFIG}" >&2
  echo "Run setup first: bash scripts/setup.sh" >&2
  exit 1
fi

if [[ ! -d "${OPENCLAW_SUBMODULE}" ]]; then
  echo "[ERROR] Missing OpenClaw source directory at: ${OPENCLAW_SUBMODULE}" >&2
  echo "Ensure this repository checkout includes openclaw/." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[ERROR] pnpm not found in PATH." >&2
  echo "Enable with Corepack (recommended): corepack enable && corepack prepare pnpm@latest --activate" >&2
  exit 1
fi

SAVC_UI_STARTED_BY_DEV=0
if bash "${REPO_ROOT}/scripts/savc_ui_service.sh" status >/dev/null 2>&1; then
  echo "[INFO] savc-ui already running (:5174)"
else
  echo "[INFO] starting savc-ui companion service (:5174)"
  bash "${REPO_ROOT}/scripts/savc_ui_service.sh" start
  SAVC_UI_STARTED_BY_DEV=1
fi
echo "[INFO] SAVC-UI URL: http://localhost:5174/"
echo "[INFO] Progress Hub URL: http://localhost:5174/progress-hub/index.html"

# OpenClaw uses OPENCLAW_GATEWAY_PORT (docs: --port > OPENCLAW_GATEWAY_PORT > gateway.port > default 18789)
export OPENCLAW_GATEWAY_PORT="${OPENCLAW_PORT:-18789}"

# Ensure a local token exists when gateway.auth.token uses env substitution in ~/.openclaw/openclaw.json
if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 16)"
  else
    OPENCLAW_GATEWAY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
  fi
  export OPENCLAW_GATEWAY_TOKEN

  upsert_env_var "${ENV_FILE}" "OPENCLAW_GATEWAY_TOKEN" "${OPENCLAW_GATEWAY_TOKEN}"
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
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "CODE_API_KEY" "${CODE_API_KEY:-}"

# Note: upstream `pnpm gateway:watch` can get stuck if a watch rebuild deletes `dist/entry.js`
# during a Node `--watch` restart. We run the equivalent watch pipeline but disable cleaning.
pnpm -C "${OPENCLAW_SUBMODULE}" exec tsdown --no-clean
pnpm -C "${OPENCLAW_SUBMODULE}" exec tsdown --watch --no-clean &
COMPILER_PID=$!

cleanup() {
  kill "${COMPILER_PID}" 2>/dev/null || true
  if [[ "${SAVC_UI_STARTED_BY_DEV}" -eq 1 ]]; then
    bash "${REPO_ROOT}/scripts/savc_ui_service.sh" stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

cd "${OPENCLAW_SUBMODULE}"
node --watch openclaw.mjs gateway --force
