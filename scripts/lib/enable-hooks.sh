#!/usr/bin/env bash
# =============================================================================
#  enable-hooks.sh — turn on the git hooks WITHOUT ever disabling yours.
#
#  v1 shipped `git config core.hooksPath .githooks` unconditionally. That single
#  line silently switched off husky, lefthook and every hook in .git/hooks in
#  the target repo, and pointed git at a directory the kit did not even ship.
#  This script exists so that can never happen again:
#
#    - hooksPath unset, no live hooks in .git/hooks  → set hooksPath (clean)
#    - hooksPath already ours                        → nothing to do
#    - hooksPath belongs to husky/lefthook/etc.      → CHAIN into theirs
#    - live hooks in .git/hooks, hooksPath unset     → CHAIN into those
#
#  Chaining does NOT append: your hook is moved to <name>.vantry-local and a
#  dispatcher runs it FIRST, then vantry's. Appending was the shipped bug — a
#  hook ending in `exit 0` never reached the appended block.
#
#  Usage:
#    scripts/lib/enable-hooks.sh [target-repo]     # default: this repo
#    scripts/lib/enable-hooks.sh --status [target]
#    scripts/lib/enable-hooks.sh --disable [target]
# =============================================================================
set -uo pipefail

MODE="enable"
case "${1:-}" in
  --status)  MODE="status";  shift ;;
  --disable) MODE="disable"; shift ;;
esac
TARGET="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
TARGET="$(cd "$TARGET" && pwd)"
HOOKS="pre-commit pre-push commit-msg"
BEGIN="# >>> vantry hooks >>>"
END="# <<< vantry hooks <<<"

[ -d "$TARGET/.git" ] || { echo "✗ not a git repo: $TARGET"; exit 1; }
# NOT above the status branch: a repo whose .githooks/ vanished (a branch switch
# is enough) has an installed dispatcher that silently skips vantry's stage, and
# --status is the one tool built to detect exactly that. It must be able to run.

current="$(git -C "$TARGET" config --local --get core.hooksPath 2>/dev/null)"
live_hooks=""
for h in $HOOKS; do
  [ -f "$TARGET/.git/hooks/$h" ] && live_hooks="$live_hooks $h"
done

# ------------------------------------------------------------------- status
if [ "$MODE" = "status" ]; then
  echo "repo          : $TARGET"
  echo "core.hooksPath: ${current:-<unset>}"
  echo "live .git/hooks:${live_hooks:- <none>}"
  # Reachability is PROVEN by running the real entry point with a probe variable
  # that .githooks/* answer and exit on. Grepping for a marker is what reported
  # ACTIVE while the stage was unreachable dead code below someone's `exit 0`.
  for h in $HOOKS; do
    entry=""
    if [ "$current" = ".githooks" ]; then entry="$TARGET/.githooks/$h"
    elif [ -f "$TARGET/.git/hooks/$h" ]; then entry="$TARGET/.git/hooks/$h"
    elif [ -n "$current" ] && [ -f "$TARGET/$current/$h" ]; then entry="$TARGET/$current/$h"
    fi
    if [ -z "$entry" ] || [ ! -x "$entry" ]; then echo "  $h : INACTIVE (no executable hook)"; continue; fi
    # </dev/null, and never interactively: a pre-push hook reads refs from stdin,
    # so probing without it HANGS, and probing through the user's stage runs
    # their real hook with its real side effects just to answer a status query.
    out="$( cd "$TARGET" && VANTRY_HOOK_PROBE=1 "$entry" /dev/null </dev/null 2>&1 )"; prc=$?
    case "$out" in
      *VANTRY_HOOK_REACHED*) echo "  $h : ACTIVE — the probe reached vantry's stage" ;;
      *)
        if [ "$prc" -ne 0 ]; then
          echo "  $h : UNPROVEN — your own hook rejected the probe (exit $prc), so vantry's stage was not reached"
        else
          echo "  $h : ✗ NOT REACHED — the hook runs, but vantry's stage never executes"
        fi ;;
    esac
  done
  exit 0
fi

[ -d "$TARGET/.githooks" ] || { echo "✗ $TARGET/.githooks is missing — nothing to enable."; exit 1; }

# ------------------------------------------------------------------ disable
if [ "$MODE" = "disable" ]; then
  [ "$current" = ".githooks" ] && { git -C "$TARGET" config --unset core.hooksPath; echo "  ✓ core.hooksPath unset"; }
  for d in "$TARGET/.git/hooks" "$TARGET/${current:-.git/hooks}"; do
    for h in $HOOKS; do
      f="$d/$h"
      [ -f "$f" ] && grep -qF "$BEGIN" "$f" 2>/dev/null || continue
      if [ -f "$f.vantry-local" ]; then
        mv "$f.vantry-local" "$f"
        if [ -s "$f.vantry-mode" ]; then chmod "$(cat "$f.vantry-mode")" "$f" 2>/dev/null; rm -f "$f.vantry-mode"
        else chmod +x "$f"; fi
        echo "  ✓ restored your original $h — bytes and mode"
      else
        rm -f "$f"; echo "  ✓ removed the vantry dispatcher $h (you had no hook of your own)"
      fi
    done
  done
  echo "✓ vantry hooks disabled. Your own hooks are exactly as they were."
  exit 0
fi

# ------------------------------------------------------------------- enable
chmod +x "$TARGET/.githooks/"* 2>/dev/null

# Appending to the END of an existing hook is WRONG, and it shipped: a hook that
# finishes with `exit 0` — husky, lint-staged, most hand-written ones — never
# reaches the appended block. Proven by committing an AWS key into a repo whose
# hook ended that way: it went in clean while --status reported ACTIVE.
#
# So the user's hook becomes a subordinate STAGE. It runs first and its failure
# still rejects the operation (we propagate its status), but its success returns
# control instead of ending the process.
chain_into() {  # $1 = the hook file that already exists and must keep working
  local f="$1" h; h="$(basename "$f")"

  if [ -f "$f" ] && grep -qF "$BEGIN" "$f" 2>/dev/null; then
    echo "  = $h already dispatches"; return 0
  fi
  if [ -f "$f" ]; then
    # An existing .vantry-local is someone's hook from a previous run. Moving
    # over it destroys the only copy, silently. A destination that already
    # exists is never an overwrite.
    if [ -e "$f.vantry-local" ] && ! cmp -s "$f" "$f.vantry-local"; then
      echo "  ✗ $h.vantry-local already exists and differs from $h."
      echo "    That file is your hook from an earlier run; moving over it would destroy it."
      echo "    Inspect both, keep the one you want as $h.vantry-local, then re-run."
      return 1
    fi
    # Record the original mode: restoring the bytes but not the mode turns a
    # deliberately-disabled hook back on, which is the wrong direction to be
    # wrong in.
    if command -v stat >/dev/null 2>&1; then
      stat -f '%Lp' "$f" 2>/dev/null > "$f.vantry-mode" || stat -c '%a' "$f" 2>/dev/null > "$f.vantry-mode" || true
    fi
    mv "$f" "$f.vantry-local"; chmod +x "$f.vantry-local"
    echo "  → your $h moved to $h.vantry-local — it still runs, and it runs FIRST"
  fi

  cat > "$f" <<EOF
#!/usr/bin/env bash
$BEGIN
# Generated by scripts/lib/enable-hooks.sh. Do not edit: put your own logic in
# $h.vantry-local, which runs first and whose failure still rejects the operation.
# Undo with: scripts/lib/enable-hooks.sh --disable
_vd="\$(cd "\$(dirname "\$0")" && pwd)"
if [ -x "\$_vd/$h.vantry-local" ]; then "\$_vd/$h.vantry-local" "\$@" || exit \$?; fi
_vr="\$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -x "\$_vr/.githooks/$h" ]; then "\$_vr/.githooks/$h" "\$@" || exit \$?; fi
exit 0
$END
EOF
  chmod +x "$f"
  echo "  ✓ $h now dispatches: your hook, then vantry's"
}

if [ "$current" = ".githooks" ]; then
  echo "✓ core.hooksPath is already .githooks — hooks active, nothing changed."
elif [ -n "$current" ]; then
  echo "→ core.hooksPath is '$current' (husky / lefthook / custom). NOT touching it."
  for h in $HOOKS; do
    mkdir -p "$TARGET/$current"
    chain_into "$TARGET/$current/$h"
  done
elif [ -n "$live_hooks" ]; then
  echo "→ this repo has live hooks in .git/hooks ($live_hooks). NOT switching hooksPath."
  for h in $HOOKS; do chain_into "$TARGET/.git/hooks/$h"; done
else
  git -C "$TARGET" config core.hooksPath .githooks
  echo "✓ core.hooksPath set to .githooks (no existing hooks were in the way)."
fi

echo
echo "Check any time:   scripts/lib/enable-hooks.sh --status"
echo "Turn it all off:  scripts/lib/enable-hooks.sh --disable"
