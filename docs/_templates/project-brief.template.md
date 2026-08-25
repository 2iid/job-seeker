<!-- TEMPLATE: written by `refine-idea` to docs/planning/project-brief.md, then executed by /bootstrap
     (or fed to /adopt as its intent). Replace {{...}} and <fill:...>. Delete this comment. -->

# Project brief — {{PROJECT_NAME}}

> PURPOSE: The plan of record. `/bootstrap` reads this file and asks only about what it leaves open — so
> every answer here is a question you do not answer twice. Confirmed by the user before anything is
> generated. `/analyze-requirements` extends it with obligations and unit economics.

- **Date:** {{YYYY-MM-DD}} · **Confirmed by:** {{USER}}

## The problem

<fill: the problem in 2–3 sentences — what is broken today, for whom, and what it costs them. Not the
solution. If you cannot name what someone does *instead* today, the problem is not sharp enough yet.>

## The user

<fill: one primary user, named concretely. Their **#1 job** — the single thing they are hiring this product
to do. Secondary users only if they change the design.>

## The core loop

<fill: the repeating action that IS the product, as a sequence: trigger → what the user does → what they get
back → what brings them back. If the loop needs more than five steps, the scope is wrong.>

## MVP scope

The smallest thing that makes the core loop real.

1. <fill.>
2. <fill.>
3. <fill.>
<!-- if the list passes ~7 items, cut it — the extras are v2 -->

## Non-goals

Explicitly NOT in this build — recorded so nobody re-litigates them mid-sprint.

- <fill.>
- <fill.>

## Constraints

- **Stack:** <fill: fixed choices and why · or "open — decide in an ADR">
- **Budget / timeline:** <fill.>
- **Region / language / compliance:** <fill: locales, data residency, GDPR/PCI/HIPAA if in scope.>
- **Team:** <fill: who builds and maintains it.>

## Obligations

<!-- Written by `/analyze-requirements`. One row per trigger. Delete the section only if nothing applies. -->

What this product is **forced** to do — because of what it actually does, not because of a regulation
someone mentioned. Column four is the point: it turns an obligation into a board row, not a paragraph.

> **Every row is an assumption to confirm with a professional. This is not legal advice, and the model's
> knowledge has a cutoff date.**
> The **non-technical** obligations — a data-processing agreement per sub-processor, a privacy policy,
> cookie consent, a processing register — are **NOT in this table and are NOT the agent's work**. A table
> claiming "GDPR — covered by row security + a delete endpoint" is worse than no table.

| # | Trigger (what in THIS product creates it) | Technical control | Where it lands |
|---|---|---|---|
| OBL-1 | <fill: e.g. we store EU customers' names + emails> | <fill: e.g. export + hard-delete endpoint, per-row tenancy> | <fill: the issue / area / REQ-### it becomes> |
| OBL-2 | <fill> | <fill> | <fill> |

<!-- Mark every inferred row "(assumed — confirm)". No row for a rule you cannot tie to a real behaviour. -->

## Unit economics

Arithmetic on numbers **you** supplied — never a price looked up on the web, so this stays auditable and
does not rot.

| Line | Per user / month |
|---|---|
| Price | $<fill> |
| LLM tokens — core loop, <fill: N> runs at <fill: tier> | −$<fill> |
| Payment fees (<fill: %> + $<fill> per transaction) | −$<fill> |
| Per-seat SaaS (<fill: which>) | −$<fill> |
| Infra, amortized per user | −$<fill> |

**Gross margin per user: $<fill>**

<fill: if negative — one sentence on why, then two levers (raise the price, drop a tier, cache/batch the
loop, cap usage). If positive, nothing more to say.>

## Success metric

<fill: ONE number, with a horizon and a starting point — "by week 8, {{N}} {{users}} complete the core loop
twice in a week (today: 0)". Vanity metrics do not count as a success metric.>

## Riskiest assumptions

Ordered — the first one is what kills the project if it is false.

1. <fill: assumption> → **test:** <fill: the cheapest thing that would disprove it.>
2. <fill> → **test:** <fill.>

## Open questions

Decisions deferred, each with a **recommended default** so work is never blocked on an answer.

| Question | Recommended default | Decide by |
|---|---|---|
| <fill> | <fill> | <fill> |
