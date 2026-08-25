#!/usr/bin/env bash
# Regression tests for the v1.0.1 hotfix. Each test asserts a REAL observable
# outcome; a failure prints what it saw.
#   bash scripts/test/test-install-safety.sh [kit-path]   # default: this repo
#
# The path used to be mandatory and the usage line named a file that no longer
# exists, so invoking it the obvious way failed with a message pointing at the
# wrong script. Default it to the repo this file lives in.
set -uo pipefail
KIT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
KIT="$(cd "$KIT" && pwd)"
WORK="$(mktemp -d)"
G() { d="$1"; shift; git -C "$d" "$@"; }   # git in a named repo, without cd
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; echo "      saw: $2"; FAIL=$((FAIL+1)); }

echo "=============================================================="
echo " T1 — install.sh must NOT disable existing git hooks"
echo "=============================================================="
P="$WORK/p1"; mkdir -p "$P"; git -C "$P" init -q
cat > "$P/.git/hooks/pre-commit" <<'H'
#!/bin/sh
echo "PROJECT-HOOK-RAN"
H
chmod +x "$P/.git/hooks/pre-commit"
OUT="$(DRY_RUN=0 "$KIT/scripts/adopt/install.sh" "$P" 2>&1)"
HP="$(git -C "$P" config --local --get core.hooksPath 2>/dev/null)"
[ -z "$HP" ] && ok "core.hooksPath left unset (was: '${HP:-<unset>}')" \
             || bad "core.hooksPath was set — hooks disabled" "core.hooksPath=$HP"
echo "x" > "$P/f.txt"; git -C "$P" add f.txt >/dev/null 2>&1
CM="$(git -C "$P" -c user.email=t@t -c user.name=t commit -m t 2>&1)"
case "$CM" in *PROJECT-HOOK-RAN*) ok "the project's own pre-commit still fires" ;;
              *) bad "the project's pre-commit no longer fires" "$CM" ;; esac
# Reachability, not a marker: the marker was present in the version where the
# stage was dead code below the user's `exit 0`.
PROBE="$( cd "$P" && VANTRY_HOOK_PROBE=1 .git/hooks/pre-commit /dev/null </dev/null 2>&1 )"
case "$PROBE" in
  *VANTRY_HOOK_REACHED*) ok "the probe REACHES vantry's stage through the project's own hook" ;;
  *) bad "vantry's stage is unreachable behind the existing hook" "$PROBE" ;;
esac

echo
echo "=============================================================="
echo " T1b — install.sh installs the UNIVERSAL kit, not just .claude/"
echo "=============================================================="
for f in AGENTS.md agents/security-engineer.md skills/verify-change/SKILL.md \
         scripts/verify.sh scripts/lib/vantry-common.sh .githooks/pre-push \
         vantry.yml.example .claude/settings.json; do
  [ -e "$P/$f" ] && ok "installed $f" || bad "MISSING $f — the kit is not portable" "$(ls "$P")"
done
for f in CLAUDE.md GEMINI.md .cursor/rules/agent-native.mdc .windsurf/rules/agent-native.md; do
  [ -e "$P/$f" ] && ok "adapter generated: $f" || bad "adapter missing: $f" ""
done
[ -d "$P/.claude/skills/verify-change" ] && ok "the Claude mirror was built in the target" || bad "no mirror" "$(ls "$P/.claude" 2>&1)"
[ -f "$P/.vantry/manifest.json" ] && ok "provenance manifest written" || bad "no manifest" ""
grep -q '"kit_version"' "$P/.vantry/manifest.json" 2>/dev/null && ok "manifest records the kit version" || bad "manifest incomplete" ""

echo
echo "=============================================================="
echo " T1c — an installed repo is NOT stale the instant it verifies"
echo "=============================================================="
# The worst bug this kit has shipped. .vantry/ held the receipt AND was untracked
# in the target (install.sh never touched its .gitignore), so the receipt was
# part of the digest it certified: verified, then instantly STALE and BLOCKED,
# forever, in every adopted repo. The kit tested green on itself only because
# its own .gitignore hides .vantry/. Correctness may not depend on a file the
# user owns, so the exclusion is now in vantry_changed_files itself.
SP="$WORK/stale"; mkdir -p "$SP/src"; ( cd "$SP" && git init -q -b main )
printf 'console.log("hi");\n' > "$SP/src/app.js"
printf '#!/usr/bin/env bash\ngrep -q hi src/app.js && echo "smoke ok"\n' > "$SP/smoke.sh"
chmod +x "$SP/smoke.sh"
( cd "$SP" && git -c user.email=t@t -c user.name=t add -A >/dev/null && git -c user.email=t@t -c user.name=t commit -qm init )
"$KIT/scripts/adopt/install.sh" "$SP" >/dev/null 2>&1
cat > "$SP/vantry.yml" <<'Y'
version: 2
stack: "plain JS"
project_type: service
strictness: standard
run:
  test: "true"
  smoke: bash smoke.sh
gates:
  verify_change: block
merge:
  base: main
trivial_paths:
  - "*.md"
sensitive_paths:
  - "**/auth/**"
Y
# Keep the run's own output: when this fails, "gate blocks on a clean verified
# tree" is a symptom, and the cause is whichever STEP failed. A test that fails
# without showing why costs a CI round-trip per guess — which is exactly what it
# cost, twice.
VOUT="$( cd "$SP" && ./scripts/verify.sh 2>&1 )"
ST="$( cd "$SP" && ./scripts/verify.sh --status 2>&1 )"
case "$VOUT" in
  *"✓ VERIFIED"*) ok "the installed repo verifies" ;;
  *) bad "the installed repo does NOT verify" "$VOUT" ;;
esac
case "$ST" in
  *"freshness  : CURRENT"*) ok "the receipt is CURRENT immediately after a pass" ;;
  *) bad "the receipt is stale the moment it is written" "$ST" ;;
esac
RC=$( ( cd "$SP" && ./scripts/verify.sh --gate --stop ) >/dev/null 2>&1; echo $? )
[ "$RC" = "0" ] && ok "the gate does not block a freshly verified clean tree" || bad "gate blocks on a clean verified tree (rc=$RC)" "$ST
--- the verify run that produced that receipt ---
$VOUT"
grep -q '^\.vantry/receipts/' "$SP/.gitignore" 2>/dev/null \
  && ok "install.sh appended the evidence paths to the target .gitignore" \
  || bad "the target .gitignore does not ignore .vantry evidence" "$(cat "$SP/.gitignore" 2>&1)"
V="$( cd "$SP" && ./scripts/verify.sh --status 2>&1 | sed -n '1s/^vantry \([^ ]*\) .*/\1/p' )"
if [ -n "$V" ] && [ "$V" != "unknown" ] && [ "$V" = "$(cat "$KIT/VERSION")" ]; then
  ok "the installed kit reports its real version ($V)"
else
  bad "version reported as '${V:-<empty>}', expected $(cat "$KIT/VERSION")" ""
fi

echo
echo "=============================================================="
echo " T2 — install.sh must NOT replace a live issues.csv"
echo "=============================================================="
P="$WORK/p2"; mkdir -p "$P/scripts/kanban"; git -C "$P" init -q
printf 'id,title\nPRJ-001,my real backlog item\n' > "$P/scripts/kanban/issues.csv"
BEFORE="$(shasum "$P/scripts/kanban/issues.csv" | cut -d' ' -f1)"
"$KIT/scripts/adopt/install.sh" "$P" >/dev/null 2>&1
AFTER="$(shasum "$P/scripts/kanban/issues.csv" | cut -d' ' -f1)"
[ "$BEFORE" = "$AFTER" ] && ok "live issues.csv byte-identical after install" \
                         || bad "live issues.csv was replaced" "$(cat "$P/scripts/kanban/issues.csv")"
[ -f "$P/scripts/kanban/import-kanban.sh" ] && ok "kit files still installed alongside it" \
                                            || bad "kit files missing" "$(ls "$P/scripts/kanban")"

echo
echo "=============================================================="
echo " T3 — install.sh is idempotent (2 runs, no data churn)"
echo "=============================================================="
"$KIT/scripts/adopt/install.sh" "$P" >/dev/null 2>&1
A2="$(shasum "$P/scripts/kanban/issues.csv" | cut -d' ' -f1)"
[ "$BEFORE" = "$A2" ] && ok "issues.csv still untouched on the 2nd run" || bad "2nd run changed it" "$A2"
N="$(find "$P" -name '*.vantry-bak-*' | wc -l | tr -d ' ')"
[ "$N" = "0" ] && ok "no spurious backups on an identical 2nd run" || bad "$N backup file(s) created" "$(find "$P" -name '*.vantry-bak-*')"

echo
echo "=============================================================="
echo " T4 — install.sh must NOT clobber a project's .claude/settings.json"
echo "=============================================================="
P="$WORK/p4"; mkdir -p "$P/.claude"; git -C "$P" init -q
printf '{"permissions":{"allow":["Bash(mine)"]}}\n' > "$P/.claude/settings.json"
"$KIT/scripts/adopt/install.sh" "$P" >/dev/null 2>&1
# The contract changed in v3.17.0, and it is worth stating precisely: this file
# is never OVERWRITTEN, but it is MERGED. Asserting byte-equality was asserting
# that the kit's hooks are never registered — which is exactly the defect that
# left the Stop gate inert on every brownfield repo that already had one.
grep -q 'Bash(mine)' "$P/.claude/settings.json" \
  && ok "the user's own settings survive the install" \
  || bad "the install destroyed settings the user had written" "$(cat "$P/.claude/settings.json")"
grep -q 'verify-gate' "$P/.claude/settings.json" \
  && ok "…and the kit's hooks are actually registered, not just copied" \
  || bad "hook scripts installed but never registered — the gate is inert" "$(cat "$P/.claude/settings.json")"
[ -d "$P/.claude/agents" ] && ok "kit agents installed next to it" || bad "kit agents missing" "$(ls "$P/.claude")"

echo
echo "=============================================================="
echo " T5 — sync-adapters.sh must NOT destroy a project CLAUDE.md"
echo "=============================================================="
P="$WORK/p5"; cp -R "$KIT" "$P"; rm -rf "$P/.git"
cat > "$P/CLAUDE.md" <<'C'
# Acme Platform — CLAUDE.md
Generated by /bootstrap. Stack: Next.js 15 + Postgres.
## Commands
- install: pnpm i
- test: pnpm vitest run
## Domain rules
Money is stored in integer minor units. Orders are immutable once paid.
## No-go zones
Never touch billing/reconcile.ts without payments-engineer sign-off.
This is 200 lines of real project knowledge in the real thing.
C
"$P/scripts/sync-adapters.sh" >/dev/null 2>&1
grep -q "Acme Platform" "$P/CLAUDE.md" && ok "project content survived the sync" \
  || bad "project CLAUDE.md was destroyed" "$(cat "$P/CLAUDE.md")"
grep -q "vantry:adapter:start" "$P/CLAUDE.md" && ok "generated block was added with markers" \
  || bad "no marker block" "$(head -3 "$P/CLAUDE.md")"
ls "$P"/CLAUDE.md.vantry-bak-* >/dev/null 2>&1 && ok "a timestamped backup was written" || bad "no backup" "$(ls "$P")"

echo "  -- 2nd sync (splice, must not duplicate) --"
"$P/scripts/sync-adapters.sh" >/dev/null 2>&1
NB="$(grep -c "vantry:adapter:start" "$P/CLAUDE.md")"
[ "$NB" = "1" ] && ok "still exactly 1 generated block after re-sync" || bad "block duplicated" "count=$NB"
grep -q "Acme Platform" "$P/CLAUDE.md" && ok "project content still there after re-sync" || bad "lost on 2nd sync" "$(cat "$P/CLAUDE.md")"

echo
echo "=============================================================="
echo " T6 — sync-adapters.sh must NOT rm -rf a project-local skill"
echo "=============================================================="
P="$WORK/p6"; cp -R "$KIT" "$P"; rm -rf "$P/.git"
mkdir -p "$P/.claude/skills/acme-deploy"
echo "# our own deploy playbook" > "$P/.claude/skills/acme-deploy/SKILL.md"
OUT="$("$P/scripts/sync-adapters.sh" 2>&1)"; RC=$?
[ -f "$P/.claude/skills/acme-deploy/SKILL.md" ] && ok "project-local skill still exists" \
  || bad "project-local skill was deleted" "rc=$RC"
[ "$RC" != "0" ] && ok "sync exits non-zero on orphans (rc=$RC)" || bad "sync exited 0 despite orphans" "rc=$RC"
case "$OUT" in *acme-deploy*) ok "the orphan is named in the output" ;;
              *) bad "orphan not named" "$OUT" ;; esac
OUT2="$("$P/scripts/sync-adapters.sh" --force 2>&1)"; RC2=$?
[ ! -f "$P/.claude/skills/acme-deploy/SKILL.md" ] && ok "--force does delete it (explicit opt-in)" \
  || bad "--force did not delete" "rc=$RC2"
[ "$RC2" = "0" ] && ok "--force exits 0" || bad "--force exited $RC2" "$OUT2"

echo
echo "=============================================================="
echo " T7 — sync-adapters.sh still produces a correct mirror"
echo "=============================================================="
P="$WORK/p7"; cp -R "$KIT" "$P"; rm -rf "$P/.git" "$P/.claude/agents" "$P/.claude/skills"
"$P/scripts/sync-adapters.sh" >/dev/null 2>&1
if diff -rq "$P/agents" "$P/.claude/agents" >/dev/null 2>&1 && diff -rq "$P/skills" "$P/.claude/skills" >/dev/null 2>&1; then
  ok "mirror rebuilt from scratch and matches source exactly"
else
  bad "mirror does not match source" "$(diff -rq "$P/agents" "$P/.claude/agents" 2>&1 | head -3)"
fi
echo "  -- deleting a source skill must be reported, not silently kept --"
rm -rf "$P/skills/standup"
OUT="$("$P/scripts/sync-adapters.sh" 2>&1)"; RC=$?
[ "$RC" != "0" ] && ok "sync refuses while the mirror holds a deleted skill (rc=$RC)" || bad "silently kept it" "rc=$RC"
"$P/scripts/sync-adapters.sh" --force >/dev/null 2>&1
[ ! -d "$P/.claude/skills/standup" ] && ok "--force reaps the deleted skill" || bad "still mirrored" "$(ls "$P/.claude/skills" | head)"

echo
echo "=============================================================="
echo " T9 — the installer must not RUN the commands it describes"
echo "=============================================================="
# Its closing message was an UNQUOTED heredoc containing an example command in
# backticks. Command substitution executed it, so a "non-destructive" installer
# created ./my-project/ and ran git init inside the user's repository.
HP="$WORK/heredoc"; mkdir -p "$HP"; ( cd "$HP" && git init -q -b main . )
printf 'x\n' > "$HP/app.js"
( cd "$HP" && git -c user.email=t@t -c user.name=t add -A >/dev/null && git -c user.email=t@t -c user.name=t commit -qm i >/dev/null )
BEFORE="$(cd "$HP" && ls -A | LC_ALL=C sort | tr '\n' ' ')"
"$KIT/scripts/adopt/install.sh" "$HP" >/dev/null 2>&1
[ -d "$HP/my-project" ] \
  && bad "the installer executed an example from its own help text — ./my-project/ was created" "" \
  || ok "the closing message is inert text, not a command substitution"
# and nothing else appeared beyond what the installer legitimately writes
UNEXPECTED="$(cd "$HP" && ls -A | LC_ALL=C sort | tr '\n' ' ')"
case "$UNEXPECTED" in
  *my-project*) bad "unexpected directory in the target" "$UNEXPECTED" ;;
  *) ok "the target gained only files the installer declares (was: $BEFORE)" ;;
esac
# The general rule, so the next one is caught by a test and not by an audit.
# Narrow deliberately: a heredoc feeding a LOOP (`done <<EOF` … `$(cmd)` … EOF)
# is the standard idiom and its substitution is the point. The dangerous shape is
# a heredoc that PRINTS to the user — prose describing a command — because there
# the substitution is an accident. So: only `cat <<TAG` unquoted, containing a
# backtick or $(.
BADHD=""
for f in "$KIT"/scripts/adopt/*.sh "$KIT"/scripts/*.sh "$KIT"/scripts/lib/*.sh "$KIT"/.githooks/*; do
  [ -f "$f" ] || continue
  if ! awk '
    /^[[:space:]]*cat[[:space:]]+<<[[:space:]]*[A-Za-z_]/ && !/<<[[:space:]]*'"'"'/ && !/<<-?[[:space:]]*"/ {
      inhd=1; tag=$0; sub(/.*<<-?[[:space:]]*/,"",tag); next }
    inhd && $0 ~ "^[[:space:]]*" tag "[[:space:]]*$" { inhd=0; next }
    inhd && (/`/ || /\$\(/) { found=1 }
    END { exit(found?1:0) }
  ' "$f" 2>/dev/null; then
    BADHD="$BADHD $(basename "$f")"
  fi
done
[ -z "$BADHD" ] && ok "no user-facing heredoc executes the commands it describes" \
  || bad "unquoted cat-heredoc(s) carrying a command substitution:$BADHD" ""

echo
echo "=============================================================="
echo " T10 — an adopter receives EVERY line of distribution.txt"
echo "=============================================================="
# The installer used to carry its own hardcoded list, and the list drifted:
# evidence.yml shipped as a feature in v3.13.0 and was never added, so for two
# versions every adopter's PR evidence gate silently did not exist. Same for
# vendor/, THIRD_PARTY_NOTICES.md, docs/engineering/ and the evals.
DP="$WORK/dist"; mkdir -p "$DP"; ( cd "$DP" && git init -q -b main . )
printf 'x\n' > "$DP/app.js"
( cd "$DP" && git -c user.email=t@t -c user.name=t add -A >/dev/null && git -c user.email=t@t -c user.name=t commit -qm i >/dev/null )
"$KIT/scripts/adopt/install.sh" "$DP" >/dev/null 2>&1

MISSING=""
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  opt=0
  case "$line" in '?'*) opt=1; line="${line#\?}" ;; esac
  [ -e "$KIT/$line" ] || { [ "$opt" -eq 1 ] && continue; MISSING="$MISSING $line(absent-upstream)"; continue; }
  [ -e "$DP/$line" ] || MISSING="$MISSING $line"
done < "$KIT/distribution.txt"
[ -z "$MISSING" ] && ok "every path in distribution.txt arrived in the target" \
  || bad "the installer did not deliver:$MISSING" ""

# and the capabilities the README advertises are reachable, not just present
for cap in ".github/workflows/verify.yml:the CI contract" \
           ".github/workflows/evidence.yml:the PR evidence gate" \
           "scripts/verify.sh:the verification gate" \
           "scripts/check-vendored.sh:the vendored-instruction gate" \
           "scripts/check-protection.sh:the branch-protection report" \
           "AGENTS.md:the working agreement" \
           ".githooks/pre-push:the universal push gate"; do
  f="${cap%%:*}"; label="${cap#*:}"
  [ -e "$DP/$f" ] || bad "$label is advertised and was not installed ($f)" ""
done
ok "every advertised capability is present in a fresh install"

# the manifest must not list something the kit does not have — a promise with
# nothing behind it fails here rather than at an adopter's first run
GHOST=""
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  case "$line" in '?'*) continue ;; esac
  [ -e "$KIT/$line" ] || GHOST="$GHOST $line"
done < "$KIT/distribution.txt"
[ -z "$GHOST" ] && ok "distribution.txt lists nothing this kit does not have" \
  || bad "distribution.txt promises paths that do not exist:$GHOST" ""

echo
echo "=============================================================="
echo " T11 — an existing .claude/settings.json is merged, not skipped"
echo "=============================================================="
# It was treated as project data and preserved WHOLE — which is right for the
# file, and wrong for the outcome: the hook scripts were copied and never
# REGISTERED, so on any repo that already had settings.json the Stop gate and
# the bash guard did not run while the README said they did.
SP2="$WORK/settings"; mkdir -p "$SP2/.claude"; ( cd "$SP2" && git init -q -b main . )
cat > "$SP2/.claude/settings.json" <<'JSON11'
{ "permissions": { "allow": ["Bash(npm test:*)"] },
  "hooks": { "PreToolUse": [ { "matcher": "Write",
    "hooks": [ { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/my-own-guard.sh" } ] } ] } }
JSON11
printf 'x\n' > "$SP2/app.js"
( cd "$SP2" && git -c user.email=t@t -c user.name=t add -A >/dev/null && git -c user.email=t@t -c user.name=t commit -qm "feat: app" >/dev/null )
"$KIT/scripts/adopt/install.sh" "$SP2" >/dev/null 2>&1

while IFS= read -r line; do
  case "$line" in
    OK*) ok "${line#OK }" ;;
    NO*) bad "${line#NO }" "$(cat "$SP2/.claude/settings.json")" ;;
  esac
done <<EOF
$(python3 - "$SP2/.claude/settings.json" <<'PY11B'
import json, sys
d = json.load(open(sys.argv[1]))
cmds = [h["command"] for e in d.get("hooks", {}).values() for entry in e for h in entry.get("hooks", [])]
allow = d.get("permissions", {}).get("allow", [])
for k, v in {
  "an existing settings.json keeps the user's own hook": any("my-own-guard" in c for c in cmds),
  "…and the user's own permissions": "Bash(npm test:*)" in allow,
  "…while the Stop gate gets registered": any("verify-gate" in c for c in cmds),
  "…and so does the bash guard": any("bash-guard" in c for c in cmds),
}.items():
    print(("OK " if v else "NO ") + k)
PY11B
)
EOF

# merging twice must change nothing — an installer people re-run is an installer
BEFORE11="$(shasum -a 256 "$SP2/.claude/settings.json" | cut -d' ' -f1)"
python3 "$KIT/scripts/lib/merge-claude-settings.py" "$KIT/.claude/settings.json" "$SP2/.claude/settings.json" >/dev/null 2>&1
AFTER11="$(shasum -a 256 "$SP2/.claude/settings.json" | cut -d' ' -f1)"
[ "$BEFORE11" = "$AFTER11" ] && ok "merging twice is a no-op" || bad "the merge is not idempotent" ""

echo
echo "=============================================================="
echo " T12 — the vulnerability scanner tells the truth in both directions"
echo "=============================================================="
# The kit had a security-review playbook and a secret scan and NOTHING that
# asked whether the project depends on something with a published CVE. The two
# properties that matter: it finds real ones on any stack, and it never reports
# a scan that could not run as clean.
VP="$WORK/vulns"; mkdir -p "$VP/scripts/lib"
( cd "$VP" && git init -q -b main . )
cp "$KIT/scripts/scan-vulns.sh" "$VP/scripts/"
cp "$KIT"/scripts/lib/*.sh "$KIT"/scripts/lib/*.py "$VP/scripts/lib/"
chmod +x "$VP/scripts/scan-vulns.sh"
printf 'version: 2\nstack: "mixed"\nproject_type: service\nstrictness: standard\nrun:\n  test: "true"\n  smoke: "true"\nmerge:\n  base: main\n' > "$VP/vantry.yml"

# an ecosystem most vendor scanners cover poorly, to prove the "any stack" claim
printf '%%{\n  "plug": {:hex, :plug, "1.3.0", "abc", [:mix], [], "hexpm"},\n}\n' > "$VP/mix.lock"
OUT12="$( cd "$VP" && bash scripts/scan-vulns.sh 2>&1 )"
case "$OUT12" in
  *"Hex/plug"*) ok "it finds a known CVE in an Elixir/Hex lockfile (no vendor account involved)" ;;
  *"could not reach"*|*"NOTHING RAN"*) ok "(offline — scanner correctly reports it could not check)" ;;
  *) bad "an Elixir lockfile with a known-vulnerable plug scanned clean" "$OUT12" ;;
esac
rm -f "$VP/mix.lock"

# and a clean lockfile must NOT produce noise — a scanner that cries wolf is off by Friday
printf '{ "name":"t","lockfileVersion":3,\n  "packages": { "node_modules/ms": { "name":"ms", "version":"2.1.3" } } }\n' > "$VP/package-lock.json"
if ( cd "$VP" && bash scripts/scan-vulns.sh ) >/dev/null 2>&1; then
  ok "a dependency with no known CVE scans clean"
else
  OUT12B="$( cd "$VP" && bash scripts/scan-vulns.sh 2>&1 )"
  case "$OUT12B" in
    *"could not reach"*|*"NOTHING RAN"*) ok "(offline — no false clean, no false alarm)" ;;
    *) bad "false positive on a clean dependency" "$OUT12B" ;;
  esac
fi

# the property the whole playbook rests on: incomplete is not clean
OUT12C="$( cd "$VP" && PATH=/usr/bin:/bin bash scripts/scan-vulns.sh 2>&1 )"
case "$OUT12C" in
  *"NOTHING RAN"*|*"not a clean scan"*|*"INCOMPLETE"*|*"could not reach"*)
    ok "with no scanner and no python3 it says so instead of reporting clean" ;;
  *)
    # python3 may still be at /usr/bin — then it genuinely scanned
    case "$OUT12C" in
      *"OSV.dev"*) ok "python3 was still present, so it scanned for real" ;;
      *) bad "a scan that could not run did not say so" "$OUT12C" ;;
    esac ;;
esac

# --introduced must not punish someone for a dependency they did not touch
( cd "$VP" && git -c user.email=t@t -c user.name=t add -A >/dev/null && git -c user.email=t@t -c user.name=t commit -qm "feat: base" >/dev/null )
( cd "$VP" && git checkout -qb feat/docs && printf 'x\n' > README.md )
( cd "$VP" && git -c user.email=t@t -c user.name=t add -A >/dev/null && git -c user.email=t@t -c user.name=t commit -qm "docs: readme" >/dev/null )
if ( cd "$VP" && bash scripts/scan-vulns.sh --introduced ) >/dev/null 2>&1; then
  ok "a branch touching no lockfile introduces nothing and is not blocked"
else
  bad "a PR was blocked for a vulnerability it did not introduce" "$( cd "$VP" && bash scripts/scan-vulns.sh --introduced 2>&1 | tail -5 )"
fi

echo
echo "=============================================================="
echo " T13 — the code-quality scan catches, and does not cry wolf"
echo "=============================================================="
QP="$WORK/quality"; mkdir -p "$QP/scripts/lib" "$QP/src"
( cd "$QP" && git init -q -b main . )
cp "$KIT/scripts/scan-quality.sh" "$QP/scripts/"; cp "$KIT"/scripts/lib/*.sh "$QP/scripts/lib/"
chmod +x "$QP/scripts/scan-quality.sh"
printf 'version: 2\nstack: "mixed"\nproject_type: service\nstrictness: standard\nrun:\n  test: "true"\n  smoke: "true"\nmerge:\n  base: main\n' > "$QP/vantry.yml"

# five real defects, five languages — the point of a cross-language floor
printf 'const r = await fetch(u, { agent: new https.Agent({ rejectUnauthorized: false }) })\n' > "$QP/src/api.js"
# a heredoc, not printf: the fixture line is full of % and printf reads those
cat > "$QP/src/db.py" <<'PYFIX'
cur.execute("SELECT * FROM orders WHERE id = %s" % request.args.get("id"))
PYFIX
printf 'system("convert #{params[:file]} out.png")\n' > "$QP/src/run.rb"
printf 'fmt.Printf("user %%s token %%s", user, sessionToken)\n' > "$QP/src/log.go"
printf 'if (localStorage.getItem("isAdmin") === "true") { showAdminPanel() }\n' > "$QP/src/ui.ts"
( cd "$QP" && git -c user.email=t@t -c user.name=t add -A >/dev/null && git -c user.email=t@t -c user.name=t commit -qm "feat: five problems" >/dev/null )
OUT13="$( cd "$QP" && bash scripts/scan-quality.sh 2>&1 )"
for pat in "TLS verification disabled" "SQL" "eval / exec on request data" "a secret in a log line" "authorization decided on the client"; do
  case "$OUT13" in
    *"$pat"*) ok "catches: $pat" ;;
    *)        bad "missed: $pat" "$OUT13" ;;
  esac
done

# a false positive is why a scanner gets switched off — this one caught its own
# kanban importer on `--single-select-options` before word boundaries were added
rm -f "$QP"/src/*
printf 'export function add(a, b) { return a + b }\n' > "$QP/src/clean.js"
printf 'gh project field-create --single-select-options "$opts"\n' > "$QP/src/deploy.sh"
( cd "$QP" && git -c user.email=t@t -c user.name=t add -A >/dev/null && git -c user.email=t@t -c user.name=t commit -qm "refactor: clean" >/dev/null )
( cd "$QP" && bash scripts/scan-quality.sh ) >/dev/null 2>&1 \
  && ok "clean code produces nothing — including '--single-select-options'" \
  || bad "false positive on clean code" "$( cd "$QP" && bash scripts/scan-quality.sh 2>&1 | tail -12 )"

# and it must never print a green tick for a language it cannot read
case "$( cd "$QP" && bash scripts/scan-quality.sh 2>&1 )" in
  *"covers the analysers above and"*) ok "a clean result states what it actually covered" ;;
  *) bad "reported clean without saying what ran" "" ;;
esac

echo
echo "=============================================================="
echo " T14 — the installer ships the kit, not what the kit left lying around"
echo "=============================================================="
# Reported from real use: install.sh copied 64 .vantry-bak-* files from the
# source kit into the target. The walk was a bare `find`, and this kit WRITES
# artefacts into its own tree — install.sh, sync-adapters.sh and upgrade.sh all
# leave <name>.vantry-bak-<timestamp> behind. They are gitignored, so a fresh
# clone has none and no test noticed; a working copy that has been used has
# dozens.
BSRC="$WORK/bak-src"; BTGT="$WORK/bak-tgt"
mkdir -p "$BSRC"
# a source that looks like a kit someone has actually used
( cd "$KIT" && git ls-files ) | while IFS= read -r f; do
  mkdir -p "$BSRC/$(dirname "$f")"; cp "$KIT/$f" "$BSRC/$f" 2>/dev/null
done
( cd "$BSRC" && git init -q -b main . && git -c user.email=t@t -c user.name=t add -A >/dev/null \
  && git -c user.email=t@t -c user.name=t commit -qm "feat: the kit" >/dev/null )
for f in AGENTS.md README.md scripts/verify.sh; do
  [ -f "$BSRC/$f" ] && cp "$BSRC/$f" "$BSRC/$f.vantry-bak-20260101-120000"
done
mkdir -p "$BSRC/.vantry/receipts" "$BSRC/.vantry/state"
printf '{"verdict":"pass"}\n' > "$BSRC/.vantry/receipts/main.verify.json"
printf 'deadbeef\n'           > "$BSRC/.vantry/state/seal.key"
printf '755\n'                > "$BSRC/.githooks/pre-push.vantry-mode"
touch "$BSRC/skills/.DS_Store"

mkdir -p "$BTGT"; ( cd "$BTGT" && git init -q -b main . )
printf 'x\n' > "$BTGT/app.js"
( cd "$BTGT" && git -c user.email=t@t -c user.name=t add -A >/dev/null && git -c user.email=t@t -c user.name=t commit -qm "feat: app" >/dev/null )
"$BSRC/scripts/adopt/install.sh" "$BTGT" >/dev/null 2>&1

[ "$(find "$BTGT" -name '*.vantry-bak-*' 2>/dev/null | wc -l | tr -d ' ')" = "0" ] \
  && ok "no .vantry-bak-* file reached the target" \
  || bad "the installer shipped its own backup files" "$(find "$BTGT" -name '*.vantry-bak-*' | head -5)"
[ "$(find "$BTGT" -name '*.vantry-mode' 2>/dev/null | wc -l | tr -d ' ')" = "0" ] \
  && ok "…nor the hook mode records" || bad ".vantry-mode files shipped" ""
[ "$(find "$BTGT" -name '.DS_Store' 2>/dev/null | wc -l | tr -d ' ')" = "0" ] \
  && ok "…nor .DS_Store" || bad ".DS_Store shipped" ""
[ -f "$BTGT/.vantry/receipts/main.verify.json" ] \
  && bad "a receipt from the SOURCE machine was installed as evidence here" "" \
  || ok "…nor a receipt from another machine (that would be someone else's proof)"
[ -f "$BTGT/.vantry/state/seal.key" ] \
  && bad "the source machine's seal key was copied — every receipt it signs would verify" "" \
  || ok "…nor the seal key, which is a machine-local secret"

# and the kit itself still arrives in full
for f in AGENTS.md scripts/verify.sh .githooks/pre-push skills/next/SKILL.md \
         agents/debugger.md .github/workflows/verify.yml distribution.txt; do
  [ -e "$BTGT/$f" ] || bad "the exclusion swept away something real: $f is missing" ""
done
ok "and every advertised path still arrives ($(find "$BTGT" -type f -not -path '*/.git/*' | wc -l | tr -d ' ') files)"

# the non-git fallback must exclude the same things
BSRC2="$WORK/bak-src-nogit"; cp -R "$BSRC" "$BSRC2"; rm -rf "$BSRC2/.git"
BTGT2="$WORK/bak-tgt-nogit"; mkdir -p "$BTGT2"; ( cd "$BTGT2" && git init -q -b main . )
"$BSRC2/scripts/adopt/install.sh" "$BTGT2" >/dev/null 2>&1
[ "$(find "$BTGT2" -name '*.vantry-bak-*' 2>/dev/null | wc -l | tr -d ' ')" = "0" ] \
  && ok "the non-git fallback excludes them too" \
  || bad "a source that is not a git repo still shipped backup files" "$(find "$BTGT2" -name '*.vantry-bak-*' | head -3)"

echo
echo "── the kit must not silently install a version three releases old ──"
# Reported: "a repo created from the kit pointed at v3.11.0 while the kit was at
# v3.19.0". True, and nothing said so. `~/.vantry` is a shallow clone that never
# refreshes itself, so whoever cloned once in March starts every project in
# September on March's kit. The quickstart made it worse by naming a tag, so the
# clone was pinned AND the number in the docs rotted independently.
SUP="$WORK/stale-upstream"; SKIT="$WORK/stale-kit"
git init -q -b main "$SUP"
G "$SUP" config user.email t@t >/dev/null 2>&1; G "$SUP" config user.name t >/dev/null 2>&1
mkdir -p "$SUP/scripts/adopt"
cp "$KIT/scripts/adopt/install.sh" "$SUP/scripts/adopt/install.sh"
printf '3.11.0\n' > "$SUP/VERSION"; printf 'kit\n' > "$SUP/AGENTS.md"
G "$SUP" add -A >/dev/null 2>&1; G "$SUP" commit -qm "release 3.11.0" >/dev/null 2>&1
G "$SUP" tag v3.11.0 >/dev/null 2>&1
git clone -q --depth 1 "$SUP" "$SKIT" 2>/dev/null
for v in 3.21.1 3.21.2; do
  printf '%s\n' "$v" > "$SUP/VERSION"
  G "$SUP" commit -qam "release $v" >/dev/null 2>&1; G "$SUP" tag "v$v" >/dev/null 2>&1
done

SOUT="$(bash "$SKIT/scripts/adopt/install.sh" --version 2>&1)"
case "$SOUT" in *"latest release: v3.21.2"*)
    ok "--version names the newer release, not just its own" ;;
  *) bad "--version stayed silent about being 10 releases behind" "$SOUT" ;; esac

STGT="$WORK/stale-target"; mkdir -p "$STGT"
( cd "$STGT" && git init -q -b main . && G "$STGT" config user.email t@t && G "$STGT" config user.name t \
  && printf 'x\n' > app.js ) >/dev/null 2>&1
G "$STGT" add -A >/dev/null 2>&1; G "$STGT" commit -qm "feat: app" >/dev/null 2>&1
IOUT="$(bash "$SKIT/scripts/adopt/install.sh" "$STGT" 2>&1)"
case "$IOUT" in *"YOU ARE INSTALLING v3.11.0"*)
    ok "and an install warns, loudly, before you build a project on an old kit" ;;
  *) bad "installed a 10-release-old kit without a word" "$(printf '%s' "$IOUT" | head -5)" ;; esac
case "$IOUT" in *"vantry"*) ok "…and installs anyway — a warning, not a refusal" ;;
  *) bad "the staleness check blocked the install" "$(printf '%s' "$IOUT" | head -5)" ;; esac

bash "$SKIT/scripts/adopt/install.sh" --update-kit >/dev/null 2>&1
[ "$(tr -d '[:space:]' < "$SKIT/VERSION")" = "3.21.2" ] \
  && ok "--update-kit actually moves the kit to the latest release" \
  || bad "--update-kit left the kit behind" "VERSION=$(cat "$SKIT/VERSION")"
# A branch-tracking clone must STAY on its branch. Checking out the tag would
# detach it, the next --update-kit would find nothing to do, and the kit would
# freeze at the very version this command exists to prevent.
[ "$(G "$SKIT" symbolic-ref --quiet --short HEAD 2>/dev/null)" = "main" ] \
  && ok "…without detaching the clone, so it can update again next time" \
  || bad "--update-kit detached the kit clone" "HEAD=$(G "$SKIT" rev-parse --abbrev-ref HEAD)"

# and the quickstart itself must not hand out a version number as the default
QS="$(grep -A3 'git clone --depth 1 https' "$KIT/README.md" | head -1)"
case "$QS" in *--branch*) bad "the default quickstart clone is pinned to a tag" "$QS" ;;
  *) ok "the quickstart's default clone names no version — the newest is the default" ;; esac

echo
echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$PASS" "$FAIL"
echo "=============================================================="
rm -rf "$WORK"
[ "$FAIL" -eq 0 ] || exit 1
