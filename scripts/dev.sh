#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

export PATH="${HOME}/.local/bin:${PATH}"

# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/lib/secret_env.sh"

ENV_FILE="${REPO_ROOT}/config/.env.local"
OPENCLAW_CONFIG="${HOME}/.openclaw/openclaw.json"
OPENCLAW_SUBMODULE="${OPENCLAW_ROOT}"
ENV_OPENCLAW_PORT_OVERRIDE="${OPENCLAW_PORT-}"
ENV_OPENCLAW_GATEWAY_PORT_OVERRIDE="${OPENCLAW_GATEWAY_PORT-}"
ENV_SAVC_UI_PORT_OVERRIDE="${SAVC_UI_PORT-}"
ENV_SAVC_GATEWAY_INTERNAL_URL_OVERRIDE="${SAVC_GATEWAY_INTERNAL_URL-}"
ENV_VITE_SAVC_GATEWAY_URL_OVERRIDE="${VITE_SAVC_GATEWAY_URL-}"

restore_env_override() {
  local key="$1"
  local value="$2"
  if [[ -n "${value}" ]]; then
    printf -v "${key}" '%s' "${value}"
    export "${key}"
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

restore_env_override "OPENCLAW_PORT" "${ENV_OPENCLAW_PORT_OVERRIDE}"
restore_env_override "OPENCLAW_GATEWAY_PORT" "${ENV_OPENCLAW_GATEWAY_PORT_OVERRIDE}"
restore_env_override "SAVC_UI_PORT" "${ENV_SAVC_UI_PORT_OVERRIDE}"
restore_env_override "SAVC_GATEWAY_INTERNAL_URL" "${ENV_SAVC_GATEWAY_INTERNAL_URL_OVERRIDE}"
restore_env_override "VITE_SAVC_GATEWAY_URL" "${ENV_VITE_SAVC_GATEWAY_URL_OVERRIDE}"

export_resolved_secret "OPENCLAW_GATEWAY_TOKEN"
export_resolved_secret "BRAVE_API_KEY"
export_resolved_secret "SILICON_EMBEDDING_API_KEY"
export_resolved_secret "ANYROUTER_API_KEY"
export_resolved_secret "WZW_API_KEY"
export_resolved_secret "GGBOOM_API_KEY"
export_resolved_secret "CODE_API_KEY"
VOLCES_API_KEY="$(resolve_secret_value "VOLCES_API_KEY" "${volces_API_KEY:-}")"
VOLCES_BASE_URL="${VOLCES_BASE_URL:-${volces_BASE_URL:-https://ark.cn-beijing.volces.com/api/v3}}"
VOLCES_MODEL="${VOLCES_MODEL:-${volces_MODEL:-${model:-doubao-seed-1-8-251228}}}"
export VOLCES_API_KEY VOLCES_BASE_URL VOLCES_MODEL

if [[ ! -f "${OPENCLAW_CONFIG}" ]]; then
  echo "[ERROR] Missing ${OPENCLAW_CONFIG}" >&2
  echo "Run setup first: bash scripts/setup.sh" >&2
  exit 1
fi

savc_require_openclaw_layout || exit 1
savc_ensure_openclaw_deps || exit 1

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[ERROR] pnpm not found in PATH." >&2
  echo "Enable with Corepack (recommended): corepack enable && corepack prepare pnpm@latest --activate" >&2
  exit 1
fi

SAVC_UI_PORT_EFFECTIVE="${SAVC_UI_PORT:-5174}"
OPENCLAW_GATEWAY_PORT_EFFECTIVE="${OPENCLAW_PORT:-18789}"
SAVC_DEV_NO_WATCH="${SAVC_DEV_NO_WATCH:-0}"

SAVC_UI_STARTED_BY_DEV=0
if bash "${REPO_ROOT}/scripts/savc_ui_service.sh" status >/dev/null 2>&1; then
  echo "[INFO] savc-ui already running (:${SAVC_UI_PORT_EFFECTIVE})"
else
  echo "[INFO] starting savc-ui companion service (:${SAVC_UI_PORT_EFFECTIVE})"
  bash "${REPO_ROOT}/scripts/savc_ui_service.sh" start
  SAVC_UI_STARTED_BY_DEV=1
fi
echo "[INFO] SAVC-UI URL: http://localhost:${SAVC_UI_PORT_EFFECTIVE}/"
echo "[INFO] Progress Hub URL: http://localhost:${SAVC_UI_PORT_EFFECTIVE}/progress-hub/index.html"

# Keep env and CLI in sync so local dev can safely avoid default Docker ports.
export OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT_EFFECTIVE}"
echo "[INFO] OpenClaw Gateway URL: http://localhost:${OPENCLAW_GATEWAY_PORT_EFFECTIVE}/"

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
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "VOLCES_API_KEY" "${VOLCES_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "VOLCES_BASE_URL" "${VOLCES_BASE_URL:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "VOLCES_MODEL" "${VOLCES_MODEL:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "CODE_API_KEY" "${CODE_API_KEY:-}"

COMPILER_PID=""

if [[ "${SAVC_DEV_NO_WATCH}" == "1" ]]; then
  echo "[INFO] OpenClaw watch disabled; running single build + gateway"
  pnpm -C "${OPENCLAW_SUBMODULE}" exec tsdown --no-clean
else
  # Note: upstream `pnpm gateway:watch` can get stuck if a watch rebuild deletes `dist/entry.js`
  # during a Node `--watch` restart. We run the equivalent watch pipeline but disable cleaning.
  pnpm -C "${OPENCLAW_SUBMODULE}" exec tsdown --no-clean
  pnpm -C "${OPENCLAW_SUBMODULE}" exec tsdown --watch --no-clean &
  COMPILER_PID=$!
fi

cleanup() {
  if [[ -n "${COMPILER_PID}" ]]; then
    kill "${COMPILER_PID}" 2>/dev/null || true
  fi
  if [[ "${SAVC_UI_STARTED_BY_DEV}" -eq 1 ]]; then
    bash "${REPO_ROOT}/scripts/savc_ui_service.sh" stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

cd "${OPENCLAW_SUBMODULE}"
if [[ "${SAVC_DEV_NO_WATCH}" == "1" ]]; then
  node openclaw.mjs gateway --force --port "${OPENCLAW_GATEWAY_PORT_EFFECTIVE}"
else
  node --watch openclaw.mjs gateway --force --port "${OPENCLAW_GATEWAY_PORT_EFFECTIVE}"
fi
