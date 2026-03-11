#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

require_command npm "Install npm together with Node.js 22+."
require_node
ensure_project_layout

ensure_dependencies "${MONITOR_DIR}"
ensure_dependencies "${DASHBOARD_DIR}"
ensure_dependencies "${AGENT_DIR}"
write_install_state

echo "macOS install completed."
echo "State file: ${STATE_DIR}/install-state.json"
