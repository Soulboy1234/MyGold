#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

require_node
ensure_project_layout

start_service "gold-monitor" "${MONITOR_DIR}" "src/daemon.mjs"
start_service "gold-dashboard" "${DASHBOARD_DIR}" "server.mjs"
start_service "gold-investor-agent" "${AGENT_DIR}" "src/daemon.mjs"
start_service "gold-investor-panel" "${AGENT_DIR}" "src/server.mjs"

"${SCRIPT_DIR}/open-all-panels.sh"
