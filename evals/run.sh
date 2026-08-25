#!/usr/bin/env bash
# =============================================================================
#  run.sh — behavioural evals for the verification gate.
#
#  scripts/test/ proves the machinery works. This asks the only question that
#  actually mattered in production: given a real agent and a real task, does the
#  agent end up verifying? A skill edit that quietly makes verify-change easier
#  to skip passes every unit test in this repo and fails here.
#
#    bash evals/run.sh                  every task
#    bash evals/run.sh <task> [<task>]  named tasks
#
#  Needs the `claude` CLI. Without it, prints the plan and exits 0 — the tasks
#  remain readable as specifications and CI does not fail for a missing key.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVALS="$ROOT/evals"
WORK="$(mktemp -d)"
PASS=0; FAIL=0; SKIP=0

HAVE_CLAUDE=0
command -v claude >/dev/null 2>&1 && HAVE_CLAUDE=1

TASKS="$*"
[ -z "$TASKS" ] && TASKS="$(cd "$EVALS/tasks" && ls -d */ 2>/dev/null | tr -d '/')"

if [ "$HAVE_CLAUDE" = "0" ]; then
  echo "⚠ the \`claude\` CLI is not on PATH — evals are DESCRIBED, not run."
  echo "  Install it, then: bash evals/run.sh"
  echo
fi

for t in $TASKS; do
  D="$EVALS/tasks/$t"
  [ -d "$D" ] || { echo "✗ no such task: $t"; FAIL=$((FAIL + 1)); continue; }
  echo "══ $t ═══════════════════════════════════════════════════"
  head -3 "$D/prompt.md" 2>/dev/null | sed 's/^/   /'

  REPO="$WORK/$t"
  mkdir -p "$REPO"
  cp -R "$EVALS/fixture-app/." "$REPO/"
  ( cd "$REPO" && git init -q -b main \
      && git -c user.email=e@e -c user.name=e add -A >/dev/null \
      && git -c user.email=e@e -c user.name=e commit -qm "chore: fixture" )
  "$ROOT/scripts/adopt/install.sh" "$REPO" >/dev/null 2>&1
  # install.sh preserves an existing vantry.yml; the fixture ships its own.
  [ -f "$D/setup.sh" ] && ( cd "$REPO" && bash "$D/setup.sh" ) >/dev/null 2>&1

  TRANSCRIPT="$WORK/$t.transcript"
  if [ "$HAVE_CLAUDE" = "1" ]; then
    ( cd "$REPO" && claude -p "$(cat "$D/prompt.md")" --output-format text ) \
      > "$TRANSCRIPT" 2>&1
  else
    : > "$TRANSCRIPT"
    echo "   (would run: claude -p \"\$(cat $D/prompt.md)\" in $REPO)"
    SKIP=$((SKIP + 1))
    continue
  fi

  if ( cd "$REPO" && REPO="$REPO" TRANSCRIPT="$TRANSCRIPT" bash "$D/assert.sh" ); then
    echo "   ✓ PASS"; PASS=$((PASS + 1))
  else
    echo "   ✗ FAIL"
    echo "   repo:       $REPO"
    echo "   transcript: $TRANSCRIPT"
    FAIL=$((FAIL + 1))
  fi
done

echo
echo "════════════════════════════════════════════════════════════"
printf " %d passed · %d failed · %d skipped\n" "$PASS" "$FAIL" "$SKIP"
echo "════════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] || { echo "artifacts kept in $WORK"; exit 1; }

# A suite that ran NOTHING must not exit 0. With no `claude` on PATH every task
# was skipped and this returned success — a behavioural eval reporting green
# without a single agent having run is the vacuous-pass shape this whole kit
# exists to refuse, sitting in the directory named after behaviour.
if [ "$SKIP" -gt 0 ] && [ "$PASS" -eq 0 ]; then
  echo
  echo "✗ NOT RUN — $SKIP task(s) skipped and nothing executed."
  echo "  This is not a pass. An agent CLI has to be on PATH for these to mean anything:"
  echo "    the evals drive a real agent against a fixture repo and assert what it did."
  echo "  Install one, then: bash evals/run.sh"
  echo "  (To acknowledge deliberately in a script: VANTRY_EVALS_MAY_SKIP=1)"
  [ "${VANTRY_EVALS_MAY_SKIP:-0}" = "1" ] || exit 2
fi
if [ "$SKIP" -gt 0 ]; then
  echo "⚠ $SKIP task(s) skipped — the result below covers only what actually ran."
fi
rm -rf "$WORK"
