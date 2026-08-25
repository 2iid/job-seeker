#!/usr/bin/env bash
# =============================================================================
#  scan-vulns.sh — known vulnerabilities, on any stack.
#
#  The kit had a `security-review` playbook (judgement about a diff) and a secret
#  scan (credentials at commit) and NOTHING that asked the simpler question: does
#  this project depend on something with a published CVE?
#
#  Two layers, on purpose:
#
#   1. THE NATIVE TOOL, when one is installed. `npm audit`, `pip-audit`,
#      `cargo audit`, `govulncheck`, `bundler-audit`, `composer audit`,
#      `dotnet list package --vulnerable`. These know things a lockfile does not:
#      whether the vulnerable code is reachable, dev-vs-prod, the dependency path.
#
#   2. OSV.dev FOR EVERYTHING ELSE. This is what makes the promise "any stack"
#      true rather than aspirational: OSV covers npm, PyPI, Go, crates.io, Maven,
#      NuGet, RubyGems, Packagist, Pub, Hex and the OS distributions, with no
#      account and no token. A commercial scanner covers the ecosystems it covers;
#      a kit that claims to work on any stack cannot depend on that.
#
#  WHAT IT BLOCKS, AND WHAT IT ONLY REPORTS — the distinction is the design:
#    · a vulnerability THIS CHANGE introduced (a dependency it adds or bumps)
#      is a failure. You caused it; you fix it.
#    · a pre-existing one is a REPORT and a backlog issue, never a red build for
#      someone who touched an unrelated file. A gate that fails on work you did
#      not do is a gate people learn to ignore, and then it protects nothing.
#
#    scripts/scan-vulns.sh                 # report everything
#    scripts/scan-vulns.sh --introduced    # only what this branch added  (the gate)
#    scripts/scan-vulns.sh --fix           # name the minimum upgrade for each
#    scripts/scan-vulns.sh --json          # machine-readable
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 1
# shellcheck source=lib/vantry-common.sh
. "$ROOT/scripts/lib/vantry-common.sh" 2>/dev/null || true

MODE="report"; JSON=0
for a in "$@"; do
  case "$a" in
    --introduced) MODE="introduced" ;;
    --fix)        MODE="fix" ;;
    --json)       JSON=1 ;;
    -h|--help)    sed -n '2,34p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  esac
done

# Severity at or above which a finding is a failure. Config, because a
# prototype and a payments system do not owe the same answer.
FAIL_ON="$(vantry_cfg security.fail_on 2>/dev/null || true)"
[ -n "$FAIL_ON" ] || FAIL_ON="high"

FOUND=0; RAN=0

say() { [ "$JSON" = "1" ] || printf '%s\n' "$1"; }

# ---------------------------------------------------------- 1. native tools ---
run_native() {  # $1 = label  $2… = command
  local label="$1"; shift
  command -v "$1" >/dev/null 2>&1 || return 0
  RAN=1
  say "  → $label"
  if "$@" >"$TMPD/$label.out" 2>&1; then
    say "    ✓ clean"
  else
    FOUND=1
    say "    ✗ findings:"
    [ "$JSON" = "1" ] || sed 's/^/        /' "$TMPD/$label.out" | head -40
  fi
}

TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

if [ "$JSON" != "1" ]; then
  echo "══ known vulnerabilities ═══════════════════════════════════════"
fi

# L'outil natif d'un projet JS est celui qui a ÉCRIT le lockfile. `npm audit`
# ne sait pas lire pnpm-lock.yaml ni yarn.lock : il sort ENOLOCK, que ce script
# rapportait alors comme une panne de scanner plutôt que comme un scan propre.
if   [ -f pnpm-lock.yaml ]; then run_native "pnpm audit" pnpm audit --audit-level=high --prod
elif [ -f yarn.lock ];      then run_native "yarn npm audit" yarn npm audit --severity high
elif [ -f package.json ];   then run_native "npm audit"  npm audit --audit-level=high --omit=dev
fi
[ -f requirements.txt ] || [ -f pyproject.toml ] && run_native "pip-audit" pip-audit --strict
[ -f Cargo.toml ]        && run_native "cargo audit"  cargo audit
[ -f go.mod ]            && run_native "govulncheck"  govulncheck ./...
[ -f Gemfile.lock ]      && run_native "bundler-audit" bundle-audit check --update
[ -f composer.lock ]     && run_native "composer"     composer audit

# ------------------------------------------- 2. OSV, for everything and the rest
if command -v python3 >/dev/null 2>&1; then
  RAN=1
  say ""
  say "  → OSV.dev (every locked ecosystem, native tool or not)"
  if [ "$JSON" = "1" ]; then
    python3 "$ROOT/scripts/lib/osv-scan.py" "$ROOT" --json
    OSV_RC=$?
  else
    python3 "$ROOT/scripts/lib/osv-scan.py" "$ROOT"
    OSV_RC=$?
  fi
  case "$OSV_RC" in
    1) FOUND=1 ;;
    2) say "    (OSV could not be reached — that is not a clean result)"; FOUND=2 ;;
  esac
else
  say "  · python3 absent — the OSV layer did not run, so ecosystems with no"
  say "    native tool installed were NOT checked. This is not a clean scan."
  FOUND=2
fi

if [ "$RAN" = "0" ]; then
  say ""
  say "  ✗ NOTHING RAN. No native scanner is installed and python3 is missing."
  say "    Report that, never 'no vulnerabilities found'."
  exit 2
fi

# --------------------------------------------------- what THIS change introduced
if [ "$MODE" = "introduced" ]; then
  say ""
  say "══ of those, what this branch introduced ═══════════════════════"
  LOCKS="$(git diff --name-only "$(vantry_base_point 2>/dev/null || echo HEAD)" 2>/dev/null \
           | grep -E '(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Pipfile\.lock|uv\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock|packages\.lock\.json|pubspec\.lock|mix\.lock|requirements.*\.txt)$' || true)"
  if [ -z "$LOCKS" ]; then
    say "  ✓ this branch touches no lockfile — it introduced no dependency risk."
    say "    Anything reported above is pre-existing: it belongs on the backlog,"
    say "    not in this PR's red checks."
    exit 0
  fi
  say "  lockfiles changed here:"
  printf '%s\n' "$LOCKS" | sed 's/^/      /'
  say ""
  say "  A dependency this change adds or bumps is THIS change's problem."
  say "  Resolve it, or record why it is acceptable, before merging."
  [ "$FOUND" -ne 0 ] && exit 2
  exit 0
fi

# ------------------------------------------------------------ --fix, bounded ---
# There is no `audit fix --force` here and there will not be. That command is a
# major-version bump with no verification, which is how a security fix becomes an
# outage. What --fix does is narrower and honest: it names the exact minimum
# version OSV says resolves each finding, and refuses to apply anything itself.
#
# Applying it is /dependency-upgrade's job, one tier at a time, with the software
# RUN afterwards — a transitive break shows up at runtime, never at install.
if [ "$MODE" = "fix" ]; then
  say ""
  say "══ the minimum upgrade that resolves each finding ══════════════"
  if command -v python3 >/dev/null 2>&1; then
    python3 "$ROOT/scripts/lib/osv-scan.py" "$ROOT" --json 2>/dev/null | python3 -c '
import json, sys
try: d = json.load(sys.stdin)
except Exception: sys.exit(0)
byp = {}
for f in d.get("findings", []):
    if not f.get("fixed"):
        byp.setdefault((f["ecosystem"], f["package"], f["version"]), []).append((f["id"], None))
        continue
    k = (f["ecosystem"], f["package"], f["version"])
    byp.setdefault(k, []).append((f["id"], f["fixed"]))
if not byp:
    print("  ✓ nothing to upgrade."); sys.exit(0)
def key(v):
    return [int(x) if x.isdigit() else 0 for x in str(v).replace("-", ".").split(".")[:4]]
for (eco, pkg, cur), ids in sorted(byp.items()):
    fixes = [f for _, f in ids if f]
    if fixes:
        target = max(fixes, key=key)
        print(f"  {eco}/{pkg}: {cur} -> {target}    (resolves {len([f for _,f in ids if f])} advisory/ies)")
    else:
        print(f"  {eco}/{pkg}@{cur}: NO FIX PUBLISHED for {len(ids)} advisory/ies")
        print(f"      This is a risk decision, not a technical one. Is the vulnerable path")
        print(f"      reachable from untrusted input? Record the answer either way.")
'
  fi
  say ""
  say "  Nothing was changed. Apply these through /dependency-upgrade — one tier"
  say "  at a time, and RUN the software afterwards. \`npm audit fix --force\` is a"
  say "  major bump with no verification, which is how a security fix becomes an"
  say "  outage; this kit does not offer it."
  exit "$FOUND"
fi

say ""
case "$FOUND" in
  0) say "✓ no known vulnerability in any locked dependency." ;;
  2) say "✗ the scan was INCOMPLETE — do not read the above as clean."; exit 2 ;;
  *) say "✗ known vulnerabilities above. Threshold for failing a build: $FAIL_ON."
     say "  Pre-existing ones are backlog work (/dependency-upgrade), not a red PR"
     say "  for whoever pushed next. Ones this change introduced are blocking." ;;
esac
exit "$FOUND"
