#!/usr/bin/env bash
# =============================================================================
#  run-all.sh — the kit's own test suite.
#
#    --unit  static checks: shell syntax, config validity, no dangling refs,
#            agent frontmatter, adapter drift. Fast, no scratch repos.
#    --e2e   the real thing: install the kit into throwaway git repos and prove
#            the gate blocks, the receipt goes stale, the hooks chain, and a
#            push is refused. This is the kit's smoke run.
#
#  No argument runs both.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1
MODE="${1:-all}"
RC=0
run() { echo; echo "▶ $*"; "$@" || RC=1; }

if [ "$MODE" = "--unit" ] || [ "$MODE" = "all" ]; then
  echo "══ UNIT ═══════════════════════════════════════════════════════"

  echo "▶ shell syntax"
  bad=0
  while IFS= read -r f; do
    bash -n "$f" 2>/dev/null || { echo "  ✗ syntax error: $f"; bad=1; }
  done < <(git ls-files '*.sh' '.githooks/*' 2>/dev/null | sort -u)
  [ "$bad" -eq 0 ] && echo "  ✓ every shell script parses" || RC=1

  # CI runs shellcheck; for a long time this suite did not, so the local gate
  # went green and the remote one went red. A local check that is weaker than
  # the remote one is a local check that lies.
  echo "▶ shellcheck"
  if command -v shellcheck >/dev/null 2>&1; then
    # -print0/-0: a path with a space would otherwise be split into two
    # non-existent files and silently skipped — the check would pass by
    # not looking. (shellcheck flags this itself, SC2038.)
    if find . -path ./.git -prune -o \( -name '*.sh' -o -path './.githooks/*' \) -type f -print0 \
       | xargs -0 shellcheck -S warning -e SC1091; then
      echo "  ✓ shellcheck clean"
    else
      echo "  ✗ shellcheck found issues (above)"; RC=1
    fi
  else
    echo "  ⚠ shellcheck not installed — CI WILL run it. brew install shellcheck"
  fi

  echo "▶ shell scripts are executable"
  bad=0
  for f in scripts/verify.sh scripts/sync-adapters.sh scripts/adopt/install.sh \
           scripts/validate-config.sh scripts/gen-codeowners.sh \
           scripts/lib/enable-hooks.sh .githooks/pre-commit .githooks/pre-push \
           .githooks/commit-msg .claude/hooks/verify-gate.sh .claude/hooks/bash-guard.sh \
           .claude/hooks/log-tool.sh .claude/hooks/session-start.sh; do
    [ -x "$f" ] || { echo "  ✗ not executable: $f"; bad=1; }
  done
  [ "$bad" -eq 0 ] && echo "  ✓ all entrypoints are executable" || RC=1

  run bash scripts/validate-config.sh
  [ -x scripts/validate-agents.sh ] && run bash scripts/validate-agents.sh
  [ -x scripts/check-refs.sh ]      && run bash scripts/check-refs.sh
  [ -x scripts/kanban/lint-kanban.sh ] && run bash scripts/kanban/lint-kanban.sh

  echo "▶ adapter drift"
  if ./scripts/sync-adapters.sh --check >/dev/null 2>&1; then
    echo "  ✓ .claude/ mirror matches agents/ + skills/"
  else
    echo "  ✗ mirror is out of sync — run ./scripts/sync-adapters.sh"; RC=1
  fi

  # A workflow skeleton nobody ever parsed shipped for four versions, and an
  # agent copying it produced a file GitHub rejects outright — the dead gate the
  # ci-pipeline playbook itself calls the only real anti-pattern.
  echo "▶ YAML in playbooks and workflows parses"
  if command -v ruby >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
    if python3 - <<'PYEOF'
import re, sys, pathlib, subprocess
bad = []
def parse(text):
    try:
        import yaml; yaml.safe_load(text); return None
    except ImportError:
        r = subprocess.run(["ruby", "-ryaml", "-e", "YAML.load(STDIN.read)"],
                           input=text, capture_output=True, text=True)
        return None if r.returncode == 0 else r.stderr.strip().splitlines()[0][:100]
    except Exception as e:
        return str(e).splitlines()[0][:100]
for f in list(pathlib.Path("skills").rglob("SKILL.md")):
    for i, b in enumerate(re.findall(r"```ya?ml\n(.*?)```", f.read_text(), re.S)):
        e = parse(b)
        if e: bad.append(f"{f} fence {i+1}: {e}")
for f in list(pathlib.Path(".github/workflows").glob("*.yml")):
    e = parse(f.read_text())
    if e: bad.append(f"{f}: {e}")
for b in bad: print("  ✗ " + b)
sys.exit(1 if bad else 0)
PYEOF
    then echo "  ✓ every yaml fence and workflow parses"
    else echo "  ✗ unparseable YAML (above)"; RC=1
    fi
  else
    echo "  ⚠ no yaml parser available — skipped"
  fi

  echo "▶ JSON files parse"
  bad=0
  while IFS= read -r f; do
    if command -v python3 >/dev/null 2>&1; then
      python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" 2>/dev/null \
        || { echo "  ✗ invalid JSON: $f"; bad=1; }
    fi
  done < <(git ls-files '*.json' 2>/dev/null)
  [ "$bad" -eq 0 ] && echo "  ✓ all JSON parses" || RC=1
fi

echo
echo "▶ workflow expressions and triggers"
if python3 - <<'PYEOF'
import pathlib, re, sys
bad = []
for f in pathlib.Path(".github/workflows").glob("*.yml"):
    src = f.read_text()
    body = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith("#"))

    # 1. `cond && '' || X` is ALWAYS X. GitHub Actions treats the empty string as
    #    falsy, so a ternary whose TRUE branch is a falsy literal silently
    #    collapses to its right-hand side. This shipped: node-version was pinned
    #    to 20 for every adopted repo while node-version-file was also set, and
    #    setup-node resolved the conflict by ignoring the file. A repo pinning
    #    Node 18 got 20, with no warning anywhere.
    for m in re.finditer(r"\$\{\{[^}]*&&\s*(''|\"\"|0|false)\s*\|\|[^}]*\}\}", body):
        bad.append(f"{f}: ternary with a falsy true-branch always yields its RIGHT side -> {m.group(0)[:70]}")

    # 2. A job that reads the PR body must be reachable when the body CHANGES.
    #    `on: pull_request:` defaults to opened/synchronize/reopened, so a PR
    #    that failed the evidence check and then had its evidence written never
    #    re-ran: the gate demanded a proof and refused to look at it.
    if "pull_request" in body and "pull_request.body" in body:
        m = re.search(r"pull_request:\s*\n\s*types:\s*\[([^\]]*)\]", body)
        types = m.group(1) if m else ""
        if "edited" not in types:
            bad.append(f"{f}: a job reads the PR body but the trigger has no `edited` type — editing the body will never re-run it")

    # 3. …and it must read the body AT RUN TIME, or "Re-run jobs" replays the
    #    frozen payload and can never turn the check green.
    if "pull_request.body" in body and "/pulls/" not in body:
        bad.append(f"{f}: the PR body is read only from the event payload — a re-run replays the stale body forever")

for b in bad: print("  ✗ " + b)
sys.exit(1 if bad else 0)
PYEOF
    then echo "  ✓ no collapsing ternary; the evidence gate can be satisfied by editing OR re-running"
    else RC=1
fi

if [ "$MODE" = "--e2e" ] || [ "$MODE" = "all" ]; then
  echo
  echo "══ E2E ════════════════════════════════════════════════════════"
  run bash scripts/test/test-install-safety.sh "$ROOT"
  run bash scripts/test/test-verify-gate.sh    "$ROOT"
  run bash scripts/test/test-hooks.sh          "$ROOT"
  run bash scripts/test/test-forge-quality.sh  "$ROOT"
  run bash scripts/test/test-kanban-import.sh  "$ROOT"
  # The demo is a marketing asset AND a regression test: if the software stops
  # producing the output the README advertises, this goes red.
  [ -x scripts/demo.sh ] && run bash scripts/demo.sh --check
fi

echo
if [ "$RC" -eq 0 ]; then echo "✓ run-all ($MODE): everything passed"
else echo "✗ run-all ($MODE): FAILURES above"; fi
exit "$RC"
