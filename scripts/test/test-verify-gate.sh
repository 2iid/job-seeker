#!/usr/bin/env bash
# ============================================================================
#  test-verify-gate.sh — proves the verification gate actually gates.
#
#  Every assertion runs against a REAL scratch git repo with a REAL (tiny) app
#  that really starts, really serves, and really fails when broken. Nothing is
#  mocked, because the defect this whole layer exists to prevent is precisely
#  "it reported success without running anything".
#
#  Usage: bash scripts/test/test-verify-gate.sh [kit-path]
# ============================================================================
set -uo pipefail
KIT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
KIT="$(cd "$KIT" && pwd)"
WORK="$(mktemp -d)"
PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ✗ $1"; [ -n "${2:-}" ] && echo "$2" | sed 's/^/        /' | head -12; FAIL=$((FAIL + 1)); }
hdr() { echo; echo "── $1 ──────────────────────────────────────────────────"; }

# --------------------------------------------------------------- the fixture
make_project() {  # $1 = dir
  local P="$1"
  mkdir -p "$P/src" "$P/tests" "$P/scripts/lib" "$P/docs"
  cp "$KIT/scripts/verify.sh"            "$P/scripts/verify.sh"
  cp "$KIT/scripts/lib/vantry-common.sh" "$P/scripts/lib/vantry-common.sh"
  chmod +x "$P/scripts/verify.sh"

  # the "app": a status string one file computes and another serves
  echo 'IN_TRANSIT' > "$P/src/status.txt"

  cat > "$P/server.sh" <<'S'
#!/usr/bin/env bash
rm -f .ready
echo "boot: starting"
sleep 0.2
cp src/status.txt .served
touch .ready
echo "boot: listening"
while true; do sleep 1; done
S

  cat > "$P/tests/unit.sh" <<'S'
#!/usr/bin/env bash
[ -f src/status.txt ] || { echo "no status"; exit 1; }
echo "1 test passed"
S

  # the smoke run exercises the RUNNING app, not the source
  cat > "$P/smoke.sh" <<'S'
#!/usr/bin/env bash
[ -f .served ] || { echo "smoke: the app never served anything"; exit 1; }
grep -q 'IN_TRANSIT' .served || { echo "smoke: served '$(cat .served)', expected IN_TRANSIT"; exit 1; }
echo "smoke: 1 flow passed"
S
  chmod +x "$P/server.sh" "$P/tests/unit.sh" "$P/smoke.sh"

  cat > "$P/vantry.yml" <<'Y'
version: 2
project_type: service
strictness: standard

run:
  test: bash tests/unit.sh
  build: true
  start: bash server.sh
  ready: test -f .ready
  smoke: bash smoke.sh
  logs: .vantry/state/app.log

gates:
  verify_change: block

merge:
  base: main

trivial_paths:
  - "*.md"
  - "docs/**"

sensitive_paths:
  - "src/auth/**"
Y

  cat > "$P/.gitignore" <<'G'
.vantry/receipts/
.vantry/state/
.vantry/artifacts/
.ready
.served
G

  git -C "$P" init -q -b main
  git -C "$P" add -A >/dev/null
  git -C "$P" -c user.email=t@t -c user.name=t commit -qm "init"
}

V() { ( cd "$1" && shift && ./scripts/verify.sh "$@" ) 2>&1; }
gate() { ( cd "$1" && ./scripts/verify.sh --gate --stop ) >/dev/null 2>&1; echo $?; }

# ============================================================================
hdr "T1 · a clean tree owes nothing"
P="$WORK/t1"; make_project "$P"
[ "$(gate "$P")" = "0" ] && ok "gate passes on an unchanged tree" || bad "gate fired with nothing changed" "$(V "$P" --gate --stop)"

hdr "T2 · an unverified source change is BLOCKED"
echo '// new behaviour' > "$P/src/extra.ts"     # a real change that does NOT break the app
RC="$(gate "$P")"
[ "$RC" = "2" ] && ok "gate BLOCKS (exit 2) after an unverified edit" || bad "gate did not block" "rc=$RC"
OUT="$(V "$P" --gate --stop)"
case "$OUT" in *"BLOCKED BY VANTRY"*) ok "the block names itself" ;; *) bad "no BLOCKED banner" "$OUT" ;; esac
case "$OUT" in *"no verification receipt"*) ok "it says WHY (no receipt)" ;; *) bad "no reason given" "$OUT" ;; esac
[ ! -f "$P/.vantry/receipts/main.verify.json" ] && ok "no receipt appeared without a run" || bad "a receipt materialised" "$(cat "$P"/.vantry/receipts/*.json)"

hdr "T3 · a real run produces a real receipt"
OUT="$(V "$P")"; RC=$?
[ "$RC" = "0" ] && ok "verify.sh exits 0 on a healthy app" || bad "verify.sh failed" "$OUT"
R="$P/.vantry/receipts/main.verify.json"
[ -f "$R" ] && ok "receipt written" || bad "no receipt" "$OUT"
grep -q '"verdict": "pass"' "$R" && ok "verdict:pass" || bad "wrong verdict" "$(cat "$R")"
grep -q '"phase":"smoke"' "$R" && ok "the smoke step is recorded with its exit code" || bad "no smoke step" "$(cat "$R")"
grep -q '"phase":"ready"' "$R" && ok "readiness was actually polled" || bad "no ready step" "$(cat "$R")"
case "$OUT" in *"smoke: 1 flow passed"*|*"[smoke]"*) ok "the smoke command really ran" ;; *) bad "smoke never ran" "$OUT" ;; esac
[ "$(gate "$P")" = "0" ] && ok "gate now passes" || bad "gate still blocks after a pass" "$(V "$P" --gate --stop)"

hdr "T4 · one more edit and the receipt is STALE"
echo '// edited again' >> "$P/src/extra.ts"
RC="$(gate "$P")"
[ "$RC" = "2" ] && ok "gate re-BLOCKS after a post-verification edit" || bad "stale receipt accepted" "rc=$RC"
case "$(V "$P" --gate --stop)" in *"stale receipt"*) ok "it says WHY (stale)" ;; *) bad "no staleness reason" "$(V "$P" --gate --stop)" ;; esac

hdr "T5 · a trivial-only change owes nothing"
rm -f "$P/src/extra.ts"
echo "# notes" > "$P/docs/notes.md"; echo "more" >> "$P/README.md" 2>/dev/null || echo "more" > "$P/README.md"
[ "$(gate "$P")" = "0" ] && ok "docs + markdown edits do not trigger the gate" || bad "gate fired on docs only" "$(V "$P" --gate --stop)"
rm -f "$P/docs/notes.md" "$P/README.md"

hdr "T6 · a BROKEN app cannot earn a receipt"
P2="$WORK/t6"; make_project "$P2"
echo 'BROKEN' > "$P2/src/status.txt"          # smoke asserts IN_TRANSIT → must fail
OUT="$(V "$P2")"; RC=$?
[ "$RC" != "0" ] && ok "verify.sh exits non-zero when the smoke run fails (rc=$RC)" || bad "a broken app passed" "$OUT"
R2="$P2/.vantry/receipts/main.verify.json"
grep -q '"verdict": "fail"' "$R2" && ok "receipt records verdict:fail (not silence)" || bad "no fail verdict" "$(cat "$R2")"
[ "$(gate "$P2")" = "2" ] && ok "gate blocks on a failed receipt" || bad "failed receipt accepted" "rc=$(gate "$P2")"
case "$(V "$P2" --gate --stop)" in *"FAILED"*) ok "it says WHY (last verification failed)" ;; *) bad "no failure reason" "" ;; esac

hdr "T7 · errors in the app log fail the run even when the smoke passes"
P3="$WORK/t7"; make_project "$P3"
cat > "$P3/server.sh" <<'S'
#!/usr/bin/env bash
rm -f .ready
cp src/status.txt .served
echo "ERROR: unhandled rejection in orders worker"
touch .ready
while true; do sleep 1; done
S
chmod +x "$P3/server.sh"
echo "x" >> "$P3/src/status.txt.bak" 2>/dev/null; echo 'IN_TRANSIT' > "$P3/src/status.txt"
touch "$P3/src/new.ts"
OUT="$(V "$P3")"; RC=$?
[ "$RC" != "0" ] && ok "a 500-style log line fails the run despite a green smoke" || bad "log errors ignored" "$OUT"
case "$OUT" in *"error line"*) ok "the offending log line is quoted back" ;; *) bad "log scan silent" "$OUT" ;; esac

hdr "T8 · the app dying during startup is caught"
P4="$WORK/t8"; make_project "$P4"
printf '#!/usr/bin/env bash\necho "boot: crash"\nexit 1\n' > "$P4/server.sh"; chmod +x "$P4/server.sh"
touch "$P4/src/new.ts"
OUT="$(V "$P4")"; RC=$?
[ "$RC" != "0" ] && ok "a dead app cannot be verified" || bad "dead app passed" "$OUT"
case "$OUT" in *"DIED"*|*"never became ready"*) ok "the death is reported, not timed out silently" ;; *) bad "no death report" "$OUT" ;; esac

hdr "T9 · --observe cannot invent a run"
P5="$WORK/t9"; make_project "$P5"
touch "$P5/src/new.ts"
OUT="$(V "$P5" --observe "it works" "I clicked around and everything looked fine")"; RC=$?
[ "$RC" != "0" ] && ok "--observe refuses when no receipt exists" || bad "narration accepted with no run" "$OUT"
case "$OUT" in *"cannot narrate a run that did not happen"*) ok "it says so plainly" ;; *) bad "weak message" "$OUT" ;; esac
V "$P5" >/dev/null 2>&1
OUT="$(V "$P5" --observe "expected" "short")"; RC=$?
[ "$RC" != "0" ] && ok "--observe rejects a <20 char observation" || bad "accepted a stub observation" "$OUT"
# `expected` was required by verify-change's Done-when and enforced nowhere, so
# an observation with nothing to compare against satisfied the gate.
OUT="$(V "$P5" --observe "" "the page rendered and the console was clean throughout")"; RC=$?
[ "$RC" != "0" ] && ok "--observe rejects an EMPTY expected" || bad "accepted an observation with nothing to compare against" "$OUT"
V "$P5" --observe "Status reads IN_TRANSIT" "GET / served IN_TRANSIT, ready file present, log clean" >/dev/null 2>&1
grep -q 'served IN_TRANSIT' "$P5/.vantry/receipts/main.verify.json" && ok "a real observation is recorded" || bad "observation not stored" "$(cat "$P5"/.vantry/receipts/*.json)"

hdr "T10 · strict mode demands the observation"
P6="$WORK/t10"; make_project "$P6"
sed -i.bak 's/^strictness: standard/strictness: strict/' "$P6/vantry.yml"; rm -f "$P6/vantry.yml.bak"
touch "$P6/src/new.ts"
V "$P6" >/dev/null 2>&1
[ "$(gate "$P6")" = "2" ] && ok "strict blocks a pass with no observation" || bad "strict accepted a bare pass" "rc=$(gate "$P6")"
V "$P6" --observe "new file present" "app still serves IN_TRANSIT after adding src/new.ts" >/dev/null 2>&1
[ "$(gate "$P6")" = "0" ] && ok "strict passes once the observation is recorded" || bad "strict still blocking" "$(V "$P6" --gate --stop)"

hdr "T11 · relaxed warns, never blocks"
P7="$WORK/t11"; make_project "$P7"
sed -i.bak 's/^strictness: standard/strictness: relaxed/' "$P7/vantry.yml"; rm -f "$P7/vantry.yml.bak"
echo 'CHANGED' > "$P7/src/status.txt"
RC="$(gate "$P7")"
[ "$RC" = "1" ] && ok "relaxed returns 1 (warn), not 2 (block)" || bad "relaxed did not warn correctly" "rc=$RC"
OUT="$(V "$P7" --gate --stop)"
# The heading must match the outcome. Printing "BLOCKED" immediately before
# letting the push through is the only gate output a new adopter ever sees,
# because /adopt mandates relaxed — and it said the opposite of what happened.
case "$OUT" in *"UNVERIFIED CHANGE"*) ok "the warning is loud AND says it was allowed" ;; *) bad "wrong heading for the warn path" "$OUT" ;; esac
case "$OUT" in *"BLOCKED BY VANTRY"*) bad "relaxed mode still says BLOCKED while letting it through" "$OUT" ;; *) ok "the word BLOCKED is reserved for the path that blocks" ;; esac
case "$OUT" in *relaxed*) ok "and it names the strictness that allowed it" ;; *) bad "does not say why it was allowed" "$OUT" ;; esac

hdr "T12 · the override is explicit, reasoned and recorded"
P8="$WORK/t12"; make_project "$P8"
echo 'CHANGED' > "$P8/src/status.txt"
OUT="$(V "$P8" --override "too short")"; RC=$?
[ "$RC" != "0" ] && ok "an override with no real reason is refused" || bad "accepted a junk reason" "$OUT"
[ "$(gate "$P8")" = "2" ] && ok "still blocked" || bad "unblocked by a refused override" ""
V "$P8" --override "hardware lab is offline until Tuesday, verified manually on staging" >/dev/null 2>&1
[ -f "$P8/.vantry/overrides/main.json" ] && ok "the override lands in a file" || bad "no override file" ""
git -C "$P8" status --porcelain -uall | grep -q '.vantry/overrides' && ok "git sees it (not gitignored)" || bad "override is invisible to git" "$(git -C "$P8" status --porcelain -uall)"

# An override's whole purpose is that the REASON travels with the PR. The gate
# printed "It is committed and shown in the PR" without ever checking, so an
# UNTRACKED file silently unblocked the push and the reviewer saw a bare bypass.
[ "$(gate "$P8")" = "2" ] && ok "an UNCOMMITTED override does NOT unblock" || bad "untracked override unblocked the gate" "$(V "$P8" --gate --stop)"
case "$(V "$P8" --gate --stop 2>&1)" in *"NOT committed"*) ok "and it says exactly why" ;; *) bad "no explanation for the untracked override" "$(V "$P8" --gate --stop 2>&1)" ;; esac

git -C "$P8" add -f .vantry/overrides >/dev/null 2>&1
git -C "$P8" -c user.email=t@t -c user.name=t commit -qm "chore: record verification override" >/dev/null 2>&1
[ "$(gate "$P8")" = "0" ] && ok "a COMMITTED reasoned override unblocks" || bad "override ignored" "$(V "$P8" --gate --stop)"

# An override is a decision about a SPECIFIC state of the code. It was being
# honoured forever: write it once, keep changing the code, and every later change
# inherited a waiver granted for something else.
cp "$P8/src/status.txt" "$WORK/t12.status.orig"
echo '// a change made AFTER the waiver was granted' >> "$P8/src/status.txt"
[ "$(gate "$P8")" = "2" ] && ok "…and it stops covering the code once the code changes" \
  || bad "one reviewed exception covered every change made after it" "$(V "$P8" --gate --stop)"
case "$(V "$P8" --gate --stop 2>&1)" in
  *"no longer describes this code"*) ok "…saying exactly that, with both digests" ;;
  *) bad "refused without explaining that the waiver went stale" "$(V "$P8" --gate --stop 2>&1)" ;;
esac
# restore EXACTLY what was there — `git checkout --` would also revert the
# change this test made before the override, and the waiver would then look
# stale for the wrong reason
cp "$WORK/t12.status.orig" "$P8/src/status.txt"
case "$(V "$P8" --gate --stop 2>&1)" in *"OVERRIDDEN"*) ok "the override is announced every single time" ;; *) bad "silent override" "" ;; esac
case "$(V "$P8" --gate --stop 2>&1)" in *"travels with the PR"*) ok "and the claim it makes is one it checked" ;; *) bad "the message still asserts something unchecked" "$(V "$P8" --gate --stop 2>&1)" ;; esac

hdr "T13 · no contract means UNDEFINED, never a free pass"
P9="$WORK/t13"; make_project "$P9"; rm -f "$P9/vantry.yml"
[ "$(gate "$P9")" = "0" ] && ok "a non-vantry repo is never interfered with" || bad "gate fired outside a vantry project" ""
OUT="$(V "$P9")"; RC=$?
[ "$RC" = "2" ] && ok "verify.sh refuses to guess (exit 2)" || bad "it guessed" "$OUT"
case "$OUT" in *"UNDEFINED"*) ok "it says verification is UNDEFINED" ;; *) bad "unclear message" "$OUT" ;; esac
P10="$WORK/t13b"; make_project "$P10"
sed -i.bak 's|^  smoke: .*|  smoke:|' "$P10/vantry.yml"; rm -f "$P10/vantry.yml.bak"
OUT="$(V "$P10")"; RC=$?
[ "$RC" = "2" ] && ok "an empty run.smoke is fatal, not skipped" || bad "empty smoke passed" "$OUT"
case "$OUT" in *"not a verification"*) ok "it explains that tests are not a smoke run" ;; *) bad "no explanation" "$OUT" ;; esac

hdr "T13c · a comment is not a command"
# `smoke:  # TODO` parsed as the command "# TODO", and `eval "# TODO"` exits 0 —
# a declared smoke run that executed nothing and PASSED.
P="$WORK/t13c"; make_project "$P"
python3 - "$P/vantry.yml" <<'PY' 2>/dev/null || sed -i.bak 's|^  smoke: .*|  smoke:   # TODO: write the smoke run|' "$P/vantry.yml"
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
p.write_text("\n".join("  smoke:   # TODO: write the smoke run" if l.startswith("  smoke:") else l for l in s.split("\n")))
PY
rm -f "$P/vantry.yml.bak"
touch "$P/src/new.ts"
OUT="$(V "$P")"; RC=$?
[ "$RC" = "2" ] && ok "a comment-only smoke is treated as UNDECLARED, not as a passing command" \
  || bad "a comment ran as a command and passed" "$OUT"
case "$OUT" in *"UNDEFINED"*) ok "and it says verification is UNDEFINED" ;; *) bad "wrong message" "$OUT" ;; esac
ls "$P"/.vantry/receipts/*.json >/dev/null 2>&1 && bad "a receipt was written for a comment" "" || ok "no receipt written"

hdr "T13d · the receipt NAMES the requirement it proves"
# The differentiator. Everything else answers "did something work?". This
# answers "which agreed requirement does this prove?" — and keeps answering it
# long after the ticket is closed.
P="$WORK/t13d"; make_project "$P"
cat >> "$P/vantry.yml" <<'Y'

acceptance:
  - "AC-1 | REQ-004 | a paid order reports its carrier status | grep -q IN_TRANSIT src/status.txt"
  - "AC-2 | REQ-007 | an unpaid order never reports a status | test ! -f src/unpaid.txt"
Y
touch "$P/src/new.ts"
OUT="$(V "$P")"; RC=$?
[ "$RC" = "0" ] && ok "a run with satisfied criteria passes" || bad "criteria failed on a healthy app" "$OUT"
R="$P/.vantry/receipts/main.verify.json"
grep -q '"req":"REQ-004"' "$R" && ok "the receipt names REQ-004" || bad "no requirement in the receipt" "$(cat "$R")"
# Within ONE object: `"id":"AC-2".*"status":"pass"` also matches AC-2's id
# followed by AC-3's status, so a per-criterion assertion was not per-criterion.
grep -qE '\{"id":"AC-2",[^}]*"status":"pass"' "$R" \
  && ok "and records each criterion's own status, matched within its own object" \
  || bad "no per-criterion status" "$(cat "$R")"
case "$OUT" in *"ac:AC-1"*) ok "each criterion runs as its own named step" ;; *) bad "criteria not run as steps" "$OUT" ;; esac

echo "  -- a regression on REQ-004, six months later --"
echo 'DELIVERED' > "$P/src/status.txt"
OUT="$(V "$P")"; RC=$?
[ "$RC" != "0" ] && ok "the criterion catches it and fails the run" || bad "regression slipped through" "$OUT"
grep -qE '\{"id":"AC-1",[^}]*"status":"fail"' "$R" \
  && ok "the receipt says WHICH criterion broke, matched within its own object" \
  || bad "no failing criterion recorded" "$(cat "$R")"
[ "$(gate "$P")" = "2" ] && ok "and the gate blocks on it" || bad "gate ignored the failed criterion" ""

echo "  -- a criterion that just re-runs the suite is refused --"
P2="$WORK/t13e"; make_project "$P2"
cp "$KIT/scripts/validate-config.sh" "$P2/scripts/" 2>/dev/null
printf '\nacceptance:\n  - "AC-1 | REQ-1 | everything works | bash tests/unit.sh"\n' >> "$P2/vantry.yml"
VCOUT="$( cd "$P2" && bash scripts/validate-config.sh 2>&1 )"; VCRC=$?
[ "$VCRC" != "0" ] && ok "validate-config refuses a criterion that re-runs run.test verbatim" \
  || bad "accepted a criterion that re-runs run.test (rc=$VCRC)" "$VCOUT"

hdr "T13f · a false PASS is impossible: pipes and quoted comments"
# Both reproduced against v3.2.0. Both are the one defect this project cannot
# ship: the gate reporting success on something that failed or never ran.
P="$WORK/t13f"; make_project "$P"
python3 - "$P/vantry.yml" <<'PY2' 2>/dev/null
import sys, pathlib
p = pathlib.Path(sys.argv[1])
p.write_text(p.read_text() + """
acceptance:
  - "AC-1 | REQ-001 | the source never contains the forbidden token | cat src/status.txt | grep -q NEVER_PRESENT"
""")
PY2
touch "$P/src/new.ts"
OUT="$(V "$P")"; RC=$?
[ "$RC" != "0" ] && ok "a criterion whose command CONTAINS A PIPE is run whole, and fails" \
  || bad "the command was truncated at the pipe and passed" "$OUT"
case "$OUT" in *"grep -q NEVER_PRESENT"*) ok "the receipt shows the full command, not the first segment" ;;
              *) bad "the command was truncated in the output too" "$OUT" ;; esac

echo "  -- a quoted comment is not a command --"
P="$WORK/t13g"; make_project "$P"
python3 - "$P/vantry.yml" <<'PY3' 2>/dev/null
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
p.write_text("\n".join('  smoke: "# TODO: write the smoke run"' if l.startswith("  smoke:") else l for l in s.split("\n")))
PY3
touch "$P/src/new.ts"
OUT="$(V "$P")"; RC=$?
[ "$RC" = "2" ] && ok "a QUOTED comment is treated as undeclared, not run as a no-op that passes" \
  || bad "a quoted comment ran as a command and passed" "$OUT"
case "$OUT" in *UNDEFINED*) ok "and it says verification is UNDEFINED" ;; *) bad "wrong message" "$OUT" ;; esac
P="$WORK/t13h"; make_project "$P"
python3 - "$P/vantry.yml" <<'PY4' 2>/dev/null
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
p.write_text("\n".join('  smoke: "   "' if l.startswith("  smoke:") else l for l in s.split("\n")))
PY4
touch "$P/src/new.ts"
RC=$( ( cd "$P" && ./scripts/verify.sh ) >/dev/null 2>&1; echo $? )
[ "$RC" = "2" ] && ok "a quoted run of spaces is undeclared too" || bad "quoted whitespace passed as a command" "rc=$RC"

hdr "T13i · a comment is never a command, however it is spelled"
# The v3.4 guard was wrong in BOTH directions: `"# TODO"` was caught but
# `" # TODO"` — one leading space — was not, and a legitimate command starting
# `#!` was wrongly emptied. Worse, a criterion whose command was a comment ran,
# exited 0, and was written into the receipt as PROOF of the requirement it
# names. A receipt that certifies a requirement on a command that executed
# nothing is the most damaging thing this kit could produce.
CFG="$WORK/cfg.yml"
cat > "$CFG" <<'Y'
version: 2
run:
  a: "# TODO"
  b: " # TODO"
  c: "   # spaces then comment"
  d: "#!/bin/sh -c true"
  e: "echo 'has # inside'"
Y
( VANTRY_CFG="$CFG"; . "$KIT/scripts/lib/vantry-common.sh"; VANTRY_CFG="$CFG"
  for k in a b c; do [ -z "$(vantry_cfg run.$k)" ] || { echo "LEAK:$k"; }; done
  [ -n "$(vantry_cfg run.d)" ] || echo "LOST:d"
  [ -n "$(vantry_cfg run.e)" ] || echo "LOST:e" ) > "$WORK/cfgres" 2>&1
grep -q LEAK "$WORK/cfgres" && bad "a comment survived the guard" "$(cat "$WORK/cfgres")" \
  || ok "a comment is empty however it is indented"
grep -q "LOST:d" "$WORK/cfgres" && bad "a shebang command was emptied as if it were a comment" "" \
  || ok "a command starting #! is kept — it is a command, not a comment"
grep -q "LOST:e" "$WORK/cfgres" && bad "a command containing a hash was emptied" "" \
  || ok "a command merely containing a hash is kept"

P="$WORK/t13i"; make_project "$P"
python3 - "$P/vantry.yml" <<'PY2' 2>/dev/null
import sys, pathlib
p = pathlib.Path(sys.argv[1])
p.write_text(p.read_text() + """
acceptance:
  - "AC-1 | REQ-007 | refunds above the original amount are refused | # TODO write this test"
""")
PY2
touch "$P/src/new.ts"
OUT="$(V "$P")"; RC=$?
[ "$RC" != "0" ] && ok "a criterion whose command is a comment FAILS the run" \
  || bad "a comment was recorded as proof of REQ-007" "$OUT"
case "$OUT" in *"not a command"*) ok "and it says why, naming the line" ;; *) bad "no explanation" "$OUT" ;; esac
R="$P/.vantry/receipts/main.verify.json"
grep -q '"id":"AC-1".*"status":"pass"' "$R" 2>/dev/null \
  && bad "the receipt still certifies REQ-007" "$(cat "$R")" \
  || ok "the receipt does not certify the requirement"

hdr "T14 · a receipt survives the commit, dies on the next edit"
P11="$WORK/t14"; make_project "$P11"
git -C "$P11" checkout -qb feat/x
echo 'IN_TRANSIT' > "$P11/src/status.txt"; touch "$P11/src/new.ts"
V "$P11" >/dev/null 2>&1
[ "$(gate "$P11")" = "0" ] && ok "verified on a feature branch" || bad "gate blocked after a pass" "$(V "$P11" --gate --stop)"
git -C "$P11" add -A >/dev/null; git -C "$P11" -c user.email=t@t -c user.name=t commit -qm "feat: x"
[ "$(gate "$P11")" = "0" ] && ok "committing does NOT invalidate the receipt (base-relative digest)" || bad "commit broke the receipt" "$(V "$P11" --gate --stop)"
echo "// more" >> "$P11/src/new.ts"
[ "$(gate "$P11")" = "2" ] && ok "the next edit DOES invalidate it" || bad "post-commit edit slipped through" ""

hdr "T15 · no stray processes are left behind"
P12="$WORK/t15"; make_project "$P12"; touch "$P12/src/new.ts"
BEFORE="$(pgrep -f "$P12/server.sh" 2>/dev/null | wc -l | tr -d ' ')"
V "$P12" >/dev/null 2>&1
sleep 0.5
AFTER="$(pgrep -f "$P12/server.sh" 2>/dev/null | wc -l | tr -d ' ')"
[ "${AFTER:-0}" = "0" ] && ok "the app process is gone after the run (was $BEFORE during)" \
  || bad "$AFTER stray server process(es) left running" "$(pgrep -fl "$P12/server.sh" 2>/dev/null)"

hdr "T16 · the receipt cannot be authored by hand (the product thesis, tested)"
P13="$WORK/t16"; make_project "$P13"
git -C "$P13" checkout -qb feat/seal
touch "$P13/src/new.ts"
V "$P13" >/dev/null 2>&1
R13="$P13/.vantry/receipts/feat-seal.verify.json"
[ "$(gate "$P13")" = "0" ] && ok "a real run passes the gate" || bad "a real run was refused" "$(V "$P13" --gate --stop)"
grep -q '"seal": "[0-9a-f]\{32,\}"' "$R13" && ok "the receipt carries a keyed seal" || bad "no seal on the receipt" "$(cat "$R13")"
[ -s "$P13/.vantry/state/seal.key" ] && ok "the key exists and lives outside the receipt" || bad "no seal key" ""
case "$(ls -l "$P13/.vantry/state/seal.key" | cut -c1-10)" in
  -rw-------*) ok "the key is 600 — not world-readable" ;;
  *) bad "the seal key is readable by others" "$(ls -l "$P13/.vantry/state/seal.key")" ;;
esac

# Forge one: correct tree_digest, correct head, everything a careful agent knows.
DIG13="$(grep -o '"tree_digest": "[0-9a-f]*"' "$R13" | sed 's/.*: "//;s/"//')"
H13="$(git -C "$P13" rev-parse HEAD)"
cat > "$R13" <<JSON13
{
  "schema": "vantry.receipt/1", "kind": "verify", "verdict": "pass",
  "produced_by": "scripts/verify.sh@9.9.9",
  "created_at": "2099-01-01T00:00:00Z",
  "branch": "feat/seal", "head": "$H13", "base": "",
  "tree_digest": "$DIG13",
  "files": [], "steps": [{"phase":"test","exit_code":0}], "acceptance": [],
  "observation": { "expected": "", "observed": "", "artifacts": [] },
  "seal": "0000000000000000000000000000000000000000000000000000000000000000"
}
JSON13
[ "$(gate "$P13")" = "2" ] && ok "a hand-written receipt with the RIGHT digest is refused" \
  || bad "the forged receipt passed the gate" "$(V "$P13" --gate --stop)"
case "$(V "$P13" --gate --stop 2>&1)" in *seal*) ok "and it names the seal as the reason" ;; *) bad "no seal reason given" "$(V "$P13" --gate --stop)" ;; esac

# A pass with no steps describes no run at all.
python3 - "$R13" <<'PYS'
import json,sys
d=json.load(open(sys.argv[1])); d["steps"]=[]; d["seal"]=""
json.dump(d,open(sys.argv[1],"w"),indent=2)
PYS
[ "$(gate "$P13")" = "2" ] && ok "a pass with zero steps is refused" || bad "a step-less pass was accepted" ""

# And the gate must stay SATISFIABLE — a one-way block is a broken gate.
V "$P13" >/dev/null 2>&1
[ "$(gate "$P13")" = "0" ] && ok "re-running verify.sh restores the pass (the gate is satisfiable)" \
  || bad "the gate could not be satisfied again" "$(V "$P13" --gate --stop)"

hdr "T17 · --status <branch> judges THAT branch, not the checked-out worktree"
P14="$WORK/t17"; make_project "$P14"
git -C "$P14" checkout -qb feat/other
touch "$P14/src/other.ts"
V "$P14" >/dev/null 2>&1
git -C "$P14" add -A >/dev/null; git -C "$P14" -c user.email=t@t -c user.name=t commit -qm "feat: other" >/dev/null
git -C "$P14" checkout -q main
echo "// dirty" >> "$P14/src/app.ts"          # the worktree is now unrelated to feat/other
OUT14="$( cd "$P14" && bash scripts/verify.sh --status feat/other 2>&1 )"
case "$OUT14" in *CURRENT*) ok "a verified branch still reads CURRENT from another worktree" ;;
  *) bad "freshness was computed from the checked-out tree" "$OUT14" ;; esac
OUT14b="$( cd "$P14" && bash scripts/verify.sh --status no/such/branch 2>&1 )"
case "$OUT14b" in *"NO SUCH BRANCH"*) ok "and an unknown branch is refused, not guessed at" ;;
  *) bad "reported on a branch that does not exist" "$OUT14b" ;; esac

hdr "T18 · running verify.sh twice in a row must give the same answer"
# Nothing in this suite ever ran it twice, and it did not survive: the ready
# poll saw the PREVIOUS run's readiness marker, broke out instantly, and the
# separate `step ready` re-ran the same command after the freshly-started app
# had cleared it. A project verified on attempt 1 and was BLOCKED on attempt 2
# with nothing changed — a flaky gate, which is worse than a strict one.
P15="$WORK/t18"; make_project "$P15"
git -C "$P15" checkout -qb feat/idem
touch "$P15/src/new.ts"
O1="$(V "$P15" 2>&1)"; R1=$?
O2="$(V "$P15" 2>&1)"; R2=$?
[ "$R1" = "0" ] && ok "run 1 verifies" || bad "run 1 failed" "$O1"
[ "$R2" = "0" ] && ok "run 2 verifies too — the gate is idempotent" || bad "run 2 failed on an unchanged tree" "$O2"
[ "$(gate "$P15")" = "0" ] && ok "and the gate is open after both" || bad "gate blocked after two clean runs" ""
case "$O2" in *'[ready]'*) ok "the ready phase still reports" ;; *) bad "ready vanished from the output" "$O2" ;; esac
grep -q '"phase":"ready","cmd":.*"exit_code":0' "$P15/.vantry/receipts/feat-idem.verify.json" \
  && ok "and the receipt records readiness as a step, from the poll that observed it" \
  || bad "the ready step is missing from the receipt" "$(cat "$P15/.vantry/receipts/feat-idem.verify.json")"

hdr "T19 · a hung step is killed and recorded as hung, not as failed"
P16="$WORK/t19"; make_project "$P16"
git -C "$P16" checkout -qb feat/hang
touch "$P16/src/new.ts"
# Replace the test command with something that never returns, and bound it.
python3 - "$P16/vantry.yml" <<'PYH'
import sys,re
p=sys.argv[1]; s=open(p).read()
s=re.sub(r'^(\s*test:).*$', r'\1 sleep 600', s, count=1, flags=re.M)
if 'timeouts:' not in s: s += "\ntimeouts:\n  test: 5\n"
open(p,'w').write(s)
PYH
T0=$(date +%s)
OUT16="$(V "$P16" 2>&1)"
T1=$(date +%s)
EL=$((T1 - T0))
[ "$EL" -lt 60 ] && ok "the run returned in ${EL}s instead of hanging for 600" \
  || bad "the watchdog did not fire (${EL}s)" "$OUT16"
case "$OUT16" in *"exceeded 5s"*) ok "and it says the step never finished, not that it failed" ;;
  *) bad "no timeout diagnostic" "$OUT16" ;; esac
grep -q '"exit_code":124' "$P16/.vantry/receipts/feat-hang.verify.json" \
  && ok "the receipt records 124 — hung is distinguishable from failed" \
  || bad "the receipt does not distinguish a hang" "$(cat "$P16/.vantry/receipts/feat-hang.verify.json")"
[ "$(gate "$P16")" = "2" ] && ok "and the gate is closed, not silently open" || bad "a hung run left the gate open" ""
# The nesting mistake that made the first version of this feature inert.
python3 - "$P16/vantry.yml" <<'PYH2'
import sys,re
p=sys.argv[1]; s=open(p).read()
s=s.replace("\ntimeouts:\n  test: 5\n","")
s=re.sub(r'^(run:)$', r'\1\n  timeouts:\n    test: 5', s, count=1, flags=re.M)
open(p,'w').write(s)
PYH2
( cd "$P16" && bash scripts/validate-config.sh >/dev/null 2>&1 ) \
  && bad "a nested timeouts: block was accepted, and it is unreadable" "" \
  || ok "a timeouts: block nested under run: is refused, not silently ignored"

hdr "T20 · --observe cannot attach evidence that was never captured"
P17="$WORK/t20"; make_project "$P17"
git -C "$P17" checkout -qb feat/obs
touch "$P17/src/new.ts"
V "$P17" >/dev/null 2>&1
OUT20="$( cd "$P17" && bash scripts/verify.sh --observe "the page renders" "it rendered and the console was clean" shots/never-taken.png 2>&1 )"; RC20=$?
[ "$RC20" != "0" ] && ok "an artifact path that does not exist is refused" || bad "recorded a screenshot nobody took" "$OUT20"
case "$OUT20" in *"do not exist"*) ok "and it names the missing path" ;; *) bad "no explanation" "$OUT20" ;; esac
grep -q 'never-taken' "$P17/.vantry/receipts/feat-obs.verify.json" \
  && bad "the phantom artifact reached the receipt anyway" "" \
  || ok "and nothing was written to the receipt"
mkdir -p "$P17/shots"; printf 'png\n' > "$P17/shots/real.png"
OUT20b="$( cd "$P17" && bash scripts/verify.sh --observe "the page renders" "it rendered and the console was clean" shots/real.png 2>&1 )"
case "$OUT20b" in *"✓ observation recorded"*) ok "a real artifact is accepted (the check is not just a wall)" ;; *) bad "refused a real artifact" "$OUT20b" ;; esac
grep -q 'shots/real.png' "$P17/.vantry/receipts/feat-obs.verify.json" && ok "and it lands in the receipt" || bad "real artifact missing from the receipt" ""

hdr "T21 · an acceptance criterion may not be the whole suite under a new name"
P18="$WORK/t21"; make_project "$P18"
ac_is() {   # $1 = command   → prints ACCEPTED / REFUSED
  python3 - "$P18/vantry.yml" "$1" <<'PYAC'
import sys, re
p, cmd = sys.argv[1], sys.argv[2]
s = re.sub(r'\nacceptance:\n(?:  - .*\n)*', '\n', open(p).read())
open(p, 'w').write(s.rstrip() + '\nacceptance:\n  - "AC-1 | REQ-004 | a refund above the original amount is refused | ' + cmd + '"\n')
PYAC
  if ( cd "$P18" && bash "$KIT/scripts/validate-config.sh" ) >/dev/null 2>&1; then echo ACCEPTED; else echo REFUSED; fi
}
RT="$( cd "$P18" && sed -n 's/^  test:[[:space:]]*//p' vantry.yml | head -1 )"
[ "$(ac_is "$RT")" = "REFUSED" ] && ok "run.test verbatim is refused" || bad "the whole suite passed as a criterion" ""
[ "$(ac_is "$RT --silent")" = "REFUSED" ] && ok "…and reworded, selecting nothing, is still refused" || bad "a reworded whole-suite copy passed" ""
[ "$(ac_is "$RT tests/refund.spec.js")" = "ACCEPTED" ] && ok "but a criterion naming ONE file is accepted" || bad "refused a legitimate single-file criterion" ""
[ "$(ac_is "pytest -k refund_cap")" = "ACCEPTED" ] && ok "and so is a different runner with a selector" || bad "refused a legitimate selector" ""

hdr "T22 · --init resolves the real trunk, or refuses to guess one"
# It wrote `git rev-parse --abbrev-ref HEAD` — the CURRENT branch. Run on a
# feature branch, merge.base became that branch, the changeset was empty forever,
# and the gate returned OK for everything with hooks and agents installed.
P19="$WORK/t22"; mkdir -p "$P19/src"; ( cd "$P19" && git init -q -b main . )
printf 'x\n' > "$P19/src/a.ts"
git -C "$P19" add -A >/dev/null; git -C "$P19" -c user.email=t@t -c user.name=t commit -qm init >/dev/null
mkdir -p "$P19/scripts/lib"
cp "$KIT/scripts/verify.sh" "$P19/scripts/"; cp "$KIT"/scripts/lib/*.sh "$P19/scripts/lib/"
git -C "$P19" checkout -qb feat/somewhere
( cd "$P19" && bash scripts/verify.sh --init ) >/dev/null 2>&1
B22="$( cd "$P19" && sed -n 's/^  base:[[:space:]]*//p' vantry.yml | head -1 | sed 's/[[:space:]]*#.*$//' )"
[ "$B22" != "feat/somewhere" ] && ok "--init did NOT write the current branch as the trunk (wrote '${B22:-<blank>}')" \
  || bad "--init wrote the feature branch as merge.base" "$(cd "$P19" && grep -A3 '^merge:' vantry.yml)"
[ "$B22" = "main" ] && ok "…it found the real trunk" \
  || { grep -q 'REQUIRED' "$P19/vantry.yml" && ok "…or left it blank and marked REQUIRED" || bad "blank base with no REQUIRED marker" "$(cat "$P19/vantry.yml")"; }

hdr "T23 · a gate that cannot SEE committed work must say so, not tick"
# On a trunk with no remote counterpart the base point IS head, so `git diff`
# only sees uncommitted files: commit a behavioural change and the gate reported
# "nothing to verify". That is the default greenfield state.
P20="$WORK/t23"; mkdir -p "$P20/src"; ( cd "$P20" && git init -q -b main . )
mkdir -p "$P20/scripts/lib"
cp "$KIT/scripts/verify.sh" "$P20/scripts/"; cp "$KIT"/scripts/lib/*.sh "$P20/scripts/lib/"
cat > "$P20/vantry.yml" <<'Y'
version: 2
stack: "shell"
project_type: cli
strictness: standard
run:
  install: "true"
  test: "true"
  build: "true"
  smoke: "true"
gates:
  verify_change: block
merge:
  authority: human
  base: main
Y
printf '.vantry/\n' > "$P20/.gitignore"
printf 'x\n' > "$P20/src/a.ts"
git -C "$P20" add -A >/dev/null; git -C "$P20" -c user.email=t@t -c user.name=t commit -qm init >/dev/null
printf 'behaviour changed\n' > "$P20/src/a.ts"
git -C "$P20" add -A >/dev/null; git -C "$P20" -c user.email=t@t -c user.name=t commit -qm "feat: change" >/dev/null
ST23="$( cd "$P20" && bash scripts/verify.sh --status 2>&1 )"
case "$ST23" in *"COMMITTED WORK IS INVISIBLE"*) ok "--status says committed work is invisible here" ;;
  *) bad "the blind state is not reported" "$ST23" ;; esac
case "$ST23" in *"BLIND"*) ok "…and the verdict is BLIND, not OK" ;; *) bad "printed a verdict it could not compute" "$ST23" ;; esac
RC23=$( ( cd "$P20" && bash scripts/verify.sh --gate --pre-push ) >/dev/null 2>&1; echo $? )
[ "$RC23" != "0" ] && ok "and the push path warns instead of returning a silent 0 (rc=$RC23)" \
  || bad "the gate returned a silent 0 on invisible committed work" ""
# strict must escalate the same case to a block
sed -i.bak 's/^strictness: standard/strictness: strict   # production/' "$P20/vantry.yml" && rm -f "$P20/vantry.yml.bak"
RC23b=$( ( cd "$P20" && bash scripts/verify.sh --gate --pre-push ) >/dev/null 2>&1; echo $? )
[ "$RC23b" = "2" ] && ok "strict blocks it — and an inline '# production' comment does not defeat the parse" \
  || bad "strict did not block (rc=$RC23b) — the strictness comment may be breaking the parse again" ""

hdr "T24 · the CI security gate is satisfiable AND still bites"
# The v3.9 CRITICAL: it compared the review's `head` to HEAD for EQUALITY while
# the playbook requires the verdict to be COMMITTED — which moves HEAD. No PR
# touching a sensitive path could ever pass, and the error told you to redo the
# step that caused it. This replays the workflow's own shell logic so a
# regression fails here rather than in someone's pull request.
P21="$WORK/t24"; mkdir -p "$P21/src/auth" "$P21/scripts/lib" "$P21/.vantry/reviews"
( cd "$P21" && git init -q -b main . )
cp "$KIT"/scripts/lib/vantry-common.sh "$P21/scripts/lib/"
cat > "$P21/vantry.yml" <<'Y'
version: 2
stack: "node"
project_type: service
strictness: standard
run:
  test: "true"
  smoke: "true"
merge:
  authority: human
  base: main
sensitive_paths:
  - "**/auth/**"
Y
printf 'ok\n' > "$P21/src/auth/login.js"
git -C "$P21" add -A >/dev/null; git -C "$P21" -c user.email=t@t -c user.name=t commit -qm init >/dev/null
git -C "$P21" checkout -qb feat/auth
printf 'changed\n' > "$P21/src/auth/login.js"
git -C "$P21" add -A >/dev/null; git -C "$P21" -c user.email=t@t -c user.name=t commit -qm "feat: auth" >/dev/null
REVIEWED="$(git -C "$P21" rev-parse HEAD)"
cat > "$P21/.vantry/reviews/feat-auth.security.json" <<EOF
{ "verdict": "pass", "head": "$REVIEWED", "reviewer": "security-engineer" }
EOF
git -C "$P21" add -A >/dev/null
git -C "$P21" -c user.email=t@t -c user.name=t commit -qm "chore(security): verdict" >/dev/null
HEAD24="$(git -C "$P21" rev-parse HEAD)"

[ "$REVIEWED" != "$HEAD24" ] && ok "committing the verdict moved HEAD (which is why equality was unsatisfiable)" \
  || bad "the fixture did not reproduce the moving-HEAD case" ""

gate24() {   # replays the workflow's security step against $1 = head sha
  ( cd "$P21" && . scripts/lib/vantry-common.sh
    R=".vantry/reviews/feat-auth.security.json"
    RH="$(grep -o '"head"[[:space:]]*:[[:space:]]*"[0-9a-f]*"' "$R" | head -1 | sed 's/.*"\([0-9a-f]*\)"$/\1/')"
    git cat-file -e "$RH^{commit}" 2>/dev/null || exit 1
    git merge-base --is-ancestor "$RH" "$1" || exit 1
    for f in $(git diff --name-only "$RH" "$1"); do vantry_is_sensitive "$f" && exit 1; done
    exit 0 )
}
gate24 "$HEAD24" && ok "a correctly reviewed PR PASSES — the gate has a reachable success state" \
  || bad "no reachable success state: the ancestry fix has regressed to equality" ""

printf 'sneaked\n' > "$P21/src/auth/login.js"
git -C "$P21" add -A >/dev/null
git -C "$P21" -c user.email=t@t -c user.name=t commit -qm "chore: tidy" >/dev/null
HEAD24b="$(git -C "$P21" rev-parse HEAD)"
gate24 "$HEAD24b" && bad "a sensitive file changed AFTER the verdict and the gate still passed" "" \
  || ok "a sensitive change made after the review REFUSES — the verdict is not a licence"

hdr "T25 · the three ways a receipt was forgeable (external audit, all reproduced)"
P22="$WORK/t25"; make_project "$P22"
git -C "$P22" checkout -qb feat/p0
mkdir -p "$P22/src"; printf '#!/usr/bin/env bash\necho ok\n' > "$P22/src/tool.sh"; chmod +x "$P22/src/tool.sh"
git -C "$P22" add -A >/dev/null; git -C "$P22" -c user.email=t@t -c user.name=t commit -qm "feat: tool" >/dev/null
V "$P22" >/dev/null 2>&1
[ "$(gate "$P22")" = "0" ] && ok "a real verification opens the gate" || bad "baseline failed" "$(V "$P22" --gate --stop)"

# (a) chmod -x must stale the receipt. git records 100755 -> 100644; the digest
#     hashed content only, so a script could be made non-executable AFTER it was
#     verified — including a hook.
chmod -x "$P22/src/tool.sh"
[ "$(gate "$P22")" = "2" ] && ok "chmod -x invalidates the receipt (the digest covers the mode)" \
  || bad "a mode change left the receipt CURRENT — a gate can be disarmed after verification" ""
chmod +x "$P22/src/tool.sh"
[ "$(gate "$P22")" = "0" ] && ok "and restoring the mode restores it" || bad "mode digest is not symmetric" ""

# (b) deleting the seal key must not excuse an unsigned receipt. "Cannot tell"
#     was being treated as acceptable, and anyone who can write a receipt can
#     delete a file.
DIG25="$(grep -o '"tree_digest": "[0-9a-f]*"' "$P22/.vantry/receipts/feat-p0.verify.json" | sed 's/.*"\([0-9a-f]*\)"/\1/')"
rm -f "$P22/.vantry/state/seal.key"
cat > "$P22/.vantry/receipts/feat-p0.verify.json" <<JSON25
{ "schema":"vantry.receipt/1","kind":"verify","verdict":"pass","produced_by":"not-verify.sh",
  "created_at":"1999-01-01T00:00:00Z","branch":"feat/p0","head":"$(git -C "$P22" rev-parse HEAD)",
  "base":"","tree_digest":"$DIG25","files":[],"steps":[{"phase":"test","exit_code":0}],
  "acceptance":[],"observation":{"expected":"","observed":"","artifacts":[]},"seal":"" }
JSON25
[ "$(gate "$P22")" = "2" ] && ok "a forged receipt is refused even with the seal key deleted" \
  || bad "deleting the key turned forgery into 'cannot tell', and 'cannot tell' let it through" ""

# (c) a deployment smoke is not a verification. --smoke skips test and build.
V "$P22" >/dev/null 2>&1
rm -rf "$P22/.vantry/receipts"
( cd "$P22" && bash scripts/verify.sh --smoke ) >/dev/null 2>&1
R25="$P22/.vantry/receipts/feat-p0.verify.json"
grep -q '"kind": "smoke"' "$R25" && ok "--smoke writes kind:smoke, not kind:verify" \
  || bad "a smoke run is still recorded as a full verification" "$(head -5 "$R25")"
[ "$(gate "$P22")" = "2" ] && ok "and the gate refuses a smoke-only receipt" \
  || bad "a deployment smoke opened the push gate" "$(V "$P22" --gate --stop)"
case "$(V "$P22" --gate --stop 2>&1)" in *"skips test and build"*) ok "…saying exactly why" ;;
  *) bad "no explanation for the refusal" "$(V "$P22" --gate --stop)" ;; esac

hdr "T26 · the seal covers the DOCUMENT, not a selection of fields"
# An external audit found the hole: the seal hashed five chosen fields —
# verdict, tree_digest, created_at, head, produced_by — and everything else was
# unsealed. Three of those unsealed fields DECIDE the gate. One sed turned a
# deployment smoke, which skips test and build, into a full verification: rc=0.
#
# Each mutation below must be a REAL change from what the receipt holds. The
# first version of this test mutated fields to the value they already had and
# passed while proving nothing.
P23="$WORK/t26"; mkdir -p "$P23/scripts/lib" "$P23/src"
( cd "$P23" && git init -q -b main . )
cp "$KIT/scripts/verify.sh" "$P23/scripts/"; cp "$KIT"/scripts/lib/*.sh "$P23/scripts/lib/"
cat > "$P23/vantry.yml" <<'Y26'
version: 2
stack: "shell"
project_type: cli
strictness: standard
run:
  install: "true"
  test: "grep -q CAP src/app.sh"
  build: "true"
  smoke: "true"
gates:
  verify_change: block
merge:
  authority: human
  base: main
acceptance:
  - "AC-1 | REQ-001 | the cap holds | grep -q CAP src/app.sh"
Y26
printf '.vantry/\n' > "$P23/.gitignore"
printf 'CAP=1\n' > "$P23/src/app.sh"
git -C "$P23" add -A >/dev/null
git -C "$P23" -c user.email=t@t -c user.name=t commit -qm "feat: app" >/dev/null
git -C "$P23" checkout -qb work
printf 'no cap at all\n' > "$P23/src/app.sh"     # test AND criterion now fail
R26="$P23/.vantry/receipts/work.verify.json"
V "$P23" >/dev/null 2>&1
[ "$(gate "$P23")" = "2" ] && ok "a failed verification blocks (the baseline)" || bad "baseline wrong" ""

t26() {  # $1 = label · $2 = python mutation
  cp "$R26" "$WORK/t26.orig"
  python3 - "$R26" <<PY26
import json,sys
p=sys.argv[1]; d=json.load(open(p))
$2
json.dump(d,open(p,"w"),indent=2)
PY26
  if [ "$(gate "$P23")" = "0" ]; then bad "$1 — rewritten and the gate OPENED" "$(cat "$R26")"
  else ok "$1 — refused"; fi
  cp "$WORK/t26.orig" "$R26"
}
t26 "verdict fail→pass"                    'd["verdict"]="pass"'
t26 "a failed acceptance criterion →pass"  'd["verdict"]="pass"; [a.update(status="pass") for a in d.get("acceptance",[])]'
t26 "steps rewritten green"                'd["verdict"]="pass"; d["steps"]=[{"phase":"test","exit_code":0}]'
t26 "the whole thing rewritten green"      'd["verdict"]="pass"; d["kind"]="verify"; d["steps"]=[{"phase":"test","exit_code":0}]; [a.update(status="pass") for a in d.get("acceptance",[])]'

# the exact route the audit reported
printf 'CAP=ok\n' > "$P23/src/app.sh"
rm -rf "$P23/.vantry/receipts"
( cd "$P23" && bash scripts/verify.sh --smoke ) >/dev/null 2>&1
grep -q '"kind": "smoke"' "$R26" && ok "a --smoke run records kind:smoke" || bad "smoke not labelled" ""
[ "$(gate "$P23")" = "2" ] && ok "and a smoke receipt does not open the gate" || bad "smoke opened the gate" ""
python3 - "$R26" <<'PY26B'
import json,sys
p=sys.argv[1]; d=json.load(open(p)); d["kind"]="verify"
json.dump(d,open(p,"w"),indent=2)
PY26B
[ "$(gate "$P23")" = "2" ] \
  && ok "rewriting kind:smoke→verify is caught by the seal (the reported P0)" \
  || bad "a deployment smoke became a verification with one sed" "$(cat "$R26")"

# and the reason the seal was ever a selection: --observe must still work
V "$P23" >/dev/null 2>&1
( cd "$P23" && bash scripts/verify.sh --observe "the cap holds" "grep found CAP and the suite was green" ) >/dev/null 2>&1
[ "$(gate "$P23")" = "0" ] && ok "--observe still annotates without breaking the seal" \
  || bad "sealing the document broke the annotation it was carved out for" "$( cd "$P23" && bash scripts/verify.sh --gate --stop 2>&1 )"

echo
echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$PASS" "$FAIL"
echo "=============================================================="
pkill -f "$WORK" 2>/dev/null
rm -rf "$WORK"
[ "$FAIL" -eq 0 ] || exit 1
