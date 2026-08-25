#!/usr/bin/env bash
# =============================================================================
#  scan-quality.sh — static analysis on any stack, without lying about coverage.
#
#  The counterpart to scan-vulns.sh. That one asks "is what we DEPEND on known to
#  be broken?"; this one asks "is what we WROTE?". SonarQube and friends answer
#  the second question well for the languages they support — and a kit for any
#  stack cannot rest on that, so this works in three layers and is explicit about
#  which of them actually ran.
#
#   1. THE PROJECT'S OWN ANALYSER, when it has one configured. eslint, ruff,
#      golangci-lint, clippy, rubocop, phpstan, detekt, swiftlint, ktlint,
#      analyzer, credo. Highest signal by far, because someone chose the rules.
#
#   2. SEMGREP, if installed. ~30 languages from one binary, with a free OSS
#      security ruleset. This is the closest thing to a universal layer that
#      exists; it is optional because it needs installing.
#
#   3. THE CROSS-LANGUAGE SECURITY GREPS below. Deliberately few, deliberately
#      about the things AGENTS.md already commits to — disabled TLS
#      verification, SQL built by string concatenation, eval of request data,
#      a secret in a log line. These fire on any text file in any language, and
#      they are the floor when layers 1 and 2 are both absent.
#
#  THE RULE THAT MATTERS: if nothing ran, it says NOTHING RAN. A quality gate
#  that prints a green tick on a language it cannot read is worse than no gate,
#  because someone will cite it.
#
#    scripts/scan-quality.sh              # everything it can
#    scripts/scan-quality.sh --changed    # only what this branch touched
#    scripts/scan-quality.sh --strict     # any finding is a failure
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 1
# shellcheck source=lib/vantry-common.sh
. "$ROOT/scripts/lib/vantry-common.sh" 2>/dev/null || true

CHANGED=0; STRICT=0
for a in "$@"; do
  case "$a" in
    --changed) CHANGED=1 ;;
    --strict)  STRICT=1 ;;
    -h|--help) sed -n '2,34p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  esac
done

RAN=0; FOUND=0
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "══ code quality ════════════════════════════════════════════════"

# ------------------------------------------------- 1. the project's own tool ---
run_tool() {   # $1 = label · $2 = config that proves it is configured · $3… = command
  local label="$1" cfg="$2"; shift 2
  # A tool the project has not configured is a tool whose findings nobody agreed
  # to. Only run what this repository actually asked for.
  case "$cfg" in
    *"*"*) compgen -G "$cfg" >/dev/null 2>&1 || return 0 ;;
    *)     [ -e "$cfg" ] || return 0 ;;
  esac
  command -v "$1" >/dev/null 2>&1 || {
    echo "  · $label is configured here but not installed — NOT run."
    return 0; }
  RAN=1
  echo "  → $label"
  if "$@" >"$TMPD/$label.out" 2>&1; then
    echo "    ✓ clean"
  else
    FOUND=1
    echo "    ✗ findings:"
    sed 's/^/        /' "$TMPD/$label.out" | head -30
  fi
}

run_tool "eslint"        ".eslintrc*"      npx --no-install eslint .
run_tool "eslint(flat)"  "eslint.config.*" npx --no-install eslint .
run_tool "ruff"          "ruff.toml"       ruff check .
run_tool "ruff(pyproj)"  "pyproject.toml"  ruff check .
run_tool "golangci-lint" ".golangci.yml"   golangci-lint run ./...
run_tool "clippy"        "Cargo.toml"      cargo clippy -- -D warnings
run_tool "rubocop"       ".rubocop.yml"    rubocop
run_tool "phpstan"       "phpstan.neon"    phpstan analyse
run_tool "detekt"        "detekt.yml"      detekt
run_tool "swiftlint"     ".swiftlint.yml"  swiftlint lint --quiet
run_tool "credo"         "mix.exs"         mix credo --strict
run_tool "shellcheck"    ".shellcheckrc"   shellcheck -x scripts/*.sh

# ------------------------------------------------------------- 2. semgrep -----
if command -v semgrep >/dev/null 2>&1; then
  RAN=1
  echo "  → semgrep (p/security-audit, ~30 languages from one binary)"
  if semgrep --config p/security-audit --error --quiet . >"$TMPD/semgrep.out" 2>&1; then
    echo "    ✓ clean"
  else
    FOUND=1; echo "    ✗ findings:"; sed 's/^/        /' "$TMPD/semgrep.out" | head -30
  fi
else
  echo "  · semgrep not installed — the universal layer did not run."
  echo "    It is the one tool that covers a stack no native linter here knows:"
  echo "      brew install semgrep   |   pip install semgrep"
fi

# ------------------------------------- 3. the cross-language security floor ----
# Few on purpose. Each maps to something AGENTS.md already commits to, and each
# is a pattern that means the same thing in any language.
echo "  → cross-language security patterns (the floor — runs on any stack)"
if [ "$CHANGED" = "1" ]; then
  FILES="$(git diff --name-only "$(vantry_base_point 2>/dev/null || echo HEAD)" 2>/dev/null || true)"
else
  FILES="$(git ls-files 2>/dev/null || true)"
fi

hits=0
scan_pattern() {  # $1 = human name · $2 = regex · $3 = why it matters
  local name="$1" re="$2" why="$3" out=""
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    case "$f" in
      # Documentation and reports QUOTE code as evidence — an audit report that
      # cites a vulnerable line is not a vulnerable line. Same reason the secret
      # scan skips fixtures: a guard that fires on its own evidence gets removed.
      # (*.md comes first and already covers the .md report files.)
      *.md|*.lock|*.min.js|*.map|*.svg|*.png|*.jpg|*.pdf)  continue ;;
      docs/*|*/docs/*|CHANGELOG*)                          continue ;;
      scripts/test/*|evals/*|*/fixtures/*|*/__fixtures__/*|vendor/*) continue ;;
      scripts/scan-quality.sh|scripts/scan-vulns.sh|.gitleaks.toml)  continue ;;
      .githooks/*)                                          continue ;;
    esac
    # JSON and lock-shaped data are records, not source.
    case "$f" in *.json) [ "$(basename "$f")" = "package.json" ] || continue ;; esac
    m="$(grep -nEi "$re" "$f" 2>/dev/null | head -2 || true)"
    [ -n "$m" ] && out="$out$(printf '\n        %s\n%s' "$f" "$(printf '%s' "$m" | sed 's/^/          /')")"
  done <<EOF
$FILES
EOF
  if [ -n "$out" ]; then
    hits=$((hits + 1)); FOUND=1
    printf '    ✗ %s — %s%s\n' "$name" "$why" "$out"
  fi
}

scan_pattern "TLS verification disabled" \
  'rejectUnauthorized[[:space:]]*:[[:space:]]*false|verify[[:space:]]*=[[:space:]]*False|InsecureSkipVerify[[:space:]]*:[[:space:]]*true|--insecure|CURLOPT_SSL_VERIFYPEER[[:space:]]*,[[:space:]]*(false|0)' \
  "an encrypted channel nobody authenticates is a channel anyone can sit in"

# Two passes rather than one clever regex. The first version anchored on
# [^"']* after the keyword, which stopped at the first quote — so the commonest
# Python shape, "… id = '%s'" % request.args.get("id"), walked straight through.
# WORD BOUNDARIES matter here: without them `--single-select-options` matched
# "SELECT" and this scanner reported an injection in its own kanban importer.
# A false positive in a security scanner is not a small cost — it is the reason
# people switch it off.
scan_pattern "SQL assembled with string formatting" \
  '(^|[^A-Za-z_-])(SELECT[[:space:]]+[*A-Za-z_]|INSERT[[:space:]]+INTO|UPDATE[[:space:]]+[A-Za-z_]|DELETE[[:space:]]+FROM|DROP[[:space:]]+TABLE).*(%s|%d|\{\}|\$\{|\+[[:space:]]*[A-Za-z_])' \
  "parameterise it — a query built by formatting is injection in every language that has strings"

scan_pattern "SQL interpolating request data" \
  '(execute|query|raw|exec_sql|prepare)\(.*(^|[^A-Za-z_-])(SELECT|INSERT|UPDATE|DELETE)[[:space:]].*(req\.|request\.|params|argv|body|input|user_input)' \
  "the value came from the caller — bind it, never build with it"

scan_pattern "eval / exec on request data" \
  '(eval|exec|Function|system|popen|child_process\.exec)\(.*(req\.|request\.|params|argv|input|body)' \
  "executing what a caller sent is remote code execution with extra steps"

scan_pattern "a secret in a log line" \
  '(log|logger|console\.(log|info|warn|error)|print|println|puts|fmt\.Print)[^)]*(password|passwd|secret|token|api_?key|authorization|session|cookie|private_?key)' \
  "logs are read by more people than the database ever is"

scan_pattern "authorization decided on the client" \
  '(localStorage|sessionStorage|document\.cookie)[^;]*(role|isAdmin|is_admin|permission|scope)' \
  "the client cannot be trusted to say who it is — re-check on the server"

if [ "$hits" -eq 0 ]; then
  echo "    ✓ none of the cross-language patterns matched"
fi
RAN=1

# ------------------------------------------------------------------ verdict ----
echo
if [ "$RAN" = "0" ]; then
  echo "✗ NOTHING RAN — no configured analyser, no semgrep."
  echo "  Report that, never 'code quality is fine'. Configure a linter for this"
  echo "  stack, or install semgrep, then run this again."
  exit 2
fi

if [ "$FOUND" = "0" ]; then
  echo "✓ nothing found by the layers that ran."
  echo "  Note which those were: a clean result covers the analysers above and"
  echo "  nothing else. It is not a statement about the whole codebase."
  exit 0
fi

echo "✗ findings above."
if [ "$STRICT" = "1" ]; then
  echo "  --strict: any finding fails."
  exit 1
fi
echo "  Rank them, fix what this change caused, and file the rest — a finding"
echo "  nobody is assigned is a finding nobody fixes. See /code-review."
exit 1
