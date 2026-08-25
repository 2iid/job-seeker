#!/usr/bin/env bash
# =============================================================================
#  check-protection.sh — is the CI gate BLOCKING, or merely informative?
#
#  This is the question the rest of the kit cannot answer about itself. Every
#  local hook, every receipt, every review verdict is bypassable by one direct
#  push to an unprotected trunk. A red check that nobody is required to satisfy
#  is a notification, not a gate — and an audit of this very repository found ten
#  red runs sitting on `main`.
#
#  It reports; it does not enforce. Enabling protection is the repository
#  owner's decision, and `--fix` prints the exact command rather than running it.
#
#    scripts/check-protection.sh          # report
#    scripts/check-protection.sh --fix    # print the command that would close it
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 1
# shellcheck source=lib/vantry-common.sh
. "$ROOT/scripts/lib/vantry-common.sh" 2>/dev/null || true

BASE="$(vantry_base_ref 2>/dev/null || echo main)"

command -v gh >/dev/null 2>&1 || {
  echo "  · gh is not installed — cannot tell whether '$BASE' is protected."
  echo "    That is not the same as 'it is protected'. Check it by hand."
  exit 0; }

SLUG="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)"
[ -n "$SLUG" ] || { echo "  · no GitHub remote — branch protection does not apply here."; exit 0; }

# Judge gh's EXIT CODE, not whether it printed something. On a 404 gh writes the
# error body to stdout, so testing for a non-empty string reported "protected"
# for an unprotected branch — this check's first draft did exactly that, which is
# the defect class this kit exists to catch, produced while writing the catcher.
if PROT="$(gh api "repos/$SLUG/branches/$BASE/protection" 2>/dev/null)"; then :; else PROT=""; fi
RULES="$(gh api "repos/$SLUG/rulesets" --jq '[.[] | select(.enforcement=="active")] | length' 2>/dev/null || echo 0)"

if [ -z "$PROT" ] && [ "${RULES:-0}" -eq 0 ]; then
  cat <<MSG
  ⚠ '$BASE' in $SLUG is NOT protected, and no active ruleset covers it.

    Every check this kit runs — the receipt, the security review, the evidence
    block, CI itself — can be skipped by pushing straight to '$BASE'. The local
    hooks stop an agent; they do not stop a force-push, and they are not what a
    reviewer relies on.

    Until this is on, describe the CI results as informative, not blocking.
MSG
  [ "${1:-}" = "--fix" ] && cat <<FIX

    To close it (run this yourself — it changes how you push, so it is your call):

      gh api -X PUT "repos/$SLUG/branches/$BASE/protection" \\
        -H "Accept: application/vnd.github+json" \\
        -F "required_status_checks[strict]=true" \\
        -F "required_status_checks[contexts][]=contract is valid" \\
        -F "required_status_checks[contexts][]=re-run the verification" \\
        -F "required_status_checks[contexts][]=PR states its evidence" \\
        -F "required_status_checks[contexts][]=sensitive paths need a security review" \\
        -F "enforce_admins=true" \\
        -F "required_pull_request_reviews[required_approving_review_count]=0" \\
        -F "restrictions="

    Protect the TAGS too — a tag can publish a commit that never saw a PR:

      gh api -X POST "repos/$SLUG/rulesets" --input - <<'RULESET'
      { "name": "protect release tags", "target": "tag", "enforcement": "active",
        "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
        "rules": [ { "type": "deletion" }, { "type": "non_fast_forward" } ] }
      RULESET
FIX
  exit 1
fi

if [ -n "$PROT" ]; then
  echo "  ✓ '$BASE' is protected."
  printf '%s' "$PROT" | grep -o '"contexts":\[[^]]*\]' | head -1 | sed 's/^/    required checks: /'
  printf '%s' "$PROT" | grep -q '"enforce_admins":{"[^}]*"enabled":true' \
    && echo "    admins are included (good — an exception for admins is an exception for everyone who matters)" \
    || echo "    ⚠ enforce_admins is OFF — the people most able to bypass it are exempt"
else
  echo "  ✓ an active ruleset covers this repository ($RULES rule set(s))."
  echo "    Confirm it names '$BASE' and requires this kit's checks."
fi
exit 0
