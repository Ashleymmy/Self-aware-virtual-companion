#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

cd "${REPO_ROOT}"

bash "${REPO_ROOT}/scripts/test/test_phase5c.sh"
bash "${REPO_ROOT}/scripts/test/test_phase5d.sh"
bash "${REPO_ROOT}/scripts/test/test_phase5e.sh"

echo "[PASS] phase5 full suite completed"
