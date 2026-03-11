#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/infra/docker/docker-compose.prod.yml"
ENV_FILE="${SAVC_DOCKER_ENV_FILE:-${REPO_ROOT}/infra/docker/.env.prod}"
ENV_EXAMPLE="${REPO_ROOT}/infra/docker/.env.prod.example"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/prod_container.sh init-env
  bash scripts/prod_container.sh validate
  bash scripts/prod_container.sh up
  bash scripts/prod_container.sh down
  bash scripts/prod_container.sh restart
  bash scripts/prod_container.sh logs [service]
  bash scripts/prod_container.sh ps
  bash scripts/prod_container.sh config

Env:
  SAVC_DOCKER_ENV_FILE=/path/to/.env.prod
  COMPOSE_PROFILES=automation
EOF
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "[ERROR] docker not found." >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "[ERROR] docker compose not available." >&2
    exit 1
  fi
}

ensure_env() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "[ERROR] Missing docker env file: ${ENV_FILE}" >&2
    echo "Create with: bash scripts/prod_container.sh init-env" >&2
    exit 1
  fi
}

validate_env() {
  bash "${REPO_ROOT}/scripts/validate_cloud_env.sh" "${ENV_FILE}"
}

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

cmd="${1:-help}"
case "${cmd}" in
  init-env)
    if [[ -f "${ENV_FILE}" ]]; then
      echo "[INFO] docker env already exists: ${ENV_FILE}"
      exit 0
    fi
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}" 2>/dev/null || true
    echo "[OK] created docker env: ${ENV_FILE}"
    echo "[INFO] edit this file and prepare ${REPO_ROOT}/infra/docker/secrets/ before deployment."
    ;;
  validate)
    ensure_env
    validate_env
    ;;
  up)
    require_docker
    ensure_env
    validate_env
    compose up -d --build --remove-orphans
    ;;
  down)
    require_docker
    ensure_env
    compose down
    ;;
  restart)
    require_docker
    ensure_env
    validate_env
    compose down
    compose up -d --build --remove-orphans
    ;;
  logs)
    require_docker
    ensure_env
    service="${2:-}"
    if [[ -n "${service}" ]]; then
      compose logs -f "${service}"
    else
      compose logs -f
    fi
    ;;
  ps)
    require_docker
    ensure_env
    compose ps
    ;;
  config)
    require_docker
    ensure_env
    validate_env
    compose config
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "[ERROR] unknown command: ${cmd}" >&2
    usage
    exit 1
    ;;
esac
