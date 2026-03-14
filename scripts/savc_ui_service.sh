#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

resolve_runtime_root() {
  local candidate=""
  local probe=""
  for candidate in "${SAVC_RUNTIME_ROOT:-${REPO_ROOT}/.runtime}" "${XDG_RUNTIME_DIR:-}" "${TMPDIR:-/tmp}"; do
    [[ -n "${candidate}" ]] || continue
    mkdir -p "${candidate}" 2>/dev/null || true
    probe="${candidate}/.savc-ui-write-probe.$$"
    if : > "${probe}" 2>/dev/null; then
      rm -f "${probe}" 2>/dev/null || true
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  echo "[ERROR] Could not find a writable runtime directory for savc-ui service." >&2
  return 1
}

RUNTIME_ROOT="$(resolve_runtime_root)"
PID_FILE="${RUNTIME_ROOT}/savc-ui-dev.pid"
LOG_FILE="${RUNTIME_ROOT}/savc-ui-dev.log"
UI_PORT="${SAVC_UI_PORT:-5174}"

is_listening() {
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)${UI_PORT}$"
}

list_port_pids() {
  ss -ltnp 2>/dev/null \
    | grep -E "(^|[[:space:]])LISTEN" \
    | grep -E "(:${UI_PORT})([[:space:]]|$)" \
    | grep -o 'pid=[0-9]*' \
    | cut -d= -f2 \
    | sort -u
}

pid_running() {
  local pid="$1"
  [[ -n "${pid}" ]] || return 1
  kill -0 "${pid}" 2>/dev/null
}

start_ui() {
  if is_listening; then
    echo "[OK] savc-ui already listening on :${UI_PORT}"
    return 0
  fi

  if [[ -f "${PID_FILE}" ]]; then
    local old_pid
    old_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if pid_running "${old_pid}"; then
      echo "[INFO] savc-ui process exists (pid=${old_pid}), waiting for port..."
      for _ in {1..10}; do
        if is_listening; then
          echo "[OK] savc-ui is now listening on :${UI_PORT}"
          return 0
        fi
        sleep 1
      done
    fi
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    echo "[ERROR] pnpm not found"
    return 1
  fi

  echo "[INFO] starting savc-ui dev server on :${UI_PORT}"
  if command -v setsid >/dev/null 2>&1; then
    setsid pnpm --dir "${REPO_ROOT}/packages/ui" dev >"${LOG_FILE}" 2>&1 < /dev/null &
  else
    nohup pnpm --dir "${REPO_ROOT}/packages/ui" dev >"${LOG_FILE}" 2>&1 < /dev/null &
  fi
  local pid=$!
  echo "${pid}" > "${PID_FILE}"

  for _ in {1..30}; do
    if is_listening; then
      echo "[OK] savc-ui started (pid=${pid})"
      echo "[INFO] log file: ${LOG_FILE}"
      return 0
    fi
    if ! pid_running "${pid}"; then
      echo "[ERROR] savc-ui process exited early, check ${LOG_FILE}"
      return 1
    fi
    sleep 1
  done

  echo "[ERROR] savc-ui failed to listen on :${UI_PORT} in time"
  return 1
}

stop_ui() {
  local stopped=0

  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if pid_running "${pid}"; then
      echo "[INFO] stopping savc-ui pid=${pid}"
      kill "${pid}" 2>/dev/null || true
      for _ in {1..10}; do
        if ! pid_running "${pid}"; then
          stopped=1
          break
        fi
        sleep 1
      done
      if pid_running "${pid}"; then
        kill -9 "${pid}" 2>/dev/null || true
      fi
    fi
    rm -f "${PID_FILE}"
  fi

  local pids
  pids="$(list_port_pids || true)"
  if [[ -n "${pids}" ]]; then
    echo "[INFO] stopping remaining listeners on :${UI_PORT}"
    while IFS= read -r pid; do
      [[ -n "${pid}" ]] || continue
      kill "${pid}" 2>/dev/null || true
    done <<< "${pids}"
    sleep 1
    pids="$(list_port_pids || true)"
    if [[ -n "${pids}" ]]; then
      while IFS= read -r pid; do
        [[ -n "${pid}" ]] || continue
        kill -9 "${pid}" 2>/dev/null || true
      done <<< "${pids}"
    fi
    stopped=1
  fi

  if is_listening; then
    echo "[WARN] savc-ui still listening on :${UI_PORT}"
    return 1
  fi

  if [[ "${stopped}" -eq 1 ]]; then
    echo "[OK] savc-ui stopped"
  else
    echo "[OK] savc-ui already stopped"
  fi
}

status_ui() {
  local pid=""
  if [[ -f "${PID_FILE}" ]]; then
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  fi

  if is_listening; then
    echo "savc-ui: listening on :${UI_PORT}"
    if [[ -n "${pid}" ]]; then
      echo "pid file: ${pid}"
    fi
    return 0
  fi

  if [[ -n "${pid}" ]] && pid_running "${pid}"; then
    echo "savc-ui: process alive (pid=${pid}), but port :${UI_PORT} not listening"
    return 1
  fi

  echo "savc-ui: stopped"
  return 3
}

cmd="${1:-status}"
case "${cmd}" in
  start)
    start_ui
    ;;
  stop)
    stop_ui
    ;;
  restart)
    stop_ui || true
    start_ui
    ;;
  status)
    status_ui
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}" >&2
    exit 2
    ;;
esac
