#!/usr/bin/env bash
# ============================================================================
#  install.sh — drop the Vantry kit into an EXISTING repo, NON-destructively,
#  so you can then run `/adopt` inside it. bash 3.2 / macOS compatible.
#
#  It ONLY copies the kit's own files (.claude/, the kanban + adopt scripts,
#  doc templates, secret-scan config). It NEVER touches your source code.
#
#  NON-DESTRUCTIVE GUARANTEES (v1.0.1):
#    - Copies FILE BY FILE. It never moves one of your directories aside, so a
#      partial kit can never replace a whole directory of your work.
#    - Never overwrites project DATA (scripts/kanban/issues.csv, your
#      .claude/settings*.json) — those are kept as-is when they already exist.
#    - Backs up any other file it replaces to <name>.vantry-bak-<timestamp>.
#    - Never touches core.hooksPath unless the hook really exists AND you have
#      no hook manager of your own. Pointing core.hooksPath at a missing
#      directory silently DISABLES every git hook in the repo.
#
#  USAGE (a LOCAL path OR a GIT URL — your choice):
#    ./scripts/adopt/install.sh /path/to/your-project        # a local folder, in place
#    ./scripts/adopt/install.sh .                            # the current project (via the kit's abs path)
#    ./scripts/adopt/install.sh https://github.com/you/repo  # clone the URL, then install into it
#    DRY_RUN=1 ./scripts/adopt/install.sh <target> [dest]    # preview only
# ============================================================================
set -uo pipefail

KIT="$(cd "$(dirname "$0")/../.." && pwd)"          # the Vantry kit root (this repo)
ARG="${1:-}"
DRY_RUN="${DRY_RUN:-0}"
STAMP="$(date +%Y%m%d-%H%M%S)"
MISSING=""                                          # kit files that were not found
COPIED=0; KEPT=0; BACKED=0

KIT_VERSION="$(cat "$KIT/VERSION" 2>/dev/null || echo unknown)"
KIT_COMMIT="$(git -C "$KIT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
# Two DIFFERENT questions, and conflating them is how a checkout silently
# passes for a release: "is HEAD exactly on a tag?" and "which tag is nearest?"
KIT_TAG_EXACT="$(git -C "$KIT" describe --tags --exact-match 2>/dev/null || echo '')"
KIT_TAG_NEAR="$(git -C "$KIT" describe --tags --abbrev=0 2>/dev/null || echo '')"
if [ -n "$KIT_TAG_EXACT" ]; then KIT_REF="$KIT_TAG_EXACT"
elif [ -n "$KIT_TAG_NEAR" ]; then KIT_REF="$KIT_TAG_NEAR+"
else KIT_REF="untagged"; fi

# Is a newer release out? `~/.vantry` is a shallow clone PINNED TO A TAG, so it
# never updates on its own — and nothing used to say so. Someone clones once at
# v3.11.0 and every project they start for the next six months is v3.11.0, with
# no signal anywhere. That is the report this exists to answer.
#
# Deliberately non-fatal and deliberately quiet when offline: refusing to install
# because a version check could not reach the network would be worse than the
# staleness it is warning about.
kit_latest_release() {
  local url latest
  url="$(git -C "$KIT" remote get-url origin 2>/dev/null || true)"
  [ -n "$url" ] || return 1
  latest="$(git ls-remote --tags --refs "$url" 2>/dev/null \
            | awk -F/ '{print $NF}' \
            | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
            | sed 's/^v//' \
            | sort -t. -k1,1n -k2,2n -k3,3n \
            | tail -1)"
  [ -n "$latest" ] || return 1
  printf '%s' "$latest"
}

report_staleness() {
  local latest
  latest="$(kit_latest_release 2>/dev/null || true)"
  if [ -z "$latest" ]; then
    echo "  · could not check for a newer release (offline, or no origin) — installing $KIT_VERSION."
    return 0
  fi
  [ "$latest" = "$KIT_VERSION" ] && { echo "  ✓ this is the latest release (v$latest)."; return 0; }
  # Only shout when the remote is genuinely AHEAD, not when a local checkout is
  # ahead of the last tag.
  if [ "$(printf '%s\n%s\n' "$KIT_VERSION" "$latest" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)" = "$latest" ]; then
    cat <<STALE
  ⚠ YOU ARE INSTALLING v$KIT_VERSION — the latest release is v$latest.

    This kit lives in a shallow clone pinned to a tag, so it does NOT update
    itself, and every project you start from it inherits the version it holds.

    To refresh it, then re-run this installer:
      git -C "$KIT" fetch --tags --depth 1 origin
      git -C "$KIT" checkout "v$latest"

    Installing v$KIT_VERSION anyway. If that is deliberate, it is a fine answer —
    a pinned kit is reproducible. It just should not be an accident.
STALE
  fi
}

case "${1:-}" in
  --version|-V)
    echo "vantry $KIT_VERSION ($KIT_REF @ $KIT_COMMIT)"
    l="$(kit_latest_release 2>/dev/null || true)"
    if [ -n "$l" ] && [ "$l" != "$KIT_VERSION" ]; then echo "latest release: v$l"; fi
    exit 0 ;;
  --update-kit)
    # Refresh the kit clone in place, so nobody has to remember two git commands.
    l="$(kit_latest_release 2>/dev/null || true)"
    [ -n "$l" ] || { echo "✗ could not reach the origin to find the latest release."; exit 1; }
    if [ "$l" = "$KIT_VERSION" ]; then echo "✓ already on the latest release (v$l)."; exit 0; fi
    echo "→ updating the kit: v$KIT_VERSION → v$l"
    git -C "$KIT" fetch --tags --depth 1 origin >/dev/null 2>&1 || true
    # Two shapes of clone reach here and they update differently. A clone that
    # TRACKS a branch (the quickstart default) must fast-forward that branch —
    # checking out the tag would silently detach it, so the next update would
    # find nothing to do and the kit would freeze at exactly the version this
    # command exists to prevent. Only a clone already detached at a tag moves
    # by tag.
    _br="$(git -C "$KIT" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
    if [ -n "$_br" ]; then
      git -C "$KIT" fetch --depth 1 origin "$_br" >/dev/null 2>&1 || true
      if git -C "$KIT" reset --hard "origin/$_br" >/dev/null 2>&1; then
        echo "✓ now on v$(tr -d '[:space:]' < "$KIT/VERSION" 2>/dev/null) (branch $_br)."
        echo "  Re-run the installer in each project you want to update,"
        echo "  or use scripts/adopt/upgrade.sh there."
        exit 0
      fi
      echo "✗ could not fast-forward $_br — is the kit clone dirty?"
      exit 1
    fi
    if git -C "$KIT" checkout "v$l" >/dev/null 2>&1; then
      echo "✓ now on v$l. Re-run the installer in each project you want to update,"
      echo "  or use scripts/adopt/upgrade.sh there."
      exit 0
    fi
    echo "✗ could not check out v$l — a shallow clone may need: git -C \"$KIT\" fetch --unshallow"
    exit 1 ;;
esac

[ -z "$ARG" ] && { echo "Usage: ./scripts/adopt/install.sh <path-to-project | git-url> [dest-dir]"; exit 1; }

# Say WHICH version is being installed. A kit you cannot identify is a kit you
# cannot upgrade — every adopter's copy otherwise becomes an opaque fork, which
# is precisely what made v1 impossible to update in place.
echo "→ vantry $KIT_VERSION  ($KIT_REF @ $KIT_COMMIT)"
report_staleness
if [ -z "$KIT_TAG_EXACT" ]; then
  echo "  ⚠ this checkout is NOT on a release tag — you are installing unreleased work."
  [ -n "$KIT_TAG_NEAR" ] && echo "    nearest release: $KIT_TAG_NEAR"
  echo "    For the released version:  git -C \"$KIT\" checkout v$KIT_VERSION"
fi

# Resolve the target: a git URL is cloned first; a local path is used in place.
case "$ARG" in
  http://*|https://*|git@*|ssh://*|*.git)
    DEST="${2:-$PWD/$(basename "${ARG%.git}")}"
    if [ "$DRY_RUN" = "1" ]; then echo "  DRY (would clone) $ARG → $DEST"; TARGET="$DEST"
    else
      command -v git >/dev/null 2>&1 || { echo "✗ git not found (needed to clone a URL)."; exit 1; }
      [ -e "$DEST" ] && { echo "✗ Destination already exists: $DEST"; exit 1; }
      echo "→ Cloning $ARG …"
      git clone --quiet "$ARG" "$DEST" || { echo "✗ clone failed."; exit 1; }
      TARGET="$(cd "$DEST" && pwd)"
    fi ;;
  *)
    [ -d "$ARG" ] || { echo "✗ Target folder not found: $ARG"; exit 1; }
    TARGET="$(cd "$ARG" && pwd)" ;;
esac
[ "$TARGET" = "$KIT" ] && { echo "✗ Target is the kit itself. Point at your project (path or URL)."; exit 1; }

echo "→ Installing the Vantry kit into: $TARGET   (DRY_RUN=$DRY_RUN)"
[ -d "$TARGET/.git" ] || echo "  ⚠ Not a git repo yet — 'git init' is recommended before /adopt (so changes land as commits/PRs)."

# Paths that hold PROJECT data, not kit data. If the target already has one,
# it is YOURS — the kit never replaces it. (A live backlog is not a sample.)
is_project_data() {
  case "$1" in
    # Never ship the kit's own 8-row sample into someone's project: /adopt
    # Phase 4 APPENDS, so those rows would survive into a real board and be
    # dispatched as if they were the project's work.
    scripts/kanban/issues.csv)                       return 0 ;;
    scripts/kanban/details/*)                        return 0 ;;
    # settings.json is yours and is never overwritten — but "preserved" used to
    # mean the kit's hook scripts were copied and never REGISTERED, so on any
    # repo that already had one, the Stop gate and the bash guard silently did
    # not run while the README said they did. It is MERGED after the copy.
    .claude/settings.json|.claude/settings.local.json) return 0 ;;
    *)                                               return 1 ;;
  esac
}

# Artefacts this kit leaves in its OWN tree, which must never travel to a target.
# Every one of these is gitignored here, which is exactly why a bare directory
# walk shipped them and no test noticed: a fresh clone has none of them.
is_ephemeral() {
  case "$1" in
    *.vantry-bak-*|*.vantry-bak)          return 0 ;;   # our own backup files
    *.vantry-mode)                        return 0 ;;   # enable-hooks mode records
    .vantry/receipts/*|.vantry/state/*)   return 0 ;;   # evidence, machine-local
    .vantry/artifacts/*)                  return 0 ;;
    *.DS_Store|*.swp|*~)                  return 0 ;;
    *.orig|*.rej)                         return 0 ;;   # merge leftovers
    *) return 1 ;;
  esac
}

KIT_IS_GIT=0
git -C "$KIT" rev-parse --git-dir >/dev/null 2>&1 && KIT_IS_GIT=1

copy_file() {  # $1 = path relative to the kit root
  local rel="$1" src="$KIT/$1" dst="$TARGET/$1"
  if is_project_data "$rel" && [ -e "$dst" ]; then
    echo "  = kept YOUR $rel (project data — never overwritten)"; KEPT=$((KEPT+1)); return 0
  fi
  if [ "$DRY_RUN" = "1" ]; then
    if [ -e "$dst" ]; then
      cmp -s "$src" "$dst" && echo "  DRY (identical) $rel" || echo "  DRY (would back up + replace) $rel"
    else echo "  DRY (would add) $rel"; fi
    return 0
  fi
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ]; then
    cmp -s "$src" "$dst" && return 0                 # already identical, say nothing
    cp "$dst" "$dst.vantry-bak-$STAMP"
    echo "  ~ backed up $rel → $(basename "$dst").vantry-bak-$STAMP"; BACKED=$((BACKED+1))
  fi
  cp "$src" "$dst" && { echo "  + $rel"; COPIED=$((COPIED+1)); }
}

copy_in() {  # $1 = path relative to the kit root (file OR directory)
  local rel="$1" src="$KIT/$1" f
  if [ ! -e "$src" ]; then
    echo "  ⚠ SKIPPED $rel — the kit does not ship it (looked in $src)"
    MISSING="$MISSING $rel"
    return 0
  fi
  if [ -d "$src" ]; then
    # File by file, always. Moving a whole directory aside would replace your
    # live content (e.g. a 120-line issues.csv) with the kit's sample.
    #
    # ENUMERATE WITH GIT WHEN WE CAN. A bare `find` copied everything the source
    # directory happened to contain — and this kit WRITES artefacts into its own
    # tree: install.sh, sync-adapters.sh and upgrade.sh all leave
    # `<name>.vantry-bak-<timestamp>` behind. Those are gitignored, so a fresh
    # clone has none and the defect is invisible in testing; a working copy that
    # has actually been used has dozens, and one user received 64 of them.
    #
    # git ls-files is the exact right answer: it lists what the kit SHIPS and
    # nothing it merely accumulated. The find fallback keeps a non-git copy
    # working, with the same exclusions spelled out.
    if [ "$KIT_IS_GIT" = "1" ]; then
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        is_ephemeral "$f" && continue
        copy_file "$f"
      done < <(git -C "$KIT" ls-files -- "$rel" 2>/dev/null)
    else
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        is_ephemeral "${f#$KIT/}" && continue
        copy_file "${f#$KIT/}"
      done < <(find "$src" -type f 2>/dev/null)
    fi
  else
    is_ephemeral "$rel" && return 0
    copy_file "$rel"
  fi
}

# The kit's own files — nothing here is your application code.
#
# v1 copied ONLY .claude/, which made every "universal, works on any agent"
# claim false the moment you installed it: no AGENTS.md, no agents/, no skills/,
# no adapters, and — fatally for v2 — no scripts/verify.sh for the hooks to call.
# THE INVENTORY IS distribution.txt, not this file.
#
# It used to be a hardcoded list here, and the list drifted: evidence.yml shipped
# as a feature in v3.13.0 and was never added, so for two versions every
# adopter's PR evidence gate silently did not exist. vendor/, the third-party
# notices, docs/engineering/ and the eval suite were missing the same way.
#
# One list now, read by the installer, the upgrader and a test that asserts every
# line of it actually arrives.
MANIFEST="$KIT/distribution.txt"
if [ ! -f "$MANIFEST" ]; then
  echo "✗ $MANIFEST is missing — refusing to install a set of files nothing declares." >&2
  exit 1
fi
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  opt=0
  case "$line" in '?'*) opt=1; line="${line#\?}" ;; esac
  if [ ! -e "$KIT/$line" ]; then
    if [ "$opt" -eq 1 ]; then continue; fi
    echo "✗ distribution.txt lists '$line', which does not exist in this kit." >&2
    MISSING="$MISSING $line"
    continue
  fi
  copy_in "$line"
done < "$MANIFEST"

# ---- register the Claude hooks in whatever settings.json the target has ------
# Copying a hook script does not arm it: the registration lives in settings.json,
# which is the user's file. So merge additively — their hooks and permissions are
# never removed, ours are added, and running it twice changes nothing.
if [ "$DRY_RUN" != "1" ] && command -v python3 >/dev/null 2>&1; then
  python3 "$KIT/scripts/lib/merge-claude-settings.py" \
    "$KIT/.claude/settings.json" "$TARGET/.claude/settings.json" || true
elif [ "$DRY_RUN" != "1" ]; then
  echo "  ! python3 is absent — .claude/settings.json was NOT merged."
  echo "    The hook scripts are installed but NOT registered: the Stop gate and"
  echo "    the bash guard will not run. Install python3 and re-run, or register"
  echo "    them by hand from the kit's .claude/settings.json."
fi

# .claude/agents and .claude/skills are DERIVED — sync-adapters.sh builds them
# below, so the mirror can never be installed stale.

if [ "$DRY_RUN" != "1" ]; then
  # Only what WE copied. The old glob chmod +x'd every .sh in the target,
  # including the project's own scripts — a silent mode change on files the
  # installer promises never to touch.
  ( cd "$KIT" && find scripts .githooks .claude/hooks -type f 2>/dev/null ) | while IFS= read -r rel; do
    case "$rel" in
      *.sh|.githooks/*|.claude/hooks/*) [ -f "$TARGET/$rel" ] && chmod +x "$TARGET/$rel" 2>/dev/null ;;
    esac
  done

  # Build the Claude mirror in place, so it can never be installed stale.
  if [ -x "$TARGET/scripts/sync-adapters.sh" ]; then
    echo
    echo "→ Generating the tool adapters in the target…"
    ( cd "$TARGET" && ./scripts/sync-adapters.sh ) 2>&1 | sed 's/^/  /'
  fi

  # Hooks: delegated to the ONE implementation that knows how not to break you.
  if [ -d "$TARGET/.git" ] && [ -x "$TARGET/scripts/lib/enable-hooks.sh" ]; then
    echo
    echo "→ Enabling git hooks (never overwriting husky/lefthook)…"
    ( cd "$TARGET" && ./scripts/lib/enable-hooks.sh . ) 2>&1 | sed 's/^/  /'
  fi

  # .vantry/ holds evidence, not source. The gate no longer DEPENDS on this
  # (vantry-common.sh excludes the path outright), but leaving receipts and the
  # agent log as untracked files makes `git status` useless within a day.
  GI="$TARGET/.gitignore"
  if ! grep -q '^\.vantry/receipts/' "$GI" 2>/dev/null; then
    { [ -s "$GI" ] && echo ""
      echo "# --- vantry: evidence, not source ---"
      echo ".vantry/receipts/"
      echo ".vantry/state/"
      echo ".vantry/artifacts/"
      echo "*.vantry-bak-*"
      echo "# tracked deliberately: .vantry/manifest.json, .vantry/overrides/, .vantry/reviews/"
    } >> "$GI"
    echo "  + .gitignore (vantry evidence paths appended — your entries untouched)"
  fi

  # A fresh target gets the SCHEMA, not the kit's example rows.
  if [ ! -s "$TARGET/scripts/kanban/issues.csv" ] || cmp -s "$KIT/scripts/kanban/issues.csv" "$TARGET/scripts/kanban/issues.csv"; then
    head -1 "$KIT/scripts/kanban/issues.csv" > "$TARGET/scripts/kanban/issues.csv"
    rm -f "$TARGET"/scripts/kanban/details/*.md 2>/dev/null
    echo "  + scripts/kanban/issues.csv (header only — the kit's sample rows are not your backlog)"
  fi

  # Provenance: which kit version this project runs, and what it kept of its own.
  mkdir -p "$TARGET/.vantry"
  cat > "$TARGET/.vantry/manifest.json" <<JSON
{
  "schema": "vantry.manifest/1",
  "kit_version": "$(cat "$KIT/VERSION" 2>/dev/null || echo unknown)",
  "source_commit": "$(git -C "$KIT" rev-parse HEAD 2>/dev/null || echo unknown)",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "installed_by": "scripts/adopt/install.sh"
}
JSON
  echo "  + .vantry/manifest.json"
fi

echo
if [ -n "$MISSING" ]; then
  echo "⚠ Kit installed WITH GAPS — these were not found in the kit and were skipped:"
  for m in $MISSING; do echo "    - $m"; done
  echo "  The kit is incomplete; the features behind those files are NOT active."
else
  echo "✓ Kit installed."
fi
[ "$DRY_RUN" != "1" ] && echo "  $COPIED file(s) written · $BACKED backed up · $KEPT of yours kept untouched."
# QUOTED heredoc. It was unquoted, and the text below contains a shell command in
# backticks as an EXAMPLE — which command substitution duly executed, so a
# non-destructive installer created ./my-project/ and ran git init inside the
# user's repository. Prose that describes a command must never be interpolated.
printf '  Next:\n'
printf '    1. declare how THIS project is verified — the one step nothing can guess:\n'
printf '         cd %s && ./scripts/verify.sh --init && $EDITOR vantry.yml\n' "$TARGET"
cat <<'NEXT'
    2. prove the contract is real (it must print ✓ VERIFIED):
         ./scripts/verify.sh
    3. then open your agent and onboard — the playbook depends on what this repo IS:
         claude
           an EXISTING codebase  →  /adopt        (or '/adopt audit' for the review only)
           an EMPTY repo + an idea →  /refine-idea  then  /bootstrap
         (This printed /adopt for everyone, including someone who had just run
          'mkdir my-project && git init' — sending them to a review of nothing.)

  Until step 1 is done the gate stays inert: with no vantry.yml, verification is
  UNDEFINED and vantry refuses to pretend otherwise.
NEXT
[ -n "$MISSING" ] && exit 1
exit 0
