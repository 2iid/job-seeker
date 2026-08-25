#!/usr/bin/env bash
# =============================================================================
#  lint-kanban.sh — refuse a backlog that cannot be worked.
#
#  import-kanban.sh talks to the network. Every defect this catches would
#  otherwise be found after issues exist on GitHub, when fixing it means editing
#  or deleting real issues. So this runs BEFORE the first API call — and from
#  run-all.sh --unit, but deliberately NOT from .githooks/pre-commit: a guard
#  that blocks a commit in the middle of grooming gets uninstalled.
#
#  Usage: scripts/kanban/lint-kanban.sh [csv]   (default scripts/kanban/issues.csv)
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CSV="${1:-$ROOT/scripts/kanban/issues.csv}"
ERR=0
err() { echo "  ✗ $1"; ERR=1; }

[ -f "$CSV" ] || { echo "✗ no backlog at $CSV"; exit 1; }
echo "→ linting $CSV"

HEADER="$(head -1 "$CSV")"
NCOL="$(printf '%s' "$HEADER" | awk -F, '{print NF}')"
ROWS="$(($(wc -l < "$CSV") - 1))"

# ---- 1. arity, derived from the header -------------------------------------
# A comma inside a title shifts every later column, which silently mis-files the
# sprint. The count comes from the header so the schema can grow.
BAD="$(awk -F, -v n="$NCOL" 'NR>1 && NF>0 && NF!=n {printf "    line %d has %d columns, header has %d: %s\n", NR, NF, n, $1}' "$CSV")"
[ -n "$BAD" ] && { err "rows do not match the header's $NCOL columns (a comma inside a title is the usual cause):"; printf '%s\n' "$BAD"; }

# ---- 2. ids are present, well-formed and unique ----------------------------
DUP="$(awk -F, 'NR>1 && NF>0 {print $1}' "$CSV" | sort | uniq -d)"
[ -n "$DUP" ] && err "duplicate issue id(s): $(printf '%s' "$DUP" | tr '\n' ' ')"
MAL="$(awk -F, 'NR>1 && NF>0 && $1 !~ /^[A-Z][A-Z0-9]{1,5}-[0-9]{1,4}$/ {printf "%s ", $1}' "$CSV")"
[ -n "$MAL" ] && err "malformed id(s) (expected e.g. PRJ-014): $MAL"

# ---- 3. every dependency exists --------------------------------------------
# awk, not a shell loop: a `while read` inside $( ) runs in a subshell, so ERR
# set inside it never reaches the caller — the check would print nothing and
# pass. Exactly the class of silently-discarded finding this kit exists to stop.
DEPBAD="$(awk -F, '
  NR>1 && NF>0 { have[$1]=1; id[++n]=$1; deps[$1]=$8 }
  END {
    for (i=1;i<=n;i++) {
      k=id[i]; m=split(deps[k], d, /[; ]+/)
      for (j=1;j<=m;j++)
        if (d[j] != "" && !(d[j] in have))
          printf "    %s depends on %s, which is not in this backlog\n", k, d[j]
    }
  }' "$CSV")"
[ -n "$DEPBAD" ] && { err "unresolvable dependencies:"; printf '%s\n' "$DEPBAD"; }

# ---- 4. no dependency cycles -----------------------------------------------
# Kahn's algorithm: repeatedly remove nodes with no unmet dependency. Whatever
# is left is, by definition, in a cycle — and a cycle means /next can never
# schedule any of them, forever, with no error to explain why.
CYC="$(awk -F, '
  NR>1 && NF>0 { id[++n]=$1; deps[$1]=$8 }
  END {
    for (i=1;i<=n;i++) alive[id[i]]=1
    changed=1
    while (changed) {
      changed=0
      for (i=1;i<=n;i++) {
        k=id[i]; if (!alive[k]) continue
        ready=1
        m=split(deps[k], d, /[; ]/)
        for (j=1;j<=m;j++) if (d[j] != "" && alive[d[j]]) ready=0
        if (ready) { alive[k]=0; changed=1 }
      }
    }
    for (i=1;i<=n;i++) if (alive[id[i]]) printf "%s ", id[i]
  }' "$CSV")"
[ -n "$CYC" ] && err "dependency cycle — these can never be scheduled: $CYC"

# ---- 5. controlled vocabularies --------------------------------------------
check_col() {  # $1 = column index, $2 = column name, $3 = allowed values
  local bad
  bad="$(awk -F, -v c="$1" -v ok=" $3 " '
    NR>1 && NF>0 && $c != "" && index(ok, " " $c " ") == 0 { seen[$c]=1 }
    END { for (v in seen) printf "%s ", v }' "$CSV")"
  [ -n "$bad" ] && err "$2: unexpected value(s): $bad  (allowed: $3)"
}
check_col 6 priority "P0 P1 P2 P3"
check_col 7 size     "XS S M L XL"
# `backlog` is what /bootstrap, /decompose-feature and the kanban README all
# tell you to write for an unscheduled item. It was rejected here, so the
# prescribed backlog failed its own linter.
check_col 9 status   "backlog todo in-progress in-review blocked blocked-gate awaiting-merge done"

# ---- 6. the agent must exist ------------------------------------------------
AGBAD=""
for a in $(awk -F, 'NR>1 && NF>0 && $5 != "" {print $5}' "$CSV" | sort -u); do
  [ -f "$ROOT/agents/$a.md" ] || AGBAD="$AGBAD $a"
done
[ -n "$AGBAD" ] && err "assigned to persona(s) that do not exist in agents/:$AGBAD"
# The agent column was checked only when it was non-empty, so a blank one passed
# — and /next has no defined behaviour for an issue with no lead role.
NOAG="$(awk -F, 'NR>1 && NF>0 && $5 == "" {printf "%s ", $1}' "$CSV")"
[ -n "$NOAG" ] && err "issue(s) with no lead agent — /next cannot dispatch them: $NOAG"

# ---- 7. MUST coverage, when a spec exists ----------------------------------
# The one line that changes a decision: "your MVP has 11 MUST and 7 have no issue."
SPEC="$ROOT/docs/specs/functional-spec.md"
if [ -f "$SPEC" ] && [ "$NCOL" -ge 12 ]; then
  MISSING=""; TOTAL=0
  while IFS= read -r r; do
    [ -n "$r" ] || continue
    TOTAL=$((TOTAL + 1))
    # Whole-field match. `grep -q REQ-1` also matches REQ-10, so a requirement
    # with no issue was reported as covered by an unrelated one — the
    # traceability claim lying in exactly the direction that hides work.
    awk -F, -v r="$r" 'NR>1 && $12 != "" { n = split($12, a, /[; ]+/); for (i = 1; i <= n; i++) if (a[i] == r) f = 1 } END { exit !f }' "$CSV" \
      || MISSING="$MISSING $r"
  done <<EOF
$(grep -oE 'REQ-[0-9]{1,4}' "$SPEC" | sort -u)
EOF
  if [ -n "$MISSING" ]; then
    err "these MUST requirements have no issue in the backlog:$MISSING"
    echo "    ($TOTAL requirement(s) in $SPEC. An unplanned MUST is a missing MVP, not a missing ticket.)"
  elif [ "$TOTAL" -gt 0 ]; then
    echo "  ✓ all $TOTAL requirement(s) in the spec are covered by at least one issue"
  fi
fi

echo "  $ROWS row(s), $NCOL column(s)"
echo

# ---- security: yes  vs  vantry.yml sensitive_paths --------------------------
# Two independent declarations of the same property, and nothing reconciled them.
# `security: yes` drives the issue's Definition-of-Done line; `sensitive_paths`
# drives the CI job that actually blocks the merge. They drift both ways: a
# decorative promise, or a PR blocked with no warning.
if [ -f "$ROOT/vantry.yml" ] && [ -f "$ROOT/scripts/lib/vantry-common.sh" ]; then
  # shellcheck source=../lib/vantry-common.sh
  . "$ROOT/scripts/lib/vantry-common.sh" 2>/dev/null || true
  if type vantry_is_sensitive >/dev/null 2>&1; then
    _mismatch=""
    while IFS= read -r _row; do
      [ -n "$_row" ] || continue
      _id="$(printf '%s' "$_row"  | awk -F, '{print $1}')"
      _pth="$(printf '%s' "$_row" | awk -F, '{print $11}')"
      _sec="$(printf '%s' "$_row" | awk -F, '{print $13}' | tr -d '[:space:]')"
      [ -n "$_pth" ] || continue
      _hit=0; _real=0
      _old="$IFS"; IFS=';'
      for _g in $_pth; do
        # Only judge rows that describe THIS project. The shipped sample backlog
        # names a hypothetical app (lib/env.*, migrations/**); warning about it in
        # a repo that has no lib/ is noise, and noise is how a real warning gets
        # ignored. If the glob's first segment does not exist here, skip the row.
        _root="$(printf '%s' "$_g" | sed -e 's#/.*##' -e 's#\*.*##')"
        [ -n "$_root" ] && [ -e "$ROOT/$_root" ] && _real=1
        _probe="$(printf '%s' "$_g" | sed -e 's#\*\*#x#g' -e 's#\*#x#g')"
        vantry_is_sensitive "$_probe" && _hit=1
      done
      IFS="$_old"
      [ "$_real" -eq 1 ] || continue
      if [ "$_sec" = "yes" ] && [ "$_hit" -eq 0 ]; then
        _mismatch="$_mismatch\n      $_id: security=yes but its paths match no sensitive_paths glob — the DoD promises a review CI will never require"
      elif [ "$_sec" = "no" ] && [ "$_hit" -eq 1 ]; then
        _mismatch="$_mismatch\n      $_id: security=no but its paths ARE sensitive — CI will block the PR with no warning"
      fi
    done <<EOF
$(tail -n +2 "$CSV" | grep -v '^[[:space:]]*$')
EOF
    if [ -n "$_mismatch" ]; then
      # shellcheck disable=SC2059
      printf "  ⚠ security flag vs vantry.yml sensitive_paths:$_mismatch\n"
    else
      echo "  ✓ every issue's security flag agrees with vantry.yml sensitive_paths"
    fi
  fi
fi

[ "$ERR" -eq 0 ] && echo "✓ backlog is workable." || echo "✗ backlog has problems (above) — fix them before importing."
exit "$ERR"
