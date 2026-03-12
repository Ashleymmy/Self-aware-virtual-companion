#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

WORKSPACE="${REPO_ROOT}/packages/core"
MONTH="${1:-}"

if [[ -n "${MONTH}" ]]; then
  node "${REPO_ROOT}/scripts/runtime/self_reflection_runtime.mjs" monthly --workspace "${WORKSPACE}" --month "${MONTH}"
else
  node "${REPO_ROOT}/scripts/runtime/self_reflection_runtime.mjs" monthly --workspace "${WORKSPACE}"
fi
