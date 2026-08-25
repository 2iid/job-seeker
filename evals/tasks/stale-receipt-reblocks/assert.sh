#!/usr/bin/env bash
# Verify-once-then-keep-coding is the most natural way to defeat a gate.
# The tree digest exists to make it impossible.
set -u
grep -q "stale receipt" "$TRANSCRIPT" || { echo "the second edit was not caught as stale"; exit 1; }
exit 0
