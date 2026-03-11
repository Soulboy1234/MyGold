#!/usr/bin/env bash

set -euo pipefail

SUITE_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SUITE_DIR}/lib/common.sh"

print_access_urls
