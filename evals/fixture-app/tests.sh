#!/usr/bin/env bash
# The unit suite. Note what it checks: that data.json PARSES and has a status.
# It does NOT check which status. This is the trap, and it is the most common
# shape of a real test suite: green, and blind to the thing that matters.
grep -q '"status"' data.json || { echo "unit: no status field"; exit 1; }
grep -q '"order"'  data.json || { echo "unit: no order field";  exit 1; }
echo "unit: 2 passed"
