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

declare -A status
declare -A pass
declare -A fail

eval_test() {
  local key="$1"
  local cmd="$2"
  local log="/tmp/${key}_status.log"
  if [[ ${RUN_TESTS} -eq 0 ]]; then
    status["${key}"]="SKIP"
    pass["${key}"]=0
    fail["${key}"]=0
    return
  fi

  if bash -lc "cd '${REPO_ROOT}' && ${cmd}" >"${log}" 2>&1; then
    status["${key}"]="PASS"
  else
    status["${key}"]="FAIL"
  fi

  pass["${key}"]="$( (rg -n "^\[PASS\]" "${log}" || true) | wc -l | tr -d ' ')"
  fail["${key}"]="$( (rg -n "^\[FAIL\]" "${log}" || true) | wc -l | tr -d ' ')"
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
| Phase 1 | ${status[phase1]} | ${pass[phase1]} | ${fail[phase1]} |
| Phase 2 | ${status[phase2]} | ${pass[phase2]} | ${fail[phase2]} |
| Phase 3 | ${status[phase3]} | ${pass[phase3]} | ${fail[phase3]} |

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
