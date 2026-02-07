#!/usr/bin/env bash
set -euo pipefail

TAG="# SAVC_PHASE3"

if ! crontab -l >/tmp/savc_cron_current 2>/dev/null; then
  echo "[WARN] no crontab installed"
  exit 0
fi

current_cron="$(cat /tmp/savc_cron_current)"

if ! echo "${current_cron}" | rg -q "${TAG}"; then
  echo "[OK] no Phase 3 cron entries found"
  exit 0
fi

new_cron="$(echo "${current_cron}" | rg -v "${TAG}")"

echo "${new_cron}" | crontab -

echo "[OK] Phase 3 cron removed"
