#!/usr/bin/env bash
# Full Regression Sweep: the dependency-free unit tests, then every browser suite, one after the other.
#   tests/browser/run-all.sh                 everything
#   RB_ONLY="confirm google" tests/browser/run-all.sh   just those suites
# Each browser suite drives the real app in Chromium against an IN-BROWSER test double of Supabase/Google
# (fake-supabase.js): they prove what the app sends and how it reacts, NOT what the real services answer.
# Needs Playwright (see tests/browser/README.md). Exit status is non-zero if anything failed.
set -u
cd "$(dirname "$0")/../.."
SUITES="${RB_ONLY:-local extra connected sw recovery otp google confirm channels}"
LOG="${RB_OUT:-${TMPDIR:-/tmp}/rebuilt-browser-out}/sweep"; mkdir -p "$LOG"
fail=0
echo "=== unit: node tests/auth.test.js"
node tests/auth.test.js > "$LOG/unit.txt" 2>&1; rc=$?; tail -n 1 "$LOG/unit.txt"; [ $rc -eq 0 ] || { echo "FAILED: unit"; fail=1; }
for s in $SUITES; do
  echo "=== browser: run_$s.js"
  start=$(date +%s)
  timeout "${RB_TIMEOUT:-540}" node "tests/browser/run_$s.js" > "$LOG/$s.txt" 2>&1; rc=$?
  echo "    $(grep -E '^[0-9]+/[0-9]+ passed|passed' "$LOG/$s.txt" | tail -n 1)  (exit $rc, $(( $(date +%s) - start ))s, log: $LOG/$s.txt)"
  [ $rc -eq 0 ] || { echo "FAILED: $s"; grep -E '^FAIL|FAILED|HARNESS' "$LOG/$s.txt" | head -n 8; fail=1; }
done
[ $fail -eq 0 ] && echo "SWEEP: ALL PASSED" || echo "SWEEP: FAILURES (see above)"
exit $fail
