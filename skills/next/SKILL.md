---
name: next
description: Answer "what's next" deterministically AND drive it forward. Reconciles what is already in flight, then either hands you the single next unblocked issue, OR — when several issues are provably independent — AUTO-DISPATCHES them in parallel (each lead agent in its own git worktree, concurrency cap from vantry.yml dispatch.max_parallel), so agents never sit idle and you never ask "what should I do next?". Trigger words — next, what's next, next issue, continue the sprint, parallel, swarm, fan out, /next.
---
# /next — the next thing(s) to build

**Use when:** you just finished an issue and need the next work, or you want to move the sprint forward. This
skill KILLS the "what should I do next?" question — the answer comes from the sprint plan, not a guess — and it
**fans out**: when the sprint has independent work ready, it puts several agents on it at once instead of one.

## Procedure
0. **Reconcile before you dispatch.** For **every** issue marked in-progress, look at its PR (`gh pr list --head
   <branch>`; **no `gh`? use the local-git table in *When `gh` is unavailable* below — it answers three of the
   four questions, and the fourth fails closed**), then settle it — an unreconciled issue is re-dispatched work:
   - **PR merged** → close the issue, `git worktree remove ../wt-<id>`, `git branch -d <branch>`. It is done.
   - **PR open** → status **awaiting-merge**. The work exists; **do NOT re-dispatch it** and do not count it runnable.
   - **PR failed, closed or abandoned** (gate blocked, review verdict `block`, branch stale) → status
     **blocked-gate** with the reason in one clause, and leave the worktree in place for the fix.
   - **No branch, no PR** → the dispatch never happened; return the issue to the runnable set.
1. **Find the ACTIVE sprint.** In order of authority: `docs/planning/sprint-plan.md` (the sprint marked
   `ACTIVE`) → the lowest `sprint:N` in `scripts/kanban/issues.csv` with open issues. (Earlier wording named a
   board "Iteration"; nothing in this kit creates one — `import-kanban.sh` writes a **Sprint** single-select
   field. Do not look for an object the tools never made.)
2. **List its issues** with status, `deps`, lead `agent`, declared `paths`, and the `‖ parallel: #x #y` groups the
   `sprint-planner` marked (issues that share no dependency).
   **`Backlog` is not a source of work.** Only issues whose `Sprint` is the ACTIVE one are runnable. An issue
   in `Backlog` is unplanned by definition; handing one out silently is how a sprint acquires scope its goal
   never mentioned. If the ACTIVE sprint is empty and backlog remains, that is `/refine-backlog`'s job — say so
   rather than reaching past it.

3. **Compute the RUNNABLE-NOW set** — every issue that is (a) not done/closed, (b) has **all `deps` done**, and
   (c) is **not awaiting-merge and not blocked-gate**. Rank by priority (P0 > P1 > P2), then size.
4. **Dispatch — this is the default behavior:**
   - Read the cap from `vantry.yml` **`dispatch.max_parallel`** (default **2** — review load and file conflicts
     grow faster than throughput). If **`dispatch.confirm_before_fanout`** is true, **ask the human first** before
     putting N agents on the repo.
   - **Exactly one runnable** → return it: `#id title` + one line on *why it's next* + the 1–2 concrete steps;
     offer `/pickup-issue <id>`.
   - **Two or more independent** → **auto-parallelize.** Put each issue's **lead agent in its OWN git worktree**
     (`git worktree add ../wt-<id> -b <branch>`), up to the cap (highest-priority first; the rest queue). Each
     agent runs the full loop — branch → implement → tests → **`scripts/verify.sh`** → **PR** (`Closes #NN`). The
     PR body carries the **observation** from the receipt (expected vs observed), and the **security-review gate
     still applies to every PR**. Report the N dispatched: `#id · agent · worktree/branch`.
   - **Co-dispatch requires declared `paths` on BOTH issues.** Two issues are co-runnable only if each declares a
     `paths` value in `scripts/kanban/issues.csv` and those globs **do not intersect**. An issue with **no declared
     `paths` is NOT co-runnable** — run it alone. A rule that cannot be checked is not a rule.
   - **Empty `paths` is the conservative answer by construction, not a limitation to route around.** A row that
     predates the column, or one `/decompose-feature` left blank, reads as `paths=""` — which already means
     "run this alone", the safe outcome, with no special case anywhere in the loop. **Never** guess the globs
     yourself to unlock a fan-out: a wrong guess puts two writers in the same file, and the loop's worst failure
     is a silent collision, not an idle agent. The fix is to declare `paths` on the issue (`/decompose-feature`
     or `/refine-backlog`), then re-run `/next`.
   - **The shared test file is the collision nobody declares.** Three issues with provably disjoint `paths`
     (`src/slots/**`, `src/booking/**`, `src/rules/**`) were dispatched together and **all three PRs conflicted**
     — every one of them had appended to the same `tests/unit.mjs`, which none of them declared. `paths`
     intersection is only a real isolation proof when the tests are isolated too.
     - Co-dispatch requires each issue's `paths` to cover **where its tests live**, e.g.
       `src/booking/**;tests/booking.*` — an issue whose `paths` name only production code is **not** co-runnable.
     - If the project has one monolithic test file, that file is a shared surface and **nothing co-dispatches**
       until it is split per feature. Say so and run them one at a time; the fix is a per-feature test file, not
       a bigger cap.
     - The same applies to any other single file every issue touches: a route table, a DI container, a barrel
       `index` re-export, a lockfile, a migrations index.
   - **Hard rule (isolation):** never two file-writing agents in one worktree.

5. **Batch the PR, not the work.** Read `dispatch.batch_prs` (default **1** — one PR per issue). When it is
   greater than 1, the issues you just dispatched may land in **one** pull request instead of one each. This is
   about GitHub Actions minutes: CI runs per PR, the free tier is 2000 a month, and a verification is ~5 of
   them — one PR per issue burns a month on a medium sprint.

   An issue may join a batch only when **all** of these hold:
   - it is in the **same sprint** as the rest of the batch;
   - its `paths` **do not intersect** any other issue's in the batch (the same predicate as co-dispatch, and
     `paths` must cover where its tests live);
   - it has **no dependency** on another issue in the batch, in either direction — a batch is a set, not a chain;
   - it is **not** `security: yes` and its `paths` match **no** `sensitive_paths` glob. Sensitive work gets its
     own PR: the security verdict names one branch, and a batch makes the scope of that verdict ambiguous.
   - the batch is at most `dispatch.batch_prs` issues.

   Inside the batch, **one commit per issue**, each ending `Closes #<n>`, so `git log` stays atomic and a
   revert is still per-issue. The PR body lists every issue it closes and carries **one evidence block per
   issue**. Verification runs on the batch as a whole — so if one issue fails, the batch is held: keep them
   small, and never batch something you are unsure of.

   **When in doubt, do not batch.** A blocked batch costs more than the minutes it saved.
5. **If every sprint issue is done** → run `/sprint-review`. On pass, advance to the next sprint **immediately**
   and re-run this — no waiting for a date. Stop only if a gate fails, the whole backlog is done, or you genuinely
   need human input.
6. **If nothing is runnable** → name the blocking issue(s) and what must finish first, separating **blocked on a
   dep**, **awaiting-merge**, and **blocked-gate** (with the gate reason).


## When `gh` is unavailable
Never report a state you could not observe. Local git answers three of the four questions without a network:

| question | with `gh` | local git only |
|---|---|---|
| is it merged? | `gh pr view <n> --json state` | `git merge-base --is-ancestor <branch> "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"` — **no**, see below |
| is there a branch at all? | — | `git rev-parse --verify <branch>` |
| is a worktree live? | — | `git worktree list` |
| is a PR open? | `gh pr list --head <branch>` | **unobservable** |

> **The obvious command here is wrong, and wrong in the dangerous direction.**
> `git branch --merged "$(git rev-parse --abbrev-ref HEAD)"` asks *what is merged into where I am
> standing*, and a branch is always merged into itself. Run from the branch you just finished — its
> most likely position — it answers **merged**, the ritual says *"It is done"*, removes the worktree
> and drops the issue from the runnable set. Unmerged, unreviewed, unverified work disappears.
>
> Ask the trunk, by name, and never ask from the branch under test:
>
> ```bash
> BASE="$(sed -n 's/^  base:[[:space:]]*//p' vantry.yml | head -1 | sed 's/[[:space:]]*#.*$//')"
> BASE="${BASE:-main}"
> for r in "origin/$BASE" "$BASE"; do git rev-parse --verify --quiet "$r" >/dev/null && { REF="$r"; break; }; done
> [ -z "${REF:-}" ] && { echo "cannot resolve the trunk — refusing to answer"; exit 1; }
> git merge-base --is-ancestor "<branch>" "$REF" && echo merged || echo "not merged"
> ```
>
> If the trunk does not resolve, the honest answer is **cannot tell**, which classifies as
> awaiting-merge — never as done.


The fourth has no local answer, so it **fails closed**: a branch that exists, is not merged, and has no live
worktree is classified **awaiting-merge** and is NOT re-dispatched. That is the same construction as the
`paths=""` rule — when the honest answer is "cannot tell", take the conservative one and say which it was.

## Output — a decision, not a survey (~5 lines)
- **Sprint:** `Sn — goal` · progress `done/total`.
- **Reconciled:** `#id merged/closed` · `#id awaiting-merge` · `#id blocked-gate — reason` (or "—").
- **Now:** either **Next:** `#id title — why` (single), **or** **Parallel (N):** `#id → agent (wt/branch)` ×N.
- **Queued:** runnable issues beyond the cap (or "—"). · **Blocked:** `#id — blocker` (or "none").

## Don't
- Don't re-plan the sprint here (that's the `sprint-planner`).
- Don't pull from a future sprint while the active one still has runnable work.
- Don't dispatch before step 0 — re-running merged or in-flight work is the loop's classic failure.
- Don't exceed `dispatch.max_parallel`, co-dispatch issues without disjoint declared `paths`, or run two writers in one worktree.
- Don't write `paths` onto an issue here to make a fan-out possible — declaring the globs is the decomposer's job, not the dispatcher's.
- **Never close a sprint with a dispatch still in flight** — an open PR or a live worktree means the sprint is not done.
- Don't dump the whole backlog — surface exactly the runnable set (one, or the parallel N).

## Done when
Step 0 reconciled every in-flight issue (merged → closed and reaped; open → awaiting-merge; failed →
`blocked-gate`), and the output names either exactly one next issue, or the N dispatched with their agent,
branch and worktree — each below `dispatch.max_parallel` and with provably disjoint `paths`. If nothing is
runnable, the blocking issue is named. "Ask the user what to do" is not an outcome.
