#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
OPENCLAW_CONFIG="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"

TASK_TEXT=""
TASK_FILE=""
SESSION_ID="yuanyuan-autodev-$(date +%Y%m%d-%H%M%S)"
CHANNEL="${YUANYUAN_AUTODEV_CHANNEL:-telegram}"
TIMEOUT_SECONDS="${YUANYUAN_AUTODEV_TIMEOUT:-180}"
THINKING="${YUANYUAN_AUTODEV_THINKING:-minimal}"
MAX_ROUNDS="${YUANYUAN_AUTODEV_MAX_ROUNDS:-2}"
RETRIES="${YUANYUAN_AUTODEV_RETRIES:-2}"
ARTIFACT_DIR=""
TARGET_FILES=""
FORCE_RUN=0

VERIFY_CMDS=()

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/yuanyuan_autodev.sh [options]

Options:
  --task <text>            Development task text
  --task-file <path>       Read task text from file
  --verify <cmd>           Verification command (repeatable)
  --target-files <csv>     Optional file scope hint, e.g. "src/a.ts,README.md"
  --session-id <id>        Session id (default: yuanyuan-autodev-<timestamp>)
  --channel <name>         Agent channel (default: telegram)
  --timeout <seconds>      Per-round agent timeout (default: 180)
  --thinking <level>       thinking level: off|minimal|low|medium|high (default: minimal)
  --max-rounds <n>         Max repair rounds (default: 2)
  --retries <n>            Retries per round when timeout/error (default: 2)
  --artifact-dir <path>    Output dir (default: tests/artifacts/yuanyuan-autodev/<session-id>)
  --force                  Run even if autodev readiness check fails
  -h, --help               Show help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --task requires a value" >&2
        exit 1
      fi
      TASK_TEXT="$2"
      shift 2
      ;;
    --task-file)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --task-file requires a value" >&2
        exit 1
      fi
      TASK_FILE="$2"
      shift 2
      ;;
    --verify)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --verify requires a value" >&2
        exit 1
      fi
      VERIFY_CMDS+=("$2")
      shift 2
      ;;
    --target-files)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --target-files requires a value" >&2
        exit 1
      fi
      TARGET_FILES="$2"
      shift 2
      ;;
    --session-id)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --session-id requires a value" >&2
        exit 1
      fi
      SESSION_ID="$2"
      shift 2
      ;;
    --channel)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --channel requires a value" >&2
        exit 1
      fi
      CHANNEL="$2"
      shift 2
      ;;
    --timeout)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --timeout requires a value" >&2
        exit 1
      fi
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --thinking)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --thinking requires a value" >&2
        exit 1
      fi
      THINKING="$2"
      shift 2
      ;;
    --max-rounds)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --max-rounds requires a value" >&2
        exit 1
      fi
      MAX_ROUNDS="$2"
      shift 2
      ;;
    --retries)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --retries requires a value" >&2
        exit 1
      fi
      RETRIES="$2"
      shift 2
      ;;
    --artifact-dir)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --artifact-dir requires a value" >&2
        exit 1
      fi
      ARTIFACT_DIR="$2"
      shift 2
      ;;
    --force)
      FORCE_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -n "${TASK_FILE}" ]]; then
  if [[ ! -f "${TASK_FILE}" ]]; then
    echo "[ERROR] task file not found: ${TASK_FILE}" >&2
    exit 1
  fi
  TASK_TEXT="$(cat "${TASK_FILE}")"
fi

if [[ -z "${TASK_TEXT//[[:space:]]/}" ]]; then
  echo "[ERROR] missing task text (use --task or --task-file)" >&2
  exit 1
fi

if [[ -z "${ARTIFACT_DIR}" ]]; then
  ARTIFACT_DIR="${REPO_ROOT}/tests/artifacts/yuanyuan-autodev/${SESSION_ID}"
fi
mkdir -p "${ARTIFACT_DIR}"

if [[ "${OPENCLAW_CONFIG}" == ~/* ]]; then
  OPENCLAW_CONFIG="${HOME}/${OPENCLAW_CONFIG#~/}"
fi

if [[ ! -f "${OPENCLAW_CONFIG}" ]]; then
  echo "[ERROR] openclaw config missing: ${OPENCLAW_CONFIG}" >&2
  echo "Run: bash scripts/setup.sh" >&2
  exit 1
fi

if ! python3 - "${OPENCLAW_CONFIG}" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    cfg = json.load(f)

agents = cfg.get('agents') if isinstance(cfg, dict) else {}
if not isinstance(agents, dict):
    agents = {}
defaults = agents.get('defaults')
if not isinstance(defaults, dict):
    defaults = {}
sandbox = defaults.get('sandbox')
if not isinstance(sandbox, dict):
    sandbox = {}
workspace_access = str(sandbox.get('workspaceAccess') or '').strip().lower()

tools = cfg.get('tools') if isinstance(cfg, dict) else {}
if not isinstance(tools, dict):
    tools = {}
tool_sandbox = tools.get('sandbox') if isinstance(tools.get('sandbox'), dict) else {}
tool_rules = tool_sandbox.get('tools') if isinstance(tool_sandbox.get('tools'), dict) else {}
deny = tool_rules.get('deny') if isinstance(tool_rules.get('deny'), list) else []
blocked = {str(item).strip().lower() for item in deny if isinstance(item, str)}

ready = workspace_access == 'rw' and 'group:fs' not in blocked and 'group:runtime' not in blocked
sys.exit(0 if ready else 1)
PY
then
  if [[ "${FORCE_RUN}" -eq 1 ]]; then
    echo "[WARN] autodev readiness check failed, but --force is set; continuing." >&2
  else
    echo "[ERROR] autodev readiness check failed." >&2
    echo "Run: bash scripts/yuanyuan_enable_autodev.sh" >&2
    exit 2
  fi
fi

extract_payload_text() {
  local json_file="$1"
  python3 - "$json_file" <<'PY'
import json
import sys
from pathlib import Path

p = Path(sys.argv[1])
if not p.exists():
    sys.exit(1)
try:
    data = json.loads(p.read_text(encoding='utf-8'))
except Exception:
    sys.exit(1)

payloads = data.get('payloads') if isinstance(data, dict) else []
if not isinstance(payloads, list):
    payloads = []
texts = []
for item in payloads:
    if isinstance(item, dict):
        text = item.get('text')
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())

print("\n\n".join(texts).strip())
PY
}

build_prompt() {
  local round="$1"
  local failure_file="$2"

  local verify_text="(none)"
  if [[ ${#VERIFY_CMDS[@]} -gt 0 ]]; then
    verify_text=""
    local i=0
    for cmd in "${VERIFY_CMDS[@]}"; do
      i=$((i + 1))
      verify_text+="${i}. ${cmd}"$'\n'
    done
  fi

  local scope_text="未限制"
  if [[ -n "${TARGET_FILES}" ]]; then
    scope_text="${TARGET_FILES}"
  fi

  if [[ "${round}" -eq 1 ]]; then
    cat <<__PROMPT__
你是 SAVC 的 yuanyuan 开发代理。你必须直接在工作区改代码并执行验证，不要只输出开发方案。

工作区根目录: ${REPO_ROOT}
任务描述:
${TASK_TEXT}

文件范围限制(可选): ${scope_text}

强约束:
1) 先使用 savc_route 与 savc_decompose 完成编排。
2) 涉及实现时必须使用 savc_spawn_expert（technical 或 vibe-coder）并等待完成。
3) 对于代码改动，优先直接修改工作区文件，而不是返回大段示例代码。
4) 完成后执行以下验证命令(若有):
${verify_text}
5) 最终输出只允许一个 JSON 对象，不要 Markdown。格式:
{"status":"done|blocked|need_followup","summary":"...","changed_files":["..."],"verify":[{"command":"...","ok":true,"note":"..."}],"next_actions":["..."]}
__PROMPT__
  else
    cat <<__REPAIR__
继续上一次会话，执行“修复回合 #${round}”。

目标: 修复本地验证失败项，直接改文件并重跑验证。
失败摘要:
$(cat "${failure_file}")

仍需遵守：先编排，再改代码，最后只输出一个 JSON 对象（同上一轮格式）。
__REPAIR__
  fi
}

run_agent_round() {
  local round="$1"
  local prompt_file="$2"

  local attempt=1
  while [[ "${attempt}" -le "${RETRIES}" ]]; do
    local out_json="${ARTIFACT_DIR}/round-${round}-attempt-${attempt}.json"
    local err_log="${ARTIFACT_DIR}/round-${round}-attempt-${attempt}.err.log"

    if bash "${REPO_ROOT}/scripts/openclaw.sh" agent \
      --local \
      --channel "${CHANNEL}" \
      --session-id "${SESSION_ID}" \
      --thinking "${THINKING}" \
      --timeout "${TIMEOUT_SECONDS}" \
      --message "$(cat "${prompt_file}")" \
      --json >"${out_json}" 2>"${err_log}"; then
      local text_file="${ARTIFACT_DIR}/round-${round}-assistant.txt"
      if extract_payload_text "${out_json}" >"${text_file}"; then
        if [[ -s "${text_file}" ]]; then
          cp -f "${out_json}" "${ARTIFACT_DIR}/round-${round}-agent.json"
          cp -f "${err_log}" "${ARTIFACT_DIR}/round-${round}-agent.err.log"
          return 0
        fi
      fi
    fi

    if rg -n "timed out|FailoverError|embedded run timeout" "${out_json}" "${err_log}" >/dev/null 2>&1; then
      echo "[WARN] round ${round} attempt ${attempt}: timeout/failover detected" >&2
    else
      echo "[WARN] round ${round} attempt ${attempt}: agent call failed" >&2
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  return 1
}

run_verify_round() {
  local round="$1"
  local summary_file="${ARTIFACT_DIR}/round-${round}-verify-summary.txt"
  : > "${summary_file}"

  if [[ ${#VERIFY_CMDS[@]} -eq 0 ]]; then
    echo "(no verify command configured)" > "${summary_file}"
    return 0
  fi

  local all_ok=1
  local idx=0
  for cmd in "${VERIFY_CMDS[@]}"; do
    idx=$((idx + 1))
    local log_file="${ARTIFACT_DIR}/round-${round}-verify-${idx}.log"
    if bash -lc "cd '${REPO_ROOT}' && ${cmd}" >"${log_file}" 2>&1; then
      echo "[OK] ${cmd}" >> "${summary_file}"
    else
      echo "[FAIL] ${cmd}" >> "${summary_file}"
      echo "----- tail(${log_file}) -----" >> "${summary_file}"
      tail -n 60 "${log_file}" >> "${summary_file}" || true
      echo "-----------------------------" >> "${summary_file}"
      all_ok=0
    fi
  done

  [[ "${all_ok}" -eq 1 ]]
}

round=1
success=0

while [[ "${round}" -le "${MAX_ROUNDS}" ]]; do
  prompt_file="${ARTIFACT_DIR}/round-${round}-prompt.txt"
  if [[ "${round}" -eq 1 ]]; then
    build_prompt "${round}" "" > "${prompt_file}"
  else
    prev_summary="${ARTIFACT_DIR}/round-$((round - 1))-verify-summary.txt"
    build_prompt "${round}" "${prev_summary}" > "${prompt_file}"
  fi

  echo "[INFO] round ${round}/${MAX_ROUNDS}: calling yuanyuan (session=${SESSION_ID}, channel=${CHANNEL})"
  if ! run_agent_round "${round}" "${prompt_file}"; then
    echo "[ERROR] round ${round}: yuanyuan call failed after ${RETRIES} retries" >&2
    break
  fi

  if run_verify_round "${round}"; then
    success=1
    break
  fi

  round=$((round + 1))
done

assistant_last="${ARTIFACT_DIR}/round-${round}-assistant.txt"
if [[ ! -f "${assistant_last}" ]]; then
  assistant_last="${ARTIFACT_DIR}/round-$((round - 1))-assistant.txt"
fi

echo "[INFO] artifacts: ${ARTIFACT_DIR}"
if [[ -f "${assistant_last}" ]]; then
  echo "[INFO] last assistant output: ${assistant_last}"
fi

if [[ "${success}" -eq 1 ]]; then
  echo "[OK] yuanyuan autodev completed with passing local verification."
  exit 0
fi

echo "[WARN] yuanyuan autodev finished but verification is still failing (or not run to pass)."
exit 3
