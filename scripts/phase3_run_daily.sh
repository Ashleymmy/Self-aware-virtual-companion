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
