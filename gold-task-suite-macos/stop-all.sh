#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

stop_by_pid_file "gold-investor-panel"
stop_by_pid_file "gold-investor-agent"
stop_by_pid_file "gold-dashboard"
stop_by_pid_file "gold-monitor"
