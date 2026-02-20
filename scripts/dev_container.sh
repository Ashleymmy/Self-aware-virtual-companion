#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/infra/docker/docker-compose.cloud.yml"
ENV_FILE="${SAVC_DOCKER_ENV_FILE:-${REPO_ROOT}/infra/docker/.env}"
ENV_EXAMPLE="${REPO_ROOT}/infra/docker/.env.example"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/dev_container.sh init-env
  bash scripts/dev_container.sh up
  bash scripts/dev_container.sh down
  bash scripts/dev_container.sh restart
  bash scripts/dev_container.sh logs [service]
  bash scripts/dev_container.sh ps
  bash scripts/dev_container.sh config

Env:
  SAVC_DOCKER_ENV_FILE=/path/to/.env   # override default infra/docker/.env
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
    echo "Create with: bash scripts/dev_container.sh init-env" >&2
    exit 1
  fi
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
    echo "[INFO] edit this file before running container commands."
    ;;
  up)
    require_docker
    ensure_env
    compose up -d --build
    ;;
  down)
    require_docker
    ensure_env
    compose down
    ;;
  restart)
    require_docker
    ensure_env
    compose down
    compose up -d --build
    ;;
  logs)
    require_docker
    ensure_env
    service="${2:-savc-gateway}"
    compose logs -f "${service}"
    ;;
  ps)
    require_docker
    ensure_env
    compose ps
    ;;
  config)
    require_docker
    ensure_env
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
