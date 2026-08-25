---
name: sprint-review
description: Close a sprint the disciplined way — check every issue against a MECHANICAL Definition of Done (passing receipt, merged PR, committed review verdicts), summarize what shipped and is demoable, roll carry-overs to the next sprint, capture a short retro, log the report, and mark the next sprint ACTIVE. Trigger words — sprint review, close sprint, end sprint, sprint done, retro, /sprint-review.
---
# /sprint-review — close a sprint, open the next

**Use when:** the ACTIVE sprint's issues are all done.

## Procedure
1. **Read the ACTIVE sprint** from `docs/planning/sprint-plan.md` + its issues and statuses (board via `gh`,
   else `scripts/kanban/issues.csv`).
2. **Check the Definition of Done — mechanically, per issue.** Not a narrative; three checks that either pass or
   do not:
   - **Receipt — and ask the right question for the issue's state.** On an **unmerged** branch:
     `scripts/verify.sh --status <branch>` reports that branch's receipt; `UNVERIFIED` or `UNOBSERVED` is a fail,
     and so is a stale one. On an issue whose PR has **already merged**, the branch's changeset is empty and the
     gate returns 0 for anything — see **Checking a MERGED issue** below and use the three durable artefacts
     instead. Asking `--gate` about merged work is the vacuous-tick failure this whole kit exists to stop.
   - **Merged:** the PR is **merged** into `merge.base` and the issue is closed. An open PR is not done.
   - **Reviewed:** if the change touched anything in `vantry.yml` **`sensitive_paths`**, a committed
     `.vantry/reviews/<branch-slug>.security.json` with **`verdict: "pass"`** exists. Same for
     `<slug>.code.json` / `<slug>.design.json` wherever `gates.code_review` / `gates.design_review` is `block`.

   Any issue failing any of the three is a **CARRY-OVER** — never a "done with a note". There is no partial done.
3. **Report:** did the sprint hit its **goal**? What is **demoable** now (one or two sentences a stakeholder
   would understand — quote the receipt's **observation** where it makes the demo concrete)? List **carry-overs**
   with which of the three checks failed.
3b. **Check the board is not missing work.** `bash scripts/kanban/import-kanban.sh --check`. If rows in
   `issues.csv` have no issue on the board, this sprint's scope is larger than what you just reviewed — close
   nothing until they are imported, or the review is a verdict on a subset nobody chose.

4. **MUST coverage — one line, computed not felt.** Take every `REQ-###` marked **MUST** in
   `docs/specs/functional-spec.md`; for each, look for a row in `scripts/kanban/issues.csv` naming it in the
   **`req`** column, and whether that row passed step 2. Print it exactly like this:
   **`MVP: 4 of 11 MUST delivered; REQ-007 and REQ-009 have no issue.`** A MUST with no row is not a slow
   requirement — it is an **unplanned** one, and it is why the board can look finished while the MVP is not.
   Name those ids and hand them to `/refine-backlog` in step 7. If the spec has no `REQ-###` ids yet, say
   `MUST coverage: unavailable — docs/specs/functional-spec.md carries no REQ ids` and do not estimate.
5. **If the sprint is BLOCKED** — issues stuck at **blocked-gate** (verification failing, a review verdict
   `block`) — say so plainly, **name the blocker and the failing check**, and route to `/refine-backlog` to
   re-shape the work. Do **not** declare a hollow win, and do not roll a blocked issue forward untouched.
6. **Retro:** 1–3 concrete, actionable adjustments (scope too big, a dep that bit, sizing off).
7. **Roll forward — always refill the engine.** Move carry-overs back into the backlog, along with every
   uncovered MUST from step 4. Then, **while any unplanned backlog remains, run `refine-backlog`** (not
   optional): it re-grooms the leftover items and slices the next sprint from them, setting each issue's
   **`Sprint`** field on the board (nothing stays in "No Sprint").
   Mark the **next sprint `ACTIVE`** in `sprint-plan.md` and move each issue's **Sprint** field on the board —
   that single-select is what `import-kanban.sh` creates, and it is the only sprint object that exists here.
8. **Persist the outcome.** Append the report — date, sprint, goal hit/partial/blocked, shipped, MUST coverage,
   carry-overs with their failing check, retro — to **`docs/planning/sprint-log.md`** (create it if absent). A
   ritual whose output exists only in a chat window cannot be reviewed later.
9. **Continue immediately — a review is a GATE, not a stop.** On pass, the next sprint (freshly refilled by
   `refine-backlog` when backlog remained) is ACTIVE and work continues via `/next`. There is **no waiting for a
   timebox**. The loop ends **only** when the backlog is genuinely empty; otherwise keep building. Pause only if a
   gate fails or you need human input.

## Guardrails
- **No partial done.** An issue that fails any of the three checks is a carry-over. "Done with a note" is how a
  board reports a finished sprint that shipped nothing.
- **Never re-run the gate to get a better answer.** The receipt is what it is; if it is stale, the issue carries
  over.
- **Never close a sprint by moving the goalposts.** The goal was written before the sprint; judge against that
  one, and if it was wrong say so in the retro rather than editing it.
- **Never roll a blocked issue forward untouched.** Name the blocker and the failing check, or it will block the
  next sprint too, silently.
- **Do not skip `refine-backlog` while backlog remains.** A sprint that closes without refilling the next one is
  where the loop stops — and the loop stopping is the failure this whole engine exists to prevent.

## Output
A crisp sprint report — **goal → hit / partial / blocked**, **shipped / demoable**, **MVP: N of M MUST
delivered (+ the uncovered REQ ids)**, **carry-overs (with the failed check)**, **retro (≤3)**, and the **next
sprint's goal + first issue**, ready to start with `/next` — appended verbatim to `docs/planning/sprint-log.md`.


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

## Checking a MERGED issue
Do not ask `scripts/verify.sh --gate` about a branch that has already merged — once the work is in the base,
the changeset is empty and the gate returns 0 for **anything**, including work that was never verified. It
would be a green tick that means "there is nothing here", not "this was proven".

Ask the artefacts that outlive the branch instead, all three of which are checkable after the fact:
1. the PR carries a filled `## Verification evidence` block — CI already refuses an empty one, so a merged PR
   that has one passed a real check at the time;
2. any sensitive-path change carries a committed `.vantry/reviews/<slug>.security.json` with `verdict: pass`
   **and a `head` that is an ancestor of the merge commit** — a verdict made before later commits is stale;
3. the issue is closed by that PR, not by hand.

An issue that cannot produce all three is a carry-over, whatever the board says.

## Done when
Every issue in the sprint is **mechanically** classified, by the check that matches its state: an **unmerged**
issue needs `scripts/verify.sh --status <branch>` to report a passing, non-stale receipt; a **merged** issue
needs the three durable artefacts of *Checking a MERGED issue* (filled evidence block, review verdict whose
`head` is an ancestor of the merge, closed by that PR). In both cases any sensitive-path change carries a
committed `.vantry/reviews/<slug>.security.json` with `verdict: "pass"`. Anything short is a carry-over,
never a "done with a note". The report
carries the MUST-coverage line with every uncovered `REQ-###` named, is appended to
`docs/planning/sprint-log.md`, the next sprint is `ACTIVE`, and no worktree or open PR is left behind.
