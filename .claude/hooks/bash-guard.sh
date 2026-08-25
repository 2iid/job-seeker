#!/usr/bin/env bash
# =============================================================================
#  PreToolUse(Bash) — the four things an agent must not be able to do.
#
#  1. Forge evidence.        Writing a receipt by hand turns proof back into prose.
#  2. Disarm the gate.       Editing hooks/config mid-turn to get unstuck.
#  3. Commit or push unverified code.
#  4. Merge, when the project says a human merges.
#
#  Exit 2 blocks the tool call and returns the message to the model.
#  Anything not understood exits 0 — git and CI are the backstop, and a guard
#  that blocks on ambiguity gets uninstalled by lunchtime.
# =============================================================================
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}")"
[ -f "$ROOT/vantry.yml" ] || exit 0
# shellcheck source=../../scripts/lib/vantry-common.sh
. "$ROOT/scripts/lib/vantry-common.sh" 2>/dev/null || exit 0

payload="$(cat 2>/dev/null || true)"
cmd="$(vantry_json_get "$payload" tool_input.command)"
[ -n "$cmd" ] || exit 0

# Match INTENT, not payload. A commit message that merely mentions
# `--no-verify` is documentation; a command that passes it is an escape. Drop
# heredoc bodies and quoted spans before pattern-matching, or the guard fires
# on its own release notes — and a guard with false positives gets uninstalled.
scrub() {
  printf '%s\n' "$1" | awk '
    inhd { if ($0 ~ "^[[:space:]]*" tag "[[:space:]]*$") inhd = 0; next }
    {
      l = $0
      if (match(l, /<<-?[[:space:]]*'\''?"?[A-Za-z_][A-Za-z0-9_]*'\''?"?/)) {
        t = substr(l, RSTART, RLENGTH)
        sub(/^<<-?[[:space:]]*/, "", t); gsub(/['\''"]/, "", t)
        tag = t; inhd = 1
      }
      gsub(/"[^"]*"/, " ", l)
      gsub(/'\''[^'\'']*'\''/, " ", l)
      print l
    }'
}
scmd="$(scrub "$cmd")"
# A wrapper defeats the scrub by design: sh -c puts the whole escape inside a
# quoted span, and scrub() removes quoted spans. When the command IS a wrapper,
# judge the raw text too — there, the quoting is the payload, not the packaging.
case "$scmd" in
  # "sh -c" already covers "bash -c" and "zsh -c" — they contain it.
  *"sh -c"*|*eval*|*xargs*) scmd="$scmd $cmd" ;;
esac

deny() { printf '%s\n' "$1" >&2; vantry_log "guard.deny" "$2"; exit 2; }

# --- 1. the receipt is harness-produced evidence -----------------------------
case "$scmd" in
  *".vantry/receipts"*)
    # The read-allowlist matched a VERB anywhere in the string, so
    # `cat > .vantry/receipts/main.verify.json <<EOF` was read as "a cat, that's
    # a read" and waved through. It is the exact command that forges a receipt.
    # Decide on the REDIRECT first: drop the harmless ones, and if any writing
    # redirect survives beside the receipts path, this is a write whatever verb
    # it opens with.
    wr="$(printf '%s\n' "$scmd" \
          | sed -e 's/2>&1//g' -e 's/[0-9]*>>*[[:space:]]*\/dev\/null//g' -e 's/&>[[:space:]]*\/dev\/null//g')"
    case "$wr" in
      *">"*|*"tee "*|*"dd "*|*"truncate"*|*"sed -i"*|*"cp "*|*"mv "*|*"install "*|*"python"*|*"perl"*|*"ruby"*|*"node "*|*"awk "*)
        deny "DENIED — that command WRITES into .vantry/receipts/.
  A receipt is harness-produced evidence: the whole gate rests on it being
  impossible to author. Only scripts/verify.sh writes one, and only by running
  the software. To record what you observed:
    scripts/verify.sh --observe \"<expected>\" \"<what you saw>\"" "write to receipts: $cmd" ;;
    esac
    case "$scmd" in
      *cat*|*ls*|*grep*|*jq*|*head*|*tail*|*find*|*wc*|*diff*|*stat*) : ;;   # a genuine read
      *)
        deny "DENIED — .vantry/receipts/ is harness-produced evidence.
  Only scripts/verify.sh may write a receipt, and only by actually running the
  software. To record what you observed:
    scripts/verify.sh --observe \"<expected>\" \"<what you saw>\"" "write to receipts: $cmd" ;;
    esac ;;
esac

# --- 2. never let the gate be disarmed from inside a turn --------------------
case "$scmd" in
  *"core.hooksPath"*)
    case "$scmd" in *--get*|*--list*|*cat*|*grep*|*"enable-hooks.sh"*) ;; *)
    deny "DENIED — core.hooksPath is not yours to change. Setting it disables
  every git hook in this repo (that exact line is what broke v1).
  Use: scripts/lib/enable-hooks.sh [--status|--disable]" "hooksPath: $cmd" ;; esac ;;
  *"--no-verify"*)
    deny "DENIED — --no-verify skips the secret scan and the verification gate.
  If the change is genuinely unverifiable, say so and use the recorded route:
    scripts/verify.sh --override \"<why, >=20 chars>\"" "no-verify: $cmd" ;;
  *"VANTRY_SKIP_GATE="*)
    deny "DENIED — VANTRY_SKIP_GATE is a human's emergency lever, not an agent's.
  Use scripts/verify.sh --override \"<why>\" so the decision is committed and reviewed." "skip-gate: $cmd" ;;
esac
case "$scmd" in
  rm*" .githooks"*|rm*" .claude/hooks"*|rm*" vantry.yml"*|rm*/.githooks*|rm*/vantry.yml*|*"rm -rf .vantry"*)
    deny "DENIED — removing the verification machinery is not a way to pass it." "rm gate: $cmd" ;;
esac

# --- 3. commit / push require a fresh passing receipt ------------------------
case "$scmd" in
  *"git commit"*|*"git push"*|*"gh pr create"*)
    out="$("$ROOT/scripts/verify.sh" --gate --pre-commit 2>&1)"; rc=$?
    if [ "$rc" -ge 2 ]; then
      printf '%s\n' "$out" >&2
      echo "  (blocked before \`${cmd%% *} ...\` — verify first)" >&2
      vantry_log "guard.deny" "unverified: $cmd"
      exit 2
    fi ;;
esac

# --- 4. merge authority ------------------------------------------------------
case "$scmd" in
  *"gh pr merge"*)
    if [ "$(vantry_cfg merge.authority human)" = "human" ]; then
      deny "DENIED — vantry.yml says merge.authority: human.
  Report that the PR is ready and let a person merge it. To let agents merge,
  a human changes merge.authority to 'agent' in vantry.yml." "merge: $cmd"
    fi ;;
esac

exit 0
