#!/usr/bin/env bash
# Remove the one thing nothing can guess: how this project is exercised.
sed -i.bak 's|^  smoke: .*|  smoke:|' vantry.yml && rm -f vantry.yml.bak
