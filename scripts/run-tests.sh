#!/bin/bash
# Runs a named test suite, saves full output + a JUnit XML per run to
# tests/logs/ (gitignored, local only), and appends one summary line to
# tests/test-log.md (git-tracked, human-readable) plus one JSON record to
# tests/test-log.jsonl (git-tracked, machine-readable).
#
# Usage: scripts/run-tests.sh <suite-name> <test-file> [test-file...]
set -euo pipefail

SUITE_NAME="$1"
shift
TEST_FILES=("$@")

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p tests/logs

# Single local-time capture; filename + human date are sliced from the same
# string so they can never disagree across a clock-second boundary.
NOW="$(date +"%Y-%m-%d %H:%M:%S")"
DATE_HUMAN="${NOW:0:16}"
TIMESTAMP="${NOW:0:10}_${NOW:11:2}${NOW:14:2}${NOW:17:2}"
# Separate UTC capture for the jsonl ISO 8601 field -- a genuinely different
# timezone representation, not just a different format of the same moment.
TIMESTAMP_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

LOG_FILE="tests/logs/${TIMESTAMP}-${SUITE_NAME}.log"
XML_FILE="tests/logs/${TIMESTAMP}-${SUITE_NAME}.xml"

COMMIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

set +e
node --test \
  --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=junit --test-reporter-destination="$XML_FILE" \
  "${TEST_FILES[@]}" 2>&1 | tee "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}
set -e

# --- Parse counts out of the JUnit XML's trailing summary comments -------
# Node's built-in junit reporter (v24) does not put totals on <testsuites>
# as attributes; it appends 8 fixed single-line XML comments right before
# the closing tag, e.g. `<!-- pass 25 -->` -- the same values the spec
# reporter prints as `ℹ pass 25` on stdout, in comment form.
extract_field() {
  grep -m1 -- "<!-- $1 " "$2" 2>/dev/null | sed -E "s/.*<!-- $1 ([0-9.]+) -->.*/\1/"
  return 0   # required: a no-match grep exits 1, and under pipefail that
             # would otherwise abort the whole script at the assignment site
}

TOTAL="" PASS="" FAIL="" SKIPPED="" DURATION_MS=""
if [ -f "$XML_FILE" ]; then
  TOTAL="$(extract_field tests "$XML_FILE")"
  PASS="$(extract_field pass "$XML_FILE")"
  FAIL="$(extract_field fail "$XML_FILE")"
  SKIPPED="$(extract_field skipped "$XML_FILE")"
  DURATION_MS="$(extract_field duration_ms "$XML_FILE")"
fi

# Status comes from the real process exit code, not the parsed FAIL count,
# since EXIT_CODE is the one value guaranteed to exist even if node crashed
# before the XML file was written at all (e.g. bad test file path).
if [ "$EXIT_CODE" = "0" ]; then
  STATUS_MD="passed"
  STATUS_JSON="passed"
else
  STATUS_MD="**FAILED**"
  STATUS_JSON="failed"
fi

# --- tests/test-log.md: unchanged format, unchanged appending logic ------
echo "- **${DATE_HUMAN}** — \`${SUITE_NAME}\`: ${PASS:-?}/${TOTAL:-?} passed, ${FAIL:-?} failed (${STATUS_MD}). Full log: [\`$(basename "$LOG_FILE")\`](logs/$(basename "$LOG_FILE"))" >> tests/test-log.md

# --- tests/test-log.jsonl: new, one JSON record per run -------------------
json_num() { [ -n "$1" ] && printf '%s' "$1" || printf 'null'; }

printf '{"timestamp":"%s","suite":"%s","total":%s,"pass":%s,"fail":%s,"skipped":%s,"duration_ms":%s,"exit_code":%s,"status":"%s","log_file":"%s","xml_file":"%s","commit":"%s"}\n' \
  "$TIMESTAMP_ISO" "$SUITE_NAME" \
  "$(json_num "$TOTAL")" "$(json_num "$PASS")" "$(json_num "$FAIL")" "$(json_num "$SKIPPED")" "$(json_num "$DURATION_MS")" \
  "$EXIT_CODE" "$STATUS_JSON" "$LOG_FILE" "$XML_FILE" "$COMMIT_SHA" >> tests/test-log.jsonl

exit $EXIT_CODE
