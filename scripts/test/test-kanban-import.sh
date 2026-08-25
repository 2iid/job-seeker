#!/usr/bin/env bash
# ============================================================================
#  test-kanban-import.sh — the two blocking greenfield defects, as regressions.
#
#  Both were fixed in a commit titled "every item, with a test behind it", and
#  neither had one. They are correct today and unprotected tomorrow — which is
#  exactly the state this file exists to end.
#
#    1. The Sprint field was assigned from a 10-field read of a 13-column CSV,
#       so `sprint` absorbed the rest of the line and every card got a value
#       like "S1,app/**,REQ-4,no" — matching no field option, silently.
#    2. The importer never inlined scripts/kanban/details/<id>.md, so every
#       issue carried identical boilerplate and the decomposition was discarded.
# ============================================================================
set -uo pipefail
KIT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
KIT="$(cd "$KIT" && pwd)"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ✗ $1"; [ -n "${2:-}" ] && echo "$2" | sed 's/^/        /' | head -10; FAIL=$((FAIL + 1)); }

echo "── every emitted sprint token is a real field option ──"
# REPO is explicit on purpose: without it the importer calls `gh repo view` to
# autodetect, which fails on any machine without gh auth — CI, a fresh clone, a
# contributor's laptop. The test then exercised nothing and still said ✓ (the
# token list was empty, and "every value matches" is vacuously true of none).
# A test that only passes where its author happens to be logged in is not a test.
OUT="$( cd "$KIT" && DRY_RUN=1 REPO=vantry-test/offline ./scripts/kanban/import-kanban.sh 2>&1 )"
TOK="$(printf '%s' "$OUT" | grep -oE 'sprint:[^ ]*' | sed 's/^sprint://' | sort -u)"
if [ -z "$TOK" ]; then
  bad "no sprint tokens emitted at all — the importer never reached the label phase" "$OUT"
else
  ok "the importer reached the label phase offline (no gh auth required)"
fi
BADTOK=""
for t in $TOK; do
  case "$t" in
    S[0-9]|S[0-9][0-9]|Backlog) : ;;
    *) BADTOK="$BADTOK $t" ;;
  esac
done
if [ -z "$TOK" ]; then
  bad "no sprint values to check — 'every value matches' would be vacuously true of none" "$OUT"
elif [ -z "$BADTOK" ]; then
  ok "every sprint value matches ^S[0-9]+$|^Backlog$ ($TOK)"
else
  bad "sprint values that match no field option:$BADTOK" "$OUT"
fi

echo
echo "── a legacy 10-column CSV still imports, and reads paths as empty ──"
L="$W/legacy.csv"
printf 'id,title,epic,area,agent,priority,size,deps,status,sprint\n' > "$L"
printf 'PRJ-001,A thing,E0,backend,backend-engineer,P0,M,,todo,S1\n' >> "$L"
OUT="$( cd "$KIT" && CSV="$L" DRY_RUN=1 REPO=vantry-test/offline ./scripts/kanban/import-kanban.sh 2>&1 )"
case "$OUT" in
  *"do not match the header"*) bad "a legacy 10-column file is now rejected" "$OUT" ;;
  *) ok "a pre-schema backlog still imports (arity comes from its own header)" ;;
esac

echo
echo "── the issue body carries the REAL acceptance criteria ──"
BODY="$W/body.sh"
python3 - "$KIT/scripts/kanban/import-kanban.sh" "$BODY" <<'PY'
import sys, pathlib
src = pathlib.Path(sys.argv[1]).read_text()
start = src.index('    detail_file=')
end   = src.index('    if [ "$DRY_RUN" = "1" ]; then\n      echo "  DRY issue')
pathlib.Path(sys.argv[2]).write_text(
    'set -u\n'
    'id="$1"; title=t; epic=E; area=a; agent=backend-engineer; priority=P0; size=S\n'
    'deps=; st=todo; sprint=S1; paths="lib/**"; req="REQ-004"; security="$2"\n'
    'deps_line="none"; missing_detail=0\n'
    + src[start:end] + '\nprintf "%s\\n" "$body"\n')
PY
WITH="$( cd "$KIT/scripts/kanban" && bash "$BODY" PRJ-002 yes 2>&1 )"
case "$WITH" in
  *Given*) ok "an id WITH a details file gets its real Given/When/Then" ;;
  *) bad "the criteria were not inlined" "$WITH" ;;
esac
case "$WITH" in *"REQ-004"*) ok "and the requirement it satisfies" ;; *) bad "no Satisfies line" "$WITH" ;; esac
case "$WITH" in *"lib/**"*) ok "and the paths it touches" ;; *) bad "no Touches line" "$WITH" ;; esac
case "$WITH" in *"security.json"*) ok "and the security-review requirement when flagged" ;; *) bad "no security line" "$WITH" ;; esac

WITHOUT="$( cd "$KIT/scripts/kanban" && bash "$BODY" PRJ-999 no 2>&1 )"
case "$WITHOUT" in
  *"No per-issue detail found"*) ok "a MISSING details file is a loud warning, not a silent placeholder" ;;
  *) bad "a missing details file is silent" "$WITHOUT" ;;
esac
case "$WITHOUT" in *"security.json"*) bad "the security line appears when not flagged" "$WITHOUT" ;; *) ok "and the security line stays off when not flagged" ;; esac

echo
echo "══════════════════════════════════════════════"
echo " T10 — the board must not silently lag the backlog"
echo "══════════════════════════════════════════════"
# Reported from real use: /refine-backlog took a sprint from 11 stories to 20 and
# the board still showed 11. Setting a Sprint field only moves an issue that
# already EXISTS; a row just written has no issue behind it. Everything
# downstream then reads the old number — /next cannot hand out an issue that does
# not exist, standup counts 11, sprint-review closes on a scope nobody agreed.
DP="$W/drift"; mkdir -p "$DP/scripts/kanban" "$DP/scripts/lib" "$DP/fakebin"
cp "$KIT/scripts/kanban/import-kanban.sh" "$KIT/scripts/kanban/lint-kanban.sh" "$DP/scripts/kanban/"
cp "$KIT"/scripts/lib/*.sh "$DP/scripts/lib/"
head -1 "$KIT/scripts/kanban/issues.csv" > "$DP/scripts/kanban/issues.csv"
cat >> "$DP/scripts/kanban/issues.csv" <<'CSV10'
PRJ-001,Publish slots,EPIC 1,backend,backend-engineer,P0,M,,todo,S1,src/slots/**,,no
PRJ-002,Book a slot,EPIC 1,backend,backend-engineer,P0,M,,todo,S1,src/booking/**,,no
CSV10

# a gh that knows about PRJ-001 only — the board is one issue behind
cat > "$DP/fakebin/gh" <<'FAKEGH'
#!/usr/bin/env bash
case "$*" in
  *"repo view"*)  echo "acme/demo" ;;
  *"issue list"*) echo "PRJ-001 Publish slots" ;;
  *)              exit 0 ;;
esac
FAKEGH
chmod +x "$DP/fakebin/gh"

OUT10="$( cd "$DP" && PATH="$DP/fakebin:$PATH" REPO=acme/demo bash scripts/kanban/import-kanban.sh --check 2>&1 )"
RC10=$( cd "$DP" && PATH="$DP/fakebin:$PATH" REPO=acme/demo bash scripts/kanban/import-kanban.sh --check >/dev/null 2>&1; echo $? )
case "$OUT10" in
  *"MISSING: 1"*) ok "--check counts the rows that have no issue behind them" ;;
  *) bad "the drift was not counted" "$OUT10" ;;
esac
case "$OUT10" in
  *PRJ-002*) ok "…and names which one" ;;
  *) bad "did not name the missing row" "$OUT10" ;;
esac
case "$OUT10" in
  *"import-kanban.sh --project"*) ok "…and says how to fix it" ;;
  *) bad "no remedy given" "$OUT10" ;;
esac
[ "$RC10" = "1" ] && ok "and it exits non-zero, so a Done-when can depend on it" \
  || bad "drift reported but exit 0 — nothing could gate on it" "rc=$RC10"

# once the board catches up, it must go quiet
cat > "$DP/fakebin/gh" <<'FAKEGH2'
#!/usr/bin/env bash
case "$*" in
  *"repo view"*)  echo "acme/demo" ;;
  *"issue list"*) printf 'PRJ-001 Publish slots\nPRJ-002 Book a slot\n' ;;
  *)              exit 0 ;;
esac
FAKEGH2
chmod +x "$DP/fakebin/gh"
( cd "$DP" && PATH="$DP/fakebin:$PATH" REPO=acme/demo bash scripts/kanban/import-kanban.sh --check ) >/dev/null 2>&1 \
  && ok "a board that matches the backlog reports clean" \
  || bad "false drift on a board that is in sync" "$( cd "$DP" && PATH="$DP/fakebin:$PATH" REPO=acme/demo bash scripts/kanban/import-kanban.sh --check 2>&1 )"

# and with no gh at all it must say it cannot tell, never "clean"
OUT10C="$( cd "$DP" && PATH=/usr/bin:/bin bash scripts/kanban/import-kanban.sh --check 2>&1 )"
# The script's own gh precheck fires first and says "gh not found" — which is the
# honest answer. What must never happen is a clean report from a check that could
# not look, so assert on THAT rather than on one exact wording.
case "$OUT10C" in
  *"cannot compare"*|*"gh not found"*|*"gh is not"*)
    ok "with no gh it says so, rather than reporting the board clean" ;;
  *"every backlog row exists"*)
    bad "reported the board in sync from a check that could not run" "$OUT10C" ;;
  *) ok "with no gh it does not claim the board is in sync" ;;
esac

echo
echo "══════════════════════════════════════════════"
printf " RESULT: %d passed, %d failed\n" "$PASS" "$FAIL"
echo "══════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] || exit 1
