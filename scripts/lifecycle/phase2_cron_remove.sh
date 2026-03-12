#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"
if ! crontab -l >/tmp/savc_phase2_cron_current 2>/dev/null; then
  echo "[WARN] no crontab installed"
  exit 0
fi

current_cron="$(cat /tmp/savc_phase2_cron_current)"
if ! echo "${current_cron}" | rg -q "${TAG}"; then
  echo "[OK] no Phase 2 cron entries found"
  exit 0
fi

new_cron="$(echo "${current_cron}" | rg -v "${TAG}")"
echo "${new_cron}" | crontab -

echo "[OK] Phase 2 cron removed"
