#!/usr/bin/env bash
# =============================================================================
#  verify.sh — the ONE executable definition of "verified" in this project.
#
#  It RUNS the commands declared in vantry.yml, captures their REAL exit codes,
#  and writes the receipt every gate reads. Nothing else may write a receipt:
#  it never accepts an exit code as an argument, and --observe refuses to
#  annotate a run that did not happen. An agent can describe a verification it
#  did not perform; it cannot produce this file.
#
#  MODES
#    scripts/verify.sh                       test + build + start/ready + smoke → receipt
#    scripts/verify.sh --smoke               smoke only (fast re-check)
#    scripts/verify.sh --probe               run each declared line, report which are real (no receipt)
#    scripts/verify.sh --observe "exp" "obs" [artifact ...]
#    scripts/verify.sh --gate [--stop|--pre-commit|--pre-push|--ci]
#                                            evaluate only: 0 ok · 1 warn · 2 BLOCK
#    scripts/verify.sh --override "reason (>=20 chars)"
#    scripts/verify.sh --status              human-readable state
#    scripts/verify.sh --init                create vantry.yml from the example
#
#  bash 3.2 / macOS compatible. No runtime dependency beyond git + bash.
# =============================================================================
set -uo pipefail

# The manifest is the accurate answer in an ADOPTED repo (it records which kit
# version was installed); VERSION is the answer in the kit itself.
VANTRY_VERSION="$(sed -n 's/.*"kit_version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
                    "$(dirname "$0")/../.vantry/manifest.json" 2>/dev/null | head -1)"
[ -n "$VANTRY_VERSION" ] || VANTRY_VERSION="$(cat "$(dirname "$0")/../VERSION" 2>/dev/null || echo unknown)"
_here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/vantry-common.sh
. "$_here/lib/vantry-common.sh"
cd "$VANTRY_ROOT" || exit 1

SLUG="$(vantry_slug)"
RECEIPT=".vantry/receipts/$SLUG.verify.json"
OVERRIDE=".vantry/overrides/$SLUG.json"
TMP="$(mktemp -d)"
APP_PID=""
# `pnpm dev` is a wrapper that spawns the real server. Killing only the job we
# started leaves that server holding the port, and the next run mistakes it for
# its own app. Job control (set -m) puts the app in its own process group so we
# can take the whole tree down.
kill_app() {
  [ -n "$APP_PID" ] || return 0
  kill -TERM "-$APP_PID" 2>/dev/null || kill -TERM "$APP_PID" 2>/dev/null
  local i=0
  while [ $i -lt 20 ] && kill -0 "$APP_PID" 2>/dev/null; do sleep 0.1; i=$((i + 1)); done
  kill -KILL "-$APP_PID" 2>/dev/null || kill -KILL "$APP_PID" 2>/dev/null
  wait "$APP_PID" 2>/dev/null
  APP_PID=""
}
# Belt as well as braces. Disarming the trap inside the watchdog is the fix; this
# makes the failure structurally impossible whatever a given bash does with an
# inherited EXIT trap. A subshell gets its own copy of this variable, so setting
# it there cannot leak back out.
cleanup() {
  [ "${VANTRY_NO_CLEANUP:-0}" = "1" ] && return 0
  kill_app; rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

STEPS=""
ERRS=0
PROBE=0
ACCEPT=""

need_config() {
  [ -f "$VANTRY_CFG" ] && return 0
  cat >&2 <<'MSG'
✗ vantry.yml is missing — verification is UNDEFINED for this project.
  This is deliberately fatal. Guessing how to run your software would produce
  a receipt that proves nothing, which is worse than no receipt at all.
  Create it:  scripts/verify.sh --init
MSG
  exit 2
}

# --------------------------------------------------------------- run one step
step() {  # step <phase> <command>   → the command's REAL exit code
  local phase="$1" cmd="$2" t0 t1 rc out bare
  [ -z "$cmd" ] && return 0
  # `eval` on a comment exits 0. Left alone, a criterion reading "# TODO write
  # this test" was executed, returned success, and was written into the receipt
  # as PROOF of the requirement it names. A command with nothing executable in
  # it is not a passing command — it is an undeclared one, and saying so loudly
  # is the whole point of this file.
  bare="$(printf '%s\n' "$cmd" | sed -e 's/^[[:space:]]*//' | grep -v '^#[^!]' | grep -v '^#$' | tr -d '[:space:]')"
  # A no-op is a legitimate answer for run.install or run.build ("nothing to do
  # here"), and a lie for an ACCEPTANCE criterion, which exists to prove one
  # named behaviour. Same denylist as validate-config.sh (CI's contract job), so
  # a criterion cannot be green on a laptop and red in CI, scoped to the steps
  # where a no-op is dishonest.
  case "$phase" in
    ac:*)
      case "$bare" in
        true|:|exit0|exit|/bin/true)
          echo "✗ [$phase] \"$cmd\" cannot fail, so it proves nothing."
          echo "    A criterion is a proof obligation. Give it a command that can return non-zero."
          STEPS="$STEPS{\"phase\":\"$phase\",\"cmd\":\"$(vantry_esc "$cmd")\",\"exit_code\":126,\"duration_ms\":0,\"tail\":\"a criterion that cannot fail is not evidence\"},"
          return 126 ;;
      esac ;;
  esac
  if [ -z "$bare" ]; then
    echo "✗ [$phase] this is not a command — it is a comment or blank:"
    echo "    $cmd"
    echo "    A step that executes nothing cannot pass. Declare the real command."
    STEPS="$STEPS{\"phase\":\"$phase\",\"cmd\":\"$(vantry_esc "$cmd")\",\"exit_code\":126,\"duration_ms\":0,\"tail\":\"not a command\"},"
    return 126
  fi
  echo "→ [$phase] $cmd"
  t0="$(date +%s)"
  # No step had a wall-clock bound, so a leaked handle in a test suite — an
  # unclosed server or DB pool, the commonest failure in an inherited repo —
  # turned this into a process that never returns and never says why. The Stop
  # hook, pre-push and CI all call it, so the whole loop stalled. --probe, whose
  # entire promise is "tells you which lines are real", hung identically.
  #
  # timeout(1) is absent on macOS, so this is a watchdog. `set -m` makes the
  # child a process-group leader — the same mechanism the [start] phase already
  # uses — so the kill reaches the grandchildren a bare `kill <pid>` would leave
  # behind holding the port.
  #
  # Config is a TOP-LEVEL `timeouts:` block, two levels deep, because that is
  # what vantry_cfg reads. It is worth saying plainly: the first version of this
  # used `run.timeouts.test`, which vantry_cfg cannot parse, so the feature was
  # silently inert and a 600s step sailed past a declared 5s limit.
  _limit="$(vantry_cfg "timeouts.$phase")"
  [ -n "$_limit" ] || _limit="$(vantry_cfg timeouts.default)"
  case "$_limit" in ''|*[!0-9]*) _limit=1800 ;; esac
  set -m 2>/dev/null
  ( eval "$cmd" ) >"$TMP/$phase.out" 2>&1 &
  _cpid=$!
  set +m 2>/dev/null
  ( VANTRY_NO_CLEANUP=1
    # DISARM THE TRAP FIRST. bash runs an EXIT trap set in the parent when a
    # SUBSHELL exits too, so this watchdog — whose whole job is to exit quietly
    # the moment the step finishes — was firing cleanup(): `rm -rf "$TMP"` and
    # kill_app, mid-run, on its own parent. The step after it then died with
    # "$TMP/<phase>.out: No such file or directory". bash 3.2 on macOS does not
    # do it and bash 5 on Linux does, so it passed locally and failed in CI.
    trap - EXIT INT TERM
    _e=0
    while [ "$_e" -lt "$_limit" ]; do
      kill -0 "$_cpid" 2>/dev/null || exit 0
      sleep 1; _e=$((_e + 1))
    done
    kill -0 "$_cpid" 2>/dev/null || exit 0
    kill -TERM "-$_cpid" 2>/dev/null || kill -TERM "$_cpid" 2>/dev/null
    sleep 2
    kill -KILL "-$_cpid" 2>/dev/null || kill -KILL "$_cpid" 2>/dev/null
  ) >/dev/null 2>&1 &
  _wpid=$!
  wait "$_cpid" 2>/dev/null
  rc=$?
  kill "$_wpid" 2>/dev/null; wait "$_wpid" 2>/dev/null
  t1="$(date +%s)"
  if [ $((t1 - t0)) -ge "$_limit" ]; then
    # 124 is timeout(1)'s convention. "Hung" and "failed" are different problems
    # and the receipt has to be able to say which one it saw.
    rc=124
    echo "✗ [$phase] exceeded ${_limit}s and was killed — it did not fail, it never finished."
    echo "    Raise it in vantry.yml (timeouts.$phase: <seconds>) or find what is not closing."
  fi
  out="$(tail -c 600 "$TMP/$phase.out" 2>/dev/null)"
  if [ "$rc" -ne 0 ]; then
    echo "✗ [$phase] exit $rc"
    tail -n 80 "$TMP/$phase.out" 2>/dev/null | sed 's/^/    /'
  fi
  STEPS="$STEPS{\"phase\":\"$phase\",\"cmd\":\"$(vantry_esc "$cmd")\",\"exit_code\":$rc,\"duration_ms\":$(( (t1 - t0) * 1000 )),\"tail\":\"$(vantry_esc "$out")\"},"
  return $rc
}

# ------------------------------------------------------------------- full run
do_run() {
  local only_smoke="${1:-0}" rc=0 smoke start ready logs t=0

  need_config
  smoke="$(vantry_cfg run.smoke)"
  # --probe is the diagnostic twin of a run: it exercises the same contract but
  # is allowed to find it incomplete, because that is the entire point of asking.
  # It writes NO receipt — verify.sh is the only writer, and a diagnostic mode
  # must not quietly become a second one.
  if [ "$PROBE" = "1" ] && [ -z "$smoke" ]; then
    echo "⚠ run.smoke is not declared — verification is UNDEFINED for this project."
    echo "  Everything else below still runs, so you can see what already works."
    echo
  fi
  if [ "$PROBE" != "1" ] && [ -z "$smoke" ]; then
    cat >&2 <<'MSG'
✗ vantry.yml: run.smoke is empty — verification is UNDEFINED for this project.
  A passing test suite is not a verification. Declare the command that
  EXERCISES the software the way a user does:
    web     smoke: pnpm exec playwright test tests/smoke.spec.ts
    service smoke: bash scripts/smoke.sh        # real requests + status assertions
    cli     smoke: bash scripts/smoke.sh        # run the binary, assert output + exit code
    library smoke: node scripts/smoke.mjs       # import the BUILT artifact and use it
MSG
    exit 2
  fi

  if [ "$only_smoke" = "0" ]; then
    step test  "$(vantry_cfg run.test)"  || rc=2
    step build "$(vantry_cfg run.build)" || rc=2
  fi

  start="$(vantry_cfg run.start)"
  ready="$(vantry_cfg run.ready)"
  logs="$(vantry_cfg run.logs .vantry/state/app.log)"

  if [ -n "$start" ]; then
    mkdir -p "$(dirname "$logs")"; : > "$logs"
    set -m 2>/dev/null
    ( eval "$start" ) >>"$logs" 2>&1 &
    APP_PID=$!
    set +m 2>/dev/null
    echo "→ [start] $start (pid $APP_PID)"
    if [ -n "$ready" ]; then
      echo "→ [ready] polling: $ready"
      ready_rc=1
      while [ "$t" -lt 90 ]; do
        if eval "$ready" >/dev/null 2>&1; then ready_rc=0; break; fi
        if ! kill -0 "$APP_PID" 2>/dev/null; then
          echo "✗ the app DIED during startup — last lines of $logs:"
          tail -n 30 "$logs" 2>/dev/null | sed 's/^/    /'
          ready_rc=2; break
        fi
        sleep 1; t=$((t + 1))
      done
      if [ "$t" -ge 90 ] && [ "$ready_rc" != "0" ]; then
        echo "✗ the app never became ready within 90s ($ready)"
        tail -n 30 "$logs" 2>/dev/null | sed 's/^/    /'
        ready_rc=2
      fi
      # The poll IS the observation. Re-running the ready command afterwards, as
      # a second `step`, made the gate flaky in the most damaging way: a stale
      # readiness marker from the previous run satisfied the poll instantly, the
      # freshly-started app then cleared it, and the re-run failed — so a project
      # verified on the first attempt and was BLOCKED on the second with nothing
      # changed. Record what the poll saw; do not ask twice.
      if [ "$ready_rc" = "0" ]; then
        echo "✓ [ready] $ready (after ${t}s)"
        STEPS="$STEPS{\"phase\":\"ready\",\"cmd\":\"$(vantry_esc "$ready")\",\"exit_code\":0,\"duration_ms\":$((t * 1000)),\"tail\":\"became ready after ${t}s\"},"
      else
        STEPS="$STEPS{\"phase\":\"ready\",\"cmd\":\"$(vantry_esc "$ready")\",\"exit_code\":1,\"duration_ms\":$((t * 1000)),\"tail\":\"never became ready\"},"
        rc=2
      fi
    fi
  fi

  step smoke "$smoke" || rc=2

  # The acceptance criteria. This is what makes a receipt answer "which agreed
  # requirement does this prove?" instead of only "did something work?".
  # A criterion is added here when it PASSES, at the end of /pickup-issue —
  # never when the spec is written, or every board would be red until the work
  # lands. Once added it runs forever: a regression on REQ-004 six months later
  # blocks the push of someone who has never heard of REQ-004.
  local ac id req then_ cmd n=0
  while IFS= read -r ac; do
    [ -n "$ac" ] || continue
    # Parameter expansion, not awk -F: the command is EVERYTHING after the third
    # separator. Taking "field 4" truncated any command containing a pipe —
    # `cat app.sh | grep -q MISSING` ran as `cat app.sh`, exited 0, and the
    # criterion PASSED while the real command exits 1. A false pass inside the
    # gate is the one defect this project cannot ship.
    id="${ac%% | *}"
    _r="${ac#* | }"; req="${_r%% | *}"
    _r="${_r#* | }"; then_="${_r%% | *}"
    cmd="${_r#* | }"
    case "$ac" in *" | "*" | "*" | "*) : ;; *) cmd="" ;; esac
    if [ -z "$cmd" ]; then
      echo "✗ [ac:$id] malformed — expected 'AC-n | REQ-n | statement | command'"
      rc=2; continue
    fi
    ACCEPT="$ACCEPT{\"id\":\"$(vantry_esc "$id")\",\"req\":\"$(vantry_esc "$req")\",\"then\":\"$(vantry_esc "$then_")\",\"cmd\":\"$(vantry_esc "$cmd")\","
    # validate-config.sh (CI's contract job) refuses any id not matching AC-*, and
    # this accepted anything — so a criterion could be green on a laptop and red
    # in CI. Same rule, both layers.
    case "$id" in
      AC-*) : ;;
      *) echo "✗ [ac:$id] the id must look like AC-3 — CI's contract job refuses anything else"
         ACCEPT="$ACCEPT{\"id\":\"$(vantry_esc "$id")\",\"req\":\"\",\"then\":\"\",\"cmd\":\"\",\"status\":\"malformed\"},"
         rc=2; continue ;;
    esac
    if step "ac:$id" "$cmd"; then ACCEPT="$ACCEPT\"status\":\"pass\"},"
    else ACCEPT="$ACCEPT\"status\":\"fail\"},"; rc=2; fi
    n=$((n + 1))
  done <<EOF
$(vantry_cfg_list acceptance)
EOF
  [ "$n" -gt 0 ] && echo "→ $n acceptance criterion/criteria carried by this project"

  # A green screen with a 500 in the log is not a pass.
  if [ -n "$start" ] && [ -f "$logs" ]; then
    grep -nEi 'unhandled|uncaught|ECONNREFUSED|\bERROR\b|\bFATAL\b|HTTP/[0-9.]+ 5[0-9][0-9]' "$logs" 2>/dev/null | head -20 > "$TMP/logerr"
    ERRS="$(wc -l < "$TMP/logerr" | tr -d ' ')"
    if [ "${ERRS:-0}" -gt 0 ]; then
      echo "✗ $ERRS error line(s) in $logs:"
      sed 's/^/    /' "$TMP/logerr"
      rc=2
    fi
  fi

  kill_app

  if [ "$PROBE" = "1" ]; then
    echo
    echo "── contract truth table ──────────────────────────────"
    local k v
    for k in install test build start ready smoke; do
      v="$(vantry_cfg "run.$k")"
      if [ -z "$v" ]; then printf '  %-8s  —  not declared\n' "$k"
      else
        case "$STEPS" in
          *"\"phase\":\"$k\",\"cmd\""*)
            if printf '%s' "$STEPS" | grep -q "\"phase\":\"$k\",\"cmd\":\"[^\"]*\",\"exit_code\":0"
            then printf '  %-8s  ✓  %s\n' "$k" "$v"
            else printf '  %-8s  ✗  %s\n' "$k" "$v"; fi ;;
          *) printf '  %-8s  ·  %s   (declared, not run by the probe)\n' "$k" "$v" ;;
        esac
      fi
    done
    echo "──────────────────────────────────────────────────────"
    echo "Fix every ✗ and fill every '— not declared' that matters, then run"
    echo "scripts/verify.sh for real. The probe writes no receipt, on purpose."
    return 0
  fi

  write_receipt "$rc"
  if [ "$rc" -eq 0 ]; then
    echo
    echo "✓ VERIFIED — receipt written to $RECEIPT"
    echo "  Now record what you actually SAW (required in strict mode):"
    echo "    scripts/verify.sh --observe \"<expected>\" \"<what you observed>\" [artifact ...]"
  else
    echo
    echo "✗ NOT VERIFIED — receipt written with verdict:fail."
    echo "  Fix it. Do not describe this change as working, done, or fixed."
  fi
  return $rc
}

# A deployment smoke is NOT a verification, and writing both as kind:"verify" let
# one stand in for the other: `--smoke` skipped test and build, wrote
# verdict:"pass" to the same path, and the gate opened. /release runs --smoke
# against a deployed environment; that must never satisfy the push gate.
write_receipt() {
  local KIND="verify"
  [ "${SMOKE_ONLY:-0}" = "1" ] && KIND="smoke"
  local rc="$1" verdict="pass" files
  [ "$rc" -ne 0 ] && verdict="fail"
  mkdir -p .vantry/receipts
  files="$(vantry_changed_files | sed 's/.*/"&"/' | paste -sd, - 2>/dev/null)"
  cat > "$RECEIPT" <<JSON
{
  "schema": "vantry.receipt/1",
  "kind": "$KIND",
  "verdict": "$verdict",
  "produced_by": "scripts/verify.sh@$VANTRY_VERSION",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)",
  "head": "$(git rev-parse HEAD 2>/dev/null)",
  "base": "$(vantry_base_point)",
  "tree_digest": "$(vantry_tree_digest)",
  "project_type": "$(vantry_cfg project_type unknown)",
  "strictness": "$(vantry_cfg strictness standard)",
  "files": [${files:-}],
  "steps": [${STEPS%,}],
  "log_scan": { "file": "$(vantry_cfg run.logs)", "errors": ${ERRS:-0} },
  "acceptance": [${ACCEPT%,}],
  "observation": { "expected": "", "observed": "", "artifacts": [] },
  "seal": ""
}
JSON
  # Seal it — a keyed hash over verdict + tree_digest + created_at + head +
  # produced_by, keyed by a secret that lives only in .vantry/state/ here.
  _seal="$(vantry_seal_compute "$(vantry_seal_payload "$RECEIPT")")"
  if [ -n "$_seal" ]; then
    sed -e "s#\"seal\": \"\"#\"seal\": \"$_seal\"#" "$RECEIPT" > "$RECEIPT.tmp" \
      && mv "$RECEIPT.tmp" "$RECEIPT"
  fi
  vantry_log "verify.run" "$verdict"
}

# ------------------------------------------------------ annotate the receipt
do_observe() {
  if [ ! -f "$RECEIPT" ]; then
    echo "✗ no receipt for '$SLUG' — run scripts/verify.sh first." >&2
    echo "  You cannot narrate a run that did not happen." >&2
    exit 2
  fi
  local exp="${1:-}" obs="${2:-}"
  [ $# -ge 2 ] && shift 2 || shift $#
  if [ "${#exp}" -lt 10 ]; then
    echo "✗ 'expected' is empty — step 1 of verify-change is to state, in one line, what a user" >&2
    echo "  should now be able to do. An observation with nothing to compare against is a note." >&2
    exit 2
  fi
  if [ "${#obs}" -lt 20 ]; then
    echo "✗ 'observed' must quote what you ACTUALLY saw (>=20 chars)." >&2
    echo "  e.g. \"GET /orders/9f31 → 200, status pill reads 'In transit', console clean\"" >&2
    exit 2
  fi
  # Artifacts are EVIDENCE, and evidence you did not capture is not evidence.
  # This recorded any string, so a receipt could carry two screenshot filenames
  # that were never taken and --status printed them as corroboration. Playbooks
  # that demand a screenshot (ui-component, design-review, perf-profile) can now
  # rely on this; before, they could not.
  local _a _missing=""
  for _a in "$@"; do
    [ -e "$_a" ] || _missing="$_missing $_a"
  done
  if [ -n "$_missing" ]; then
    echo "✗ these artifacts do not exist:" >&2
    for _a in $_missing; do echo "    $_a" >&2; done
    echo "  You cannot attach evidence you did not capture. Take the screenshot," >&2
    echo "  save the profile, write the log — then attach the real path." >&2
    exit 2
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$RECEIPT" "$exp" "$obs" "$@" <<'PY'
import json, sys
path, exp, obs = sys.argv[1], sys.argv[2], sys.argv[3]
arts = sys.argv[4:]
d = json.load(open(path))
d["observation"] = {"expected": exp, "observed": obs, "artifacts": arts}
json.dump(d, open(path, "w"), indent=2)
PY
  else
    local arts="" a
    for a in "$@"; do arts="$arts\"$(vantry_esc "$a")\","; done
    sed -e "s#\"observation\": {.*#\"observation\": { \"expected\": \"$(vantry_esc "$exp")\", \"observed\": \"$(vantry_esc "$obs")\", \"artifacts\": [${arts%,}] }#" \
        "$RECEIPT" > "$RECEIPT.tmp" && mv "$RECEIPT.tmp" "$RECEIPT"
  fi
  vantry_log "verify.observe" "$obs"
  echo "✓ observation recorded in $RECEIPT"
}

# ------------------------------------------------------------------- the GATE
#  exit 0 = nothing owed / satisfied · 1 = warn · 2 = BLOCK
do_gate() {
  local mode="${1:---stop}" strict policy reason="" n cur have obs

  [ -f "$VANTRY_CFG" ] || return 0          # not a Vantry project → never interfere

  strict="$(vantry_cfg strictness standard)"
  policy="$(vantry_cfg gates.verify_change block)"
  [ "$strict" = "relaxed" ] && policy="warn"
  [ "$policy" = "off" ] && return 0

  # A base that does not resolve is not a base. Without one the changeset is
  # computed against HEAD, which is empty the moment anything is committed — so
  # a repo whose trunk is not `main` and has no origin reported "verdict: OK"
  # and enforced nothing. Refusing to guess is the same rule that governs a
  # missing run.smoke: an undefined criterion is never a passing one.
  if ! vantry_base_resolves; then
    cat >&2 <<MSG

BLOCKED BY VANTRY — the gate cannot tell what is pending.
  reason : merge.base is '$(vantry_base_ref)', and no such branch exists here
           (checked 'origin/$(vantry_base_ref)' and '$(vantry_base_ref)')
  effect : without a base, the changeset is measured against HEAD and goes empty
           the moment you commit — the gate would fall silent instead of failing.
  fix    : set the real trunk in vantry.yml, e.g.
             merge:
               base: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)
MSG
    vantry_log "gate.block" "$mode: base ref does not resolve"
    [ "$policy" = "warn" ] && return 1
    return 2
  fi

  n="$(vantry_changed_files | grep -c . || true)"
  if [ "${n:-0}" -eq 0 ]; then
    # An empty changeset has two very different causes and this returned the same
    # silent 0 for both. On the trunk with no remote counterpart, the base point
    # IS HEAD, so the diff can only ever see uncommitted files — commit a
    # behavioural change and the gate reports "nothing to verify". That is the
    # default greenfield state (a repo exists before its remote does), and it
    # made the gate look armed while seeing nothing.
    if vantry_gate_blind; then
      case "$mode" in
        --pre-commit|--pre-push)
          cat >&2 <<MSG

⚠ THE GATE CANNOT SEE COMMITTED WORK HERE.
  where  : branch '$SLUG' is the trunk ($(vantry_base_ref)) and has no remote
           counterpart, so "what changed" can only mean uncommitted files.
  effect : anything you have already committed is invisible to this gate.
  fix    : push a trunk (\`git remote add origin …\` + \`git push -u origin $SLUG\`)
           so unpushed commits become the changeset — or do the work on a branch.
MSG
          vantry_log "gate.blind" "$mode: trunk with no remote counterpart"
          [ "$strict" = "strict" ] && return 2
          return 1 ;;
      esac
    fi
    return 0                                # genuinely nothing non-trivial pending
  fi

  # Computed here, not further down: the override check below compares against
  # it, and it was reading an unset variable — so a fresh, valid override looked
  # stale and blocked. A gate that refuses its own escape hatch is worse than
  # one that has none, because it teaches people the hatch does not work.
  cur="$(vantry_tree_digest)"

  if [ -f "$OVERRIDE" ]; then
    # The whole point of an override is that the REASON travels with the PR for
    # a human to read. This printed "It is committed and shown in the PR" as a
    # statement of fact without ever checking, so an untracked file silently
    # unblocked the push and the reviewer saw an unexplained bypass. An override
    # nobody can read is just a disabled gate with extra steps.
    if git ls-files --error-unmatch "$OVERRIDE" >/dev/null 2>&1; then
      # An override is a decision about a SPECIFIC state of the code, and it was
      # being honoured forever: write it once, keep changing the code, and every
      # later change inherited a waiver granted for something else. Bind it to
      # the tree it was granted for, exactly as a receipt is bound.
      _ovd="$(vantry_json_get "$(cat "$OVERRIDE")" tree_digest)"
      if [ -n "$_ovd" ] && [ "$_ovd" != "$cur" ]; then
        cat >&2 <<MSG

BLOCKED BY VANTRY — the override no longer describes this code.
  reason  : $(vantry_json_get "$(cat "$OVERRIDE")" reason)
  granted : for tree $(printf '%.12s' "$_ovd")
  now     : $(printf '%.12s' "$cur")
  why     : a waiver is a decision about a specific state. Carrying it forward
            would let one reviewed exception cover every change made after it.
  fix     : scripts/verify.sh — or, if it is still genuinely impossible,
            scripts/verify.sh --override "<why>" again, and commit that.
MSG
        vantry_log "gate.block" "$mode: override is stale"
        [ "$policy" = "warn" ] && return 1
        return 2
      fi
      echo "⚠ VERIFICATION OVERRIDDEN for '$SLUG' — $(vantry_json_get "$(cat "$OVERRIDE")" reason)" >&2
      echo "  (declared by $(vantry_json_get "$(cat "$OVERRIDE")" who), for this exact tree. Committed, so it travels with the PR.)" >&2
      return 0
    fi
    cat >&2 <<MSG

BLOCKED BY VANTRY — the override exists but is NOT committed.
  file   : $OVERRIDE
  reason : $(vantry_json_get "$(cat "$OVERRIDE")" reason)
  why    : an override is a reviewed decision. Untracked, nobody sees it — not
           the reviewer, not CI — and it degrades to a silent bypass.
  fix    : git add "$OVERRIDE" && git commit -m "chore: record verification override"
MSG
    vantry_log "gate.block" "$mode: override present but untracked"
    [ "$policy" = "warn" ] && return 1
    return 2
  fi

  if [ ! -f "$RECEIPT" ]; then
    reason="no verification receipt exists for branch '$SLUG'"
  else
    have="$(vantry_receipt_field "$RECEIPT" verdict)"
    _kind="$(vantry_receipt_field "$RECEIPT" kind)"
    # A receipt claiming a pass with no steps describes no run at all. Free to
    # check, and it kills the laziest forgery outright.
    # vantry_receipt_field cannot index an array (jq getpath takes a string key
    # for "0" and returns null), so it reported "no steps" for every receipt.
    # Ask the file the plain question instead.
    _steps="$(grep -c '"phase"' "$RECEIPT" 2>/dev/null || printf 0)"
    vantry_seal_ok "$RECEIPT"; _sealrc=$?
    if [ -n "$_kind" ] && [ "$_kind" != "verify" ]; then
      reason="the only receipt here is a '$_kind' run — a deployment smoke skips test and build and cannot stand in for a verification. Run: scripts/verify.sh"
    elif [ "$_sealrc" -eq 1 ]; then
      reason="the receipt's seal does not match its own claims — it was not written by scripts/verify.sh on this machine"
    elif [ "${_steps:-0}" -eq 0 ] && [ "$have" = "pass" ]; then
      reason="the receipt records a pass with NO steps — nothing was run"
    elif [ "$have" != "pass" ]; then
      reason="the last verification FAILED (verdict: ${have:-unknown})"
    elif [ "$(vantry_receipt_field "$RECEIPT" tree_digest)" != "$cur" ]; then
      reason="the code changed after the last verification (stale receipt)"
    elif [ "$strict" = "strict" ]; then
      obs="$(vantry_receipt_field "$RECEIPT" observation.observed)"
      [ "${#obs}" -lt 20 ] && reason="strict mode: the receipt records no observation (use --observe)"
    fi
  fi

  [ -z "$reason" ] && return 0

  if [ "$policy" = "warn" ]; then HEADING="UNVERIFIED CHANGE — allowed (strictness: relaxed), and recorded"
  else HEADING="BLOCKED BY VANTRY — unverified change."; fi
  cat >&2 <<MSG

$HEADING
  reason : $reason
  scope  : $n non-trivial file(s) changed on this branch
  fix    : scripts/verify.sh
             runs the tests AND actually starts and exercises the software
           scripts/verify.sh --observe "<expected>" "<what you actually saw>"

  If you genuinely cannot run it, write the single word UNVERIFIED and stop.
  Do NOT describe this change as working, done, fixed, ready, or verified.

  Deliberate human override (committed and reviewed):
    scripts/verify.sh --override "<why, >=20 chars>"
MSG
  vantry_log "gate.block" "$mode: $reason"
  [ "$policy" = "warn" ] && return 1
  return 2
}

do_override() {
  local reason="${1:-}"
  if [ "${#reason}" -lt 20 ]; then
    echo "✗ an override needs a real reason (>=20 chars). It is committed and reviewed." >&2
    exit 1
  fi
  mkdir -p .vantry/overrides
  cat > "$OVERRIDE" <<JSON
{
  "schema": "vantry.override/1",
  "branch": "$SLUG",
  "who": "$(git config user.name 2>/dev/null)",
  "email": "$(git config user.email 2>/dev/null)",
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "head": "$(git rev-parse HEAD 2>/dev/null)",
  "tree_digest": "$(vantry_tree_digest)",
  "reason": "$(vantry_esc "$reason")"
}
JSON
  vantry_log "gate.override" "$reason"
  echo "⚠ Override written to $OVERRIDE"
  echo "  COMMIT IT — CI and the PR template display it prominently. An override"
  echo "  that nobody sees is just a disabled gate."
}

do_status() {
  local n want="${1:-}"
  # An explicit branch lets a standup or handoff read another branch's receipt
  # without checking it out — reporting on work by mutating the tree that holds
  # it is not a read-only report.
  if [ -n "$want" ]; then
    SLUG="$(printf '%s' "$want" | tr '/' '-' | tr -cd 'A-Za-z0-9._-')"
    RECEIPT=".vantry/receipts/$SLUG.verify.json"
    OVERRIDE=".vantry/overrides/$SLUG.json"
    # It read the receipt of the branch you asked about and then computed
    # freshness and the changeset from whatever is CHECKED OUT — so a BLOCKED
    # branch green-ticked and a correctly verified one read STALE. /sprint-review
    # and /handoff both make their call on this output.
    if git rev-parse --verify --quiet "$want" >/dev/null 2>&1; then
      VANTRY_REF="$want"; export VANTRY_REF
    else
      echo "vantry $VANTRY_VERSION · branch $SLUG"
      echo "  branch     : ✗ NO SUCH BRANCH here — refusing to report on a ref I cannot see"
      return 0
    fi
    if [ ! -f "$RECEIPT" ]; then
      echo "vantry $VANTRY_VERSION · branch $SLUG"
      echo "  receipt    : none — this branch has never been verified here"
      echo "  verdict    : UNOBSERVED (say that word; do not infer a state)"
      return 0
    fi
  fi
  echo "vantry $VANTRY_VERSION · branch $SLUG"
  if [ ! -f "$VANTRY_CFG" ]; then echo "  contract   : ABSENT (scripts/verify.sh --init)"; return 0; fi
  echo "  strictness : $(vantry_cfg strictness standard)   gate: $(vantry_cfg gates.verify_change block)"
  if vantry_base_resolves; then
    echo "  base       : $(vantry_base_ref) @ $(vantry_base_point | cut -c1-8)"
  else
    echo "  base       : $(vantry_base_ref) — ✗ NO SUCH BRANCH (set merge.base in vantry.yml)"
  fi
  n="$(vantry_changed_files | grep -c . || true)"
  echo "  changed    : ${n:-0} non-trivial file(s)"
  vantry_gate_blind && echo "  visibility : ⚠ COMMITTED WORK IS INVISIBLE — you are on the trunk with no
               remote counterpart, so only uncommitted files are gated here"
  if [ -f "$RECEIPT" ]; then
    echo "  receipt    : $(vantry_receipt_field "$RECEIPT" verdict) @ $(vantry_receipt_field "$RECEIPT" created_at)"
    if [ "$(vantry_receipt_field "$RECEIPT" tree_digest)" = "$(vantry_tree_digest)" ]; then echo "  freshness  : CURRENT"
    else echo "  freshness  : STALE (the code changed since)"; fi
    echo "  observed   : $(vantry_receipt_field "$RECEIPT" observation.observed)"
  else
    echo "  receipt    : none"
  fi
  [ -f "$OVERRIDE" ] && echo "  OVERRIDE   : $(vantry_json_get "$(cat "$OVERRIDE")" reason)"
  do_gate --status >/dev/null 2>&1
  case $? in
    0) if vantry_gate_blind; then echo "  verdict    : BLIND — nothing is pending that this gate can SEE. That is not"
                                  echo "               the same as verified; see visibility above."
       else echo "  verdict    : OK"; fi ;;
    1) echo "  verdict    : WARN" ;;
    *) echo "  verdict    : BLOCKED" ;;
  esac
  # "freshness: STALE" beside "verdict: OK" is a contradiction a reader has to
  # resolve, and a gate whose output needs interpreting is a gate that gets
  # ignored. Say plainly why both are true.
  if [ -f "$RECEIPT" ] && [ "$(vantry_receipt_field "$RECEIPT" tree_digest)" != "$(vantry_tree_digest)" ] \
     && [ "${n:-0}" -eq 0 ]; then
    echo "               (the receipt describes work that is now part of the base —"
    echo "                nothing is pending, so there is nothing to re-verify)"
  fi
}

# --init used to copy vantry.yml.example verbatim, which hard-codes one stack:
# a Rails, Go or Django adopter received a contract that was wrong on every
# line, did not fix it, and lived in a repo with hooks, 16 agents and ZERO
# verification. Guessing wrong is worse than leaving a line blank, so this
# guesses only from files that exist, marks every guess, and never invents
# start/ready/smoke — nothing on disk can tell you how software is exercised.
do_init() {
  if [ -f "$VANTRY_CFG" ]; then echo "✓ vantry.yml already exists — nothing to do."; return 0; fi
  local pt="unknown" inst="" test="" build="" src="" n=0
  h() { [ -f "$VANTRY_ROOT/$1" ]; }

  if   h pnpm-lock.yaml;    then src="pnpm-lock.yaml";    inst="pnpm install --frozen-lockfile"; test="pnpm test"; build="pnpm build"
  elif h yarn.lock;         then src="yarn.lock";         inst="yarn install --frozen-lockfile"; test="yarn test"; build="yarn build"
  elif h bun.lockb;         then src="bun.lockb";         inst="bun install --frozen-lockfile";  test="bun test";  build="bun run build"
  elif h package-lock.json; then src="package-lock.json"; inst="npm ci";                         test="npm test";  build="npm run build"
  elif h package.json;      then src="package.json";      inst="npm install";                    test="npm test";  build="npm run build"
  elif h go.mod;            then src="go.mod";            inst="go mod download";                test="go test ./..."; build="go build ./..."
  elif h Cargo.toml;        then src="Cargo.toml";        inst="cargo fetch";                    test="cargo test"; build="cargo build --release"
  elif h pyproject.toml;    then src="pyproject.toml";    inst="";                               test="pytest";     build=""
  elif h requirements.txt;  then src="requirements.txt";  inst="pip install -r requirements.txt"; test="pytest";    build=""
  elif h Gemfile;           then src="Gemfile";           inst="bundle install";                 test="bundle exec rspec"; build=""
  elif h composer.json;     then src="composer.json";     inst="composer install";               test="vendor/bin/phpunit"; build=""
  elif h pubspec.yaml;      then src="pubspec.yaml";      inst="flutter pub get";                test="flutter test"; build="flutter build apk --debug"; pt="mobile"
  elif h foundry.toml;      then src="foundry.toml";      inst="forge install";                  test="forge test"; build="forge build"; pt="contract"
  elif h hardhat.config.ts || h hardhat.config.js; then src="hardhat.config"; inst="npm install"; test="npx hardhat test"; build="npx hardhat compile"; pt="contract"
  elif h platformio.ini;    then src="platformio.ini";    inst="pio pkg install";                test="pio test"; build="pio run"; pt="embedded"
  fi
  # A Unity project has no lockfile, only a marker directory.
  if [ -z "$src" ] && [ -f "$VANTRY_ROOT/ProjectSettings/ProjectVersion.txt" ]; then
    src="ProjectSettings/ProjectVersion.txt"; pt="game"
  fi
  h Makefile && [ -z "$src" ] && src="Makefile"

  case "$src" in
    pnpm-lock.yaml|yarn.lock|bun.lockb|package-lock.json|package.json) pt="web" ;;
    go.mod) pt="service" ;;
    # A crate with src/main.rs is a binary; without it, a library.
    Cargo.toml)
      # A Solana/Anchor workspace is Cargo underneath and was typed `library`
      # with `cargo build --release` — which builds nothing deployable and tests
      # nothing on-chain. Look for the thing that makes it a contract.
      if [ -f "$VANTRY_ROOT/Anchor.toml" ] || [ -d "$VANTRY_ROOT/programs" ]; then
        pt="contract"; inst="anchor build"; test="anchor test"; build="anchor build"
      elif [ -f "$VANTRY_ROOT/src/main.rs" ]; then pt="cli"
      else pt="library"; fi ;;
    pyproject.toml|requirements.txt)
      if grep -qEi 'torch|tensorflow|scikit-learn|sklearn|pandas|polars|jupyter' \
           "$VANTRY_ROOT/$src" 2>/dev/null; then pt="data"; else pt="cli"; fi ;;
  esac

  mark() { [ -n "$2" ] && printf '  %s: %s   # guessed from %s — confirm with --probe\n' "$1" "$2" "$src" \
                        || printf '  %s:\n' "$1"; }

  {
    echo "# vantry.yml — this project's contract with its agents."
    echo "# Generated by scripts/verify.sh --init$( [ -n "$src" ] && echo " after finding $src" )."
    echo "# EVERY line below is a claim about YOUR project. Check it:  scripts/verify.sh --probe"
    echo "version: 2"
    if [ -n "$src" ]; then
      echo "stack: \"<inferred from $src — name the framework, datastore and the things that decide idioms>\""
    else
      echo "stack: \"<name the real stack>\""
    fi
    echo "project_type: $pt"
    echo "strictness: relaxed          # switch to standard once the contract is proven once"
    echo
    echo "run:"
    mark install "$inst"; mark test "$test"; mark build "$build"
    echo "  start:                     # how the software is launched (empty for a CLI or a library)"
    echo "  ready:                     # the command that proves it came up"
    echo "  smoke:                     # MANDATORY: how a USER exercises it. Nothing on disk can guess this."
    echo "  logs: .vantry/state/app.log"
    echo
    echo "gates:"
    echo "  verify_change: block"
    echo "  security_review: block_on_sensitive"
    echo
    echo "merge:"
    echo "  authority: human"
    # This wrote `git rev-parse --abbrev-ref HEAD` — the CURRENT branch. Run
    # --init on a feature branch (the normal case for an adopter mid-work) and
    # merge.base became that branch, so the changeset was always empty and the
    # gate returned OK for everything: hooks installed, agents installed, zero
    # enforcement, everything green. Resolve the real trunk, and when it cannot
    # be resolved leave the line EMPTY and marked REQUIRED — a blank the gate
    # refuses to run on beats a guess it silently obeys.
    _b="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
    if [ -z "$_b" ]; then
      for _c in main master develop trunk; do
        if git rev-parse --verify --quiet "origin/$_c" >/dev/null 2>&1 || git rev-parse --verify --quiet "$_c" >/dev/null 2>&1; then _b="$_c"; break; fi
      done
    fi
    _cur="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    if [ -n "$_b" ] && [ "$_b" != "$_cur" ]; then
      echo "  base: $_b   # the trunk THIS repo uses"
    elif [ -n "$_b" ]; then
      echo "  base: $_b   # the trunk THIS repo uses (you are standing on it)"
    else
      echo "  base:                      # REQUIRED — the trunk you merge into. The gate"
      echo "                             # REFUSES to run until this names a real branch:"
      echo "                             # without it the changeset is measured against HEAD"
      echo "                             # and goes empty the moment you commit."
    fi
    echo
    echo "trivial_paths:"
    echo '  - "*.md"'
    echo '  - "docs/**"'
    echo
    echo "# acceptance:   # see vantry.yml.example — criteria that outlive the ticket"
    echo "#   - \"AC-1 | REQ-001 | <what it proves> | <the command that proves it>\""
    echo
    echo "sensitive_paths:"
    echo '  - "**/auth/**"'
    echo '  - "**/*auth*"'
    echo '  - "**/payment*/**"'
  } > "$VANTRY_CFG"

  [ -n "$src" ] && echo "✓ vantry.yml created (stack inferred from $src)." \
                || echo "✓ vantry.yml created — nothing on disk identified the stack, so run: is blank."
  cat <<'NEXT'
  Two things only you can answer, and the gate is inert until you do:
    run.smoke   how a USER exercises this software. A test suite is not a smoke run.
    run.start   how it is launched, if it is a service or an app.
  Then check every line you were handed:
    scripts/verify.sh --probe        # runs each line, tells you which ones are real
    scripts/verify.sh                # the real thing, writes the receipt
NEXT
}

case "${1:-}" in
  ""|--full)  do_run 0 ;;
  --smoke)    SMOKE_ONLY=1; export SMOKE_ONLY; do_run 1 ;;
  --probe)    PROBE=1; do_run 0 ;;
  --ci)       do_run 0 ;;
  --observe)  shift; do_observe "$@" ;;
  --gate)
    shift
    _gmode="${1:---stop}"; [ $# -gt 0 ] && shift
    if [ "${1:-}" = "--ref" ] && [ -n "${2:-}" ]; then
      # pre-push hands us each ref being pushed. Judging the checked-out tree
      # instead is how `git push origin feat/y` from a verified `main` sailed
      # through: point the receipt AND the changeset at the branch under test.
      VANTRY_REF="$2"
      SLUG="$(printf '%s' "$VANTRY_REF" | tr '/' '-' | tr -cd 'A-Za-z0-9._-')"
      RECEIPT=".vantry/receipts/$SLUG.verify.json"
      OVERRIDE=".vantry/overrides/$SLUG.json"
      export VANTRY_REF
    fi
    do_gate "$_gmode" ;;
  --override) shift; do_override "${1:-}" ;;
  --status)   shift; do_status "${1:-}" ;;
  --init)     do_init ;;
  -h|--help)  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) echo "✗ unknown mode: $1"; echo "   try: scripts/verify.sh --help"; exit 1 ;;
esac
