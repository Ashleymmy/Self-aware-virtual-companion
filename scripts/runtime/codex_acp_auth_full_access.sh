#!/usr/bin/env bash
set -euo pipefail

workspace="${SAVC_CODEX_ACP_CWD:-/workspace-devrepo}"
auth_file="${HOME}/.codex/auth.json"

if [[ ! -s "${auth_file}" ]]; then
  echo "[ERROR] missing Codex auth file: ${auth_file}" >&2
  exit 1
fi

exec codex-acp \
  -c 'approval_policy="never"' \
  -c 'sandbox_mode="danger-full-access"' \
  -c "projects.\"${workspace}\".trust_level=\"trusted\"" \
  -c 'shell_environment_policy.inherit="all"' \
  "$@"
