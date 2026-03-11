#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUITE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${SUITE_DIR}/.." && pwd)"

MONITOR_DIR="${ROOT_DIR}/gold-monitor"
DASHBOARD_DIR="${ROOT_DIR}/gold-dashboard"
AGENT_DIR="${ROOT_DIR}/gold-investor-agent"

RUN_DIR="${SUITE_DIR}/run"
LOG_DIR="${SUITE_DIR}/logs"
STATE_DIR="${SUITE_DIR}/state"

mkdir -p "${RUN_DIR}" "${LOG_DIR}" "${STATE_DIR}"

require_command() {
  local command_name="$1"
  local hint="$2"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "${command_name} is required. ${hint}" >&2
    exit 1
  fi
}

require_node() {
  require_command node "Install Node.js 22+ first."
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "${major}" -lt 22 ]]; then
    echo "Node.js 22+ is required. Current version: $(node -v)" >&2
    exit 1
  fi
}

ensure_project_layout() {
  local missing=0
  for dir in "${MONITOR_DIR}" "${DASHBOARD_DIR}" "${AGENT_DIR}"; do
    if [[ ! -d "${dir}" ]]; then
      echo "Missing project directory: ${dir}" >&2
      missing=1
    fi
  done

  if [[ "${missing}" -ne 0 ]]; then
    exit 1
  fi
}

ensure_dependencies() {
  local project_dir="$1"
  if [[ -f "${project_dir}/package.json" && ! -d "${project_dir}/node_modules" ]]; then
    echo "Installing dependencies in ${project_dir}"
    (cd "${project_dir}" && npm install)
  fi
}

pid_file_for() {
  local name="$1"
  echo "${RUN_DIR}/${name}.pid"
}

log_file_for() {
  local name="$1"
  echo "${LOG_DIR}/${name}.log"
}

is_pid_running() {
  local pid="$1"
  kill -0 "${pid}" >/dev/null 2>&1
}

stop_by_pid_file() {
  local name="$1"
  local pid_file
  pid_file="$(pid_file_for "${name}")"

  if [[ ! -f "${pid_file}" ]]; then
    echo "${name} is not running."
    return 0
  fi

  local pid
  pid="$(cat "${pid_file}")"
  if [[ -n "${pid}" ]] && is_pid_running "${pid}"; then
    kill "${pid}" >/dev/null 2>&1 || true
    sleep 1
    if is_pid_running "${pid}"; then
      kill -9 "${pid}" >/dev/null 2>&1 || true
    fi
    echo "${name} stopped."
  else
    echo "${name} had a stale pid file."
  fi

  rm -f "${pid_file}"
}

start_service() {
  local name="$1"
  local project_dir="$2"
  local entry_file="$3"
  local pid_file
  local log_file

  pid_file="$(pid_file_for "${name}")"
  log_file="$(log_file_for "${name}")"

  stop_by_pid_file "${name}" >/dev/null 2>&1 || true

  if [[ ! -f "${project_dir}/${entry_file}" ]]; then
    echo "Entry file not found: ${project_dir}/${entry_file}" >&2
    exit 1
  fi

  (
    cd "${project_dir}"
    nohup node "${entry_file}" >>"${log_file}" 2>&1 &
    echo $! > "${pid_file}"
  )

  sleep 1
  local pid
  pid="$(cat "${pid_file}")"
  if ! is_pid_running "${pid}"; then
    echo "Failed to start ${name}. Check ${log_file}" >&2
    exit 1
  fi

  echo "${name} started (pid ${pid})."
}

write_install_state() {
  cat > "${STATE_DIR}/install-state.json" <<EOF
{
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "nodeVersion": "$(node -v)",
  "platform": "macOS"
}
EOF
}
