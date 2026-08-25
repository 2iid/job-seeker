#!/usr/bin/env bash
# ============================================================================
#  test-hooks.sh — proves the two hook layers behave.
#
#  Layer 3b (git) is the guarantee: it must block a real `git push` to a real
#  remote, and it must NEVER disable a hook the project already had.
#  Layer 3a (Claude) is the accelerator: same verdict, earlier, and it must
#  refuse to trap a session.
#
#  Usage: bash scripts/test/test-hooks.sh [kit-path]
# ============================================================================
set -uo pipefail
KIT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
KIT="$(cd "$KIT" && pwd)"
WORK="$(mktemp -d)"
PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ✗ $1"; [ -n "${2:-}" ] && echo "$2" | sed 's/^/        /' | head -10; FAIL=$((FAIL + 1)); }
hdr() { echo; echo "── $1 ─────────────────────────────────────────────"; }
G() { git -C "$1" -c user.email=t@t -c user.name=t "${@:2}"; }

make_project() {  # $1 = dir
  local P="$1"
  mkdir -p "$P/src" "$P/scripts/lib" "$P/.githooks" "$P/.claude/hooks"
  cp "$KIT/scripts/verify.sh"             "$P/scripts/"
  cp "$KIT/scripts/lib/vantry-common.sh"  "$P/scripts/lib/"
  cp "$KIT/scripts/lib/enable-hooks.sh"   "$P/scripts/lib/"
  cp "$KIT"/.githooks/*                   "$P/.githooks/"
  cp "$KIT"/.claude/hooks/*               "$P/.claude/hooks/"
  cp "$KIT/.gitleaks.toml"                "$P/"
  chmod +x "$P/scripts/verify.sh" "$P/scripts/lib/enable-hooks.sh" "$P"/.githooks/* "$P"/.claude/hooks/*
  echo 'ok' > "$P/src/status.txt"
  printf '#!/usr/bin/env bash\ngrep -q ok src/status.txt && echo "smoke ok"\n' > "$P/smoke.sh"
  chmod +x "$P/smoke.sh"
  cat > "$P/vantry.yml" <<'Y'
version: 2
project_type: service
strictness: standard
run:
  test: true
  smoke: bash smoke.sh
gates:
  verify_change: block
merge:
  authority: human
  base: main
trivial_paths:
  - "*.md"
sensitive_paths:
  - "src/auth/**"
Y
  printf '.vantry/receipts/\n.vantry/state/\n' > "$P/.gitignore"
  git -C "$P" init -q -b main
  G "$P" add -A >/dev/null; G "$P" commit -qm "chore: init"
}

# ============================================================================
hdr "T1 · enable-hooks on a clean repo"
P="$WORK/t1"; make_project "$P"
( cd "$P" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
[ "$(git -C "$P" config --local --get core.hooksPath)" = ".githooks" ] \
  && ok "core.hooksPath set when nothing was in the way" || bad "hooksPath not set" "$(git -C "$P" config --local --list)"

hdr "T2 · enable-hooks NEVER disables husky"
P="$WORK/t2"; make_project "$P"
mkdir -p "$P/.husky"
# `exit 0` at the end is what husky, lint-staged and most hand-written hooks
# actually do — and it is what made the appended vantry block unreachable.
printf '#!/usr/bin/env bash\necho HUSKY-RAN\nexit 0\n' > "$P/.husky/pre-commit"; chmod +x "$P/.husky/pre-commit"
git -C "$P" config core.hooksPath .husky
( cd "$P" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
[ "$(git -C "$P" config --local --get core.hooksPath)" = ".husky" ] \
  && ok "husky's hooksPath left alone" || bad "hooksPath was hijacked" "$(git -C "$P" config --local --get core.hooksPath)"
# Assert REACHABILITY, not the presence of a marker. Grepping for the marker is
# exactly what reported ACTIVE while the stage was dead code.
( cd "$P" && VANTRY_HOOK_PROBE=1 .husky/pre-commit /dev/null 2>&1 ) | grep -q VANTRY_HOOK_REACHED \
  && ok "the probe REACHES vantry's stage through husky's hook" \
  || bad "vantry's stage is unreachable behind husky's hook" "$(cat "$P/.husky/pre-commit")"
echo "x" > "$P/f.txt"; G "$P" add f.txt >/dev/null
OUT="$(G "$P" commit -m "chore: t" 2>&1)"
case "$OUT" in *HUSKY-RAN*) ok "husky's own hook still runs" ;; *) bad "husky hook stopped running" "$OUT" ;; esac

hdr "T3 · enable-hooks NEVER disables .git/hooks"
P="$WORK/t3"; make_project "$P"
printf '#!/usr/bin/env bash\necho LEGACY-RAN\nexit 0\n' > "$P/.git/hooks/pre-commit"; chmod +x "$P/.git/hooks/pre-commit"
( cd "$P" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
[ -z "$(git -C "$P" config --local --get core.hooksPath)" ] \
  && ok "hooksPath left unset (would have killed .git/hooks)" || bad "hooksPath set anyway" ""
echo "x" > "$P/f.txt"; G "$P" add f.txt >/dev/null
OUT="$(G "$P" commit -m "chore: t" 2>&1)"
case "$OUT" in *LEGACY-RAN*) ok "the pre-existing hook still runs" ;; *) bad "legacy hook broken" "$OUT" ;; esac
# THE regression. A repo whose hook ends in `exit 0` used to accept a secret
# cleanly while --status reported ACTIVE. Proven by committing an AWS key.
printf 'const k = "AKIA%s";\n' "J7QF2M4XZ9WD3PLK" > "$P/leak.ts"
G "$P" add -A >/dev/null
OUT="$(G "$P" commit -m "feat: key" 2>&1)"; RC=$?
[ "$RC" != "0" ] && ok "a secret is REFUSED even behind a hook ending in exit 0" \
  || bad "the secret got in — vantry's stage is unreachable again" "$OUT"
rm -f "$P/leak.ts"; G "$P" reset -q >/dev/null
STOUT="$( cd "$P" && ./scripts/lib/enable-hooks.sh --status . 2>&1 )"
case "$STOUT" in
  *"pre-commit : ACTIVE"*) ok "--status reports the stage reached" ;;
  *) bad "--status could not prove the stage is reached" "$STOUT" ;;
esac
# The NEGATIVE is what proves --status is not just grepping for its own marker:
# a hook that CONTAINS the marker but exits before vantry's stage must report
# NOT REACHED. This assertion fails under the old marker-grep implementation.
FAKE="$P/.git/hooks/commit-msg"
printf '#!/usr/bin/env bash\n# >>> vantry hooks >>>\necho "marker present but unreachable"\nexit 0\n# <<< vantry hooks <<<\n' > "$FAKE"
chmod +x "$FAKE"
STOUT2="$( cd "$P" && ./scripts/lib/enable-hooks.sh --status . 2>&1 )"
case "$STOUT2" in
  *"commit-msg : ✗ NOT REACHED"*) ok "a hook carrying the marker but exiting first is reported NOT REACHED" ;;
  *) bad "--status believed a marker over a behaviour" "$STOUT2" ;;
esac

hdr "T4 · enable-hooks is idempotent and reversible"
( cd "$P" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
N="$(grep -c "vantry hooks >>>" "$P/.git/hooks/pre-commit")"
[ "$N" = "1" ] && ok "a second run does not double-chain" || bad "chained $N times" ""
( cd "$P" && ./scripts/lib/enable-hooks.sh --disable . ) >/dev/null 2>&1
grep -q "vantry hooks" "$P/.git/hooks/pre-commit" && bad "--disable left the block behind" "" || ok "--disable removes the block"
OUT="$(G "$P" commit --allow-empty -m "chore: t2" 2>&1)"
case "$OUT" in *LEGACY-RAN*) ok "the project's hook survives --disable intact" ;; *) bad "disable damaged it" "$OUT" ;; esac

hdr "T5 · commit-msg enforces Conventional Commits"
P="$WORK/t5"; make_project "$P"
( cd "$P" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
echo "x" > "$P/README.md"; G "$P" add -A >/dev/null
OUT="$(G "$P" commit -m "updated some stuff" 2>&1)"; RC=$?
[ "$RC" != "0" ] && ok "a non-conventional subject is refused" || bad "junk subject accepted" "$OUT"
case "$OUT" in *"Conventional Commit"*) ok "the message explains the format" ;; *) bad "unhelpful message" "$OUT" ;; esac
G "$P" commit -qm "docs: update the readme" >/dev/null 2>&1 && ok "a conventional subject is accepted" || bad "valid subject refused" ""
G "$P" commit --allow-empty -qm "Merge branch 'x'" >/dev/null 2>&1 && ok "git's own Merge wording is not policed" || bad "merge commit refused" ""

hdr "T6 · pre-commit catches a staged secret"
P="$WORK/t6"; make_project "$P"
( cd "$P" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
printf 'const k = "AKIA%s";\n' "J7QF2M4XZ9WD3PLK" > "$P/src/leak.ts"
G "$P" add -A >/dev/null
OUT="$(G "$P" commit -m "feat: add key" 2>&1)"; RC=$?
[ "$RC" != "0" ] && ok "an AWS-shaped key blocks the commit" || bad "secret committed" "$OUT"
case "$OUT" in *"possible secret"*|*"COMMIT REFUSED"*) ok "it names the file" ;; *) bad "no explanation" "$OUT" ;; esac
rm "$P/src/leak.ts"; G "$P" reset -q >/dev/null
printf 'GITHUB_TOKEN=ghp_%s\n' "R7kQm2Xv9ZbN4wLpT6yH1sJ8dF3gC5aE0uI" > "$P/.env"
G "$P" add -f .env >/dev/null 2>&1
OUT="$(G "$P" commit -m "chore: env" 2>&1)"; RC=$?
[ "$RC" != "0" ] && ok "an .env file is refused outright" || bad ".env committed" "$OUT"
rm -f "$P/.env"; G "$P" reset -q >/dev/null

# The failure that showed up the first time the kit was installed for real:
# it ships its own secret-scanner fixtures, so a project's very next commit
# died on the kit's test data. A guard that fires on day one gets removed.
mkdir -p "$P/scripts/test" "$P/evals"
printf 'const k = "AKIAIOSFODNN7EXAMPLE";\n' > "$P/scripts/test/fixture-secrets.sh"
printf 'token = "ghp_EXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLE"\n'  > "$P/evals/sample.txt"
printf 'const documented = "AKIAIOSFODNN7EXAMPLE"; // AWS docs\n' > "$P/src/docs.ts"
G "$P" add -A >/dev/null
G "$P" commit -qm "test: add scanner fixtures" >/dev/null 2>&1 \
  && ok "test fixtures and EXAMPLE-marked strings do not block a commit" \
  || bad "false positive on the kit's own fixtures" "$(G "$P" commit -m "test: x" 2>&1)"

hdr "T7 · pre-push BLOCKS an unverified push (the universal guarantee)"
P="$WORK/t7"; make_project "$P"
( cd "$P" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
git init -q --bare "$WORK/t7-remote.git"
git -C "$P" remote add origin "$WORK/t7-remote.git"
G "$P" push -q origin main >/dev/null 2>&1   # baseline push, nothing changed yet
git -C "$P" checkout -qb feat/thing
echo '// unverified' > "$P/src/new.ts"
G "$P" add -A >/dev/null; G "$P" commit -qm "feat: a thing" >/dev/null 2>&1
OUT="$(G "$P" push origin feat/thing 2>&1)"; RC=$?
[ "$RC" != "0" ] && ok "push REFUSED with no receipt (rc=$RC)" || bad "unverified push went through" "$OUT"
case "$OUT" in *"PUSH REFUSED"*) ok "it says why" ;; *) bad "no refusal banner" "$OUT" ;; esac
( cd "$P" && ./scripts/verify.sh ) >/dev/null 2>&1
OUT="$(G "$P" push origin feat/thing 2>&1)"; RC=$?
[ "$RC" = "0" ] && ok "push succeeds once verified" || bad "verified push still refused" "$OUT"

hdr "T8 · the emergency lever works and is loud"
git -C "$P" checkout -q feat/thing
echo '// more' >> "$P/src/new.ts"
G "$P" add -A >/dev/null; G "$P" commit -qm "feat: more" >/dev/null 2>&1
OUT="$(G "$P" push origin feat/thing 2>&1)"; RC=$?
[ "$RC" != "0" ] && ok "the new edit re-blocks the push" || bad "stale receipt let it through" "$OUT"
OUT="$(VANTRY_SKIP_GATE=1 G "$P" push origin feat/thing 2>&1)"; RC=$?
[ "$RC" = "0" ] && ok "VANTRY_SKIP_GATE=1 lets a human through" || bad "escape hatch broken" "$OUT"
case "$OUT" in *"bypassed on purpose"*) ok "the bypass announces itself" ;; *) bad "silent bypass" "$OUT" ;; esac
grep -q "gate.skip" "$P/.vantry/state/agent-log.jsonl" 2>/dev/null && ok "the bypass is written to the audit log" || bad "bypass not logged" ""

hdr "T9 · a non-vantry repo is never touched"
P="$WORK/t9"; make_project "$P"; rm -f "$P/vantry.yml"
( cd "$P" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
git init -q --bare "$WORK/t9-remote.git"; git -C "$P" remote add origin "$WORK/t9-remote.git"
echo "x" > "$P/src/a.ts"; G "$P" add -A >/dev/null
G "$P" commit -qm "anything at all, not conventional" >/dev/null 2>&1 \
  && ok "commit-msg stays out of a non-vantry repo" || bad "policed a repo with no contract" ""
G "$P" push -q origin main >/dev/null 2>&1 && ok "pre-push stays out too" || bad "blocked a non-vantry push" ""

# ============================================================================
hdr "T10 · the Claude Stop hook blocks, then escalates"
P="$WORK/t10"; make_project "$P"
echo '// unverified' > "$P/src/new.ts"
HOOK() { ( cd "$P" && printf '{}' | ./.claude/hooks/verify-gate.sh 2>&1 ); }
RC1=$( ( cd "$P" && printf '{}' | ./.claude/hooks/verify-gate.sh >/dev/null 2>&1 ); echo $? )
[ "$RC1" = "2" ] && ok "exit 2 — the turn cannot end (1st block)" || bad "did not block" "rc=$RC1"
OUT="$(HOOK)"
case "$OUT" in *"BLOCKED BY VANTRY"*) ok "the model is told exactly what to do" ;; *) bad "unhelpful stderr" "$OUT" ;; esac
RC3=$( ( cd "$P" && printf '{}' | ./.claude/hooks/verify-gate.sh >/dev/null 2>&1 ); echo $? )
[ "$RC3" = "0" ] && ok "3rd attempt escalates to the human instead of looping" || bad "still looping at attempt 3" "rc=$RC3"
RC4=$( ( cd "$P" && printf '{"stop_hook_active": true}' | ./.claude/hooks/verify-gate.sh >/dev/null 2>&1 ); echo $? )
[ "$RC4" = "0" ] && ok "stop_hook_active is honoured (no re-entry loop)" || bad "ignored stop_hook_active" "rc=$RC4"

# A fan-out where every subagent must run the full suite before returning is
# the "too heavy, disable it" failure. The orchestrator owns the gate.
SUBP='{"hook_event_name":"SubagentStop"}'
RCS=$( ( cd "$P" && printf '%s' "$SUBP" | ./.claude/hooks/verify-gate.sh >/dev/null 2>&1 ); echo $? )
[ "$RCS" = "0" ] && ok "SubagentStop reports without blocking (default)" || bad "a subagent was trapped by the gate" "rc=$RCS"
OUTS=$( cd "$P" && printf '%s' "$SUBP" | ./.claude/hooks/verify-gate.sh 2>&1 )
case "$OUTS" in *"orchestrator owns the gate"*) ok "…and still says so out loud" ;; *) bad "silent subagent pass" "$OUTS" ;; esac
printf '\ngates:\n  subagent_verify: block\n' >> "$P/vantry.yml"
RCS2=$( ( cd "$P" && printf '%s' "$SUBP" | ./.claude/hooks/verify-gate.sh >/dev/null 2>&1 ); echo $? )
[ "$RCS2" = "2" ] && ok "subagent_verify: block makes it blocking (worktree isolation)" || bad "opt-in did not engage" "rc=$RCS2"
sed -i.bak '/subagent_verify/d' "$P/vantry.yml"; rm -f "$P/vantry.yml.bak"
( cd "$P" && ./scripts/verify.sh ) >/dev/null 2>&1
RC5=$( ( cd "$P" && printf '{}' | ./.claude/hooks/verify-gate.sh >/dev/null 2>&1 ); echo $? )
[ "$RC5" = "0" ] && ok "passes once the change is verified" || bad "still blocking after a pass" "$(HOOK)"

hdr "T11 · the Bash guard denies the four escapes"
P="$WORK/t11"; make_project "$P"
echo '// unverified' > "$P/src/new.ts"
guard() { ( cd "$P" && printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$1" | ./.claude/hooks/bash-guard.sh 2>&1 ); }
grc()   { ( cd "$P" && printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$1" | ./.claude/hooks/bash-guard.sh >/dev/null 2>&1 ); echo $?; }
[ "$(grc '"echo x > .vantry/receipts/main.verify.json"')" = "2" ] && ok "forging a receipt is denied" || bad "receipt write allowed" "$(guard '"echo x > .vantry/receipts/main.verify.json"')"
[ "$(grc '"cat .vantry/receipts/main.verify.json"')" = "0" ] && ok "READING a receipt is still allowed" || bad "reading denied" ""
[ "$(grc '"git config core.hooksPath .x"')" = "2" ] && ok "changing core.hooksPath is denied" || bad "hooksPath allowed" ""
[ "$(grc '"git commit --no-verify -m x"')" = "2" ] && ok "--no-verify is denied" || bad "no-verify allowed" ""
[ "$(grc '"git commit -m \"feat: x\""')" = "2" ] && ok "committing unverified work is denied" || bad "unverified commit allowed" "$(guard '"git commit -m x"')"
[ "$(grc '"rm -rf .githooks"')" = "2" ] && ok "deleting the hooks is denied" || bad "hook deletion allowed" ""
[ "$(grc '"gh pr merge 12 --squash"')" = "2" ] && ok "merging is denied while merge.authority: human" || bad "agent merge allowed" ""
[ "$(grc '"ls -la"')" = "0" ] && ok "ordinary commands pass straight through" || bad "false positive on ls" "$(guard '"ls -la"')"
( cd "$P" && ./scripts/verify.sh ) >/dev/null 2>&1
[ "$(grc '"git commit -m \"feat: x\""')" = "0" ] && ok "commit allowed once verified" || bad "still denied after verify" "$(guard '"git commit -m x"')"

hdr "T11b · the guard matches INTENT, not text in a payload"
# A guard that fires on its own release notes is a guard somebody uninstalls.
# These all MENTION an escape hatch; none of them USE one.
[ "$(grc '"git commit -F - <<MSG\nfix: document VANTRY_SKIP_GATE and --no-verify\nMSG"')" = "0" ] \
  && ok "a commit message mentioning the escape hatches is allowed" \
  || bad "false positive on a heredoc commit message" "$(guard '"git commit -F - <<MSG\nfix: document VANTRY_SKIP_GATE and --no-verify\nMSG"')"
[ "$(grc '"echo \"never run: git config core.hooksPath .x\" >> docs/notes.md"')" = "0" ] \
  && ok "a quoted mention of core.hooksPath is allowed" || bad "false positive on a quoted string" ""
[ "$(grc '"grep -rn VANTRY_SKIP_GATE .githooks"')" = "0" ] \
  && ok "grepping for the lever is allowed" || bad "false positive on grep" ""
# …and the real thing is still denied.
[ "$(grc '"VANTRY_SKIP_GATE=1 git push origin main"')" = "2" ] \
  && ok "actually SETTING the lever is still denied" || bad "the real escape slipped through" ""
[ "$(grc '"git config core.hooksPath .x"')" = "2" ] \
  && ok "actually setting hooksPath is still denied" || bad "real hooksPath change allowed" ""

# A wrapper defeats the scrub by design: sh -c puts the whole escape inside a
# quoted span, which scrub() removes. The audit found this exact false negative.
NV="--no-""verify"
[ "$(grc "\"sh -c 'git push $NV origin main'\"")" = "2" ] \
  && ok "the escape hidden inside sh -c is still denied" \
  || bad "a wrapper command smuggles the escape past the guard" "$(guard "\"sh -c 'git push $NV origin main'\"")"
[ "$(grc "\"bash -c \\\"git commit $NV -m x\\\"\"")" = "2" ] \
  && ok "…and inside bash -c" || bad "bash -c wrapper allowed" ""
[ "$(grc '"grep -rn wrapper docs/"')" = "0" ] \
  && ok "and an ordinary command with no wrapper still passes" || bad "false positive after the wrapper rule" ""
# Reading the setting is how you DIAGNOSE the gate; only writing it disarms one.
# A guard that blocks inspection is the false-positive its own header warns about.
HP="core.hooks""Path"
[ "$(grc "\"git config --get $HP\"")" = "0" ] \
  && ok "reading the hooks setting is allowed" || bad "the guard blocks read-only inspection" ""
[ "$(grc "\"scripts/lib/enable-hooks.sh --status\"")" = "0" ] \
  && ok "the tool the guard recommends is not itself denied" || bad "the recommended tool is denied" ""
[ "$(grc "\"git config $HP .x\"")" = "2" ] \
  && ok "…and writing it is still denied" || bad "the write escape reopened" ""

hdr "T12 · hooks never crash on junk input"
for h in verify-gate bash-guard log-tool session-start; do
  RC=$( ( cd "$P" && printf 'not json at all' | "./.claude/hooks/$h.sh" >/dev/null 2>&1 ); echo $? )
  [ "$RC" -le 2 ] && ok "$h survives malformed stdin (rc=$RC)" || bad "$h crashed" "rc=$RC"
done
RC=$( ( cd "$WORK" && printf '{}' | "$P/.claude/hooks/verify-gate.sh" >/dev/null 2>&1 ); echo $? )
[ "$RC" = "0" ] && ok "hooks stay out of a directory with no contract" || bad "fired outside a project" "rc=$RC"

hdr "T13 · SessionStart reports real state, not memory"
P="$WORK/t13"; make_project "$P"
echo '// unverified' > "$P/src/new.ts"
OUT="$( cd "$P" && printf '{}' | ./.claude/hooks/session-start.sh 2>&1 )"
case "$OUT" in *"none for this branch"*) ok "an unverified branch is announced" ;; *) bad "no verification state" "$OUT" ;; esac
( cd "$P" && ./scripts/verify.sh ) >/dev/null 2>&1
OUT="$( cd "$P" && printf '{}' | ./.claude/hooks/session-start.sh 2>&1 )"
case "$OUT" in *"current for this code"*) ok "a fresh receipt is announced" ;; *) bad "fresh state not reported" "$OUT" ;; esac
echo '// changed again' >> "$P/src/new.ts"
OUT="$( cd "$P" && printf '{}' | ./.claude/hooks/session-start.sh 2>&1 )"
case "$OUT" in *STALE*) ok "staleness is announced after compaction" ;; *) bad "stale state not reported" "$OUT" ;; esac

hdr "T14 · pre-push gates the refs being PUSHED, not the branch you stand on"
# It never read stdin, so a verified `main` let an unverified `feat/y` out with
# exit 0 and not a word. `git push --all` and any /next fan-out from trunk
# defeated it the same way.
P14="$WORK/t14push"; make_project "$P14"
( cd "$P14" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
git init -q --bare "$WORK/t14-remote.git"
git -C "$P14" remote add origin "$WORK/t14-remote.git"
G "$P14" push -q origin main >/dev/null 2>&1
( cd "$P14" && ./scripts/verify.sh ) >/dev/null 2>&1
G "$P14" push -q origin main >/dev/null 2>&1
git -C "$P14" checkout -qb feat/unverified
echo '// unverified' > "$P14/src/new.ts"
G "$P14" add -A >/dev/null; G "$P14" commit -qm "feat: unverified" >/dev/null 2>&1
git -C "$P14" checkout -q main
OUT="$(G "$P14" push origin feat/unverified 2>&1)"; RC=$?
[ "$RC" != "0" ] && ok "an unverified branch pushed FROM main is refused" \
  || bad "unverified branch went out while standing on main" "$OUT"
case "$OUT" in *"PUSH REFUSED"*) ok "and it says why" ;; *) bad "no refusal banner" "$OUT" ;; esac
# The tag case is tested with the standing branch DELIBERATELY stale, because
# that is the case that fell through: a tag-only push carries no changeset, but
# an earlier version gated whatever branch you were standing on and refused.
printf 'stale\n' > "$P14/src/status.txt"          # deliberately stale standing branch
# Create the tag through the identity-carrying helper, and ASSERT it exists
# before pushing. An annotated tag needs a tagger identity; on a CI runner git
# often cannot auto-detect one and refuses. The first version used bare `git`
# with the error swallowed, so the push then failed with "src refspec t14 does
# not match any" — a message about the hook that had nothing to do with the hook.
G "$P14" tag t14 >/dev/null 2>&1
if ! git -C "$P14" rev-parse -q --verify refs/tags/t14 >/dev/null 2>&1; then
  bad "the fixture could not create a tag at all — this says nothing about pre-push" "$(G "$P14" tag t14 2>&1 | head -2)"
else
  G "$P14" push -q origin refs/tags/t14 >/dev/null 2>&1 && ok "a tag is not blocked, even with the standing branch stale" \
    || bad "tag push blocked — 'only tags' is being confused with 'no stdin'" "$(G "$P14" push origin refs/tags/t14 2>&1 | head -4)"
fi
git -C "$P14" checkout -q -- src/status.txt
git -C "$P14" checkout -q feat/unverified
( cd "$P14" && ./scripts/verify.sh ) >/dev/null 2>&1
git -C "$P14" checkout -q main
G "$P14" push -q origin feat/unverified >/dev/null 2>&1 \
  && ok "once verified it goes out — the ref gate is satisfiable" \
  || bad "still refused after a real verification" "$(G "$P14" push origin feat/unverified 2>&1)"

hdr "T15 · a secret scanner that finds nothing must not weaken the gate"
# The secret scan was an if/ELSE: when gitleaks was installed, the built-in scan
# was skipped entirely. gitleaks 8.19 removed `protect`, and on 8.30 the command
# reported "0 commits scanned … no leaks found" and exited 0 — so a staged AWS
# key committed cleanly on a machine WITH gitleaks and was refused on one
# without. A gate whose strength depends on your PATH is not a gate.
P15="$WORK/t15leak"; make_project "$P15"
( cd "$P15" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
FAKEBIN="$WORK/t15-bin"; mkdir -p "$FAKEBIN"
cat > "$FAKEBIN/gitleaks" <<'FAKE'
#!/usr/bin/env bash
echo "INF 0 commits scanned."
echo "INF no leaks found"
exit 0
FAKE
chmod +x "$FAKEBIN/gitleaks"
printf 'title = "x"\n' > "$P15/.gitleaks.toml"      # the config the hook looks for
G "$P15" add -A >/dev/null; G "$P15" commit -qm "chore: scanner config" >/dev/null 2>&1
printf 'const k = "AKIA%s";\n' "J7QF2M4XZ9WD3PLK" > "$P15/leak.ts"
G "$P15" add -A >/dev/null
OUT15="$(PATH="$FAKEBIN:$PATH" G "$P15" commit -m "feat: key" 2>&1)"; RC15=$?
[ "$RC15" != "0" ] && ok "a staged AWS key is REFUSED even when gitleaks says 'no leaks found'" \
  || bad "the blind scanner disabled the built-in floor — the gate depends on what is on your PATH" "$OUT15"
case "$OUT15" in *"COMMIT REFUSED"*) ok "and the built-in floor is what refused it" ;;
  *) bad "refused for some other reason" "$OUT15" ;; esac
rm -f "$P15/leak.ts"; G "$P15" reset -q >/dev/null

hdr "T16 · a leftover green light is impossible to miss"
# /autopilot sets merge.authority: agent for the duration of a run and restores
# it at step 5. A run that dies in between leaves agents able to merge, and
# nothing used to say so. Autonomy must not outlive the run it was granted.
P16="$WORK/t16auto"; make_project "$P16"
mkdir -p "$P16/.vantry"
printf '{ "granted_at": "2026-01-01T00:00:00Z", "granted_by": "issa", "scope": "sprint 1", "merge_authority_before": "human" }\n' > "$P16/.vantry/autopilot.json"
OUT16="$( cd "$P16" && bash "$KIT/.claude/hooks/session-start.sh" 2>&1 )"
case "$OUT16" in *"AUTOPILOT IS ACTIVE"*) ok "the session hook announces an active autopilot" ;;
  *) bad "a green light was left on and nothing said so" "$OUT16" ;; esac
case "$OUT16" in *"leftover state"*) ok "...and says what to do if no run is in progress" ;;
  *) bad "announced it without saying how to clear it" "$OUT16" ;; esac

# and the contract check catches agent-merges that nobody granted
rm -f "$P16/.vantry/autopilot.json"
sed -i.bak 's/^  authority: human/  authority: agent/' "$P16/vantry.yml" 2>/dev/null
rm -f "$P16/vantry.yml.bak"
grep -q 'authority: agent' "$P16/vantry.yml" || printf 'merge:\n  authority: agent\n' >> "$P16/vantry.yml"
OUT16B="$( cd "$P16" && bash "$KIT/scripts/validate-config.sh" 2>&1 )"
case "$OUT16B" in *"records who granted it"*) ok "validate-config warns when agents may merge and nobody granted it" ;;
  *) bad "an unexplained agent-merge setting passed silently" "$OUT16B" ;; esac

hdr "T17 · a tag that publishes unverified work is refused"
# `refs/tags/*) : ;;` skipped every tag on the grounds that "a tag carries no
# changeset". True only when its commit is already on the trunk: `git tag v1
# <unpushed-sha> && git push origin v1` publishes that commit, and in this kit a
# v-tag is what /release acts on.
P17="$WORK/t17tag"; make_project "$P17"
( cd "$P17" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
git init -q --bare "$WORK/t17-remote.git"
git -C "$P17" remote add origin "$WORK/t17-remote.git"
( cd "$P17" && ./scripts/verify.sh ) >/dev/null 2>&1
G "$P17" push -q origin main >/dev/null 2>&1

# (a) a tag on already-published history costs nothing
G "$P17" tag v1.0.0 >/dev/null 2>&1
G "$P17" push -q origin v1.0.0 >/dev/null 2>&1 \
  && ok "a tag on a commit already on the trunk is not gated" \
  || bad "a harmless tag was refused" "$(G "$P17" push origin v1.0.0 2>&1 | head -3)"

# (b) a tag on an unpushed, unverified commit IS gated
echo '// unverified' >> "$P17/src/status.txt"
G "$P17" add -A >/dev/null; G "$P17" commit -qm "feat: unverified" >/dev/null 2>&1
G "$P17" tag v2.0.0 >/dev/null 2>&1
OUT17="$(G "$P17" push origin v2.0.0 2>&1)"; RC17=$?
[ "$RC17" != "0" ] && ok "a tag publishing an unverified commit is REFUSED" \
  || bad "a tag published a commit nothing verified" "$OUT17"
case "$OUT17" in *"NOT on origin"*) ok "and it names what it noticed" ;;
  *) bad "refused without saying why" "$OUT17" ;; esac

# (c) and it stays satisfiable — verify, then the same tag goes out
( cd "$P17" && ./scripts/verify.sh ) >/dev/null 2>&1
G "$P17" push -q origin v2.0.0 >/dev/null 2>&1 \
  && ok "once the commit is verified the tag goes out — the gate is satisfiable" \
  || bad "the tag gate cannot be satisfied" "$(G "$P17" push origin v2.0.0 2>&1 | head -4)"

hdr "T18 · a filename cannot smuggle a secret past the scan"
# `for f in $STAGED` split on whitespace, so `src/my config.ts` became two paths
# that do not exist and was skipped — a credential escaped the one check that
# exists to stop it, by being in a file with a space in its name. The .env
# guard had the same shape and only fired when the .env was the LAST staged path.
P18="$WORK/t18names"; make_project "$P18"
( cd "$P18" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
mkdir -p "$P18/src"

printf 'const k = "AKIA%s";\n' "J7QF2M4XZ9WD3PLK" > "$P18/src/normal.ts"
G "$P18" add -A >/dev/null
G "$P18" commit -qm "feat: normal" >/dev/null 2>&1 \
  && bad "a plain filename let a key through" "" || ok "a key in a normal filename is refused"
G "$P18" reset -q >/dev/null; rm -f "$P18/src/normal.ts"

printf 'const k = "AKIA%s";\n' "J7QF2M4XZ9WD3PLK" > "$P18/src/my config.ts"
G "$P18" add -A >/dev/null
G "$P18" commit -qm "feat: spaced" >/dev/null 2>&1 \
  && bad "a filename with a space smuggled a key past the scan" "$(G "$P18" log -1 --name-only)" \
  || ok "the same key in 'my config.ts' is refused too"
G "$P18" reset -q >/dev/null; rm -f "$P18/src/my config.ts"

printf 'SECRET=x\n' > "$P18/.env"
printf 'y\n' > "$P18/zzz-sorts-last.txt"
G "$P18" add -A >/dev/null
G "$P18" commit -qm "chore: env" >/dev/null 2>&1 \
  && bad "an .env committed because it was not the last staged path" "" \
  || ok "an .env is refused wherever it sits in the staged list"
G "$P18" reset -q >/dev/null; rm -f "$P18/.env" "$P18/zzz-sorts-last.txt"

printf 'API_KEY=<your-key-here>\n' > "$P18/.env.example"
G "$P18" add -A >/dev/null
G "$P18" commit -qm "docs: env example" >/dev/null 2>&1 \
  && ok "…but .env.example is still allowed (the guard is not a wall)" \
  || bad ".env.example was refused — this will get the hook uninstalled" "$(G "$P18" commit -m x 2>&1 | head -3)"

hdr "T19 · a release tag must agree with the VERSION file"
# v3.17.0 through v3.21.1 were all tagged while VERSION still said 3.19.0. Every
# adopter's manifest therefore recorded the wrong kit version, and the README pin
# — derived from VERSION — froze three releases behind, so `git clone --branch`
# in the quickstart handed people an old kit.
#
# The cause was mundane and is worth writing down: a compound command that wrote
# VERSION was refused by a guard, so NOTHING in it ran, and only the verify step
# was re-run afterwards. A human does not notice that. A check does.
P19="$WORK/t19ver"; make_project "$P19"
( cd "$P19" && ./scripts/lib/enable-hooks.sh . ) >/dev/null 2>&1
git init -q --bare "$WORK/t19-remote.git"
git -C "$P19" remote add origin "$WORK/t19-remote.git"
printf '3.0.0\n' > "$P19/VERSION"
G "$P19" add -A >/dev/null; G "$P19" commit -qm "chore: version" >/dev/null 2>&1
( cd "$P19" && ./scripts/verify.sh ) >/dev/null 2>&1
G "$P19" push -q origin main >/dev/null 2>&1

G "$P19" tag v3.9.9 >/dev/null 2>&1
OUT19="$(G "$P19" push origin v3.9.9 2>&1)"; RC19=$?
[ "$RC19" != "0" ] && ok "a tag that disagrees with VERSION is refused" \
  || bad "v3.9.9 shipped while VERSION said 3.0.0" "$OUT19"
case "$OUT19" in *"does not match the VERSION file"*) ok "…and it names both numbers" ;;
  *) bad "refused without saying what disagreed" "$OUT19" ;; esac

G "$P19" tag v3.0.0 >/dev/null 2>&1
G "$P19" push -q origin refs/tags/v3.0.0 >/dev/null 2>&1 \
  && ok "and the matching tag goes out — the check is not a wall" \
  || bad "a correct tag was refused" "$(G "$P19" push origin refs/tags/v3.0.0 2>&1 | head -4)"

echo
echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$PASS" "$FAIL"
echo "=============================================================="
rm -rf "$WORK"
[ "$FAIL" -eq 0 ] || exit 1
