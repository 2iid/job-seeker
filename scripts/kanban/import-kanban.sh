#!/usr/bin/env bash
# ============================================================================
#  import-kanban.sh — turn issues.csv into a FULLY set-up GitHub board.
#  GENERIC + bash 3.2 compatible (macOS default shell). No assoc arrays, no eval.
#
#  Repo is AUTO-DETECTED from the current gh/git context (override with REPO=owner/name).
#  Everything is DERIVED from issues.csv, so this works for ANY project:
#    - one milestone per unique `epic`
#    - labels area:/agent:/priority:/size:/status:/sprint: from the CSV's actual values
#    - a board (created or reused) with a single-select **Sprint** field, and every
#      issue placed in its sprint column — no manual board setup.
#
#  CSV columns (header required): id,title,epic,area,agent,priority,size,deps,status,sprint
#    `sprint` holds the Sprint field value (e.g. S1, S2, Backlog). The sprint-planner fills it.
#
#  USAGE:
#    ./import-kanban.sh                     # labels + milestones + issues (no board)
#    ./import-kanban.sh --project new       # ALSO create a board + Sprint field + place every issue
#    ./import-kanban.sh --project 7         # ALSO set up an EXISTING board #7 the same way
#    REPO=you/repo ./import-kanban.sh …     # explicit repo
#    DRY_RUN=1 ./import-kanban.sh …         # simulate, create nothing
#    PROJECT_TITLE="My Board" ./import-kanban.sh --project new   # name the created board
#
#  PREREQS: gh installed + authenticated (`gh auth login`); the repo must exist.
#           Board steps need the 'project' scope: `gh auth refresh -s project`.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CSV="${CSV:-$HERE/issues.csv}"
DRY_RUN="${DRY_RUN:-0}"
PROJECT_NUMBER=""
[ "${1:-}" = "--project" ] && PROJECT_NUMBER="${2:-}"

TMP="$(mktemp -d 2>/dev/null || echo /tmp/kanban.$$)"; mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

# A DRY RUN must work offline. Its whole purpose is to let you inspect what
# WOULD be created before you have a repo, a token, or the nerve — and demanding
# credentials to preview nothing makes the preview useless exactly when it is
# most wanted. Everything that talks to the network is already guarded by
# DRY_RUN individually.
if [ "$DRY_RUN" != "1" ]; then
  command -v gh >/dev/null 2>&1 || { echo "✗ gh not found. Install it then 'gh auth login'."; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "✗ gh not authenticated. Run 'gh auth login'."; exit 1; }
fi
[ -f "$CSV" ] || { echo "✗ issues.csv not found at $CSV"; exit 1; }

# Auto-detect the target repo if not provided.
REPO="${REPO:-}"
[ -z "$REPO" ] && REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [ -z "$REPO" ]; then
  if [ "$DRY_RUN" = "1" ]; then REPO="dry-run/preview"
  else echo "✗ Could not detect repo. Run inside the repo or set REPO=owner/name."; exit 1; fi
fi
owner="${REPO%%/*}"
echo "→ Target repo: $REPO   (DRY_RUN=$DRY_RUN)"

# --check: compare the CSV to the board and report the DRIFT. Nothing is created.
#
# This exists because of a failure seen in real use: /refine-backlog took a
# sprint from 11 stories to 20, and the board still showed 11. The playbook said
# "board-synced" and set Sprint fields on issues that already existed — it never
# CREATED the new ones, because nothing named this script. Drift you cannot see
# is drift you plan around: standup and sprint-review both read the board.
if [ "${1:-}" = "--check" ]; then
  command -v gh >/dev/null 2>&1 || { echo "  · gh absent — cannot compare the CSV to the board."; exit 0; }
  [ -f "$CSV" ] || { echo "  · no $CSV"; exit 0; }
  CSV_IDS="$(tail -n +2 "$CSV" | awk -F, 'NF>1 && $1 !~ /^[[:space:]]*$/ {print $1}' | sort -u)"
  BOARD_TITLES="$(gh issue list --repo "$REPO" --state all --limit 1000 --json title --jq '.[].title' 2>/dev/null || true)"
  MISSING=""
  for id in $CSV_IDS; do
    printf '%s\n' "$BOARD_TITLES" | grep -q "^$id " || MISSING="$MISSING $id"
  done
  N_CSV="$(printf '%s\n' "$CSV_IDS" | grep -c . || true)"
  N_MISS="$(printf '%s' "$MISSING" | wc -w | tr -d ' ')"
  echo "  CSV rows: ${N_CSV:-0} · on the board: $(( ${N_CSV:-0} - N_MISS )) · MISSING: $N_MISS"
  if [ "$N_MISS" -gt 0 ]; then
    echo "  ✗ these rows exist in $CSV and NOT on the board:"
    for id in $MISSING; do echo "      $id"; done
    echo "    They are invisible to /next, to standup and to sprint-review."
    echo "    Fix: bash scripts/kanban/import-kanban.sh --project <n>"
    exit 1
  fi
  echo "  ✓ every backlog row exists on the board"
  exit 0
fi

# Guard: arity comes from the HEADER, never from a hard-coded number. The count
# was pinned at 10 while /next, /refine-backlog and /bootstrap all required a
# `paths` column — so the board could not carry the field its own parallel
# dispatch rule depends on, and adding it aborted the import. A comma inside a
# title still shifts the columns and would silently mis-file the sprint, so that
# stays fatal.
# Lint BEFORE the first network call. Every defect the linter catches would
# otherwise be found once issues exist on GitHub, when fixing it means editing
# or deleting real ones.
if [ -x "$(dirname "$0")/lint-kanban.sh" ]; then
  "$(dirname "$0")/lint-kanban.sh" "$CSV" || {
    echo "✗ refusing to import a backlog that does not lint. Nothing was created."; exit 1; }
  echo
fi

NCOL="$(head -1 "$CSV" | awk -F, '{print NF}')"
bad_rows="$(awk -F, -v n="$NCOL" 'NR>1 && NF>0 && NF!=n{printf "  line %d (has %d columns, header has %d): %s\n", NR, NF, n, $0}' "$CSV")"
if [ -n "$bad_rows" ]; then
  echo "✗ issues.csv: these rows do not match the header's $NCOL columns (a comma inside a title is the usual cause):"
  printf '%s\n' "$bad_rows"
  echo "  Fix them (keep titles comma-free), then re-run."; exit 1
fi

# ---- deterministic label color by prefix + value ---------------------------
label_color() {  # $1=prefix $2=value
  case "$1" in
    priority) case "$2" in P0) echo B60205;; P1) echo D93F0B;; P2) echo FBCA04;; *) echo 0E8A16;; esac;;
    size)     case "$2" in S) echo C2E0C6;; M) echo FBCA04;; L) echo D93F0B;; *) echo BFD4F2;; esac;;
    status)   case "$2" in todo) echo 0E8A16;; doing|in-progress) echo FBCA04;; done) echo 5319E7;; *) echo FFFFFF;; esac;;
    sprint)   echo 1D76DB;;
    agent)    echo EEEEEE;;
    *)        echo 0052CC;;   # area:* and anything else
  esac
}
uniq_labels() { # $1=col_index(1-based) $2=prefix
  tail -n +2 "$CSV" | cut -d, -f"$1" | sed '/^$/d' | sort -u | while read -r v; do [ -n "$v" ] && echo "$2|$v"; done
}
# Sprint values in board order: S0,S1,…,S<n> numeric, then Backlog / any non-S* last.
# GUARANTEE a "Backlog" bucket whenever any row is unscheduled, so unassigned work gets an
# explicit column and NEVER falls into a "No Sprint" column.
sprint_values_sorted() {
  local all rows nz; all="$(tail -n +2 "$CSV" | cut -d, -f10 | sed '/^[[:space:]]*$/d' | sort -u)"
  rows=$(tail -n +2 "$CSV" | grep -c .); nz=$(tail -n +2 "$CSV" | cut -d, -f10 | sed '/^[[:space:]]*$/d' | grep -c .)
  printf '%s\n' "$all" | grep -E '^S[0-9]+$' | sort -t S -k2,2n
  { printf '%s\n' "$all" | grep -vE '^S[0-9]+$'; [ "$nz" -lt "$rows" ] && echo Backlog; } | sed '/^[[:space:]]*$/d' | sort -u
}

echo "→ Labels (derived from issues.csv)…"
# columns: 1 id,2 title,3 epic,4 area,5 agent,6 priority,7 size,8 deps,9 status,10 sprint
{ uniq_labels 4 area; uniq_labels 5 agent; uniq_labels 6 priority; uniq_labels 7 size; uniq_labels 9 status; sprint_values_sorted | while read -r v; do [ -n "$v" ] && echo "sprint|$v"; done; } \
| sort -u | while IFS='|' read -r prefix value; do
  [ -z "${value:-}" ] && continue
  name="$prefix:$value"; color="$(label_color "$prefix" "$value")"
  if [ "$DRY_RUN" = "1" ]; then echo "  DRY label: $name (#$color)"
  else gh label create "$name" --color "$color" --force --repo "$REPO" >/dev/null 2>&1 && echo "  + $name" || echo "  ~ $name"; fi
done

echo "→ Milestones (one per epic)…"
existing_ms="$(gh api "repos/$REPO/milestones?state=all&per_page=100" --jq '.[].title' 2>/dev/null || true)"
tail -n +2 "$CSV" | cut -d, -f3 | sed '/^$/d' | sort -u | while read -r epic; do
  [ -z "$epic" ] && continue
  if printf '%s\n' "$existing_ms" | grep -qxF "$epic"; then echo "  = exists: $epic"
  elif [ "$DRY_RUN" = "1" ]; then echo "  DRY milestone: $epic"
  else gh api "repos/$REPO/milestones" -f title="$epic" >/dev/null 2>&1 && echo "  + $epic" || echo "  ~ $epic"; fi
done

echo "→ Issues…"
# SAFETY: abort if we can't read existing issues (avoid duplicates). Fetch number+title so we can
# BACK-FILL labels onto issues that ALREADY EXIST (adopt-safe) — this is what makes the sprint (and
# every other label) appear on pre-existing issues, so a board can be grouped by sprint even when the
# issues were created before the sprint was assigned. New issues are still created as before.
# The one call left unguarded, which made the previous "a dry run works offline"
# claim false: 40 lines of promising preview, then an abort and a non-zero exit,
# on exactly the machine the fix was for. A dry run has nothing to deduplicate
# against because it creates nothing.
if [ "$DRY_RUN" = "1" ]; then
  existing_tsv=""
elif ! existing_tsv="$(gh issue list --repo "$REPO" --state all --limit 1000 --json number,title,labels --jq '.[]|"\(.number)\t\(.title)\t\([.labels[].name]|join(","))"' 2>/dev/null)"; then
  echo "✗ Could not fetch existing issues (network/API). Aborting to avoid duplicates."; exit 1
fi
created=0; missing_detail=0; synced=0; failed=0
{
  read -r _header
  # paths/req/security are bound so the positional read consumes them: without
  # the trailing names, `sprint` would swallow the rest of the line. They are
  # not used here — /next, /sprint-review and the security gate read them from
  # the CSV directly.
  # shellcheck disable=SC2034
  while IFS=, read -r id title epic area agent priority size deps st sprint paths req security; do
    [ -z "${id:-}" ] && continue
    issue_title="$id $title"
    row="$(printf '%s\n' "$existing_tsv" | awk -F'\t' -v t="$issue_title" '$2==t{print; exit}')"
    num="$(printf '%s' "$row" | cut -f1)"
    if [ -n "$num" ]; then
      # EXISTS → back-fill its labels (idempotent), and REMOVE any stale sprint:* first so a re-plan
      # never leaves two sprint labels on the same issue.
      target="sprint:${sprint:-Backlog}"; cur_labels="$(printf '%s' "$row" | cut -f3)"; stale=""
      for L in $(printf '%s' "$cur_labels" | tr ',' ' '); do
        case "$L" in sprint:*) [ "$L" != "$target" ] && stale="${stale:+$stale,}$L";; esac
      done
      lbls=""
      for pair in "area:${area:-}" "agent:${agent:-}" "priority:${priority:-}" "size:${size:-}" "status:${st:-}" "$target"; do
        [ -n "${pair#*:}" ] && lbls="${lbls:+$lbls,}$pair"
      done
      if [ "$DRY_RUN" = "1" ]; then echo "  = exists #$num (would sync: $lbls${stale:+ · drop: $stale}): $issue_title"
      else
        [ -n "$stale" ] && gh issue edit "$num" --repo "$REPO" --remove-label "$stale" >/dev/null 2>&1
        if [ -n "$lbls" ] && gh issue edit "$num" --repo "$REPO" --add-label "$lbls" >/dev/null 2>&1; then echo "  ⟳ synced #$num: $issue_title"
        else echo "  = exists #$num: $issue_title"; fi
      fi
      synced=$((synced+1)); continue
    fi
    set --
    [ -n "${area:-}" ]     && set -- "$@" --label "area:$area"
    [ -n "${agent:-}" ]    && set -- "$@" --label "agent:$agent"
    [ -n "${priority:-}" ] && set -- "$@" --label "priority:$priority"
    [ -n "${size:-}" ]     && set -- "$@" --label "size:$size"
    [ -n "${st:-}" ]       && set -- "$@" --label "status:$st"
    set -- "$@" --label "sprint:${sprint:-Backlog}"
    deps_line="${deps:-none}"; deps_line="$(printf '%s' "$deps_line" | sed 's/;/, /g')"; [ -z "$deps_line" ] && deps_line="none"

    # The REAL acceptance criteria, written per issue by /decompose-feature.
    # Without this the decomposition work was done and then thrown away: every
    # issue got the same boilerplate, so the agent that picks it up reads a
    # tautology ("implements the behaviour described") instead of the criteria a
    # human agreed to.
    detail_file="$(dirname "$0")/details/$id.md"
    if [ -f "$detail_file" ]; then
      criteria="$(cat "$detail_file")"
    else
      criteria="⚠ No per-issue detail found at \`scripts/kanban/details/$id.md\`.
/decompose-feature writes the real Given/When/Then there. Until it does, this
issue carries no agreed criteria — treat that as the first thing to fix.

- [ ] Implements the behaviour described for $id."
      missing_detail=$((missing_detail + 1))
    fi
    [ -n "${req:-}" ] && satisfies="**Satisfies:** ${req}" || satisfies="**Satisfies:** _no requirement declared_"
    [ -n "${paths:-}" ] && touches="**Touches:** \`${paths}\`" || touches="**Touches:** _not declared — this issue cannot be co-dispatched_"

    body="**Epic:** ${epic:-n/a}  •  **Area:** ${area:-n/a}  •  **Lead agent:** ${agent:-n/a}  •  **Priority:** ${priority:-n/a}  •  **Size:** ${size:-n/a}  •  **Sprint:** ${sprint:-Backlog}

**Dependencies:** $deps_line
$satisfies
$touches

### Context
See \`docs/planning/kanban-backlog.md\` (item $id) and the linked spec sections. Read \`CLAUDE.md\` first.

### Acceptance criteria
$criteria

### Definition of Done
- [ ] \`scripts/verify.sh\` passes on the code as it stands, and the behaviour was **observed running**.
- [ ] **Security:** authorization enforced server-side and proven by an executed allow AND deny test.$([ "${security:-}" = "yes" ] && printf '\n- [ ] This issue touches a **sensitive path** — a committed `.vantry/reviews/<branch>.security.json` with `verdict: pass` is required before merge.')
- [ ] i18n / mobile-first / accessibility as applicable to this project.
- [ ] CI green.$([ -f "docs/engineering/definition-of-done.md" ] && printf ' Satisfies `docs/engineering/definition-of-done.md`.')

### Done
PR title is a Conventional Commit and closes this issue with \`Closes #<n>\`."

    if [ "$DRY_RUN" = "1" ]; then
      echo "  DRY issue: $issue_title  [${area:-} ${priority:-} ${size:-} ${st:-} sprint:${sprint:-} ms:${epic:-}]"
      # /decompose-feature tells the author to check the criteria in the preview.
      # It never printed them, so that instruction could not be followed.
      printf '%s\n' "$body" | sed -n '/^### Acceptance criteria/,/^### /p' | sed '$d' | sed 's/^/      /'
      created=$((created+1))
    else
      if gh issue create --repo "$REPO" --title "$issue_title" --body "$body" "$@" --milestone "${epic:-}" >/dev/null 2>&1 \
         || gh issue create --repo "$REPO" --title "$issue_title" --body "$body" "$@" >/dev/null 2>&1; then
        echo "  + $issue_title"; created=$((created+1))
      else
        echo "  ✗ FAILED: $issue_title"; failed=$((failed+1))
      fi
    fi
  done
} < "$CSV"
echo "→ Issues: created=$created synced(existing labels back-filled)=$synced failed=$failed"

# ---------------------------------------------------------------------------
#  BOARD: create/reuse a Project, add every issue, create the Sprint field,
#  and set each issue's sprint — so nothing lands in "No Sprint". Fully auto.
# ---------------------------------------------------------------------------
# This warning used to sit BELOW the early exit, so on the prescribed first-import
# path (no --project) it never printed: a board could ship with most issues
# carrying "Implements the behaviour described" and the import reported plain
# success. Say it on every path, before anything can exit.
[ "${missing_detail:-0}" -gt 0 ] && {
  echo "⚠ $missing_detail issue(s) had no scripts/kanban/details/<id>.md — they carry a placeholder"
  echo "  instead of agreed acceptance criteria. Run /decompose-feature to write them."
}

[ -z "$PROJECT_NUMBER" ] && { echo "✓ Done (no --project given; skipped board setup)."; exit 0; }

echo "→ Board setup (needs 'project' scope: gh auth refresh -s project)…"
if [ "$PROJECT_NUMBER" = "new" ]; then
  title="${PROJECT_TITLE:-$REPO board}"
  if [ "$DRY_RUN" = "1" ]; then echo "  DRY create project: \"$title\""; PROJECT_NUMBER="<new>"
  else
    PROJECT_NUMBER="$(gh project create --owner "$owner" --title "$title" --format json --jq .number 2>/dev/null || true)"
    [ -z "$PROJECT_NUMBER" ] && { echo "  ✗ could not create project (is the 'project' scope granted?)"; exit 1; }
    echo "  + created project #$PROJECT_NUMBER \"$title\""
  fi
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "  DRY add all issues to project #$PROJECT_NUMBER"
  echo "  DRY Sprint field options: $(sprint_values_sorted | tr '\n' ',' | sed 's/,$//')"
  echo "  DRY assign each issue to its sprint column"
  echo "✓ Done (dry run)."; exit 0
fi

PID="$(gh project view "$PROJECT_NUMBER" --owner "$owner" --format json --jq .id 2>/dev/null)"
[ -z "$PID" ] && { echo "  ✗ could not resolve project #$PROJECT_NUMBER"; exit 1; }

echo "  · adding issues to the board…"
gh issue list --repo "$REPO" --state all --limit 1000 --json url --jq '.[].url' 2>/dev/null | while read -r u; do
  [ -z "$u" ] && continue
  gh project item-add "$PROJECT_NUMBER" --owner "$owner" --url "$u" >/dev/null 2>&1 && echo "    + $u" || true
done

# Sprint single-select field (create once; idempotent by name).
opts_csv="$(sprint_values_sorted | tr '\n' ',' | sed 's/,$//')"
existing_fid="$(gh project field-list "$PROJECT_NUMBER" --owner "$owner" --format json --jq '.fields[]|select(.name=="Sprint")|.id' 2>/dev/null || true)"
if [ -z "$existing_fid" ] && [ -n "$opts_csv" ]; then
  gh project field-create "$PROJECT_NUMBER" --owner "$owner" --name "Sprint" --data-type SINGLE_SELECT \
    --single-select-options "$opts_csv" >/dev/null 2>&1 && echo "  + Sprint field: [$opts_csv]" || echo "  ~ Sprint field (exists or failed)"
elif [ -n "$existing_fid" ] && [ -n "$opts_csv" ]; then
  # The field was created once and its options were NEVER reconciled, so the first
  # import fixed the vocabulary forever: sprint 3 printed "! Sprint option 'S3'
  # missing" and exited 1, which made /refine-backlog's "nothing stays in No
  # Sprint" Done-when unreachable from the second sprint onward.
  #
  # TWO things were learned the hard way here, against the real API:
  #
  #  1. `gh api graphql -F opts=<json>` sends the array as a STRING and the
  #     mutation is rejected. The variables have to go in a JSON body via --input.
  #
  #  2. updateProjectV2Field REPLACES the option list. Omit the existing options'
  #     `id`s and GitHub mints new ones — which silently WIPES the Sprint value of
  #     every card on the board. Reproduced on a real board: 10 of 10 cards went to
  #     <none>. Preserving each id keeps every assignment.
  #
  # So: read the options with their ids and colours, append only what is missing,
  # and send the whole list back with the ids intact.
  if command -v python3 >/dev/null 2>&1; then
    _cur="$(gh api graphql -f query='
      query($org:String!, $num:Int!){
        user(login:$org){ projectV2(number:$num){ fields(first:50){ nodes{
          ... on ProjectV2SingleSelectField { id name options { id name color description } } } } } }
      }' -f org="$owner" -F num="$PROJECT_NUMBER" \
      --jq '.data.user.projectV2.fields.nodes[] | select(.name=="Sprint")' 2>/dev/null || true)"
    [ -z "$_cur" ] && _cur="$(gh api graphql -f query='
      query($org:String!, $num:Int!){
        organization(login:$org){ projectV2(number:$num){ fields(first:50){ nodes{
          ... on ProjectV2SingleSelectField { id name options { id name color description } } } } } }
      }' -f org="$owner" -F num="$PROJECT_NUMBER" \
      --jq '.data.organization.projectV2.fields.nodes[] | select(.name=="Sprint")' 2>/dev/null || true)"

    VANTRY_WANT="$opts_csv"; export VANTRY_WANT
    _added="$(printf '%s' "$_cur" | python3 -c '
import json, sys, os, subprocess, tempfile
cur = sys.stdin.read().strip()
want = [w for w in os.environ.get("VANTRY_WANT", "").split(",") if w]
if not cur or not want:
    print(""); raise SystemExit(0)
f = json.loads(cur)
have = {o["name"]: o for o in f.get("options", [])}
missing = [w for w in want if w not in have]
if not missing:
    print(""); raise SystemExit(0)
opts = [{"id": o["id"], "name": o["name"], "color": o.get("color") or "GRAY",
         "description": o.get("description") or ""} for o in f["options"]]
opts += [{"name": m, "color": "GRAY", "description": ""} for m in missing]
body = {"query": "mutation($id:ID!,$opts:[ProjectV2SingleSelectFieldOptionInput!]!)"
                 "{updateProjectV2Field(input:{fieldId:$id,singleSelectOptions:$opts})"
                 "{projectV2Field{... on ProjectV2SingleSelectField{options{name}}}}}",
        "variables": {"id": f["id"], "opts": opts}}
t = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
json.dump(body, t); t.close()
r = subprocess.run(["gh", "api", "graphql", "--input", t.name],
                   capture_output=True, text=True)
os.unlink(t.name)
print(",".join(missing) if r.returncode == 0 and "errors" not in r.stdout else "")
' 2>/dev/null || true)"
    export VANTRY_WANT=""
    if [ -n "$_added" ]; then
      echo "  ~ Sprint field: added option(s) [$_added] — existing card values preserved"
    fi
  fi
fi

# Assign each issue its sprint value on the board.
echo "  · assigning sprints…"
assigned=0; sprint_total=0
LOOKUP="$TMP/sprint-lookup.tsv"; : > "$LOOKUP"
# All 13 names, or `sprint` absorbs the rest of the line and every card gets a
# Sprint value of "S1,app/**,REQ-4,no" — which matches no field option, so the
# board silently ends up with nothing assigned.
# shellcheck disable=SC2034
{ read -r _h; while IFS=, read -r id title epic area agent priority size deps st sprint paths req security; do
    [ -z "${id:-}" ] && continue
    printf '%s\t%s\n' "$id $title" "${sprint:-Backlog}" >> "$LOOKUP"
  done; } < "$CSV"

gh project field-list "$PROJECT_NUMBER" --owner "$owner" --format json > "$TMP/fields.json" 2>/dev/null
gh project item-list "$PROJECT_NUMBER" --owner "$owner" --limit 1000 --format json > "$TMP/items.json" 2>/dev/null
FID="$(jq -r '.fields[]|select(.name=="Sprint")|.id' "$TMP/fields.json" 2>/dev/null)"
if [ -z "$FID" ] || [ "$FID" = "null" ]; then
  echo "  ~ no Sprint field resolved; skipped assignment."
else
  # The loop is fed by a pipe, so it runs in a SUBSHELL and any counter
  # incremented inside it is lost on the way out. That is why the closing line
  # could only ever be unconditional. Tally to a file instead.
  : > "$TMP/assigned"; : > "$TMP/seen"
  jq -r '.items[]|select(.content.title!=null)|"\(.content.title)\t\(.id)"' "$TMP/items.json" 2>/dev/null \
  | while IFS="$(printf '\t')" read -r ititle iid; do
      echo x >> "$TMP/seen"
      sp="$(awk -F'\t' -v t="$ititle" '$1==t{print $2; exit}' "$LOOKUP")"
      [ -z "$sp" ] && sp="Backlog"   # a board card not in the CSV → Backlog, never "No Sprint"
      oid="$(jq -r --arg n "$sp" '.fields[]|select(.name=="Sprint")|.options[]|select(.name==$n)|.id' "$TMP/fields.json" 2>/dev/null)"
      if [ -z "$oid" ] || [ "$oid" = "null" ]; then echo "    ! Sprint option '$sp' missing — add it so this card isn't 'No Sprint'"; continue; fi
      if gh project item-edit --id "$iid" --field-id "$FID" --single-select-option-id "$oid" --project-id "$PID" >/dev/null 2>&1; then
        echo "    ⇢ $ititle → $sp"; echo x >> "$TMP/assigned"
      else
        echo "    ✗ $ititle"
      fi
    done
  assigned="$(wc -l < "$TMP/assigned" | tr -d ' ')"
  sprint_total="$(wc -l < "$TMP/seen" | tr -d ' ')"
fi

# This used to be printed unconditionally, directly after the loop that may have
# assigned nothing at all — a success line that was true of the intention and
# not of the run.
if [ "${assigned:-0}" -gt 0 ] && [ "${assigned:-0}" -eq "${sprint_total:-0}" ]; then
  echo "✓ Done. Board #$PROJECT_NUMBER — all $assigned card(s) carry a Sprint value (unscheduled → Backlog), so there is no 'No Sprint' column. Group by Sprint to see S1…/Backlog."
else
  echo "✗ Board #$PROJECT_NUMBER — ${assigned:-0} of ${sprint_total:-0} card(s) got a Sprint value."
  echo "  The rest will sit in 'No Sprint'. Usually a scope problem:"
  echo "    gh auth refresh -s project    then re-run this script."
  exit 1
fi
