---
name: autopilot
description: Total green light — work the backlog to completion without asking anything. Grants the agent authority to open AND merge PRs, takes the recommended option whenever a decision offers one, batches PRs to protect the Actions budget, and runs the sprint loop until the backlog is empty. Stops only on the short list of things a human genuinely has to decide, and logs every decision it made on your behalf. Trigger words — autopilot, feu vert, green light, finish everything, complete the project, run to completion, no questions, don't ask me, work through the backlog, tout terminer, va jusqu'au bout.
---
# /autopilot — the green light, and what it does not switch off

**Use when:** the backlog is defined and you want it *built* — not discussed. You are handing over the
decisions you would otherwise be asked for, in exchange for a written record of every one that was made.

**Owner:** `tech-lead-orchestrator`, dispatching to whichever role each issue names.

> **Invoking this command IS the authorization.** Nothing else is needed and nothing is asked twice. It is
> recorded, it is bounded, and it expires when the run ends.

## What this switches off, and what it does not

It switches off **the asking**. It does not switch off a single check.

| still enforced, without exception | why |
|---|---|
| `scripts/verify.sh` on every change | autonomy is about who decides, never about whether it works |
| the security review on any `sensitive_paths` change | an unattended agent is exactly when you want this one |
| the secret scan at commit | — |
| every `acceptance:` criterion | they are the promises that outlive the ticket |
| CI, including the sensitive-path job | the local receipt was never the only layer |

If you want a run that skips checks, this is not that command, and this kit does not have one.

## Procedure

### Step 0 — Record the grant, then take the wheel
1. Write **`.vantry/autopilot.json`** and commit it. It is tracked on purpose: an autonomous run that leaves no
   trace is not something anyone can audit afterwards.
   ```json
   {
     "granted_at": "<ISO-8601>",
     "granted_by": "<git config user.name>",
     "scope": "<the sprint(s) or 'the whole backlog'>",
     "merge_authority_before": "<whatever vantry.yml said>",
     "stop_file": ".vantry/autopilot.stop"
   }
   ```
2. Set `merge.authority: agent` in `vantry.yml`. **Record the previous value in the manifest** — you are
   restoring it at the end, and a run that dies mid-way must be recoverable to exactly what it found.
3. Create **`docs/planning/autopilot-log.md`** from `docs/_templates/autopilot-log.md`. Every decision you make
   on the human's behalf goes here, as it happens. Not at the end — as it happens, because a run that dies
   still has to be reviewable.
4. Say, in two lines, what you are about to do and how to stop it:
   *"Autopilot on for <scope>. To stop at the next safe boundary: `touch .vantry/autopilot.stop`."*

### Step 1 — Preflight. This is the only place you are allowed to stop before starting.
Check all of these, and **stop and report if any fails** — starting an unattended run on a broken foundation
wastes an afternoon and a quota:
- `bash scripts/validate-config.sh` exits 0, and **`run.smoke` is not empty** — an autonomous run against an
  undefined verification is theatre.
- `bash scripts/kanban/lint-kanban.sh` exits 0. A backlog with a cycle will deadlock you at issue three.
- `bash scripts/verify.sh` passes on the trunk **before you change anything**. If it is already red, you cannot
  tell your breakage from the one you inherited.
- Every issue in scope names an `agent` that exists and has `paths` declared. An issue with no `paths` runs
  alone; an issue with no acceptance criteria in `scripts/kanban/details/<id>.md` gets one written first.
- **The Actions budget.** Estimate: `PRs × ~5 minutes`, where `PRs ≈ ceil(issues ÷ dispatch.batch_prs)` plus one
  run per push. Compare with what is left:
  ```bash
  gh api /users/{owner}/settings/billing/actions --jq '"remaining: \(.included_minutes - .total_minutes_used) min"'
  ```
  If the estimate exceeds what remains, **say so and stop** — do not discover it at issue nine with half a
  sprint merged and no CI. Suggest raising `dispatch.batch_prs`, and let the human decide.

### Step 2 — The loop, until it is genuinely done
Run the ordinary engine, with nobody to ask:

```
/next → branch (batched per dispatch.batch_prs) → implement → tests → scripts/verify.sh
      → PR → security-review if sensitive → merge → next
sprint empty → /sprint-review → /refine-backlog → back to /next
```

At **every** iteration, in this order:
1. **Check the stop file.** If `.vantry/autopilot.stop` exists, finish the issue you are on, merge it or leave
   it on its branch cleanly, write the summary, and hand back. Never abandon a half-applied change.
2. Take the next work from `/next`. Respect `dispatch.batch_prs`, and respect every condition that makes a
   batch safe — a sensitive issue always gets its own PR.
3. Implement, verify, `--observe` with what you actually saw. The observation is the only thing the human will
   read to know what happened while they were away; "tests pass" wastes their time and yours.
4. Open the PR, wait for CI, merge when green. **A red check is not a thing to retry** — read it, fix the
   cause, and record what it was in the log.

### Step 3 — Deciding without asking
This is the part you were given authority over. The rule, in order:

1. **A recommended option exists → take it.** Do not weigh it again. That is what "recommended" meant when it
   was written, and second-guessing it is how an autonomous run turns into a slow interactive one.
2. **Options exist, none recommended → take the most reversible one**, and log it as `ASSUMED`. Reversible
   beats optimal when nobody is watching: a feature flag over a migration, additive over destructive, a new
   column over a changed one.
3. **The brief already answers it → follow the brief**, and log which line you followed. `docs/planning/project-brief.md`
   and `docs/specs/functional-spec.md` were written for exactly this moment.
4. **Nothing above applies → it is a stop condition** (below). Do not invent a preference and call it a decision.

**Every one of these goes in `docs/planning/autopilot-log.md` as it happens**, with what you chose, what you
rejected, and which rule above you used. That log is the price of the green light. A run that made forty
decisions and recorded none of them cannot be reviewed, only re-done.

### Step 4 — Stop conditions
Stop, write the summary, and hand back. These are deliberately few — a command that stops every twenty minutes
is not autonomous — and deliberately absolute.

- **A verification that will not go green after 3 honest attempts.** Not three retries: three different
  hypotheses, each tested. Then stop, with what you tried.
- **A security review returning `block`**, or any finding you would have to weaken a control to clear.
- **Anything irreversible**: dropping a column or table, deleting data, rotating a live credential, a migration
  with no down path, anything that touches real money or a production dataset.
- **A missing credential or secret.** Never invent, stub, or work around one; never commit a placeholder that
  looks like the real thing.
- **A requirement that contradicts another**, or an ambiguity where the two readings produce materially
  different products. Guessing here costs more than waiting.
- **Scope you were not given**: an issue that turns out to need a decision the brief does not contain — pricing,
  a legal or compliance question, a public name, anything a user will see and cannot easily un-see.
- **The Actions budget running out mid-run**, or CI unavailable.
- **`.vantry/autopilot.stop` appearing.**

### Step 5 — Hand back cleanly, always
Whether the backlog is empty or you stopped at issue two:
1. Restore `merge.authority` to the value in the manifest. **Autonomy must not outlive the run** — this is the
   single most important line in this playbook.
2. Delete `.vantry/autopilot.json` and any stop file, and commit that.
3. Write the summary: issues completed, PRs merged, **every decision from the log**, what stopped you and why,
   Actions minutes spent, and what is left on the board.
4. Leave no worktree, no open branch without a PR, and nothing half-applied.

## Guardrails
- **Autonomy is over the asking, never over the checking.** Any instinct to skip a gate to keep moving is the
  one thing this command must never do. If a gate blocks you, that is the gate working.
- **Never use `--override` to get unstuck.** An override is a human's reviewed decision about a specific
  impossibility; using one to clear your own path is forging a judgement you were not given.
- **Never merge a PR whose CI is red**, and never disable a check to make it green. If branch protection is not
  enabled, behave as though it is.
- **Never rewrite history on a shared branch**, never force-push to trunk, never close an issue you did not
  finish.
- **Never invent a requirement.** An issue with no acceptance criteria gets criteria written and logged — not
  imagined silently while you implement.
- **Never batch a sensitive change.** It gets its own PR, its own review verdict, its own scope.
- **Stop rather than guess** on anything in Step 4. The list is short so that the stops mean something.
- **Log as you go, not at the end.** A run that crashes at issue seven still owes the human six decisions.

## Done when
- The backlog in scope is empty, **or** a Step-4 condition stopped you and the summary names which one.
- `vantry.yml` `merge.authority` is back to the value recorded in `.vantry/autopilot.json`, and that file and
  any `.vantry/autopilot.stop` are deleted — `git status` is clean of both.
- Every merged issue is **closed by its PR**, and `bash scripts/kanban/lint-kanban.sh` exits 0.
- `docs/planning/autopilot-log.md` has **one entry per decision taken on the human's behalf**, each naming the
  rule from Step 3 it used. Zero entries is only honest if zero decisions were made.
- `scripts/verify.sh --status` on the trunk reports a passing, current receipt.
- The summary states the Actions minutes spent and what remains on the board.

## Stack notes — GitHub + `gh` (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.

- Budget: `gh api /users/<owner>/settings/billing/actions`. On an organization, `/orgs/<org>/...`.
- Merge: `gh pr merge <n> --squash --delete-branch`. Squash keeps trunk history one-commit-per-PR while the
  branch keeps one-commit-per-issue, which is the combination a `git bisect` wants.
- Waiting for CI: `gh pr checks <n> --watch` blocks until every check reports, and is cheaper than polling.
- On GitLab or Bitbucket the same loop holds; only the CLI changes.
