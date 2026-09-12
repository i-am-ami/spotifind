#!/bin/bash
# Runs a named test suite, saves the full output to tests/logs/ (gitignored,
# for local debugging), and appends a one-line summary to tests/test-log.md
# (git-tracked, the running history of suite health over time).
#
# Usage: scripts/run-tests.sh <suite-name> <test-file> [test-file...]
set -euo pipefail

SUITE_NAME="$1"
shift
TEST_FILES=("$@")

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p tests/logs
TIMESTAMP="$(date +"%Y-%m-%d_%H%M%S")"
LOG_FILE="tests/logs/${TIMESTAMP}-${SUITE_NAME}.log"

set +e
node --test "${TEST_FILES[@]}" 2>&1 | tee "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}
set -e

PASS="$(grep -m1 "ℹ pass" "$LOG_FILE" | awk '{print $NF}')"
FAIL="$(grep -m1 "ℹ fail" "$LOG_FILE" | awk '{print $NF}')"
TOTAL="$(grep -m1 "ℹ tests" "$LOG_FILE" | awk '{print $NF}')"
DATE_HUMAN="$(date +"%Y-%m-%d %H:%M")"

STATUS="passed"
if [ "${FAIL:-0}" != "0" ]; then
  STATUS="**FAILED**"
fi

echo "- **${DATE_HUMAN}** — \`${SUITE_NAME}\`: ${PASS:-?}/${TOTAL:-?} passed, ${FAIL:-?} failed (${STATUS}). Full log: [\`$(basename "$LOG_FILE")\`](logs/$(basename "$LOG_FILE"))" >> tests/test-log.md

exit $EXIT_CODE
