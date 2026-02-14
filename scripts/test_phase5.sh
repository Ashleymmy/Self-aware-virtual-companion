#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

bash "${REPO_ROOT}/scripts/test_phase5c.sh"
bash "${REPO_ROOT}/scripts/test_phase5d.sh"
bash "${REPO_ROOT}/scripts/test_phase5e.sh"

echo "[PASS] phase5 full suite completed"
