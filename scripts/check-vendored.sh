#!/usr/bin/env bash
# =============================================================================
#  check-vendored.sh — third-party instructions cannot change under you.
#
#  A vendored agent skill is text someone else wrote that this project's agents
#  READ AS INSTRUCTION. Pinning a version string is not enough: what matters is
#  whether the bytes on disk are still the bytes that were reviewed.
#
#  So this is a content check, not a version check. It fails when:
#    · a vendored directory has no VENDOR.md, no upstream_sha, or no licence;
#    · its SHA-256 no longer matches the committed manifest;
#    · any vendored SKILL.md declares a WILDCARD `allowed-tools:` — a
#      pre-approved shell grant pointing at third-party instructions is the
#      exact shape this whole directory exists to refuse.
#
#    scripts/check-vendored.sh            # verify (this is the gate)
#    scripts/check-vendored.sh --update   # re-record after a reviewed refresh
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 1
VENDOR="vendor/skills"
MANIFEST="vendor/MANIFEST.sha256"
MODE="${1:-verify}"
ERR=0

[ -d "$VENDOR" ] || { echo "✓ no vendored skills"; exit 0; }

sha_dir() {   # a stable digest over the file list AND their contents
  ( cd "$1" && find . -type f ! -name '.DS_Store' -print0 \
      | LC_ALL=C sort -z \
      | while IFS= read -r -d '' f; do
          printf '%s ' "$f"
          if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$f" | cut -d' ' -f1
          else sha256sum "$f" | cut -d' ' -f1; fi
        done ) | { if command -v shasum >/dev/null 2>&1; then shasum -a 256; else sha256sum; fi; } | cut -d' ' -f1
}

TMP_MANIFEST="$(mktemp)"
trap 'rm -f "$TMP_MANIFEST"' EXIT

for d in "$VENDOR"/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"

  # ---- provenance -----------------------------------------------------------
  if [ ! -f "$d/VENDOR.md" ]; then
    echo "  ✗ $name: no VENDOR.md — nothing records where this came from or what was changed"; ERR=1; continue
  fi
  for k in upstream upstream_path upstream_sha vendored modified; do
    grep -qE "^${k}:" "$d/VENDOR.md" || { echo "  ✗ $name: VENDOR.md has no '${k}:'"; ERR=1; }
  done
  sha="$(sed -n 's/^upstream_sha:[[:space:]]*//p' "$d/VENDOR.md" | head -1 | tr -d '[:space:]')"
  case "$sha" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) : ;;
    *) echo "  ✗ $name: upstream_sha '$sha' is not a commit sha — a pin you cannot resolve is not a pin"; ERR=1 ;;
  esac

  # ---- licence --------------------------------------------------------------
  _haslic=0
  for _f in "$d"LICENSE* "$d"License* "$d"license* "$d"NOTICE* "$d"COPYING*; do
    [ -f "$_f" ] && _haslic=1
  done
  if [ "$_haslic" -eq 0 ]; then
    echo "  ✗ $name: no LICENSE/NOTICE file — this repo is distributed, so the terms have to travel with the text"; ERR=1
  fi

  # ---- the one that matters --------------------------------------------------
  # A wildcard tool grant on third-party instructions means a command the
  # permission system waves through can be anything the upstream author later
  # decides it is.
  while IFS= read -r f; do
    at="$(awk 'NR==1&&/^---/{f=1;next} f&&/^---/{exit} f' "$f" | sed -n 's/^allowed-tools:[[:space:]]*//p')"
    [ -n "$at" ] || continue
    case "$at" in
      *"*"*)
        echo "  ✗ $name: $(basename "$f") grants a WILDCARD tool permission: $at"
        echo "      Narrow it to explicit subcommands, or do not vendor this skill."
        ERR=1 ;;
      *) echo "  · $name: $(basename "$f") grants $at (explicit — allowed)" ;;
    esac
  done <<EOF
$(find "$d" -name 'SKILL.md' -type f 2>/dev/null)
EOF

  printf '%s  %s\n' "$(sha_dir "$d")" "$name" >> "$TMP_MANIFEST"
done

# ---- drift ------------------------------------------------------------------
if [ "$MODE" = "--update" ]; then
  sort "$TMP_MANIFEST" > "$MANIFEST"
  echo "✓ manifest re-recorded — review the diff before committing it:"
  sed 's/^/    /' "$MANIFEST"
  exit "$ERR"
fi

if [ ! -f "$MANIFEST" ]; then
  echo "  ✗ $MANIFEST is missing — run: scripts/check-vendored.sh --update"; ERR=1
elif ! diff -q <(sort "$TMP_MANIFEST") <(sort "$MANIFEST") >/dev/null 2>&1; then
  echo "  ✗ vendored content no longer matches the manifest:"
  diff <(sort "$MANIFEST") <(sort "$TMP_MANIFEST") | sed 's/^/      /'
  echo "      Third-party instructions changed. Review the diff as a dependency-upgrade,"
  echo "      then: scripts/check-vendored.sh --update"
  ERR=1
fi

[ "$ERR" -eq 0 ] && echo "✓ every vendored skill is pinned, licensed, and free of wildcard tool grants"
exit "$ERR"
