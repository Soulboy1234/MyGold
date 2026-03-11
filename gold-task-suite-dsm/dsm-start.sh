#!/usr/bin/env bash

set -euo pipefail

SUITE_DIR="$(cd "$(dirname "$0")" && pwd)"
LINUX_SUITE_DIR="${SUITE_DIR}/../gold-task-suite-linux"

chmod +x "${LINUX_SUITE_DIR}/"*.sh "${LINUX_SUITE_DIR}/lib/common.sh"
"${LINUX_SUITE_DIR}/start-all.sh"
