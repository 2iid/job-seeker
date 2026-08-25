<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Project Management Tooling

> PURPOSE: Where issues live, how they're tracked, and the template that makes them autonomous-agent-ready.

## Recommendation  *(default: GitHub Issues + Projects)*

- **Tracker:** {{TRACKER}} — <fill: why this fits an autonomous, one-issue-at-a-time workflow.>
- **Board:** columns Backlog → To Do → In Progress → Done (top of To Do = highest priority).

## Issue template (autonomous pickup)

Every issue should contain enough for an agent to work it cold:
- **Title:** `{{PREFIX}}-NNN — <short imperative>` (stable ID kept in title for traceability).
- **Context / linked docs:** <fill: which spec sections it implements.>
- **Acceptance criteria:** <fill: testable checkboxes.>
- **Area / Agent / Priority / Size / Dependencies:** <fill.>
- **Definition of Done:** link to [definition-of-done](../engineering/definition-of-done.md).

## Labels & fields

<fill: area labels, priority (P0/P1/P2), size (S/M/L), agent owner.>

## Automation

<fill: how agents pull the top of To Do, open a PR that `Closes #NN`, pass CI + review, merge, repeat.
Any board automation / GitHub Actions that move cards.>

## ID scheme

<fill: `{{PREFIX}}-NNN` internal IDs vs GitHub issue numbers; note they differ after import.>
