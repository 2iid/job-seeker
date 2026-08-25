<!-- TEMPLATE: write to docs/planning/PROJECT-STATE.md — that exact path and filename.
     .claude/hooks/session-start.sh reads its first 25 lines on every session start and after every
     compaction, so KEEP THE TOP OF THIS FILE CURRENT and keep it short. Delete this comment. -->

# Project state — {{PROJECT_NAME}}

> PURPOSE: What a cold session needs to rehydrate in ten seconds. Not a status report and not a changelog —
> the *current* state only. Update it when something in it changes; delete lines that stop being true.
> Last updated: {{YYYY-MM-DD}}

## Next
<!-- FIRST, deliberately. .claude/hooks/session-start.sh shows the first 25 lines of this
     file to a resumed session; the single next action used to sit at line 32, so the
     one thing /handoff exists to deliver was the one thing never delivered. -->
<fill: the single next action, or "run /next".>
## In flight
| Issue | What | Agent | Branch / worktree |
|---|---|---|---|
| `#<id>` | <fill> | <fill> | <fill> |
<!-- one row per open branch, including parallel-dispatch worktrees. Empty table = nothing in flight. -->

## Active sprint
**S{{N}} — {{GOAL}}** · progress {{DONE}}/{{TOTAL}}
<!-- must match the sprint marked ACTIVE in docs/planning/sprint-plan.md -->

## Blocked
- `#<id>` — <fill: what is blocking it and who/what unblocks it.>
<!-- "none" if nothing is blocked. A blocker with no owner is not recorded, it is ignored. -->

## Last verified
- **Branch:** <fill> · **Receipt:** `.vantry/receipts/<branch-slug>.verify.json` · **Verdict:** pass | stale | none
- **Observed:** <fill: the one-line observation from the last passing run — what was actually seen.>
- **Overrides in play:** <fill: `.vantry/overrides/<branch-slug>.json` and why · or "none">
<!-- run `scripts/verify.sh --status` if this section is unclear; the receipt wins over this file. -->

## Open decisions
- <fill: the question> — **recommended default:** <fill> · **decide by:** <fill>
<!-- promote anything settled here into an ADR (docs/architecture/decisions/) and remove the line. -->

