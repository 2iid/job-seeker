#!/usr/bin/env bash
# =============================================================================
#  SessionStart(startup|resume|clear|compact) — orient every session.
#
#  Runs after compaction too, which is the point: the moment a long session
#  loses its context is exactly the moment an agent starts describing work it
#  can no longer see. This puts the gate's real state back in front of it,
#  read from the repo rather than from memory.
#
#  stdout is added to the session context. Keep it short — it is paid for on
#  every single session.
# =============================================================================
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}")"
[ -f "$ROOT/vantry.yml" ] || exit 0
# shellcheck source=../../scripts/lib/vantry-common.sh
. "$ROOT/scripts/lib/vantry-common.sh" 2>/dev/null || exit 0
cd "$ROOT" || exit 0

n="$(vantry_changed_files | grep -c . || true)"
R=".vantry/receipts/$(vantry_slug).verify.json"

echo "## Vantry state (read from the repo, not from memory)"
echo "- branch \`$(vantry_slug)\` · strictness \`$(vantry_cfg strictness standard)\` · gate \`$(vantry_cfg gates.verify_change block)\` · merge by \`$(vantry_cfg merge.authority human)\`"
echo "- ${n:-0} non-trivial file(s) changed vs \`$(vantry_base_ref)\`"

if [ -f "$R" ]; then
  if [ "$(vantry_receipt_field "$R" tree_digest)" = "$(vantry_tree_digest)" ]; then
    echo "- verification: **$(vantry_receipt_field "$R" verdict)**, current for this code"
    o="$(vantry_receipt_field "$R" observation.observed)"
    [ -n "$o" ] && echo "  - observed: $o"
  else
    echo "- verification: **STALE** — the code changed after the last run. Re-run \`scripts/verify.sh\`."
  fi
elif [ "${n:-0}" -gt 0 ]; then
  echo "- verification: **none for this branch**. \`scripts/verify.sh\` before you call anything done."
fi

# An autonomous run that died leaves merge.authority: agent behind, and nothing
# would have said so. Autonomy must not outlive the run that was granted it.
if [ -f ".vantry/autopilot.json" ]; then
  echo "- ⚠ **AUTOPILOT IS ACTIVE** — granted $(vantry_json_get "$(cat .vantry/autopilot.json)" granted_at) by $(vantry_json_get "$(cat .vantry/autopilot.json)" granted_by)."
  echo "  Agents may merge. If no run is in progress this is leftover state: finish"
  echo "  \`/autopilot\` step 5, or restore merge.authority and delete .vantry/autopilot.json."
fi

[ -f ".vantry/overrides/$(vantry_slug).json" ] && \
  echo "- ⚠ an OVERRIDE is active on this branch: $(vantry_json_get "$(cat ".vantry/overrides/$(vantry_slug).json")" reason)"

# The last retro, put in front of the next session. sprint-review has written
# these all along and nothing ever read one back — a feedback loop with no edge.
if [ -f "docs/planning/sprint-log.md" ]; then
  echo
  echo "## Last retro (docs/planning/sprint-log.md)"
  tail -12 docs/planning/sprint-log.md
fi

if [ -f "docs/planning/PROJECT-STATE.md" ]; then
  echo
  echo "## Where the work stands"
  sed -n '1,25p' docs/planning/PROJECT-STATE.md
fi

echo
echo "Reminder: a change is done when \`scripts/verify.sh\` has written a passing"
echo "receipt for the code as it is now. Green tests are not a verification."
exit 0
