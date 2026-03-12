#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

WORKSPACE="${REPO_ROOT}/packages/core"
DATE="${1:-}"

if [[ "${SAVC_SELF_UPGRADE_LOOP:-0}" == "1" ]]; then
  UPGRADE_ARGS=(--workspace "${WORKSPACE}")
  if [[ -n "${DATE}" ]]; then
    UPGRADE_ARGS+=(--date "${DATE}")
  fi
  if [[ "${PERSONA_TUNING_APPLY:-}" == "1" ]]; then
    UPGRADE_ARGS+=(--apply-persona)
  fi
  bash "${REPO_ROOT}/scripts/dev_self_upgrade.sh" "${UPGRADE_ARGS[@]}"
  exit 0
fi

if [[ -n "${DATE}" ]]; then
  node "${REPO_ROOT}/scripts/runtime/self_reflection_runtime.mjs" daily --workspace "${WORKSPACE}" --date "${DATE}"
else
  node "${REPO_ROOT}/scripts/runtime/self_reflection_runtime.mjs" daily --workspace "${WORKSPACE}"
fi

TUNING_ARGS=()
if [[ -n "${DATE}" ]]; then
  TUNING_ARGS+=(--date "${DATE}")
fi

TUNING_MODE="preview"
if [[ "${PERSONA_TUNING_APPLY:-}" == "1" ]]; then
  TUNING_MODE="apply"
  TUNING_ARGS+=(--user-ok)
fi

node "${REPO_ROOT}/scripts/runtime/persona_tuning_runtime.mjs" "${TUNING_MODE}" --workspace "${WORKSPACE}" "${TUNING_ARGS[@]}"
