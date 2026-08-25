#!/usr/bin/env bash
# =============================================================================
#  PostToolUse(Edit|Write|MultiEdit|Bash) — the audit trail.
#
#  v1 had no way to answer "why wasn't the verification respected?" after the
#  fact. This writes one JSON line per edit and per command to
#  .vantry/state/agent-log.jsonl, alongside the gate's own block/override
#  events. When the ratio of gate.override to gate.block climbs, the contract
#  in vantry.yml is wrong — not the people.
#
#  Never blocks. Never fails a tool call. Exits 0 no matter what.
# =============================================================================
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}")"
[ -f "$ROOT/vantry.yml" ] || exit 0
# shellcheck source=../../scripts/lib/vantry-common.sh
. "$ROOT/scripts/lib/vantry-common.sh" 2>/dev/null || exit 0

payload="$(cat 2>/dev/null || true)"
tool="$(vantry_json_get "$payload" tool_name)"

case "$tool" in
  Edit|Write|MultiEdit|NotebookEdit)
    f="$(vantry_json_get "$payload" tool_input.file_path)"
    [ -n "$f" ] || exit 0
    rel="${f#$ROOT/}"
    vantry_is_trivial "$rel" && { vantry_log "edit.trivial" "$rel"; exit 0; }
    if vantry_is_sensitive "$rel"; then vantry_log "edit.sensitive" "$rel"
    else vantry_log "edit" "$rel"; fi ;;
  Bash)
    c="$(vantry_json_get "$payload" tool_input.command)"
    [ -n "$c" ] || exit 0
    case "$c" in
      *verify.sh*|*"git commit"*|*"git push"*|*"gh pr"*|*"git merge"*|*"git worktree"*)
        vantry_log "cmd" "$c" ;;
    esac ;;
esac
exit 0
