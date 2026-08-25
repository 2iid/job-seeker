#!/usr/bin/env bash
# =============================================================================
#  check-refs.sh — no dangling paths in the instructions.
#
#  An agent that follows a playbook to a file that does not exist improvises,
#  and improvisation is what this kit exists to replace. The v1 audit found
#  /bootstrap and /write-adr pointing at five paths that were never shipped,
#  including an ADR template the skill told agents to copy.
#
#  Precision matters more than reach here: a checker that cries wolf on `0/N`
#  and `feat/` gets ignored, and an ignored checker is a checker that is not
#  run. So it only inspects tokens whose FIRST segment is a real top-level
#  entry of this repo — everything else is prose, a ratio, or a branch prefix.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 1
ERR=0
OUT="$(mktemp)"; trap 'rm -f "$OUT"' EXIT

# Real top-level entries. A token not rooted in one of these is not a repo path.
TOPS=" $(ls -A1 "$ROOT" | tr '\n' ' ') "

# Paths created at RUNTIME by /bootstrap, /adopt, /decompose-feature, verify.sh
# or the project itself. "Will be created" is not "broken".
is_runtime_path() {
  case "$1" in
    docs/planning/*|docs/architecture/*|docs/audit/*|docs/ops/*|docs/security/*|\
    docs/product/*|docs/growth/*|docs/specs/*|docs/design/*|docs/engineering/*|\
    docs/integrations/*|docs/README.md|\
    .vantry/*|.github/CODEOWNERS|\
    scripts/kanban/issues.csv|scripts/kanban/details/*|\
    *"<"*|*"{{"*|*"*"*|*"..."*|*"NNNN"*|*" "*) return 0 ;;
  esac
  return 1
}

echo "→ checking backticked paths in AGENTS.md, agents/, skills/, docs/_templates/"
while IFS= read -r f; do
  [ -f "$f" ] || continue
  grep -oE '`[A-Za-z0-9_.][A-Za-z0-9_./{}<>-]*`' "$f" 2>/dev/null | tr -d '`' | sort -u |
  while IFS= read -r p; do
    case "$p" in */*) : ;; *) continue ;; esac      # must look like a path
    root="${p%%/*}"
    case "$TOPS" in *" $root "*) : ;; *) continue ;; esac   # …rooted in this repo
    is_runtime_path "$p" && continue
    [ -e "$ROOT/$p" ] && continue
    echo "  ✗ $f → $p"
  done
done < <(
  echo AGENTS.md
  ls agents/*.md skills/*/SKILL.md skills/*.md docs/_templates/*.md 2>/dev/null
) > "$OUT" 2>&1

if grep -q '✗' "$OUT"; then
  cat "$OUT"
  echo "  Ship the file, fix the reference, or declare it in is_runtime_path()."
  ERR=1
else
  echo "  ✓ no dangling paths"
fi

echo "→ checking that every playbook named in a persona exists"
MISS=0
while IFS= read -r s; do
  [ -n "$s" ] || continue
  [ -d "skills/$s" ] || { echo "  ✗ a persona references the playbook '$s', which does not exist"; MISS=1; ERR=1; }
done < <(grep -h '^- \*\*[a-z]' agents/*.md 2>/dev/null \
         | sed 's/ — .*//' \
         | grep -oE '\*\*[a-z][a-z0-9-]+\*\*' | tr -d '*' | sort -u)
[ "$MISS" -eq 0 ] && echo "  ✓ every referenced playbook exists"

echo "→ checking that shipped docs carry no unfilled markers"
# *.template.md is SUPPOSED to contain them — that is what makes it a template.
# docs/audit/ quotes the templates verbatim as evidence — that is the report, not a gap.
# /bootstrap's Done-when cites this as proof that no {{VAR}} or <fill:> survived
# generation — so it has to scan what /bootstrap actually writes, not docs/ alone.
BAD="$(grep -rlE '<fill:|\{\{[A-Z_]+\}\}' CLAUDE.md AGENTS.md docs/ 2>/dev/null \
       | grep -v '\.template\.md$' | grep -v '^docs/_templates/' | grep -v '^docs/audit/' || true)"
if [ -n "$BAD" ]; then
  echo "  ✗ non-template docs still contain <fill:> markers:"; printf '%s\n' "$BAD" | sed 's/^/      /'; ERR=1
else
  echo "  ✓ no unfilled markers outside templates"
fi

echo "→ checking that every playbook is discoverable"
# AGENTS.md is the file this repo tells Codex, Cursor, Aider and Copilot to read
# as law, and they have no auto-invocation: a playbook not named there is a
# playbook those tools can never be told to run. The list drifted to 24 of 46
# because nothing checked it.
UNLISTED=""
for d in skills/*/; do
  n="$(basename "$d")"
  grep -q "\`$n\`" AGENTS.md 2>/dev/null || UNLISTED="$UNLISTED AGENTS.md:$n"
  grep -q "\`$n\`" skills/README.md 2>/dev/null || UNLISTED="$UNLISTED skills/README.md:$n"
done
if [ -n "$UNLISTED" ]; then
  echo "  ✗ playbooks missing from an index (a playbook nobody can name is a playbook nobody runs):"
  for u in $UNLISTED; do echo "      ${u%%:*} does not list ${u##*:}"; done
  ERR=1
else
  echo "  ✓ all $(ls -d skills/*/ | wc -l | tr -d ' ') playbooks are named in AGENTS.md and skills/README.md"
fi

echo "→ checking the house shape of every playbook"
# **Use when:** · ## Procedure · ## Guardrails|## Don't · ## Done when.
# `kickoff` is an alias that produces nothing; the exemption is stated in
# skills/README.md so it is a decision rather than a file that quietly differs.
SHAPE=""
for d in skills/*/; do
  n="$(basename "$d")"; f="$d/SKILL.md"
  [ "$n" = "kickoff" ] && continue
  [ -f "$f" ] || { SHAPE="$SHAPE $n:no-SKILL.md"; continue; }
  grep -q '^\*\*Use when:\*\*' "$f"                     || SHAPE="$SHAPE $n:no-Use-when"
  grep -q '^## Procedure' "$f"                           || SHAPE="$SHAPE $n:no-Procedure"
  grep -qE "^## (Guardrails|Don't|Guardrail)" "$f"       || SHAPE="$SHAPE $n:no-Guardrails"
  grep -q '^## Done when' "$f"                           || SHAPE="$SHAPE $n:no-Done-when"
done
if [ -n "$SHAPE" ]; then
  echo "  ✗ playbooks deviating from the house shape:"
  for x in $SHAPE; do echo "      ${x%%:*} — ${x##*:}"; done
  ERR=1
else
  echo "  ✓ every playbook carries Use-when, Procedure, Guardrails and Done-when"
fi

echo "→ checking that every Done-when names something checkable"
# "The change is verified" is prose; "scripts/verify.sh wrote a passing receipt"
# is a check. A Done-when nobody can compute is satisfied by whoever asserts it,
# which is the defect this whole kit exists to make impossible. The test is
# deliberately cheap: the section must name at least one backticked identifier
# (a command, a file, a field) — filler prose contains none.
PROSE=""
for d in skills/*/; do
  n="$(basename "$d")"; f="$d/SKILL.md"
  [ "$n" = "kickoff" ] && continue
  [ -f "$f" ] || continue
  dw="$(awk '/^## Done when/{f=1;next} /^## /{f=0} f' "$f")"
  printf '%s' "$dw" | grep -q '`' || PROSE="$PROSE $n"
done
if [ -n "$PROSE" ]; then
  echo "  ✗ Done-when sections that name no command, file or field:"
  for x in $PROSE; do echo "      $x"; done
  ERR=1
else
  echo "  ✓ every Done-when names a command, a file or a field"
fi

echo
[ "$ERR" -eq 0 ] && echo "✓ references are sound." || echo "✗ reference check FAILED."
exit "$ERR"
