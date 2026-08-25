#!/usr/bin/env bash
# ============================================================================
#  vantry-common.sh — shared helpers. bash 3.2 / macOS compatible.
#  SOURCED, never executed. No dependency beyond git, bash, sed/awk/grep.
#  jq and python3 are used when present, never required.
# ============================================================================

VANTRY_ROOT="${VANTRY_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# When sourced from a hook the cwd may be anywhere: prefer the git toplevel.
if command -v git >/dev/null 2>&1; then
  _vt="$(git rev-parse --show-toplevel 2>/dev/null)"
  [ -n "$_vt" ] && VANTRY_ROOT="$_vt"
  unset _vt
fi
VANTRY_CFG="$VANTRY_ROOT/vantry.yml"
VANTRY_STATE="$VANTRY_ROOT/.vantry/state"

# ---------------------------------------------------------------- hashing
vantry_sha() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1
  else cksum | cut -d' ' -f1; fi
}

# ---------------------------------------------- restricted-YAML config reader
#  Supported subset: flat keys, ONE level of 2-space nesting, "- item" lists.
#  No anchors, no multiline scalars, no inline objects. Validated by
#  scripts/validate-config.sh — anything richer is a design smell, not a gap.
#    vantry_cfg strictness standard      → top-level key
#    vantry_cfg run.smoke                → nested key
vantry_cfg() {
  local key="$1" def="${2:-}" top sub val
  [ -f "$VANTRY_CFG" ] || { printf '%s' "$def"; return 0; }
  case "$key" in
    *.*) top="${key%%.*}"; sub="${key#*.}" ;;
    *)   top="$key"; sub="" ;;
  esac
  if [ -z "$sub" ]; then
    val="$(awk -v k="$top" 'index($0, k":")==1 { sub("^" k ":[ \t]*", ""); print; exit }' "$VANTRY_CFG")"
  else
    val="$(awk -v t="$top" -v s="$sub" '
      index($0, t":")==1 && $0 ~ /:[ \t]*(#.*)?$/ { inb=1; next }
      inb && /^[^ \t#]/                           { inb=0 }
      inb && $0 ~ "^[ \t]+" s ":"                 { sub("^[ \t]+" s ":[ \t]*", ""); print; exit }
    ' "$VANTRY_CFG")"
  fi
  # YAML plain scalars end at " #". A value that must contain " #" gets quoted —
  # and a quoted value keeps everything up to its closing quote, verbatim.
  case "$val" in
    \"*) val="${val#\"}"; val="${val%%\"*}" ;;
    \'*) val="${val#\'}"; val="${val%%\'*}" ;;
    # A value that is ONLY a comment is not a value. `smoke:  # TODO` used to
    # parse as the command "# TODO", and `eval "# TODO"` exits 0 — so the gate
    # saw a declared smoke run, ran nothing, and PASSED. A silent false pass is
    # the exact failure this whole project exists to make impossible.
    \#*) val="" ;;
    # [[:space:]], never [ \t]: BSD sed reads \t inside a bracket expression as
    # the literal characters \ and t, so `[ \t]*$` silently ate the final "t" of
    # `strict` and of every command ending in `... test`.
    *)   val="$(printf '%s' "$val" | sed -e 's/[[:space:]][[:space:]]*#.*$//' -e 's/[[:space:]]*$//')" ;;
  esac
  # A quoted value gets no comment-stripping, which is correct — but it was also
  # never re-tested for emptiness. `smoke: "# TODO"` therefore parsed as the
  # command "# TODO", and eval on a comment exits 0: a declared smoke run that
  # executed nothing and PASSED. Same for a quoted run of spaces.
  # Wrong in both directions before this: `"# TODO"` was caught but `" # TODO"`
  # — one leading space — was not, and a legitimate command starting `#!` was
  # wrongly emptied. Trim first, and treat `#!` as executable, because it is.
  _t="$(printf '%s' "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  case "$_t" in
    '#!'*) : ;;                       # a shebang line is a command, not a comment
    '#'*)  val="" ;;
    '')    val="" ;;
  esac
  unset _t
  [ -z "$val" ] && val="$def"
  printf '%s' "$val"
}

vantry_cfg_list() {  # vantry_cfg_list sensitive_paths  → one item per line
  local key="$1"
  [ -f "$VANTRY_CFG" ] || return 0
  awk -v k="$key" '
    index($0, k":")==1 && $0 ~ /:[ \t]*(#.*)?$/ { inb=1; next }
    inb && /^[^ \t#-]/                          { inb=0 }
    inb && /^[ \t]*-[ \t]+/ {
      sub("^[ \t]*-[ \t]+", ""); sub("[ \t]*$", "")
      # A MATCHED pair only. Stripping either end independently ate a trailing
      # apostrophe from any item that legitimately ended in one.
      if (substr($0,1,1) == "\"" && substr($0,length($0),1) == "\"") $0 = substr($0, 2, length($0)-2)
      else if (substr($0,1,1) == "'"'"'" && substr($0,length($0),1) == "'"'"'") $0 = substr($0, 2, length($0)-2)
      if (length($0)) print
    }
  ' "$VANTRY_CFG"
}

# ------------------------------------------------------------- glob matching
#  Translate a gitignore-flavoured glob to an anchored ERE.
#    docs/**  → docs(/.*)?      **/auth/** → (.*/)?auth(/.*)?      *.md → [^/]*\.md
vantry_glob_to_re() {
  # The '?' emitted by the ** rules must survive the glob '?' → '[^/]' rule,
  # so it travels as a placeholder and is restored last.
  printf '%s' "$1" \
    | sed -e 's#[][\\.^$+(){}|]#\\&#g' \
          -e 's#\*\*/#(@@ANY@@/)@@OPT@@#g' \
          -e 's#/\*\*#(/@@ANY@@)@@OPT@@#g' \
          -e 's#\*\*#@@ANY@@#g' \
          -e 's#\*#[^/]*#g' \
          -e 's#?#[^/]#g' \
          -e 's#@@ANY@@#.*#g' \
          -e 's#@@OPT@@#?#g'
}

vantry_glob_match() {  # $1 = path, $2 = glob
  printf '%s\n' "$1" | grep -qE "^$(vantry_glob_to_re "$2")$"
}

vantry_matches_list() {  # $1 = path, $2 = config list key
  local p="$1" g
  while IFS= read -r g; do
    [ -n "$g" ] || continue
    vantry_glob_match "$p" "$g" && return 0
  done <<EOF
$(vantry_cfg_list "$2")
EOF
  return 1
}

# A trivial file cannot change what the software DOES, so it never owes a
# verification. Everything not declared trivial is behavioral — deny by default.
vantry_is_trivial()   { vantry_matches_list "$1" trivial_paths; }
vantry_is_sensitive() { vantry_matches_list "$1" sensitive_paths; }

# ------------------------------------------------------- identity of the work
vantry_slug() {
  local b
  b="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  if [ -z "$b" ] || [ "$b" = "HEAD" ]; then b="detached-$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"; fi
  printf '%s' "$b" | tr '/' '-' | tr -cd 'A-Za-z0-9._-'
}

# ------------------------------------------------------------- the changeset
#  Everything is measured against the BASE the work will merge into — never
#  against HEAD. Diffing HEAD would make `git commit` erase the changeset, so a
#  receipt earned before the commit would still be "valid" after ten more
#  commits. Against the base, committing changes nothing: the content is the
#  same, so the receipt survives the commit and dies on the next EDIT.
vantry_base_ref() {
  local b
  b="$(vantry_cfg merge.base)"
  if [ -z "$b" ]; then
    b="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
  fi
  # On a pull_request run GitHub sets GITHUB_BASE_REF to the base branch. It is
  # the most authoritative answer available in CI, and it costs nothing to use.
  [ -z "$b" ] && b="${GITHUB_BASE_REF:-}"
  [ -z "$b" ] && b="main"
  printf '%s' "$b"
}

# Does the configured base actually exist? Silently falling back to HEAD made
# the changeset empty on any trunk not named `main`, so a repo on `develop` or
# `master` with no origin reported "verdict: OK" and enforced nothing on
# committed work — while --status printed a base sha that was really just HEAD.
vantry_base_resolves() {
  local b r
  b="$(vantry_base_ref)"
  # `refs/remotes/origin/$b` is listed explicitly because a shallow CI checkout
  # can hold the remote ref without a local branch of the same name.
  for r in "origin/$b" "refs/remotes/origin/$b" "$b" "refs/heads/$b"; do
    git rev-parse --verify --quiet "$r" >/dev/null 2>&1 && return 0
  done
  return 1
}

# The commit the changeset is measured FROM. VANTRY_REF lets pre-push judge a
# branch it is not standing on — without it the hook gated the checked-out tree
# and any other ref in the same push went out unexamined.
vantry_tip() { printf '%s' "$(git rev-parse "${VANTRY_REF:-HEAD}" 2>/dev/null || git rev-parse HEAD 2>/dev/null)"; }

vantry_base_point() {
  local b r mb="" tip
  b="$(vantry_base_ref)"
  tip="$(vantry_tip)"
  for r in "origin/$b" "$b"; do
    git rev-parse --verify --quiet "$r" >/dev/null 2>&1 || continue
    mb="$(git merge-base "$tip" "$r" 2>/dev/null)"
    [ -n "$mb" ] && break
  done
  [ -z "$mb" ] && mb="$tip"
  printf '%s' "$mb"
}

# Can this gate see committed work at all? When the base point is HEAD itself —
# you are standing on the trunk and no `origin/<trunk>` exists to measure unpushed
# commits against — `git diff <base>` can only report uncommitted files. The gate
# is then structurally blind to anything already committed, which is NOT the same
# as "nothing changed", and printing the same silent 0 for both is how a gate
# looks armed while seeing nothing.
vantry_gate_blind() {
  local b
  b="$(vantry_base_ref)"
  git rev-parse --verify --quiet "origin/$b" >/dev/null 2>&1 && return 1
  [ "$(vantry_base_point)" = "$(git rev-parse HEAD 2>/dev/null)" ] || return 1
  git rev-parse --verify --quiet HEAD >/dev/null 2>&1 || return 1   # no commits yet: nothing to be blind to
  return 0
}

# The non-trivial files this branch changes — committed OR not.
vantry_changed_files() {
  local base f
  base="$(vantry_base_point)"
  {
    if [ -n "${VANTRY_REF:-}" ]; then
      # Judging another branch: its changeset is base..<that branch>, committed
      # only. The working tree belongs to whatever IS checked out and says
      # nothing about the ref being pushed.
      [ -n "$base" ] && git diff --name-only "$base" "$(vantry_tip)" 2>/dev/null
    else
      [ -n "$base" ] && git diff --name-only "$base" 2>/dev/null
      git ls-files --others --exclude-standard 2>/dev/null
    fi
  } | sort -u | while IFS= read -r f; do
    [ -n "$f" ] || continue
    # .vantry/ is EVIDENCE, never source. Without this the receipt is part of
    # its own digest: verify.sh writes it, the digest changes, and the receipt
    # is stale the instant it exists. The kit only tested green on itself
    # because its own .gitignore hides .vantry/ — every adopted repo, whose
    # .gitignore the installer never touched, got a permanently blocked gate.
    # Correctness cannot depend on a file the user owns.
    case "$f" in .vantry/*) continue ;; esac
    vantry_is_trivial "$f" && continue
    printf '%s\n' "$f"
  done
}

# The file's mode, normalised to what git records: 100755 or 100644. Portable
# across BSD stat (-f %Lp) and GNU stat (-c %a) — and if neither exists, fall
# back to a test that at least distinguishes executable from not, because
# silently returning the same value for both would re-open the hole this closes.
vantry_file_mode() {
  # git records exactly two modes for a blob. `-x` is the only distinction that
  # matters and it needs no stat(1), so it is also the portable answer.
  if [ -x "$1" ]; then printf '100755'; else printf '100644'; fi
}

# The fingerprint that makes a receipt STALE the moment the code changes again.
vantry_tree_digest() {
  local f
  {
    vantry_changed_files | while IFS= read -r f; do
      if [ -n "${VANTRY_REF:-}" ]; then
        # Digest the file AS IT IS ON THAT REF, never as it is in this worktree —
        # including the mode git recorded for it.
        if git cat-file -e "$(vantry_tip):$f" 2>/dev/null; then
          printf '%s %s %s\n' "$(git show "$(vantry_tip):$f" 2>/dev/null | vantry_sha)" \
            "$(git ls-tree "$(vantry_tip)" -- "$f" 2>/dev/null | awk '{print $1}')" "$f"
        else printf 'DELETED %s\n' "$f"; fi
      elif [ -f "$VANTRY_ROOT/$f" ]; then
        # Content AND mode. Hashing content alone meant `chmod -x` on a hook or a
        # script left the receipt CURRENT while git recorded 100755 -> 100644 — a
        # gate could be made non-executable after it was verified.
        printf '%s %s %s\n' "$(vantry_sha < "$VANTRY_ROOT/$f")" "$(vantry_file_mode "$VANTRY_ROOT/$f")" "$f"
      else printf 'DELETED %s\n' "$f"; fi
    done
  } | vantry_sha
}

# ------------------------------------------------------------ receipt sealing
# "An agent cannot produce this file" was the product thesis, and it was false:
# one heredoc wrote a receipt with produced_by:"totally-not-verify.sh", steps:[]
# and the right tree_digest, and every gate accepted it. The digest proves WHICH
# CODE was judged; nothing proved the judging ever happened.
#
# The seal is a keyed hash over the receipt's own claims, using a machine-local
# key that is never committed and never leaves .vantry/state/. Writing the JSON
# is no longer enough; you must read the key, and reading the key to forge a
# receipt stops being a mistake and becomes a decision — which is the line that
# matters. Receipts are already machine-local (gitignored), so a per-machine key
# costs nothing: a fresh clone has no receipts to validate anyway.
vantry_seal_key() {
  local k="$VANTRY_ROOT/.vantry/state/seal.key"
  if [ ! -s "$k" ]; then
    mkdir -p "$(dirname "$k")" 2>/dev/null || return 1
    { head -c 32 /dev/urandom 2>/dev/null | od -An -tx1 | tr -d ' \n'; } > "$k" 2>/dev/null
    [ -s "$k" ] || printf '%s' "$$-vantry-fallback" > "$k"
    chmod 600 "$k" 2>/dev/null
  fi
  cat "$k"
}

# The sealed claims, in a fixed order. Deliberately NOT the whole file:
# --observe annotates a receipt after the fact and must not have to re-seal a
# run it did not perform.
vantry_seal_payload() {
  local r="$1"
  # SEAL THE DOCUMENT, NOT A SELECTION OF FIELDS.
  #
  # This used to hash five chosen fields — verdict, tree_digest, created_at,
  # head, produced_by. Everything else was unsealed, and three of those
  # unsealed fields DECIDE THE GATE:
  #
  #   · `kind`       — one sed turned a deployment smoke, which skips test and
  #                    build, into a full verification. Reproduced: rc=0.
  #   · `steps`      — the "a pass with no steps" check reads it.
  #   · `acceptance` — a failed criterion could be rewritten to "pass" while
  #                    still naming the requirement it did not prove.
  #
  # Choosing which fields matter was the error: the next field added to the
  # receipt would have been unsealed too, silently. So: everything EXCEPT
  # `observation` (which --observe legitimately writes afterwards) and `seal`
  # itself. Canonical JSON — sorted keys, no whitespace — so re-serialisation
  # cannot change the hash.
  if command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(1)
d.pop("seal", None)
d.pop("observation", None)
sys.stdout.write(json.dumps(d, sort_keys=True, separators=(",", ":")))
' "$r" 2>/dev/null && return 0
  fi
  # Fallback: the file with the two mutable lines removed. Weaker than canonical
  # JSON — it is sensitive to formatting — but it still covers every field the
  # gate reads, which the old five-field payload did not.
  grep -v '"seal"' "$r" 2>/dev/null | grep -v '"observation"'
}

vantry_seal_compute() {   # $1 = payload string → 64 hex chars, or nothing
  local key out; key="$(vantry_seal_key)" || return 1
  [ -n "$key" ] || return 1
  if command -v openssl >/dev/null 2>&1; then
    # openssl prints "HMAC-SHA2-256(stdin)= <hex>" on OpenSSL 3 and bare hex on
    # some LibreSSL builds. Take whatever follows the last "= ", then INSIST it
    # looks like a digest: an openssl that exists but fails wrote an empty seal,
    # and an empty seal read as "forged" — so a machine with a broken openssl
    # blocked its own gate forever with a message about forgery.
    out="$(printf '%s' "$1" | openssl dgst -sha256 -hmac "$key" 2>/dev/null | sed 's/.*= *//' | tr -d '[:space:]')"
  fi
  case "$out" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) : ;;
    *) out="$(printf '%s%s%s' "$key" "$1" "$key" | vantry_sha)" ;;
  esac
  case "$out" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) printf '%s' "$out" ;;
    *) return 1 ;;                      # this machine cannot hash at all
  esac
}

# 0 = the seal matches · 1 = it does not · 2 = cannot tell on this machine
#
# The distinction is the whole design. A machine that CAN seal and finds a
# receipt with a wrong or absent seal has caught a forgery and must block. A
# machine that cannot seal at all (no key, no sha tool — a fresh clone, a
# stripped container) knows nothing and must NOT convert its own ignorance into
# an accusation: it degrades to the pre-seal behaviour and says so.
vantry_seal_ok() {
  local r="$1" have want
  # DO NOT return "cannot tell" merely because the key file is absent. That was
  # the hole: deleting .vantry/state/seal.key turned every forged receipt into an
  # unverifiable one, and unverifiable was being treated as acceptable. An
  # attacker who can write a receipt can also delete a file.
  #
  # The only honest reason to degrade is that this machine cannot HASH AT ALL.
  # vantry_seal_compute creates the key when it is missing, so on any machine
  # with sha256 a receipt sealed elsewhere — or not sealed — simply fails to
  # match and the gate blocks. That is correct: receipts are machine-local and
  # gitignored, so a receipt that did not come from this machine is one this
  # machine has no reason to trust.
  want="$(vantry_seal_compute "$(vantry_seal_payload "$r")")" || return 2
  [ -n "$want" ] || return 2          # no hashing tool here: genuinely cannot tell
  have="$(vantry_receipt_field "$r" seal)"
  [ -n "$have" ] || return 1          # we CAN seal, and this one is not sealed
  [ "$have" = "$want" ] && return 0
  return 1
}

# ------------------------------------------------------------- JSON helpers
vantry_esc() {  # JSON-escape a scalar string
  # printf, never a heredoc: `<<EOF` always appends a newline, so every escaped
  # value in every receipt carried a trailing \n — "AC-1\n", "grep -q …\n".
  # Invisible in a diff, fatal to anything matching on the value.
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$1" | python3 -c 'import sys,json; sys.stdout.write(json.dumps(sys.stdin.read())[1:-1])'
  else
    printf '%s' "$1" | sed -e 's#\\#\\\\#g' -e 's#"#\\"#g' | tr '\n\t\r' '   '
  fi
}

vantry_json_get() {  # $1 = json text, $2 = dotted path
  if command -v jq >/dev/null 2>&1; then
    # NOT `// ""` — that swallows a legitimate `false` into the empty string.
    printf '%s' "$1" | jq -r --arg p "$2" '
      getpath($p | split(".")) as $v
      | if $v == null then empty else ($v | if type == "string" then . else tojson end) end' 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$1" | python3 -c '
import json,sys
try: d = json.load(sys.stdin)
except Exception: sys.exit(0)
for k in sys.argv[1].split("."):
    if isinstance(d, dict) and k in d: d = d[k]
    else: sys.exit(0)
if isinstance(d, bool): print("true" if d else "false")
elif d is None: pass
else: print(d if isinstance(d, str) else json.dumps(d))
' "$2" 2>/dev/null
  fi
}

vantry_receipt_field() {  # $1 = receipt path, $2 = dotted path
  [ -f "$1" ] || return 0
  vantry_json_get "$(cat "$1")" "$2"
}

# ----------------------------------------------------------------- audit log
vantry_log() {  # $1 = event, $2 = detail
  mkdir -p "$VANTRY_STATE" 2>/dev/null || return 0
  printf '{"at":"%s","event":"%s","branch":"%s","detail":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$(vantry_slug)" "$(vantry_esc "${2:-}")" \
    >> "$VANTRY_STATE/agent-log.jsonl" 2>/dev/null || true
}

vantry_is_project() { [ -f "$VANTRY_CFG" ]; }
