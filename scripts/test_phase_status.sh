#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
DOC_FILE="${REPO_ROOT}/docs/beta项目构建方案.md"

OUTPUT_FILE=""
RUN_TESTS=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --quick)
      RUN_TESTS=0
      shift
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

count_unchecked() {
  local start="$1"
  local end="$2"
  awk -v s="$start" -v e="$end" '
    $0 ~ s { in_block=1 }
    $0 ~ e { if (in_block) exit }
    in_block && /- \[ \]/ { c+=1 }
    END { print c+0 }
  ' "${DOC_FILE}"
}

phase1_unchecked="$(count_unchecked "^### 1[.]1" "^## Phase 2")"
phase2_unchecked="$(count_unchecked "^## Phase 2" "^## Phase 3")"
phase3_unchecked="$(count_unchecked "^## Phase 3" "^## 附录 A")"

status_phase1="UNKNOWN"
status_phase2="UNKNOWN"
status_phase3="UNKNOWN"
pass_phase1=0
pass_phase2=0
pass_phase3=0
fail_phase1=0
fail_phase2=0
fail_phase3=0

count_tag_lines() {
  local tag="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    (rg -n "^\[${tag}\]" "${file}" || true) | wc -l | tr -d ' '
  else
    (grep -nE "^\[${tag}\]" "${file}" || true) | wc -l | tr -d ' '
  fi
}

eval_test() {
  local key="$1"
  local cmd="$2"
  local log="/tmp/${key}_status.log"
  local status_value="SKIP"
  local pass_value=0
  local fail_value=0
  if [[ ${RUN_TESTS} -eq 0 ]]; then
    status_value="SKIP"
  else
    if bash -lc "cd '${REPO_ROOT}' && ${cmd}" >"${log}" 2>&1; then
      status_value="PASS"
    else
      status_value="FAIL"
    fi

    pass_value="$(count_tag_lines "PASS" "${log}")"
    fail_value="$(count_tag_lines "FAIL" "${log}")"
  fi

  case "${key}" in
    phase1)
      status_phase1="${status_value}"
      pass_phase1="${pass_value}"
      fail_phase1="${fail_value}"
      ;;
    phase2)
      status_phase2="${status_value}"
      pass_phase2="${pass_value}"
      fail_phase2="${fail_value}"
      ;;
    phase3)
      status_phase3="${status_value}"
      pass_phase3="${pass_value}"
      fail_phase3="${fail_value}"
      ;;
    *)
      echo "unknown phase key: ${key}" >&2
      exit 1
      ;;
  esac
}

eval_test "phase1" "bash scripts/test_phase1.sh"
eval_test "phase2" "bash scripts/test_phase2.sh"
eval_test "phase3" "bash scripts/test_phase3.sh"

now_utc="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
report="$(cat <<MD
# Phase Status Snapshot

- generated_at: ${now_utc}
- mode: $( [[ ${RUN_TESTS} -eq 1 ]] && echo "full" || echo "quick" )

## Doc Unchecked Counts
| Phase | Unchecked Count |
|---|---:|
| Phase 1 | ${phase1_unchecked} |
| Phase 2 | ${phase2_unchecked} |
| Phase 3 | ${phase3_unchecked} |

## Runtime Test Snapshot
| Phase | Status | PASS Lines | FAIL Lines |
|---|---|---:|---:|
| Phase 1 | ${status_phase1} | ${pass_phase1} | ${fail_phase1} |
| Phase 2 | ${status_phase2} | ${pass_phase2} | ${fail_phase2} |
| Phase 3 | ${status_phase3} | ${pass_phase3} | ${fail_phase3} |

## Missing-Point Hint
- If "Unchecked Count" > 0: sync doc checklist with real evidence after implementation.
- If test status is FAIL: inspect /tmp/phase*_status.log and fix failing stage first.
MD
)"

if [[ -n "${OUTPUT_FILE}" ]]; then
  mkdir -p "$(dirname -- "${OUTPUT_FILE}")"
  printf "%s\n" "${report}" > "${OUTPUT_FILE}"
  echo "[OK] wrote ${OUTPUT_FILE}"
else
  printf "%s\n" "${report}"
fi
