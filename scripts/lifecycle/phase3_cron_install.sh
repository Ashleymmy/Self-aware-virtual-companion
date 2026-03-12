#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

DAILY_CMD="${REPO_ROOT}/scripts/lifecycle/phase3_run_daily.sh"
MONTHLY_CMD="${REPO_ROOT}/scripts/lifecycle/phase3_run_monthly.sh"

TAG="# SAVC_PHASE3"

CRON_DAILY="0 23 * * * ${DAILY_CMD} ${TAG}"
CRON_MONTHLY="0 0 1 * * ${MONTHLY_CMD} ${TAG}"

current_cron=""
if crontab -l >/tmp/savc_cron_current 2>/dev/null; then
  current_cron="$(cat /tmp/savc_cron_current)"
fi

if echo "${current_cron}" | rg -q "${TAG}"; then
  # Remove old tagged lines to avoid duplicates
  current_cron="$(echo "${current_cron}" | rg -v "${TAG}")"
fi

{
  echo "${current_cron}" | sed '/^$/d'
  echo "${CRON_DAILY}"
  echo "${CRON_MONTHLY}"
} | crontab -

echo "[OK] Phase 3 cron installed:"
crontab -l | rg "${TAG}"
