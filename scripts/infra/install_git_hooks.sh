#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

if ! command -v git >/dev/null 2>&1; then
  echo "[ERROR] git not found in PATH" >&2
  exit 1
fi

cd "${REPO_ROOT}"

git config core.hooksPath .githooks
echo "[OK] core.hooksPath set to .githooks"
echo "[INFO] pre-commit will run scripts/scan_secrets.sh staged"
