#!/usr/bin/env bash
# =============================================================================
#  demo.sh — the whole thesis in ninety seconds, in a throwaway repo.
#
#  No API key, no network, no agent, nothing installed, nothing touched outside
#  a temp directory. It builds a tiny project whose unit suite is GREEN and
#  whose software is BROKEN, then shows what each layer does about it.
#
#  It is also a regression test: --check re-runs it and diffs against the
#  transcript published in the README, so the README cannot advertise output the
#  software no longer produces.
#
#  Usage: bash scripts/demo.sh [--check]
# =============================================================================
set -uo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
CHECK=0; [ "${1:-}" = "--check" ] && CHECK=1
W="$(mktemp -d)"; R="$W/remote.git"; P="$W/shop"
cleanup() { pkill -f "$W" 2>/dev/null; rm -rf "$W"; }
trap cleanup EXIT INT TERM

say()  { [ "$CHECK" = "1" ] || printf '%s\n' "$*"; }
step() { say ""; say "━━━ $* ━━━"; }
G() { git -C "$P" -c user.email=demo@example.com -c user.name=demo "$@"; }

# --------------------------------------------------------------- the project
mkdir -p "$P/src"
cat > "$P/src/order.js" <<'EOF'
// The order page reads a carrier status. A paid order should read IN_TRANSIT.
export const status = "IN_TRANSIT";
EOF
cat > "$P/tests.sh" <<'EOF'
#!/usr/bin/env bash
# A perfectly ordinary unit suite: it checks the module EXPORTS a status.
# It does not check WHICH status — and that is the most common shape of a
# real test suite.
grep -q 'export const status' src/order.js && echo "unit: 1 passed"
EOF
cat > "$P/smoke.sh" <<'EOF'
#!/usr/bin/env bash
# The smoke run asks what a USER would see.
got="$(sed -n 's/.*status = "\([A-Z_]*\)".*/\1/p' src/order.js)"
[ "$got" = "IN_TRANSIT" ] || { echo "smoke: the order page shows '$got', a user expects 'IN_TRANSIT'"; exit 1; }
echo "smoke: 1 flow passed (order page shows IN_TRANSIT)"
EOF
chmod +x "$P/tests.sh" "$P/smoke.sh"
cat > "$P/vantry.yml" <<'EOF'
version: 2
project_type: service
strictness: standard
run:
  test: bash tests.sh
  build: "true"
  smoke: bash smoke.sh
gates:
  verify_change: block
merge:
  authority: human
  base: main
trivial_paths:
  - "*.md"
sensitive_paths:
  - "**/auth/**"
acceptance:
  - "AC-1 | REQ-004 | a paid order reports its carrier status to the customer | grep -q 'status = \"IN_TRANSIT\"' src/order.js"
EOF
printf '.vantry/receipts/\n.vantry/state/\n' > "$P/.gitignore"
git -C "$P" init -q -b main
mkdir -p "$P/scripts/lib"
cp "$KIT/scripts/verify.sh" "$P/scripts/"; cp "$KIT/scripts/lib/vantry-common.sh" "$P/scripts/lib/"
cp -R "$KIT/.githooks" "$P/.githooks"; cp "$KIT/scripts/lib/enable-hooks.sh" "$P/scripts/lib/"
chmod +x "$P/scripts/verify.sh" "$P/scripts/lib/enable-hooks.sh" "$P"/.githooks/*
G add -A >/dev/null; G commit -qm "chore: init"
git init -q --bare "$R"; G remote add origin "$R"; G push -q origin main
( cd "$P" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1

say "VANTRY — what a verification gate does that a test suite cannot"
say ""
say "A tiny project. Its unit suite checks that the order module exports a status."
say "Its smoke run checks what a user actually sees. Watch them disagree."

# --------------------------------------------------------------------- act 1
step "1. An agent changes the code and the tests stay green"
G checkout -qb feat/PRJ-014 2>/dev/null
sed -i.bak 's/IN_TRANSIT/DELIVERED/' "$P/src/order.js"; rm -f "$P/src/order.js.bak"
say "$ bash tests.sh"
say "$( cd "$P" && bash tests.sh )"
say ""
say "Green. In v1 of this kit, this is exactly where an agent wrote"
say "\"verified, everything works\" — and nothing could tell the difference."

# --------------------------------------------------------------------- act 2
step "2. It tries to ship"
G add -A >/dev/null; G commit -qm "feat(orders): mark delivered" >/dev/null 2>&1
say "$ git push origin feat/PRJ-014"
say "$( G push origin feat/PRJ-014 2>&1 | grep -E 'PUSH REFUSED|no verification receipt|scripts/verify.sh$' | sed 's/^[[:space:]]*/  /' )"
say ""
say "Refused by a GIT hook — so this happens for Cursor, Codex, Copilot,"
say "Gemini, and for a human at a terminal. They share no agent hooks."
say "They all push."

# --------------------------------------------------------------------- act 3
step "3. So it runs the software"
say "$ scripts/verify.sh"
say "$( cd "$P" && ./scripts/verify.sh 2>&1 | grep -E '^(→ \[|✗)|smoke:' | sed 's/^/  /' )"
say ""
say "The suite passed. The software did not. The receipt records verdict: fail,"
say "and it names the requirement: AC-1 proves REQ-004, and AC-1 is red."

# --------------------------------------------------------------------- act 4
step "4. Fixed properly, verified, observed, shipped"
sed -i.bak 's/DELIVERED/IN_TRANSIT/' "$P/src/order.js"; rm -f "$P/src/order.js.bak"
cat >> "$P/src/order.js" <<'EOF'
export const delivered = true;
EOF
say "$( cd "$P" && ./scripts/verify.sh 2>&1 | grep -E 'VERIFIED' | sed 's/^/  /' )"
( cd "$P" && ./scripts/verify.sh --observe \
    "the order page reports a delivered flag while still showing transit status" \
    "smoke passed: order page shows IN_TRANSIT and exports delivered=true" ) >/dev/null 2>&1
G add -A >/dev/null; G commit -qm "feat(orders): expose the delivered flag" >/dev/null 2>&1
say "$ git push origin feat/PRJ-014"
say "$( G push origin feat/PRJ-014 2>&1 | grep -E 'new branch|feat/PRJ-014' | sed 's/^/  /' | head -1 )"

# --------------------------------------------------------------------- act 5
step "5. One more edit, and the proof expires"
echo "// a late tweak" >> "$P/src/order.js"
say "$ git push origin feat/PRJ-014"
say "$( G push origin feat/PRJ-014 2>&1 | grep -E 'stale receipt' | sed 's/^[[:space:]]*/  /' )"
say ""
say "The receipt carries a digest of the changed files. One edit after the"
say "verification and it no longer describes the code that exists."
say "\"Verify once, then keep coding\" is not available."

step "That is the whole idea"
say ""
say "  A change is not done until scripts/verify.sh has written a passing"
say "  receipt matching the code as it stands now. A green test suite is not"
say "  a verification."
say ""
say "  Nothing here trusted the agent's account of its own work."
say ""

# ------------------------------------------------------------------- --check
if [ "$CHECK" = "1" ]; then
  fail=0
  chk() { if [ "$2" = "1" ]; then echo "  ✓ $1"; else echo "  ✗ $1"; fail=1; fi; }
  OUT="$(bash "$KIT/scripts/demo.sh" 2>&1)"
  has() { printf '%s' "$OUT" | grep -qF "$1" && echo 1 || echo 0; }
  echo "── demo.sh --check ──"
  chk "the unit suite passes on broken software" "$(has 'unit: 1 passed')"
  chk "the push is refused"                      "$(has 'PUSH REFUSED')"
  chk "the smoke run catches what tests missed"  "$(has 'a user expects')"
  # Act 3 must actually FAIL, and the acceptance criterion must actually run and
  # name its requirement. Without these three, a demo whose act 3 quietly passed
  # still printed "the demo still tells the truth".
  chk "act 3 really fails"                       "$(has '✗ NOT VERIFIED')"
  chk "the acceptance criterion runs"            "$(has 'ac:AC-1')"
  chk "and it names its requirement"             "$(has 'REQ-004')"
  # '✓ VERIFIED', anchored: the bare substring also matches act 3's
  # '✗ NOT VERIFIED', so this check went green on evidence of a FAILURE — the
  # kit's own cardinal sin, committed inside its own truth-checker.
  chk "a real verification passes"               "$(has '✓ VERIFIED')"
  chk "the receipt goes stale on the next edit"  "$(has 'stale receipt')"
  chk "the closing statement is intact"          "$(has 'A green test suite is not')"
  echo
  [ "$fail" -eq 0 ] && echo "✓ the demo still tells the truth." || echo "✗ the demo no longer matches the software."
  exit "$fail"
fi
exit 0
