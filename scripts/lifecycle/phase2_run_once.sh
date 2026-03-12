#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

TRIGGER="${1:-auto}"
WORKSPACE="${REPO_ROOT}/packages/core"
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

node "${REPO_ROOT}/scripts/runtime/proactive_daemon.mjs" "${ARGS[@]}"
