#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

export PATH="${HOME}/.local/bin:${PATH}"

ENV_FILE="${REPO_ROOT}/config/.env.local"
OPENCLAW_CONFIG="${HOME}/.openclaw/openclaw.json"

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

if [[ ! -d "${REPO_ROOT}/openclaw" ]]; then
  echo "[ERROR] Missing ${REPO_ROOT}/openclaw (git submodule not initialized)." >&2
  echo "Fix: git submodule update --init --recursive" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[ERROR] pnpm not found in PATH." >&2
  echo "Fix: corepack enable && corepack prepare pnpm@latest --activate" >&2
  exit 1
fi

PORT="${OPENCLAW_PORT:-18789}"
export OPENCLAW_GATEWAY_PORT="${PORT}"
exec pnpm -C "${REPO_ROOT}/openclaw" gateway:watch
