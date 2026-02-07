#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

RUN_CMD="${REPO_ROOT}/scripts/phase2_run_once.sh"
TAG="# SAVC_PHASE2"

CRON_MORNING="0 8 * * * ${RUN_CMD} morning_greeting ${TAG}"
CRON_MIDDAY="0 12 * * * ${RUN_CMD} midday_reminder ${TAG}"
CRON_EVENING="0 22 * * * ${RUN_CMD} evening_reflection ${TAG}"
CRON_WEEKLY="0 10 * * 1 ${RUN_CMD} weekly_review ${TAG}"
CRON_IDLE="*/30 * * * * ${RUN_CMD} idle_check ${TAG}"

current_cron=""
if crontab -l >/tmp/savc_phase2_cron_current 2>/dev/null; then
  current_cron="$(cat /tmp/savc_phase2_cron_current)"
fi

if echo "${current_cron}" | rg -q "${TAG}"; then
  current_cron="$(echo "${current_cron}" | rg -v "${TAG}")"
fi

{
  echo "${current_cron}" | sed '/^$/d'
  echo "${CRON_MORNING}"
  echo "${CRON_MIDDAY}"
  echo "${CRON_EVENING}"
  echo "${CRON_WEEKLY}"
  echo "${CRON_IDLE}"
} | crontab -

echo "[OK] Phase 2 cron installed:"
crontab -l | rg "${TAG}"
