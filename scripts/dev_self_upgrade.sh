#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

WORKSPACE="${REPO_ROOT}/savc-core"
DATE="$(date +%F)"
MONTHLY=0
SKIP_DISCOVER=0
APPLY_PERSONA=0
SOURCE="${SELF_UPGRADE_DISCOVER_SOURCE:-openclaw-skills}"
ELIGIBLE_ONLY="${SELF_UPGRADE_ELIGIBLE_ONLY:-true}"
TOOLS="${SELF_UPGRADE_TOOLS:-}"
TARGET_TOOL="${SELF_UPGRADE_TOOL:-}"
SCENARIO="${SELF_UPGRADE_EXPERIMENT_SCENARIO:-self-upgrade-smoke}"

pass_count=0
warn_count=0
fail_count=0

pass() {
  echo "[PASS] $*"
  pass_count=$((pass_count + 1))
}

warn() {
  echo "[WARN] $*"
  warn_count=$((warn_count + 1))
}

fail() {
  echo "[FAIL] $*"
  fail_count=$((fail_count + 1))
}

usage() {
  cat <<'EOF'
Usage:
  bash scripts/dev_self_upgrade.sh [options]

Options:
  --workspace <path>        Workspace path (default: ./savc-core)
  --date <YYYY-MM-DD>       Date key for reflection/records (default: today)
  --tool <name>             Force a target tool for learn/experiment loop
  --tools <a,b,c>           Manual tools list for discover step
  --source <name>           Discover source (default: openclaw-skills)
  --eligible-only <bool>    Pass-through to discover (default: true)
  --scenario <name>         Experiment scenario tag
  --skip-discover           Skip discover step
  --apply-persona           Apply persona tuning (default: preview only)
  --monthly                 Also run monthly summary for the date month
  -h, --help                Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    --date)
      DATE="$2"
      shift 2
      ;;
    --tool)
      TARGET_TOOL="$2"
      shift 2
      ;;
    --tools)
      TOOLS="$2"
      shift 2
      ;;
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --eligible-only)
      ELIGIBLE_ONLY="$2"
      shift 2
      ;;
    --scenario)
      SCENARIO="$2"
      shift 2
      ;;
    --skip-discover)
      SKIP_DISCOVER=1
      shift
      ;;
    --apply-persona)
      APPLY_PERSONA=1
      shift
      ;;
    --monthly)
      MONTHLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

WORKSPACE="$(cd -- "${WORKSPACE}" && pwd)"

if [[ ! -d "${WORKSPACE}" ]]; then
  echo "[ERROR] workspace not found: ${WORKSPACE}" >&2
  exit 1
fi

if [[ ! -f "${REPO_ROOT}/scripts/tool_learner_runtime.mjs" ]]; then
  echo "[ERROR] missing runtime: scripts/tool_learner_runtime.mjs" >&2
  exit 1
fi

run_node_step() {
  local label="$1"
  shift
  if node "$@"; then
    pass "${label}"
    return 0
  fi
  warn "${label} failed"
  return 1
}

pick_tool_from_queue() {
  local queue_file="${WORKSPACE}/memory/tools/learning-queue.md"
  if [[ ! -f "${queue_file}" ]]; then
    return 0
  fi
  local tool=""
  tool="$(rg -o '^\- \[pending\] ([^:]+):' "${queue_file}" | head -n 1 | sed -E 's/^- \[pending\] ([^:]+):$/\1/' || true)"
  if [[ -n "${tool}" ]]; then
    printf '%s' "${tool}"
  fi
}

if [[ "${SKIP_DISCOVER}" -eq 0 ]]; then
  discover_args=(
    "${REPO_ROOT}/scripts/tool_learner_runtime.mjs"
    discover
    --repo "${REPO_ROOT}"
    --workspace "${WORKSPACE}"
    --date "${DATE}"
    --source "${SOURCE}"
    --eligible-only "${ELIGIBLE_ONLY}"
  )
  if [[ -n "${TOOLS}" ]]; then
    discover_args+=(--tools "${TOOLS}")
  fi
  if node "${discover_args[@]}"; then
    pass "tool discover (${SOURCE})"
  else
    warn "tool discover failed (source=${SOURCE})"
    if [[ -n "${TOOLS}" && "${SOURCE}" != "manual" ]]; then
      if node "${REPO_ROOT}/scripts/tool_learner_runtime.mjs" discover \
        --repo "${REPO_ROOT}" \
        --workspace "${WORKSPACE}" \
        --date "${DATE}" \
        --source manual \
        --tools "${TOOLS}"; then
        pass "tool discover fallback (manual)"
      else
        warn "tool discover fallback (manual) failed"
      fi
    fi
  fi
else
  warn "discover step skipped by --skip-discover"
fi

if [[ -z "${TARGET_TOOL}" ]]; then
  TARGET_TOOL="$(pick_tool_from_queue || true)"
fi
if [[ -z "${TARGET_TOOL}" && -n "${TOOLS}" ]]; then
  TARGET_TOOL="$(echo "${TOOLS}" | cut -d',' -f1 | xargs || true)"
fi

if [[ -n "${TARGET_TOOL}" ]]; then
  run_node_step "tool learn (${TARGET_TOOL})" \
    "${REPO_ROOT}/scripts/tool_learner_runtime.mjs" learn \
    --repo "${REPO_ROOT}" \
    --workspace "${WORKSPACE}" \
    --tool "${TARGET_TOOL}" \
    --date "${DATE}" || true

  run_node_step "tool experiment (${TARGET_TOOL})" \
    "${REPO_ROOT}/scripts/tool_learner_runtime.mjs" experiment \
    --repo "${REPO_ROOT}" \
    --workspace "${WORKSPACE}" \
    --tool "${TARGET_TOOL}" \
    --scenario "${SCENARIO}" \
    --date "${DATE}" || true

  run_node_step "tool solidify (${TARGET_TOOL})" \
    "${REPO_ROOT}/scripts/tool_learner_runtime.mjs" solidify \
    --workspace "${WORKSPACE}" \
    --tool "${TARGET_TOOL}" \
    --date "${DATE}" || true

  run_node_step "tool generalize (${TARGET_TOOL})" \
    "${REPO_ROOT}/scripts/tool_learner_runtime.mjs" generalize \
    --workspace "${WORKSPACE}" \
    --tool "${TARGET_TOOL}" \
    --date "${DATE}" || true
else
  warn "no target tool selected; skipped learn/experiment/solidify/generalize"
fi

if node "${REPO_ROOT}/scripts/self_reflection_runtime.mjs" daily \
  --workspace "${WORKSPACE}" \
  --date "${DATE}"; then
  pass "daily self reflection"
else
  fail "daily self reflection"
fi

if [[ "${APPLY_PERSONA}" -eq 1 ]]; then
  if node "${REPO_ROOT}/scripts/persona_tuning_runtime.mjs" apply \
    --workspace "${WORKSPACE}" \
    --date "${DATE}" \
    --user-ok; then
    pass "persona tuning apply"
  else
    warn "persona tuning apply failed"
  fi
else
  if node "${REPO_ROOT}/scripts/persona_tuning_runtime.mjs" preview \
    --workspace "${WORKSPACE}" \
    --date "${DATE}"; then
    pass "persona tuning preview"
  else
    warn "persona tuning preview failed"
  fi
fi

if [[ "${MONTHLY}" -eq 1 ]]; then
  month_key="${DATE:0:7}"
  if node "${REPO_ROOT}/scripts/self_reflection_runtime.mjs" monthly \
    --workspace "${WORKSPACE}" \
    --month "${month_key}"; then
    pass "monthly self reflection (${month_key})"
  else
    warn "monthly self reflection failed (${month_key})"
  fi
fi

log_file="${WORKSPACE}/memory/procedural/self-upgrade.log"
mkdir -p "$(dirname -- "${log_file}")"
printf '%s\tdate=%s\ttool=%s\tpass=%s\twarn=%s\tfail=%s\n' \
  "$(date '+%Y-%m-%d %H:%M:%S %Z')" \
  "${DATE}" \
  "${TARGET_TOOL:-none}" \
  "${pass_count}" \
  "${warn_count}" \
  "${fail_count}" >> "${log_file}"

echo "=== Self Upgrade Summary ==="
echo "workspace: ${WORKSPACE}"
echo "date: ${DATE}"
echo "target_tool: ${TARGET_TOOL:-none}"
echo "PASS: ${pass_count}"
echo "WARN: ${warn_count}"
echo "FAIL: ${fail_count}"
echo "log: ${log_file}"

if (( fail_count > 0 )); then
  exit 1
fi
