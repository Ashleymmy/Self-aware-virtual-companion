#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

if ! command -v git >/dev/null 2>&1; then
  echo "[ERROR] git not found in PATH" >&2
  exit 1
fi

cd "${REPO_ROOT}"

git config core.hooksPath .githooks
echo "[OK] core.hooksPath set to .githooks"
echo "[INFO] pre-commit will run scripts/scan_secrets.sh staged"
