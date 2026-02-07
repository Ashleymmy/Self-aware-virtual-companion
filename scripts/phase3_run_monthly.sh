#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

WORKSPACE="${REPO_ROOT}/savc-core"
MONTH="${1:-}"

if [[ -n "${MONTH}" ]]; then
  node "${REPO_ROOT}/scripts/self_reflection_runtime.mjs" monthly --workspace "${WORKSPACE}" --month "${MONTH}"
else
  node "${REPO_ROOT}/scripts/self_reflection_runtime.mjs" monthly --workspace "${WORKSPACE}"
fi
