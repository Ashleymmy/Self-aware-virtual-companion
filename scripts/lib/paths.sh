#!/usr/bin/env bash

if [[ -n "${SAVC_PATHS_SH_LOADED:-}" ]]; then
  return 0
fi
SAVC_PATHS_SH_LOADED=1

savc_find_repo_root() {
  local start_dir="$1"
  local cursor
  cursor="$(cd -- "${start_dir}" && pwd)"
  while true; do
    if [[ -f "${cursor}/package.json" && -f "${cursor}/pnpm-workspace.yaml" && -d "${cursor}/scripts" && -d "${cursor}/packages/core" ]]; then
      printf '%s\n' "${cursor}"
      return 0
    fi
    local parent
    parent="$(dirname -- "${cursor}")"
    if [[ "${parent}" == "${cursor}" ]]; then
      return 1
    fi
    cursor="${parent}"
  done
}

savc_use_repo_root() {
  local source_path="${1:-${BASH_SOURCE[1]}}"
  local script_dir
  script_dir="$(cd -- "$(dirname -- "${source_path}")" && pwd)"
  local repo_root
  repo_root="$(savc_find_repo_root "${script_dir}")" || {
    echo "[ERROR] Could not resolve SAVC repo root from: ${source_path}" >&2
    return 1
  }

  SCRIPT_DIR="${script_dir}"
  REPO_ROOT="${repo_root}"
  export SCRIPT_DIR REPO_ROOT

  local resolved_openclaw_root="${OPENCLAW_ROOT:-${REPO_ROOT}/openclaw}"
  if [[ "${resolved_openclaw_root}" != /* ]]; then
    resolved_openclaw_root="${REPO_ROOT}/${resolved_openclaw_root}"
  fi
  OPENCLAW_ROOT="${resolved_openclaw_root}"
  export OPENCLAW_ROOT
}

savc_require_openclaw_layout() {
  if [[ ! -f "${OPENCLAW_ROOT}/package.json" ]]; then
    echo "[ERROR] Missing OpenClaw package.json at: ${OPENCLAW_ROOT}/package.json" >&2
    return 1
  fi
  if [[ ! -f "${OPENCLAW_ROOT}/openclaw.mjs" ]]; then
    echo "[ERROR] Missing OpenClaw CLI entry at: ${OPENCLAW_ROOT}/openclaw.mjs" >&2
    return 1
  fi
}

savc_ensure_openclaw_deps() {
  savc_require_openclaw_layout || return 1
  if [[ -d "${OPENCLAW_ROOT}/node_modules" && -x "${OPENCLAW_ROOT}/node_modules/.bin/tsdown" ]]; then
    return 0
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "[ERROR] pnpm not found while preparing OpenClaw dependencies." >&2
    return 1
  fi
  echo "[INFO] Installing OpenClaw dependencies in ${OPENCLAW_ROOT}"
  if [[ -f "${OPENCLAW_ROOT}/pnpm-lock.yaml" ]]; then
    pnpm -C "${OPENCLAW_ROOT}" install --frozen-lockfile
  else
    pnpm -C "${OPENCLAW_ROOT}" install --no-frozen-lockfile
  fi
}

savc_ensure_openclaw_build() {
  savc_require_openclaw_layout || return 1
  if [[ -f "${OPENCLAW_ROOT}/dist/index.js" && -f "${OPENCLAW_ROOT}/dist/plugin-sdk/index.js" ]]; then
    return 0
  fi
  savc_ensure_openclaw_deps || return 1
  echo "[INFO] Building OpenClaw dist in ${OPENCLAW_ROOT}"
  pnpm -C "${OPENCLAW_ROOT}" exec tsdown --no-clean
}

savc_ensure_openclaw_ready() {
  savc_require_openclaw_layout || return 1
  savc_ensure_openclaw_deps || return 1
  savc_ensure_openclaw_build || return 1
}

savc_local_curl() {
  NO_PROXY=127.0.0.1,localhost \
  no_proxy=127.0.0.1,localhost \
  curl --noproxy '*' "$@"
}
