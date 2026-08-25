---
name: standup
description: A real project-manager status report across the board — what shipped, what's in progress, what's awaiting merge, what's blocked (and why), and what's next in the active sprint, with sprint + backlog progress. Use for a daily standup, a status check, or before/after a work session. Trigger words — standup, status, project status, where are we, progress, report.
---
# /standup — project status in 30 seconds

**Use when:** you want a PM-grade snapshot of where the project stands — daily, or before/after a session.

## Procedure
1. Read the ACTIVE sprint (`docs/planning/sprint-plan.md`) + the board (`gh`, else `scripts/kanban/issues.csv`).
2. Bucket the active sprint's issues by status: **shipped** (PR merged, issue closed) · **in progress** ·
   **awaiting merge** (PR open, work done — nobody should touch it) · **blocked-gate** (verification or a review
   verdict failed) · **blocked** (a dep or external thing) · **todo**.
3. For each in-flight branch, report the real gate state from **`scripts/verify.sh --status`** — passing receipt,
   stale receipt, or no receipt. That is the difference between "done" and "claimed done".
4. Compute sprint progress (`done/total`) and overall backlog progress (sprints done / total).
5. For each blocked or blocked-gate item, name the blocker (or the failing check) in one clause.

## Output — a tight report, not a wall of text
- **Sprint:** `Sn — goal` · `done/total`.
- **Shipped since last check:** <ids/titles> (or "—").
- **In progress:** `#id — agent · gate: pass|stale|none`.
- **Awaiting merge:** `#id — PR #N open` (or "—").
- **Blocked-gate:** `#id — failing check` (or "none"). · **Blocked:** `#id — blocker` (or "none").
- **Next:** the top 1–3 unblocked issues (defer to `/next` for the single next action).
- **Overall:** sprint `n/N` + a one-line health read (on track / at risk + why).

## Is an autopilot run active?
One line, first, because it changes how everything below should be read:

```bash
[ -f .vantry/autopilot.json ] && echo "AUTOPILOT ACTIVE since $(grep -o '"granted_at"[^,]*' .vantry/autopilot.json)"
```

If it is active, say so and say whether a run is actually in progress. An `.vantry/autopilot.json` with no run
behind it means a run died before handing back, and `merge.authority` is still `agent` — report that as a
finding, not as a footnote.

## Does the board still match the backlog?
One line, early, because every number below depends on it:

```bash
bash scripts/kanban/import-kanban.sh --check
```

A refinement that added stories without re-importing leaves rows in `issues.csv` with no issue behind them.
They are invisible here, to `/next`, and to `/sprint-review` — so a sprint can look 11 stories long while
20 were planned. If this reports missing rows, say so **before** the progress numbers, and treat those numbers
as covering only what the board knows.

## Epic progress
The `epic` column is the third field of every CSV row and the milestone on every issue, so the rollup costs
one line and nobody was printing it:

```bash
awk -F, 'NR>1 && NF>0 {tot[$3]++; if ($9=="done") d[$3]++} END {for (e in tot) printf "  %-34s %d/%d\n", e, d[e], tot[e]}' scripts/kanban/issues.csv
```

Report an epic that is 0/n and blocking others before one that is 6/7 — the second is finishing itself.

## Reading the gate for a branch that is not checked out
`scripts/verify.sh --status <branch>` reads that branch's receipt and computes freshness **against that
branch**, so you do not need a worktree and you must not create one to write a report. An earlier version of
this section claimed a branch without a live worktree could not be read and told you to say "unknown" — it
under-reported, which is the safe direction, but it was wrong about its own tool. If the branch does not exist
locally the command says `NO SUCH BRANCH` and you report that, not a guess.

## Reading the gate for a branch that is not checked out
`scripts/verify.sh --status` reports the branch you are ON. For work dispatched by `/next`, each issue has its
own worktree, so read it there without checking anything out:

```bash
for w in ../wt-*; do [ -d "$w" ] && ( cd "$w" && ./scripts/verify.sh --status ); done
```

A branch with no worktree has no read-only path — report it as **unobserved**, never as passing. The mapping,
so two standups agree:
- **verified** — receipt `pass` and `freshness : CURRENT`
- **stale** — receipt `pass` and `freshness : STALE` with changed files (work happened after the proof)
- **failed** — receipt `fail`
- **none** — no receipt for that branch

## Don't
Don't re-plan or start work here — this is **read-only** reporting. Never run `scripts/verify.sh` without
`--status`: a standup reports the gate, it does not move it. Use `/next` to act, `sprint-planner` to plan.

## Done when
Every in-flight branch has a reported gate state read from `scripts/verify.sh --status` (never guessed), the
awaiting-merge and blocked-gate buckets are explicit (or stated as empty), and the report ends with the
single next action. Nothing was changed — a standup that mutates state is a bug.
