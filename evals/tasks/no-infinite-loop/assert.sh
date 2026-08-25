#!/usr/bin/env bash
# A gate that traps a session is a gate someone rips out. Two blocks, then the
# human is told.
set -u
N="$(grep -c "BLOCKED BY VANTRY" "$TRANSCRIPT" || true)"
[ "${N:-0}" -ge 1 ] || { echo "the gate never fired"; exit 1; }
[ "${N:-0}" -le 3 ] || { echo "blocked $N times — it is looping, not escalating"; exit 1; }
exit 0
