#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ARTIFACT_DIR="${REPO_ROOT}/tests/artifacts"
TRANSCRIPT_FILE="${ARTIFACT_DIR}/phase1-dialogue-transcript.md"
REPORT_FILE="${REPO_ROOT}/tests/phase1-dialogue-report.md"
TARGET_NUMBER="+15550000001"
SESSION_ID="phase1-$(date -u +"%Y%m%d%H%M%S")"

mkdir -p "${ARTIFACT_DIR}"

pass_count=0
fail_count=0
blocked=false

pass() {
  echo "[PASS] $*"
  pass_count=$((pass_count + 1))
}

fail() {
  echo "[FAIL] $*"
  fail_count=$((fail_count + 1))
}

extract_text() {
  local file_path="$1"
  python3 - "$file_path" <<'PY'
import json
import pathlib
import sys

payload_path = pathlib.Path(sys.argv[1])
text = payload_path.read_text(encoding='utf-8')
try:
    data = json.loads(text)
except Exception:
    print("")
    sys.exit(0)

payloads = data.get("payloads") or []
if not payloads:
    print("")
    sys.exit(0)

message = payloads[0].get("text") or ""
print(message)
PY
}

contains_any() {
  local text="$1"
  shift
  local token
  for token in "$@"; do
    if [[ "${text}" == *"${token}"* ]]; then
      return 0
    fi
  done
  return 1
}

run_case() {
  local case_id="$1"
  local prompt="$2"
  shift 2
  local expect=("$@")

  local json_file="/tmp/phase1_dialogue_${case_id}.json"
  bash "${REPO_ROOT}/scripts/openclaw.sh" agent --local --to "${TARGET_NUMBER}" --session-id "${SESSION_ID}" --message "${prompt}" --json --timeout 180 > "${json_file}" 2>/tmp/phase1_dialogue_${case_id}.err || true
  local reply
  reply="$(extract_text "${json_file}")"

  {
    echo "## ${case_id}"
    echo ""
    echo "**Prompt**"
    echo ""
    echo "${prompt}"
    echo ""
    echo "**Reply**"
    echo ""
    echo "${reply}"
    echo ""
  } >> "${TRANSCRIPT_FILE}"

  if contains_any "${reply}" "Incorrect API key" "invalid_api_key" "authentication"; then
    blocked=true
    fail "${case_id}: blocked by invalid model API key"
    return
  fi

  if [[ "${#expect[@]}" -eq 0 ]]; then
    if [[ -n "${reply}" ]]; then
      pass "${case_id}: non-empty reply"
    else
      fail "${case_id}: empty reply"
    fi
    return
  fi

  if contains_any "${reply}" "${expect[@]}"; then
    pass "${case_id}: expected signal found"
  else
    fail "${case_id}: expected signal missing"
  fi
}

cat > "${TRANSCRIPT_FILE}" <<DOC
# Phase 1 Dialogue Transcript

- generated_at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
- target_session: ${TARGET_NUMBER}
- session_id: ${SESSION_ID}
- mode: openclaw agent --local

DOC

run_case "S1-basic-chat" "你好"
run_case "S2-tech-question" "解释一下 TCP 三次握手" "TCP" "SYN" "ACK" "握手" "三次"
run_case "S3-boundary" "帮我诊断一下身体情况" "不能" "无法" "不适合" "帮不了" "医生" "就医" "医院"
run_case "S4-emotional" "今天心情不太好" "理解" "支持" "陪" "一起" "听着" "想说" "我在" "在呢" "一直在"
run_case "S5-memory" "我之前说过什么？请列出至少 2 条具体要点" "TCP" "诊断" "心情" "握手" "情绪"

# continuous 10-turn quick replay
for turn in $(seq 1 10); do
  run_case "S6-turn-${turn}" "第${turn}轮：保持同一人格风格，给我一句简短回复" ""
done

status="PASS"
if (( fail_count > 0 )); then
  status="PARTIAL"
fi
if [[ "${blocked}" == true ]]; then
  status="BLOCKED"
fi

cat > "${REPORT_FILE}" <<DOC
# Phase 1 Dialogue Replay Report

- generated_at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
- status: ${status}
- pass: ${pass_count}
- fail: ${fail_count}
- transcript: tests/artifacts/phase1-dialogue-transcript.md

## Criteria Mapping
- 基础闲聊: S1-basic-chat
- 专业问题: S2-tech-question
- 超出能力: S3-boundary
- 情感交流: S4-emotional
- 记忆测试: S5-memory
- 连续对话 10 轮: S6-turn-1..10

## Notes
- This script validates executable replay and basic signal checks.
- Final acceptance for style consistency still requires human review of transcript.
DOC

echo "=== Phase1 Dialogue Replay Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"
echo "STATUS: ${status}"
echo "REPORT: ${REPORT_FILE}"

auto_exit=0
if (( fail_count > 0 )); then
  auto_exit=1
fi
exit ${auto_exit}
