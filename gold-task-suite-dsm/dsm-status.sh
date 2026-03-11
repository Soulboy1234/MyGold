#!/usr/bin/env bash

set -euo pipefail

SUITE_DIR="$(cd "$(dirname "$0")" && pwd)"
LINUX_SUITE_DIR="${SUITE_DIR}/../gold-task-suite-linux"

chmod +x "${LINUX_SUITE_DIR}/"*.sh "${LINUX_SUITE_DIR}/lib/common.sh"
source "${LINUX_SUITE_DIR}/lib/common.sh"

services=(
  "gold-monitor"
  "gold-dashboard"
  "gold-investor-agent"
  "gold-investor-panel"
)

for service in "${services[@]}"; do
  pid_file="$(pid_file_for "${service}")"
  if [[ ! -f "${pid_file}" ]]; then
    echo "${service}: not running"
    continue
  fi

  pid="$(cat "${pid_file}")"
  if [[ -n "${pid}" ]] && is_pid_running "${pid}"; then
    echo "${service}: running (pid ${pid})"
  else
    echo "${service}: stale pid file"
  fi
done

echo
print_access_urls
