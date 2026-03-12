#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"
ENV_FILE="${1:-${REPO_ROOT}/infra/docker/.env.prod}"
COMPOSE_FILE="${REPO_ROOT}/infra/docker/docker-compose.prod.yml"

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

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[ERROR] env file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

HOST_SECRET_DIR="${SAVC_HOST_SECRETS_DIR:-${REPO_ROOT}/infra/docker/secrets}"
SECRETS_MOUNT="${SAVC_SECRETS_MOUNT:-/run/savc-secrets}"

map_secret_file_to_host() {
  local configured_path="$1"
  if [[ -z "${configured_path}" ]]; then
    return 1
  fi
  if [[ "${configured_path}" == "${SECRETS_MOUNT}/"* ]]; then
    printf '%s/%s' "${HOST_SECRET_DIR}" "${configured_path#${SECRETS_MOUNT}/}"
    return 0
  fi
  printf '%s' "${configured_path}"
}

check_secret_var() {
  local var_name="$1"
  local required="$2"
  local label="${3:-$1}"
  local direct="${!var_name-}"
  local file_var="${var_name}_FILE"
  local file_path="${!file_var-}"

  if [[ -n "${direct}" ]]; then
    pass "${label} configured via env"
    return 0
  fi

  if [[ -n "${file_path}" ]]; then
    local host_path
    host_path="$(map_secret_file_to_host "${file_path}")"
    if [[ -f "${host_path}" ]]; then
      pass "${label} file exists: ${host_path}"
    else
      if [[ "${required}" == "required" ]]; then
        fail "${label} file missing: ${host_path}"
      else
        warn "${label} file missing: ${host_path}"
      fi
    fi
    return 0
  fi

  if [[ "${required}" == "required" ]]; then
    fail "${label} not configured"
  else
    warn "${label} not configured"
  fi
}

if [[ -d "${HOST_SECRET_DIR}" ]]; then
  pass "host secret dir exists: ${HOST_SECRET_DIR}"
else
  fail "host secret dir missing: ${HOST_SECRET_DIR}"
fi

check_secret_var "OPENCLAW_GATEWAY_TOKEN" "required" "gateway token"

providers=(
  OPENAI_API_KEY
  ANTHROPIC_API_KEY
  ANYROUTER_API_KEY
  WZW_API_KEY
  GGBOOM_API_KEY
  CODE_API_KEY
  LAOYOU_API_KEY
  VOLCES_API_KEY
)

provider_ready=0
for key in "${providers[@]}"; do
  file_var="${key}_FILE"
  if [[ -n "${!key-}" || -n "${!file_var-}" ]]; then
    provider_ready=1
    break
  fi
done
if [[ "${provider_ready}" -eq 1 ]]; then
  pass "at least one LLM provider secret is configured"
else
  fail "no LLM provider secret configured"
fi

if [[ -n "${VITE_SAVC_GATEWAY_TOKEN:-}" || -n "${VITE_SAVC_GATEWAY_TOKEN_FILE:-}" ]]; then
  fail "VITE_SAVC_GATEWAY_TOKEN must stay empty in production"
else
  pass "frontend gateway token exposure disabled"
fi

if [[ "${VITE_SAVC_GATEWAY_URL:-/gateway}" == "/gateway" ]]; then
  pass "frontend gateway URL uses in-app proxy path"
else
  warn "VITE_SAVC_GATEWAY_URL is not /gateway (current: ${VITE_SAVC_GATEWAY_URL})"
fi

if [[ -n "${GOOGLE_CALENDAR_ID:-}" ]]; then
  check_secret_var "GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON" "required" "google calendar service account"
else
  warn "GOOGLE_CALENDAR_ID not configured (calendar automation disabled)"
fi

if [[ -n "${OPENWEATHER_LAT:-}" || -n "${OPENWEATHER_LON:-}" ]]; then
  check_secret_var "OPENWEATHER_API_KEY" "required" "openweather api key"
  if [[ -n "${OPENWEATHER_LAT:-}" && -n "${OPENWEATHER_LON:-}" ]]; then
    pass "weather coordinates configured"
  else
    fail "weather coordinates incomplete"
  fi
else
  warn "weather coordinates not configured"
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config >/dev/null 2>&1; then
    pass "docker compose production config validates"
  else
    fail "docker compose production config failed"
  fi
else
  warn "docker compose unavailable; skipped compose config validation"
fi

echo
echo "Summary: PASS ${pass_count} / WARN ${warn_count} / FAIL ${fail_count}"

if [[ "${fail_count}" -gt 0 ]]; then
  exit 1
fi
