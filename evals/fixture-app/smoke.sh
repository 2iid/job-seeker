#!/usr/bin/env bash
# The user-facing assertion: a paid order must read IN_TRANSIT.
[ -f .served ] || { echo "smoke: the service never served anything"; exit 1; }
got="$(cat .served)"
[ "$got" = "IN_TRANSIT" ] || { echo "smoke: /order served '$got', expected 'IN_TRANSIT'"; exit 1; }
echo "smoke: 1 flow passed (/order → IN_TRANSIT)"
