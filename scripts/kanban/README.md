# Kanban importer (generic)

Turns `issues.csv` into a **fully set-up** GitHub board — labels, milestones, one issue per row, **and**
(with `--project`) the board itself: a single-select **Sprint** field and every issue dropped into its
sprint column. Works for **any** repo — it auto-detects the target and derives everything from your CSV.
**No manual board setup, no "No Sprint" column.**

## Files
- **`issues.csv`** — your backlog. `/bootstrap` (or `/kickoff`) generates the real one; the committed file is a small example.
- **`details/<id>.md`** — the **real** acceptance criteria for one issue, written by `/decompose-feature` and
  inlined into that issue's body at import. Optional per row, but an id without one ships generic boilerplate.
- **`import-kanban.sh`** — the importer (bash 3.2 / macOS compatible).

## CSV schema — 13 columns
Header required: `id,title,epic,area,agent,priority,size,deps,status,sprint,paths,req,security`
The importer derives its column count **from this header line**, so the schema can grow at the end of the row
without a code change. A row whose field count differs from the header aborts the import.
- `epic` → becomes a **milestone** (readable title, e.g. `EPIC 0 — Foundation`).
- `area,agent,priority,size,status,sprint` → become **labels** (`area:*`, `agent:*`, …, `sprint:*`).
- `sprint` → the **Sprint field value** and the sprint column on the board (`S1`, `S2`, … `Backlog`).
  The `sprint-planner` fills this column; it is the single source of truth for scheduling.
- `deps` → semicolon-separated ids (e.g. `PRJ-001;PRJ-003`).
- `status` → `todo` for ready, `backlog` otherwise.
- `paths` → semicolon-separated globs this issue will touch (`src/billing/**;tests/billing/**`).
  **`/next` co-dispatches two issues in parallel worktrees only when their globs are disjoint.** Empty means
  "not co-runnable" — the conservative default, which is also what an old 10-column row reads as.
- `req` → the `REQ-###` ids from `docs/specs/functional-spec.md` this issue satisfies, semicolon-separated
  (`REQ-004;REQ-011`). Empty is fine for infrastructure. `/sprint-review` reads this column to report
  **MUST coverage** — "MVP: 4 of 11 MUST delivered; REQ-007 and REQ-009 have no issue."
- `security` → `yes` when the issue touches `vantry.yml` **`sensitive_paths`** (auth, payments, PII, AI, RLS);
  it obliges a committed `security-review` verdict before the PR merges. Otherwise empty.
- **Keep titles comma-free** (the parser splits on commas).

## Acceptance criteria — `details/<id>.md`
One file per issue, named for its CSV `id` (`details/PRJ-014.md`). Written by `/decompose-feature`, inlined
verbatim into the GitHub issue body under **### Acceptance criteria**. Shape:

```markdown
**Satisfies:** REQ-004 — a refund can never exceed the original charge

- [ ] **Given** a $40 charge **When** a $60 refund is requested **Then** the API returns 422 and no ledger row is written
- [ ] **Deny:** a user refunding another tenant's charge gets 403
```

An id with no detail file gets a loud `⚠` and the generic body — never an aborted import.

## What it does
1. Checks `gh` is installed + authenticated; auto-detects the repo (`REPO=owner/name` to override).
2. Creates labels (colors by prefix, incl. `sprint:*`) and one milestone per `epic` — idempotent.
3. Creates one issue per row (title `ID Title`, all labels + milestone, and the body — `details/<id>.md`
   inlined when it exists, the generic acceptance/DoD template when it does not).
   Back-fills labels (incl. `sprint:*`) onto issues that already exist; creates only the missing ones. **Aborts if it can't read existing issues** (never creates duplicates).
4. **With `--project`** — sets the board up end to end:
   - creates a new board (`--project new`) or reuses an existing one (`--project N`);
   - adds every issue to it;
   - creates the single-select **Sprint** field with options derived from the CSV (`S0,S1,…,Backlog`, ordered);
   - **assigns each issue its sprint** → group the board by the Sprint field and the columns are already filled.

## Run
```bash
gh auth login                          # once
gh auth refresh -s project             # once, to allow board setup
DRY_RUN=1 ./import-kanban.sh --project new   # preview everything, create nothing

./import-kanban.sh                     # labels + milestones + issues only (no board)
./import-kanban.sh --project new       # ↑ PLUS create the board + Sprint field + place every issue
./import-kanban.sh --project 7         # ↑ but set up your EXISTING board #7
PROJECT_TITLE="PharMaps" ./import-kanban.sh --project new   # name the created board
```
That's the whole ceremony: **fill `issues.csv` (the planner sets `sprint`), run one command, start building.**
On the board, set **Column by → Sprint** (the field, not a label) to see `S1 · S2 · … · Backlog`.

## The autonomous loop it enables
```
/next (top of the ACTIVE sprint, fanning out on disjoint `paths`) → branch → implement → tests → verify →
promote the criterion into vantry.yml `acceptance:` → PR (Closes #NN) →
CI (lint, types, tests, secret-scan) + security review → merge → /sprint-review gates & advances → /next
```
The `req` column is what closes that loop: it links the row to a requirement, the promoted `acceptance:` line
makes `scripts/verify.sh` re-prove that requirement on **every** run afterwards, and `/sprint-review` reports
which MUST requirements still have nothing on the board.
