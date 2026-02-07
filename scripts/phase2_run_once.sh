#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

TRIGGER="${1:-auto}"
WORKSPACE="${REPO_ROOT}/savc-core"
CONFIG="${REPO_ROOT}/config/proactive.yaml"
CHANNELS="${REPO_ROOT}/config/channels.yaml"

if [[ -f "${REPO_ROOT}/config/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/config/.env.local"
  set +a
fi

ARGS=(
  tick
  --repo "${REPO_ROOT}"
  --workspace "${WORKSPACE}"
  --config "${CONFIG}"
  --channels "${CHANNELS}"
  --trigger "${TRIGGER}"
)

if [[ "${PHASE2_DRY_RUN:-0}" == "1" ]]; then
  ARGS+=(--dry-run true)
fi

node "${REPO_ROOT}/scripts/proactive_daemon.mjs" "${ARGS[@]}"
