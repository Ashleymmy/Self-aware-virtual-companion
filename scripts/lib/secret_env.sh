#!/usr/bin/env bash

read_secret_file() {
  local file_path="$1"
  if [[ -z "${file_path}" ]]; then
    return 1
  fi
  if [[ ! -f "${file_path}" ]]; then
    echo "[ERROR] Secret file not found: ${file_path}" >&2
    return 1
  fi
  cat -- "${file_path}"
}

resolve_secret_value() {
  local var_name="$1"
  local default_value="${2-}"
  local file_var_name="${var_name}_FILE"
  local current_value="${!var_name-}"
  local file_value="${!file_var_name-}"

  if [[ -n "${current_value}" ]]; then
    printf '%s' "${current_value}"
    return 0
  fi

  if [[ -n "${file_value}" ]]; then
    read_secret_file "${file_value}"
    return $?
  fi

  printf '%s' "${default_value}"
}

export_resolved_secret() {
  local var_name="$1"
  local default_value="${2-}"
  local resolved
  resolved="$(resolve_secret_value "${var_name}" "${default_value}")" || return 1
  printf -v "${var_name}" '%s' "${resolved}"
  export "${var_name}"
}
