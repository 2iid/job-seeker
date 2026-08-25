<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Modernization / Migration

> PURPOSE: When this project replaces or migrates from a legacy stack — what changes, why, and the plan.
> Omit this doc entirely if the project is greenfield with no predecessor.

## Starting point

<fill: the legacy/original stack or proposal being replaced, and where it's documented.>

## Why modernize

<fill: the hard requirements that reframe the decision (security, delivery speed, agent-buildability,
scale). Link the ADR that records the stack change.>

## Target stack  *(default: Next.js + Supabase + Stripe)*

<fill: the chosen stack and the one-line justification per component.>

## What carries over vs. what's rebuilt

| Concern | Legacy | Target | Strategy |
|---|---|---|---|
| <fill> | <fill> | <fill> | reuse / rewrite / adapter |

## Migration plan

<fill: phased steps, data migration, cutover, rollback. Strangler-fig / big-bang / parallel-run.>

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| <fill> | <fill> |

## Reference material to preserve

<fill: legacy docs/specs kept for provenance; note which docs supersede them where they conflict.>
