#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"
ENV_FILE="${1:-${REPO_ROOT}/infra/docker/.env.prod}"
COMPOSE_FILE="${REPO_ROOT}/infra/docker/docker-compose.prod.yml"
COMPOSE_DIR="$(cd -- "$(dirname -- "${COMPOSE_FILE}")" && pwd)"

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

SECRETS_MOUNT="${SAVC_SECRETS_MOUNT:-/run/savc-secrets}"

resolve_host_path() {
  local configured_path="$1"
  if [[ -z "${configured_path}" ]]; then
    return 1
  fi
  if [[ "${configured_path}" = /* ]]; then
    printf '%s' "${configured_path}"
    return 0
  fi
  printf '%s/%s' "${COMPOSE_DIR}" "${configured_path#./}"
}

HOST_SECRET_DIR="$(
  resolve_host_path "${SAVC_HOST_SECRETS_DIR:-./secrets}"
)"
HOST_CODEX_HOME_DIR="$(
  resolve_host_path "${SAVC_HOST_CODEX_HOME_DIR:-./bootstrap/empty-codex-home}"
)"
HOST_CODEX_AUTH_FILE="$(
  resolve_host_path "${SAVC_HOST_CODEX_AUTH_FILE:-./bootstrap/empty-codex-home/auth.json}"
)"
HOST_DEV_WORKSPACE_DIR="$(
  resolve_host_path "${SAVC_HOST_DEV_WORKSPACE_DIR:-./bootstrap/empty-workspace}"
)"

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

if [[ -d "${HOST_CODEX_HOME_DIR}" ]]; then
  pass "codex home dir exists: ${HOST_CODEX_HOME_DIR}"
else
  warn "codex home dir missing: ${HOST_CODEX_HOME_DIR}"
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
  if [[ -n "${!key-}" ]]; then
    provider_ready=1
    break
  fi
  if [[ -n "${!file_var-}" ]]; then
    provider_host_path="$(map_secret_file_to_host "${!file_var-}")"
    if [[ -f "${provider_host_path}" ]]; then
      provider_ready=1
      break
    fi
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

if [[ "${SAVC_CODEX_ACP_ENABLE:-0}" == "1" ]]; then
  case "${SAVC_CODEX_ACP_AUTH_MODE:-api-key}" in
    api-key)
      if [[ -n "${OPENAI_API_KEY:-}" || -n "${OPENAI_API_KEY_FILE:-}" ]]; then
        pass "codex ACP auth configured via OPENAI_API_KEY"
      else
        fail "codex ACP enabled but OPENAI_API_KEY / OPENAI_API_KEY_FILE is not configured"
      fi
      ;;
    auth)
      if [[ -f "${HOST_CODEX_AUTH_FILE}" ]]; then
        auth_payload="$(tr -d '[:space:]' < "${HOST_CODEX_AUTH_FILE}" 2>/dev/null || true)"
        if [[ -n "${auth_payload}" && "${auth_payload}" != "{}" && "${auth_payload}" != "null" ]]; then
          pass "codex ACP auth configured via auth file: ${HOST_CODEX_AUTH_FILE}"
        else
          fail "codex ACP auth file is still placeholder/empty: ${HOST_CODEX_AUTH_FILE}"
        fi
      else
        fail "codex ACP auth file missing: ${HOST_CODEX_AUTH_FILE}"
      fi
      ;;
    *)
      fail "unsupported codex ACP auth mode: ${SAVC_CODEX_ACP_AUTH_MODE}"
      ;;
  esac

  if [[ "${SAVC_CODEX_ACP_CWD:-}" == /workspace-devrepo* ]]; then
    if [[ -d "${HOST_DEV_WORKSPACE_DIR}" ]]; then
      pass "codex workspace dir exists: ${HOST_DEV_WORKSPACE_DIR}"
      if find "${HOST_DEV_WORKSPACE_DIR}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null | grep -q .; then
        pass "codex workspace dir is non-empty"
      else
        warn "codex workspace dir is empty: ${HOST_DEV_WORKSPACE_DIR}"
      fi
    else
      fail "codex workspace dir missing: ${HOST_DEV_WORKSPACE_DIR}"
    fi
  else
    warn "codex ACP cwd does not use /workspace-devrepo (current: ${SAVC_CODEX_ACP_CWD:-unset})"
  fi
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
