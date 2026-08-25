#!/usr/bin/env bash
# =============================================================================
#  Stop / SubagentStop — the agent cannot end its turn on an unverified change.
#
#  This is the earliest and friendliest of the three gates. It is NOT the
#  guarantee (that is .githooks/pre-push, which every tool hits). It exists so
#  the agent is told at the moment it matters, while it still has the context
#  to act, instead of discovering it at push time.
#
#  Contract: exit 2 + a message on stderr prevents the stop and feeds the
#  message back to the model. Exit 0 lets it finish.
#
#  Two hard rules, both learned from how gates die in the wild:
#    - Never trap a session. Two blocks, then escalate to the human.
#    - Never block on confusion. Any parsing doubt exits 0; git still guards.
# =============================================================================
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}")"
[ -f "$ROOT/vantry.yml" ]         || exit 0     # not a Vantry project
[ -x "$ROOT/scripts/verify.sh" ]  || exit 0
[ "${VANTRY_SKIP_GATE:-0}" = "1" ] && exit 0

payload="$(cat 2>/dev/null || true)"

# The harness sets stop_hook_active when it is already re-running because of us.
case "$payload" in
  *'"stop_hook_active": true'*|*'"stop_hook_active":true'*) exit 0 ;;
esac

# Who actually declares a change done?
#
# The MAIN thread does — it is what reports back to the human. A subagent
# handing work back to its orchestrator has not claimed anything is finished,
# and blocking there means every agent in a fan-out runs the whole suite before
# it can return. That is the "so heavy it gets disabled by Friday" failure, so
# a subagent is TOLD and lets go; the orchestrator is the one that gets stopped.
#
# Set gates.subagent_verify: block when each subagent owns an isolated worktree
# and really is the last word on its own change.
case "$payload" in
  *'"hook_event_name"'*'SubagentStop'*)
    # Same defect as pre-commit had: `subagent_verify: block  # why` became
    # "block#why" and never matched. Strip the comment before the whitespace.
    SUB="$(sed -n 's/^[[:space:]]*subagent_verify:[[:space:]]*//p' "$ROOT/vantry.yml" 2>/dev/null | head -1 | sed 's/[[:space:]]*#.*$//' | tr -d '[:space:]')"
    if [ "$SUB" != "block" ]; then
      out="$("$ROOT/scripts/verify.sh" --gate --stop 2>&1)"
      [ $? -ge 2 ] && {
        printf '%s\n' "$out" >&2
        echo "  (subagent: reporting, not blocking — the orchestrator owns the gate.)" >&2
      }
      exit 0
    fi ;;
esac

ATT="$ROOT/.vantry/state/gate-attempts"
mkdir -p "$(dirname "$ATT")" 2>/dev/null
n="$(cat "$ATT" 2>/dev/null || echo 0)"
case "$n" in ''|*[!0-9]*) n=0 ;; esac

out="$("$ROOT/scripts/verify.sh" --gate --stop 2>&1)"
rc=$?

case "$rc" in
  0) : > "$ATT" 2>/dev/null; exit 0 ;;
  1) printf '%s\n' "$out" >&2; : > "$ATT" 2>/dev/null; exit 0 ;;   # relaxed: loud, not blocking
esac

n=$((n + 1))
printf '%s' "$n" > "$ATT" 2>/dev/null

if [ "$n" -gt 2 ]; then
  : > "$ATT" 2>/dev/null
  cat >&2 <<'MSG'
⚠ The verification gate has blocked twice and the change is still unverified.
  Escalating to the human rather than looping: STOP, and tell them plainly
  that the change is UNVERIFIED and why you could not run it.
MSG
  exit 0
fi

printf '%s\n' "$out" >&2
exit 2
