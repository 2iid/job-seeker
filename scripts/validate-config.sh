#!/usr/bin/env bash
# =============================================================================
#  validate-config.sh — fail loudly on a vantry.yml that would silently
#  mis-gate the project. A contract nobody validates is a contract nobody keeps.
# =============================================================================
set -uo pipefail
_here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/vantry-common.sh
. "$_here/lib/vantry-common.sh"

ERR=0
warn() { echo "⚠ $1"; }
err()  { echo "✗ $1"; ERR=1; }

[ -f "$VANTRY_CFG" ] || { echo "✗ vantry.yml not found at $VANTRY_ROOT"; exit 1; }
echo "→ validating $VANTRY_CFG"

# --------------------------------------------------------------- enum domains
in_set() { case " $2 " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

S="$(vantry_cfg strictness standard)"
in_set "$S" "relaxed standard strict" || err "strictness: '$S' — expected relaxed | standard | strict"

STACK="$(vantry_cfg stack)"
case "$STACK" in
  "") warn "stack: is empty — every playbook's 'Stack notes' block claims to be about YOUR stack, and nothing can tell it otherwise." ;;
  *"<"*) err "stack: still holds the placeholder — name the real stack." ;;
esac

PT="$(vantry_cfg project_type unknown)"
in_set "$PT" "web service cli library mobile data docs game contract embedded unknown" \
  || warn "project_type: '$PT' is not one of web|service|cli|library|mobile|data|docs|game|contract|embedded (only affects wording)"

for g in verify_change code_review design_review; do
  v="$(vantry_cfg "gates.$g" block)"
  in_set "$v" "block warn off" || err "gates.$g: '$v' — expected block | warn | off"
done
v="$(vantry_cfg gates.security_review block_on_sensitive)"
in_set "$v" "block block_on_sensitive warn off" \
  || err "gates.security_review: '$v' — expected block | block_on_sensitive | warn | off"

B="$(vantry_cfg merge.base)"
if [ -z "$B" ]; then
  warn "merge.base is not set — the gate derives it from origin/HEAD, which is unset in a locally-initialised repo. Name your trunk explicitly."
elif ! git rev-parse --verify --quiet "origin/$B" >/dev/null 2>&1 \
   && ! git rev-parse --verify --quiet "$B" >/dev/null 2>&1; then
  err "merge.base is '$B' and no such branch exists — the gate cannot compute a changeset and would fall silent. Current branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
fi

M="$(vantry_cfg merge.authority human)"
in_set "$M" "human agent" || err "merge.authority: '$M' — expected human | agent"

P="$(vantry_cfg dispatch.max_parallel 2)"
case "$P" in ''|*[!0-9]*) err "dispatch.max_parallel: '$P' is not a number" ;;
  *) [ "$P" -gt 8 ] && warn "dispatch.max_parallel: $P is high; conflicts and review load grow faster than throughput" ;;
esac

# ----------------------------------------------------------- the run contract
SMOKE="$(vantry_cfg run.smoke)"
if [ -z "$SMOKE" ]; then
  err "run.smoke is EMPTY — verification is undefined, so the gate cannot mean anything."
  echo "    A test suite is not a smoke run. Declare how this software is actually exercised."
fi
[ -z "$(vantry_cfg run.test)" ] && warn "run.test is empty — no test suite will run before the smoke check."

READY="$(vantry_cfg run.ready)"; START="$(vantry_cfg run.start)"
[ -n "$START" ] && [ -z "$READY" ] && \
  warn "run.start is set but run.ready is empty — the gate cannot tell 'started' from 'came up'."
[ -z "$START" ] && [ -n "$READY" ] && \
  warn "run.ready is set but run.start is empty — nothing will be started to become ready."

# A smoke command that only runs the test suite is the exact failure this whole
# layer exists to prevent, so it is called out by name.
case "$SMOKE" in
  *vitest*|*jest*|*pytest*|*"go test "*|*"cargo test"*)
    case "$SMOKE" in
      *smoke*|*e2e*|*playwright*|*cypress*) : ;;
      *) warn "run.smoke looks like the unit test suite ('$SMOKE'). Green tests are not an observation of the running software." ;;
    esac ;;
esac

# ------------------------------------------------------------------- safety
# These commands are run by verify.sh via eval. vantry.yml is a reviewed,
# committed file — same trust level as a Makefile — but piping the network into
# a shell is never a build step.
for k in install test build start ready smoke; do
  c="$(vantry_cfg "run.$k")"
  [ -n "$c" ] || continue
  case "$c" in
    *"curl"*"|"*"sh"*|*"wget"*"|"*"sh"*|*"|"*"bash"*)
      err "run.$k pipes a download into a shell: $c" ;;
    *"rm -rf /"*|*"rm -rf ~"*)
      err "run.$k contains a destructive path: $c" ;;
  esac
done

# --------------------------------------------------------- is it even YAML?
# This script checked KEYS and never once checked that the file PARSES, so it
# printed "✓ vantry.yml is valid" for a document Psych rejects at line 25 — the
# kit's own named failure mode, on its single configuration surface, cited by
# /bootstrap's Done-when. Use a real parser when the machine has one, and SAY SO
# when it does not rather than implying a check that never ran.
_yaml_checked=""
if command -v python3 >/dev/null 2>&1 && python3 -c 'import yaml' 2>/dev/null; then
  _yaml_checked="python3"
  python3 -c 'import sys,yaml; yaml.safe_load(open(sys.argv[1]))' "$VANTRY_CFG" 2>/tmp/vantry-yaml.$$ \
    || err "vantry.yml is not parseable YAML: $(head -3 /tmp/vantry-yaml.$$ | tr '\n' ' ')"
  rm -f /tmp/vantry-yaml.$$
elif command -v ruby >/dev/null 2>&1; then
  _yaml_checked="ruby"
  ruby -ryaml -e 'YAML.load_file(ARGV[0])' "$VANTRY_CFG" 2>/tmp/vantry-yaml.$$ \
    || err "vantry.yml is not parseable YAML: $(head -3 /tmp/vantry-yaml.$$ | tr '\n' ' ')"
  rm -f /tmp/vantry-yaml.$$
elif command -v yq >/dev/null 2>&1; then
  _yaml_checked="yq"
  yq e '.' "$VANTRY_CFG" >/dev/null 2>/tmp/vantry-yaml.$$ \
    || err "vantry.yml is not parseable YAML: $(head -3 /tmp/vantry-yaml.$$ | tr '\n' ' ')"
  rm -f /tmp/vantry-yaml.$$
fi
if [ -n "$_yaml_checked" ]; then echo "  ✓ parses as YAML (checked with $_yaml_checked)"
else warn "no YAML parser on this machine (python3+pyyaml, ruby or yq) — the SYNTAX of vantry.yml was NOT checked, only its keys"; fi

# ---------------------------------------------------------------- timeouts
for _ph in default install test build ready smoke; do
  _t="$(vantry_cfg "timeouts.$_ph")"
  [ -z "$_t" ] && continue
  case "$_t" in
    ''|*[!0-9]*) err "timeouts.$_ph: '$_t' is not a whole number of seconds" ;;
    *) [ "$_t" -lt 5 ] && warn "timeouts.$_ph is ${_t}s — short enough to kill a healthy step" ;;
  esac
done
grep -qE '^[[:space:]]+timeouts:' "$VANTRY_CFG" 2>/dev/null && \
  err "timeouts: must be a TOP-LEVEL block, not nested under run: — nested, it is silently unreadable and every limit you set is ignored"

# ------------------------------------------------------- autonomous merges
# `merge.authority: agent` with no `.vantry/autopilot.json` beside it usually
# means a run died before step 5 and left the door open. It is legitimate on a
# project that genuinely lets agents merge — hence a warning, not an error — but
# it must never be silent.
if [ "$(vantry_cfg merge.authority human)" = "agent" ] && [ ! -f "$VANTRY_ROOT/.vantry/autopilot.json" ]; then
  warn "merge.authority is 'agent' and no .vantry/autopilot.json records who granted it — if an /autopilot run died, restore it; if this is deliberate, say so in the file"
fi

# ------------------------------------------------------------- acceptance
# Guardrails that keep this list from decaying into "run the test suite again".
AC_N=0
while IFS= read -r ac; do
  [ -n "$ac" ] || continue
  AC_N=$((AC_N + 1))
  # The SAME parse verify.sh uses. Counting fields rejected any command with a
  # pipe in it — so CI's contract job failed exactly the criteria the gate had
  # just accepted, and the v3.4 pipe fix was half-landed.
  id="${ac%% | *}"
  _r="${ac#* | }"; _r="${_r#* | }"
  cmd="${_r#* | }"
  case "$ac" in
    *" | "*" | "*" | "*) : ;;
    *) err "acceptance '$id': needs four fields separated by ' | ' — AC-n | REQ-n | statement | command"; cmd="" ;;
  esac
  case "$id" in AC-*) : ;; *) err "acceptance '$id': the id must look like AC-3" ;; esac
  if [ -z "$cmd" ]; then
    err "acceptance '$id': no command — a criterion with nothing to run proves nothing"
    continue
  fi
  case "$(printf '%s' "$cmd" | sed 's/^[[:space:]]*//')" in
    '#!'*) : ;;
    '#'*)  err "acceptance '$id': the command is a comment ($cmd) — it would run, exit 0, and be written into the receipt as proof of $(printf '%s' "$ac" | awk -F' \\| ' '{print $2}')" ;;
  esac
  # A criterion that just re-runs the suite proves nothing the suite did not
  # already prove, and it makes every receipt slower for no added meaning.
  # A command that cannot fail is a criterion that proves nothing, and the
  # receipt records it as "status":"pass" beside the requirement id — the
  # flagship differentiator certifying a vacuous truth. Reproduced with
  # `AC-1 | REQ-004 | a refund above the original amount is refused | exit 0`.
  case "$(printf '%s' "$cmd" | tr -d '[:space:]')" in
    true|:|exit0|exit|/bin/true)
      err "acceptance '$id': '$cmd' cannot fail, so it proves nothing — the receipt would record it as proof of $(printf '%s' "$ac" | awk -F' \\| ' '{print $2}')" ;;
  esac
  case "$cmd" in
    echo\ *|printf\ *)
      err "acceptance '$id': '$cmd' only prints — a criterion must ASSERT. Pipe it into a test, or use grep -q / test / an exit code." ;;
  esac
  # Byte-equality only caught copy-paste. `write-tests` tells the agent a checker
  # enforces "name one behaviour, never the whole suite", and a reworded copy of
  # the suite walked straight through — so the receipt certified one named
  # requirement while running everything.
  #
  # The rule: strip the suite command off the FRONT of the criterion, then look at
  # what is left. It has to select something — a path, a test name, or a selector
  # flag. Only cosmetic flags remaining (`--silent`, `-q`, `--reporter=…`) means
  # this is the same suite wearing one requirement's name.
  #
  # An earlier version looked for "a token containing a dot", which matched the
  # suite's own script path — so `bash tests/unit.sh --silent` read as "selects a
  # file" and passed. Judge the REMAINDER, never the whole string.
  _rt="$(vantry_cfg run.test)"; _rs="$(vantry_cfg run.smoke)"
  [ "$cmd" = "$_rt" ] && err "acceptance '$id' re-runs run.test verbatim — a criterion must prove ONE named behaviour"
  [ "$cmd" = "$_rs" ] && err "acceptance '$id' re-runs run.smoke verbatim — same reason"
  for _suite in "$_rt" "$_rs"; do
    [ -n "$_suite" ] || continue
    case "$cmd" in
      "$_suite "*) _rest="${cmd#$_suite }" ;;
      *) continue ;;
    esac
    _selects=0
    for _tok in $_rest; do
      case "$_tok" in
        -t|-k|-e|--grep|--filter|-run|--test|--testNamePattern) _selects=1 ;;
        -t=*|-k=*|--grep=*|--filter=*|-run=*|-Dtest=*|--testNamePattern=*) _selects=1 ;;
        -*) : ;;                                  # a cosmetic flag selects nothing
        *)  _selects=1 ;;                         # a bare word: a path or a test name
      esac
    done
    if [ "$_selects" -eq 0 ]; then
      err "acceptance '$id': '$cmd' is the whole suite plus cosmetic flags — it proves everything and therefore names nothing. Add a file, a test id, or a -t/-k/--grep selector."
    fi
  done
done <<EOF
$(vantry_cfg_list acceptance)
EOF
[ "$AC_N" -gt 12 ] && warn "$AC_N acceptance criteria: past ~12 this runs on every verification and the loop gets slow. Fold the settled ones into run.smoke."
[ "$AC_N" -gt 0 ] && echo "  ✓ $AC_N acceptance criterion/criteria declared"

# --------------------------------------------------------------------- paths
T=0; while IFS= read -r _; do T=$((T+1)); done <<EOF
$(vantry_cfg_list trivial_paths)
EOF
S2=0; while IFS= read -r l; do [ -n "$l" ] && S2=$((S2+1)); done <<EOF
$(vantry_cfg_list sensitive_paths)
EOF
[ "$S2" -eq 0 ] && warn "sensitive_paths is empty — the security gate and CODEOWNERS have nothing to match."

# `for g in $(vantry_cfg_list …)` is UNQUOTED, so the shell glob-expanded every
# pattern before the loop ever saw it: a `**` entry became a list of filenames,
# and the guard below — the single most consequential thing this file enforces —
# could never fire. One config line therefore disabled the whole gate while this
# validator printed "✓ vantry.yml is valid". Read line by line instead.
while IFS= read -r g; do
  [ -n "$g" ] || continue
  printf 'x\n' | grep -qE "^$(vantry_glob_to_re "$g")$" >/dev/null 2>&1
  [ $? -gt 1 ] && err "unparseable glob in vantry.yml: $g"
done <<EOF
$(vantry_cfg_list trivial_paths)
$(vantry_cfg_list sensitive_paths)
EOF

# A trivial_paths entry that swallows source code disarms the gate silently.
while IFS= read -r g; do
  [ -n "$g" ] || continue
  case "$g" in
    "**"|"*"|"**/*"|"/**"|".")
      err "trivial_paths contains '$g' — that marks EVERYTHING trivial and disables the gate entirely." ;;
  esac
  for probe in src/index.ts app/page.tsx lib/auth.ts main.go cmd/main.go; do
    vantry_glob_match "$probe" "$g" && err "trivial_paths glob '$g' matches the source file '$probe' — changes there would owe no verification, which is the gate switched off by another name."
  done
done <<EOF
$(vantry_cfg_list trivial_paths)
EOF

echo
if [ "$ERR" -eq 0 ]; then echo "✓ vantry.yml is valid."; else echo "✗ vantry.yml has errors (above)."; fi
exit "$ERR"
