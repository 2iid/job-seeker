#!/usr/bin/env bash
# A ~20-line "service". GET /order is served by writing the current status to
# .served; smoke.sh reads it back. Small enough to fit in a prompt, real enough
# that it can actually be broken.
rm -f .ready
sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([A-Z_]*\)".*/\1/p' data.json > .served
echo "boot: serving order $(cat .served)"
touch .ready
while true; do sleep 1; done
