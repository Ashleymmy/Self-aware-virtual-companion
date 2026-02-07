#!/usr/bin/env bash
set -euo pipefail

TAG="# SAVC_PHASE2"

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
