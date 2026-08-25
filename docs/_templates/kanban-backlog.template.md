<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Kanban Backlog

> PURPOSE: The complete, importable task list — decomposed into atomic, agent-ready issues grouped by EPIC.
> Pair with [project-management-tooling](./project-management-tooling.md) and [roadmap](./roadmap.md).

## Board columns
- **Backlog** — defined, not scheduled.
- **To Do** — ready to pick up (top = highest priority).
- **In Progress** — actively worked.
- **Done** — merged, CI green, criteria met.

## Legend
- **Area:** <fill: auth, ui, api, db, security, devops, payments, ai, qa, design, infra …>
- **Agent:** which sub-agent leads (security reviews all sensitive items regardless).
- **Pri:** P0 (MVP must) · P1 (MVP should) · P2 (later).
- **Size:** S (≤½ day) · M (1–2 days) · L (multi-day — consider splitting).
- **Dep:** blocking issue IDs.

> IDs are stable (`{{PREFIX}}-###`) and kept in the title after GitHub import.

## EPIC → issues structure

Group issues under EPICs that map to delivery phases. Each EPIC becomes a milestone; each row an issue.

### EPIC 0 — {{FOUNDATION_EPIC_NAME}} (Sprint 1–2)

| ID | Title | Area | Agent | Pri | Size | Dep |
|---|---|---|---|---|---|---|
| {{PREFIX}}-001 | <fill: e.g. initialize app scaffold> | devops | devops | P0 | M | — |
| {{PREFIX}}-002 | <fill> | | | | | |

### EPIC 1 — {{EPIC_1_NAME}}

| ID | Title | Area | Agent | Pri | Size | Dep |
|---|---|---|---|---|---|---|
| {{PREFIX}}-0NN | <fill> | | | | | |

<!-- repeat per EPIC, roughly in dependency/delivery order -->

## Import

<fill: a CSV / script for bulk import lives in `scripts/kanban/` (see that folder for the importer and
issue templates). Reference the exact script path here once created.>
