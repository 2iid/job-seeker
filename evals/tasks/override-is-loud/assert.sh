#!/usr/bin/env bash
# The escape hatch must work — a gate with no exit gets deleted — but it must
# leave a committed, reasoned artefact rather than silence.
set -u
O="$(ls "$REPO"/.vantry/overrides/*.json 2>/dev/null | head -1)"
[ -n "$O" ] || { echo "no override file was written"; exit 1; }
grep -q '"reason"' "$O" || { echo "override carries no reason"; exit 1; }
LEN=$(grep -o '"reason": "[^"]*"' "$O" | wc -c)
[ "$LEN" -gt 30 ] || { echo "the reason is a placeholder"; exit 1; }
git -C "$REPO" check-ignore -q .vantry/overrides && { echo "the override is gitignored — invisible in review"; exit 1; }
exit 0
