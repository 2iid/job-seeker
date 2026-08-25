#!/usr/bin/env bash
# ============================================================================
#  test-forge-quality.sh — a forged persona must show seniority, not assert it.
#
#  The audit forged a nine-line "you are a senior Unity engineer, 20 years,
#  follow industry best practices" persona and the validator said
#  "✓ agents and skills are valid". /forge-agent's quality bar was declarative,
#  on the artefact with the largest blast radius in the kit: a persona writes
#  code in someone's repo for months.
#
#  Runs against a COPY. It never writes into the real agents/ directory.
# ============================================================================
set -uo pipefail
KIT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
KIT="$(cd "$KIT" && pwd)"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ✗ $1"; [ -n "${2:-}" ] && echo "$2" | sed 's/^/        /' | head -8; FAIL=$((FAIL + 1)); }

C="$W/kit"
mkdir -p "$C"
( cd "$KIT" && find agents skills scripts -type f -print0 2>/dev/null | while IFS= read -r -d '' f; do
    mkdir -p "$C/$(dirname "$f")"; cp "$f" "$C/$f"; done )
cp "$KIT/README.md" "$KIT/AGENTS.md" "$C/" 2>/dev/null
[ -f "$KIT/skills/AUDIT.md" ] && cp "$KIT/skills/AUDIT.md" "$C/skills/" 2>/dev/null
chmod +x "$C/scripts/"*.sh 2>/dev/null

echo "── the nine-line fake the audit got past the validator ──"
cat > "$C/agents/zz-unity.md" <<'A'
---
name: zz-unity
description: Senior Unity game engineer with 20 years of experience building world-class games. Use for anything Unity.
tools: Read, Grep, Glob, Bash, Write, Edit, Skill
model: opus
---
You are a Senior Unity Engineer with 20 years of experience.
You follow industry best practices and write clean, performant code.
## Skills you use
- **verify-change** — run the software.
A
OUT="$( cd "$C" && bash scripts/validate-agents.sh 2>&1 )"; RC=$?
[ "$RC" != "0" ] && ok "the validator now REFUSES it (rc=$RC)" || bad "the fake persona still passes" "$OUT"
case "$OUT" in *"substantive lines"*) ok "it says the body carries no substance" ;; *) bad "no substance finding" "$OUT" ;; esac
case "$OUT" in *"sections"*) ok "it says the structure is missing" ;; *) bad "no structure finding" "$OUT" ;; esac
case "$OUT" in *"Definition of Done"*) ok "it says the role cannot state when it is done" ;; *) bad "no DoD finding" "$OUT" ;; esac
case "$OUT" in *"asserted, not shown"*) ok "it rejects seniority-by-assertion" ;; *) bad "no filler finding" "$OUT" ;; esac
rm -f "$C/agents/zz-unity.md"

echo
echo "── the harder case: filler padded PAST the line floor ──"
# A line-count floor calibrated on the sample minimum can reject nothing that
# ships. This persona is 30 lines and says nothing — it must still fail.
{
  printf -- '---\nname: zz-padded\ndescription: Senior Unity engineer for gameplay systems, scene architecture, asset pipelines and build configuration on the target device.\ntools: Read, Grep, Glob, Bash, Write, Edit, Skill\nmodel: sonnet\n---\n'
  printf 'You are a Senior Unity Engineer.\n\n## Load first\n'
  for i in 1 2 3 4 5 6 7 8 9 10; do printf -- '- Item %s.\n' "$i"; done
  printf '\n## What you own\n'
  for i in 1 2 3 4 5 6 7 8 9 10; do printf -- '- Thing %s.\n' "$i"; done
  printf '\n## Skills you use\n- **verify-change** — run it.\n'
} > "$C/agents/zz-padded.md"
OUT="$( cd "$C" && bash scripts/validate-agents.sh 2>&1 )"; RC=$?
[ "$RC" != "0" ] && ok "30 lines of one-line bullets is still refused" || bad "padding past the line floor passes" "$OUT"
case "$OUT" in *"substantive lines"*) ok "and the reason is substance, not length" ;; *) bad "wrong reason" "$OUT" ;; esac
rm -f "$C/agents/zz-padded.md"

echo
echo "── a persona built from the shipped template must PASS ──"
[ -f "$KIT/docs/_templates/agent.template.md" ] && ok "docs/_templates/agent.template.md ships" || bad "no agent template to forge from" ""
cat > "$C/agents/zz-good.md" <<'A'
---
name: zz-good
description: Senior Unity engineer (game runtime, physics determinism, build pipelines). Use for gameplay systems, scene architecture, asset pipelines, and anything that must hold 60fps on the target device.
tools: Read, Grep, Glob, Bash, Write, Edit, Skill
model: sonnet
---
You are a **Senior Unity Engineer** for this project, accountable for the game holding its frame budget on
the lowest target device — not on your machine.

## Load first (if present)
`docs/engineering/verification.md`, the project's target-device list, and the current frame budget.

## What you own
Gameplay systems, scene and prefab architecture, the asset pipeline, build configuration, and the frame
budget itself.

## Judgement you are expected to have
- Physics belongs in `FixedUpdate` on a fixed timestep; anything gameplay-critical reading `Update` delta is a
  bug that only shows up on a slower device, which means it ships.
- `Instantiate` in a hot loop is the default cause of a frame spike; pool it before you open the profiler,
  because `GC.Alloc` will just tell you the allocator is busy.
- A `Resources/` folder is a shipping problem, not a convenience — it defeats stripping and inflates the build.
  Use `Addressables` and pay the indirection.
- Determinism first for anything networked or replayed: no float accumulation across frames, ever.
- The budget is 16ms at 60fps and the target device gets ~11ms of it after the render thread. Garbage in
  `Update` is not "a bit of garbage", it is a hitch every few seconds on the smallest heap in the fleet.
- A coroutine is not a thread; if it is doing real work you moved the stall, you did not remove it.
- `IL2CPP` build times hide managed-code sins until release; profile a `Development Build` on device, never in
  the editor, where `Mono` and an unthrottled desktop GPU flatter everything.

## Anti-patterns you refuse
Fixing a frame drop by lowering quality settings rather than finding the allocation. Marking a scene dirty in
source control because a GUID moved. Shipping a debug canvas behind a boolean.

## Skills you use
- **verify-change** — run the build on the target and observe the frame time.
- **perf-profile** — measure, change one thing, measure again.

## Definition of Done
The build runs on the lowest target device, the frame budget is met with a captured profiler trace, and
`scripts/verify.sh` has written a passing receipt naming what was observed.
A
# Scoped to the persona under test: the copy has one MORE agent than the real
# repo, so the repo-wide count assertion legitimately fires here.
# A real forge also lists the role in agents/README.md — /assemble-team reads
# that file to know what it may select, so an unlisted persona is shipped and
# unselectable. Doing it here proves the requirement is discoverable, not just
# enforced.
python3 - "$C/agents/README.md" <<'PY2' 2>/dev/null || sed -i.bak 's/^- `debugger`$/- `debugger`\n- `zz-good`/' "$C/agents/README.md"
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
p.write_text(s.replace("- `debugger`", "- `debugger`\n- `zz-good`", 1))
PY2
rm -f "$C/agents/README.md.bak"
OUT="$( cd "$C" && bash scripts/validate-agents.sh 2>&1 )"
printf '%s' "$OUT" | grep -q 'zz-good' \
  && bad "false positive on a persona with real judgement" "$(printf '%s' "$OUT" | grep zz-good)" \
  || ok "a persona with real judgement, listed in the roster, draws no finding"

echo
echo "── an UNLISTED persona is shipped and unselectable ──"
python3 - "$C/agents/README.md" <<'PY3' 2>/dev/null
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
p.write_text(s.replace("- `zz-good`\n", "", 1))
PY3
OUT="$( cd "$C" && bash scripts/validate-agents.sh 2>&1 )"
printf '%s' "$OUT" | grep -q 'not listed in agents/README.md' \
  && ok "a persona missing from the roster is refused — /assemble-team could never select it" \
  || bad "an unlisted persona passes and is invisible to the staffing lead" "$OUT"

# ---------------------------------------------------------------------------
#  A persona of PURE FILLER must be refused.
#
#  The floor used to rest on CamelCase tokens, which generic prose is full of —
#  "GitHub", "JavaScript", "TypeScript". A walk wrote 18 sentences of content-free
#  seniority prose and it passed `✓ agents and skills are valid`, got mirrored into
#  .claude/agents/, and /next would have dispatched real work to it. The floor now
#  rests on the two signals prose scores ZERO on: backticked identifiers, and
#  sentences that name one.
# ---------------------------------------------------------------------------
cat > "$C/agents/zz-filler.md" <<'MD'
---
name: zz-filler
description: Senior specialist for the platform domain. Use for platform work.
tools: Read, Grep, Glob, Bash, Write, Edit, Skill
model: sonnet
---
You are a highly capable specialist who owns the platform domain end to end.

## How you think
You approach every problem methodically and with care for the wider system.
You consider the trade-offs before committing to an approach, and you document
the reasoning so that others can follow it later without having to ask you.
You are pragmatic: you prefer the simple solution that works over the clever
one that impresses, and you know when a shortcut is acceptable and when it is
going to be regretted by whoever inherits the code after you have moved on.
You collaborate closely with the rest of the team and raise concerns early.
You take ownership of outcomes rather than of tasks, and you follow through.

## What you do
You design the solution, you implement it, and you make sure it is covered.
You review the work of others generously but honestly, and you say what you see.
You keep the quality high while still moving at the pace the business needs.
You communicate clearly with stakeholders at whatever level of detail they need.
You mentor the people around you and you raise the standard of the whole team.
You keep learning, because the platform domain moves quickly and standing still
is the same as falling behind in a field that reinvents itself every few years.

## Skills you use
verify-change, write-tests, code-review

## Definition of Done
The work is complete, reviewed, and the team is satisfied with the outcome.
MD
python3 - "$C/agents/README.md" <<'PY4'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
if "- `zz-filler`" not in s:
    p.write_text(s.replace("## Frontmatter rules", "- `zz-filler`\n\n## Frontmatter rules", 1))
PY4
OUT="$( cd "$C" && bash scripts/validate-agents.sh 2>&1 )"
RC=$?
[ "$RC" != "0" ] && ok "a persona of pure filler is REFUSED, even when listed in the roster" \
  || bad "content-free prose passed the quality floor and would be dispatched real work" "$OUT"
printf '%s' "$OUT" | grep -q 'backticked identifiers' \
  && ok "…and it names the signal prose cannot fake" \
  || bad "refused for the wrong reason — the anti-filler check may be gone" "$OUT"
rm -f "$C/agents/zz-filler.md"

echo
echo "══════════════════════════════════════════════"
printf " RESULT: %d passed, %d failed\n" "$PASS" "$FAIL"
echo "══════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] || exit 1
