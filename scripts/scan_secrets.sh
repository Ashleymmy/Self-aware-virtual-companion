#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-staged}"
INCLUDE_OPENCLAW="${SAVC_SCAN_INCLUDE_OPENCLAW:-0}"

if ! command -v git >/dev/null 2>&1; then
  echo "[ERROR] git not found in PATH" >&2
  exit 2
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[ERROR] not inside a git repository" >&2
  exit 2
fi

case "${MODE}" in
  staged|all)
    ;;
  *)
    echo "Usage: $0 [staged|all]" >&2
    exit 1
    ;;
esac

trim() {
  local text="$1"
  text="${text#"${text%%[![:space:]]*}"}"
  text="${text%"${text##*[![:space:]]}"}"
  printf "%s" "${text}"
}

is_env_like_file() {
  local file="$1"
  local base
  base="$(basename -- "${file}")"
  case "${base}" in
    .env|.env.*|*.env|*.env.*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

should_skip_file() {
  local file="$1"
  if [[ "${INCLUDE_OPENCLAW}" != "1" && "${file}" == openclaw/* ]]; then
    return 0
  fi
  return 1
}

is_known_fake_match() {
  local content_lc
  content_lc="$(printf "%s" "$1" | tr '[:upper:]' '[:lower:]')"
  case "${content_lc}" in
    *testsecret*|*access-token-1234567890*|*refresh-token-1234567890*|*0123456789abcdefghijklmnopqrstuvwxyz*)
      return 0
      ;;
  esac
  return 1
}

is_placeholder_value() {
  local value
  local value_lc

  value="$(trim "$1")"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  value="$(trim "${value}")"
  value_lc="$(printf "%s" "${value}" | tr '[:upper:]' '[:lower:]')"

  if [[ -z "${value}" ]]; then
    return 0
  fi
  case "${value_lc}" in
    xxxxx|xxxxx*|your_*|changeme|change_me|replace_me|example|example_*|todo|null|none|test|test_*|placeholder)
      return 0
      ;;
  esac
  if [[ "${value_lc}" == *xxxx* ]]; then
    return 0
  fi
  case "${value}" in
    \<*\>)
      return 0
      ;;
  esac
  if [[ "${value}" =~ ^\$\{?[A-Z0-9_]+\}?$ ]]; then
    return 0
  fi
  return 1
}

scan_text_patterns() {
  local file="$1"
  local line
  local line_no
  local content

  while IFS= read -r line; do
    [[ -n "${line}" ]] || continue
    line_no="${line%%:*}"
    content="${line#*:}"
    is_known_fake_match "${content}" && continue
    printf "%s:%s:possible-secret-pattern:%s\n" "${file}" "${line_no}" "${content}" >> "${REPORT_FILE}"
    HIT_COUNT=$((HIT_COUNT + 1))
  done < <(
    grep -nEI \
      -e 'sk-[A-Za-z0-9_-]{32,}' \
      -e 'ghp_[A-Za-z0-9]{20,}' \
      -e 'github_pat_[A-Za-z0-9_]{30,}' \
      -e 'xox[baprs]-[A-Za-z0-9-]{12,}' \
      -e 'AKIA[0-9A-Z]{16}' \
      -e 'AIza[A-Za-z0-9_-]{20,}' \
      -e 'Bearer[[:space:]]+[A-Za-z0-9._-]{30,}' \
      "${file}" || true
  )
}

scan_env_assignments() {
  local file="$1"
  local line_no=0
  local line
  local body
  local key
  local value

  while IFS= read -r line || [[ -n "${line}" ]]; do
    line_no=$((line_no + 1))
    body="${line%%#*}"
    body="$(trim "${body}")"
    [[ -n "${body}" ]] || continue

    if [[ "${body}" =~ ^([A-Za-z0-9_]+)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      if [[ "${key}" =~ (API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|AUTH_TOKEN|ACCESS_KEY|ACCOUNT_SID|AUTH_ID) ]]; then
        if ! is_placeholder_value "${value}"; then
          printf "%s:%s:sensitive-env-assignment:%s\n" "${file}" "${line_no}" "${body}" >> "${REPORT_FILE}"
          HIT_COUNT=$((HIT_COUNT + 1))
        fi
      fi
    fi
  done < "${file}"
}

REPORT_FILE="$(mktemp /tmp/savc_secret_scan.XXXXXX)"
HIT_COUNT=0

if [[ "${MODE}" == "all" ]]; then
  TARGETS_CMD=(git ls-files)
else
  TARGETS_CMD=(git diff --cached --name-only --diff-filter=ACM)
fi

while IFS= read -r file; do
  [[ -n "${file}" ]] || continue
  [[ -f "${file}" ]] || continue
  should_skip_file "${file}" && continue
  grep -Iq . "${file}" || continue

  scan_text_patterns "${file}"
  if is_env_like_file "${file}"; then
    scan_env_assignments "${file}"
  fi
done < <("${TARGETS_CMD[@]}")

if (( HIT_COUNT > 0 )); then
  echo "[ERROR] potential secrets detected (${HIT_COUNT})"
  echo "[HINT] rotate leaked keys immediately and replace values with env vars/placeholders."
  echo "----"
  cat "${REPORT_FILE}"
  rm -f "${REPORT_FILE}"
  exit 1
fi

rm -f "${REPORT_FILE}"
echo "[OK] secret scan passed (${MODE})"
