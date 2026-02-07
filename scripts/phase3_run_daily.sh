#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

WORKSPACE="${REPO_ROOT}/savc-core"
DATE="${1:-}"

if [[ -n "${DATE}" ]]; then
  node "${REPO_ROOT}/scripts/self_reflection_runtime.mjs" daily --workspace "${WORKSPACE}" --date "${DATE}"
else
  node "${REPO_ROOT}/scripts/self_reflection_runtime.mjs" daily --workspace "${WORKSPACE}"
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

node "${REPO_ROOT}/scripts/persona_tuning_runtime.mjs" "${TUNING_MODE}" --workspace "${WORKSPACE}" "${TUNING_ARGS[@]}"
