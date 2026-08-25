#!/usr/bin/env bash
# =============================================================================
#  upgrade.sh — move an installed kit to a newer version without clobbering
#  the project's own work.
#
#  v1 had no upgrade path at all: /bootstrap and /adopt tell the agent to
#  rewrite personas and prune skills per project, with no manifest and no
#  version, so every adopter's copy became an opaque fork. This is the fix, and
#  it is why .vantry/manifest.json records a sha256 per installed file:
#
#    file untouched since install  → safely replaced
#    file modified by the project  → LEFT ALONE and listed as MANUAL MERGE
#
#  A v1 project has no manifest. --from-v1 handles that: nothing is overwritten,
#  new files are added, and vantry.yml lands at strictness: relaxed so no
#  in-flight project is blocked overnight.
#
#  Usage:
#    scripts/adopt/upgrade.sh <target> [--from-v1] [--dry-run]
# =============================================================================
set -uo pipefail

KIT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET=""; FROM_V1=0; DRY=0
for a in "$@"; do
  case "$a" in
    --from-v1) FROM_V1=1 ;;
    --dry-run) DRY=1 ;;
    -*) echo "✗ unknown option: $a"; exit 1 ;;
    *)  TARGET="$a" ;;
  esac
done
[ -n "$TARGET" ] || { echo "usage: scripts/adopt/upgrade.sh <target> [--from-v1] [--dry-run]"; exit 1; }
[ -d "$TARGET" ] || { echo "✗ target not found: $TARGET"; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"
[ "$TARGET" = "$KIT" ] && { echo "✗ target is the kit itself."; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
NEWVER="$(cat "$KIT/VERSION" 2>/dev/null || echo unknown)"
MAN="$TARGET/.vantry/manifest.json"
sha() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
        else sha256sum "$1" | cut -d' ' -f1; fi; }

echo "→ upgrading $TARGET to kit $NEWVER"

# -------------------------------------------------------------------- preflight
# v2's gate is built out of these four playbooks. If a project pruned one, the
# upgrade would install hooks that reference a skill nobody has.
MISSING=""
for c in verify-change security-review code-review write-tests; do
  [ -d "$TARGET/skills/$c" ] || [ -d "$TARGET/.claude/skills/$c" ] || MISSING="$MISSING $c"
done
if [ -n "$MISSING" ] && [ "$FROM_V1" = "0" ]; then
  echo "✗ PREFLIGHT: these core playbooks were pruned from this project:$MISSING"
  echo "  v2's verification gate depends on them. Restore first:"
  for c in $MISSING; do echo "    cp -R \"$KIT/skills/$c\" \"$TARGET/skills/$c\""; done
  exit 1
fi
[ -n "$MISSING" ] && echo "  ⚠ core playbooks absent (will be installed):$MISSING"

if [ ! -f "$MAN" ] && [ "$FROM_V1" = "0" ]; then
  echo "✗ no .vantry/manifest.json — this project was not installed by a versioned kit."
  echo "  If it is a v1 install, re-run with --from-v1 (nothing will be overwritten)."
  exit 1
fi

man_sha() {  # recorded sha for a path, empty if unknown
  [ -f "$MAN" ] || return 0
  if command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json,sys
try: d=json.load(open(sys.argv[1]))
except Exception: sys.exit(0)
print((d.get("files") or {}).get(sys.argv[2],"").replace("sha256:",""))' "$MAN" "$1" 2>/dev/null
  fi
}

REPLACED=0; ADDED=0; KEPT=0; CONFLICTS=""
FILES_JSON=""

upgrade_file() {  # $1 = path relative to the kit root
  local rel="$1" src="$KIT/$1" dst="$TARGET/$1" cur rec
  [ -f "$src" ] || return 0
  FILES_JSON="$FILES_JSON    \"$rel\": \"sha256:$(sha "$src")\",
"
  if [ ! -e "$dst" ]; then
    [ "$DRY" = "1" ] && { echo "  DRY + $rel"; ADDED=$((ADDED+1)); return 0; }
    mkdir -p "$(dirname "$dst")"; cp "$src" "$dst"; echo "  + $rel"; ADDED=$((ADDED+1)); return 0
  fi
  cur="$(sha "$dst")"
  [ "$cur" = "$(sha "$src")" ] && { KEPT=$((KEPT+1)); return 0; }   # already current
  rec="$(man_sha "$rel")"
  if [ -n "$rec" ] && [ "$rec" = "$cur" ]; then
    [ "$DRY" = "1" ] && { echo "  DRY ~ $rel (untouched since install → replace)"; REPLACED=$((REPLACED+1)); return 0; }
    cp "$dst" "$dst.vantry-bak-$STAMP"; cp "$src" "$dst"
    echo "  ~ $rel (was untouched since install)"; REPLACED=$((REPLACED+1)); return 0
  fi
  CONFLICTS="$CONFLICTS  $rel
"
  KEPT=$((KEPT+1))
}

upgrade_tree() {  # $1 = directory relative to the kit root
  local d="$1" f
  [ -d "$KIT/$d" ] || return 0
  while IFS= read -r f; do upgrade_file "${f#$KIT/}"; done < <(find "$KIT/$d" -type f 2>/dev/null)
}

echo
echo "→ kit files"
upgrade_file "AGENTS.md"
upgrade_file "VERSION"
upgrade_file "vantry.yml.example"
upgrade_file ".gitleaks.toml"
upgrade_tree  "agents"
upgrade_tree  "skills"
upgrade_tree  "scripts"
upgrade_tree  "docs/_templates"
upgrade_tree  "docs/engineering"
upgrade_tree  ".githooks"
upgrade_tree  ".claude/hooks"
upgrade_file  ".claude/settings.json"
upgrade_file  ".github/pull_request_template.md"
upgrade_file  ".github/workflows/verify.yml"

# -------------------------------------------------------- the contract itself
if [ "$DRY" != "1" ]; then
  if [ ! -f "$TARGET/vantry.yml" ]; then
    echo
    echo "→ installing the contract at strictness: relaxed"
    # Deliberately relaxed, never standard: a project upgraded on Tuesday must
    # not be unable to push on Wednesday. Switching to standard is a decision a
    # human makes, once, after run.smoke has been filled in and proven.
    sed 's/^strictness: standard/strictness: relaxed/' "$KIT/vantry.yml.example" > "$TARGET/vantry.yml"
    echo "  + vantry.yml (relaxed — the gate WARNS until you switch it)"
    echo "    EDIT IT: every run: line must be a command that really works in this project."
  fi

  mkdir -p "$TARGET/.vantry"
  cat > "$MAN" <<JSON
{
  "schema": "vantry.manifest/1",
  "kit_version": "$NEWVER",
  "source_commit": "$(git -C "$KIT" rev-parse HEAD 2>/dev/null || echo unknown)",
  "upgraded_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "files": {
${FILES_JSON%,
}
  }
}
JSON

  [ -x "$TARGET/scripts/sync-adapters.sh" ] && ( cd "$TARGET" && ./scripts/sync-adapters.sh >/dev/null 2>&1 ) \
    && echo "  ✓ adapters regenerated"
  [ -x "$TARGET/scripts/lib/enable-hooks.sh" ] && [ -d "$TARGET/.git" ] \
    && ( cd "$TARGET" && ./scripts/lib/enable-hooks.sh . ) 2>&1 | sed 's/^/  /'
fi

echo
echo "════════════════════════════════════════════════════════════════"
echo " $ADDED added · $REPLACED replaced · $KEPT kept"
if [ -n "$CONFLICTS" ]; then
  echo
  echo " MANUAL MERGE — you changed these, so the upgrade left them alone:"
  printf '%s' "$CONFLICTS"
  echo " Compare each against the kit and port what you want:"
  echo "   diff \"$TARGET/<path>\" \"$KIT/<path>\""
fi
cat <<'NEXT'

 Next, in order — do not skip step 2:
   1. edit vantry.yml so every run: line is a command that really works here
   2. prove the contract:            ./scripts/verify.sh      # must print ✓ VERIFIED
   3. run a sprint at relaxed and watch the warnings; when the noise is real
      signal, switch:                strictness: standard
NEXT
