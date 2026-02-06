#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_DIR="${REPO_ROOT}/savc-core"

if [[ ! -d "${WORKSPACE_DIR}" ]]; then
  echo "[ERROR] Workspace directory not found: ${WORKSPACE_DIR}" >&2
  echo "Run this script from the SAVC repo after scaffolding is created." >&2
  exit 1
fi

WORKSPACE_DIR_ABS="$(realpath "${WORKSPACE_DIR}")"

OPENCLAW_DIR="${HOME}/.openclaw"
OPENCLAW_CONFIG="${OPENCLAW_DIR}/openclaw.json"

mkdir -p "${OPENCLAW_DIR}"

if [[ -f "${OPENCLAW_CONFIG}" ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  backup="${OPENCLAW_CONFIG}.savc-backup-${ts}"
  cp -f "${OPENCLAW_CONFIG}" "${backup}"
  echo "[INFO] Backed up existing OpenClaw config to: ${backup}"
fi

cat > "${OPENCLAW_CONFIG}" <<JSON
{
  "gateway": {
    "mode": "local",
    "port": 18789,
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
echo "[OK] Workspace set to: ${WORKSPACE_DIR_ABS}"
