<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Testing Strategy

> PURPOSE: What we test, with which tools, at which layer — and what must pass before merge.

## Test pyramid  *(stack-dependent — default: Vitest + Playwright + pgTAP)*

| Layer | Tool | Covers |
|---|---|---|
| Unit | {{UNIT_TOOL}} | <fill: pure logic, services, edge cases.> |
| Component | {{COMPONENT_TOOL}} | <fill: UI in isolation.> |
| Integration | <fill> | <fill: route handlers + DB.> |
| E2E | {{E2E_TOOL}} | <fill: critical user flows.> |
| Authorization / RLS | {{RLS_TOOL}} | <fill: allow AND deny per policy.> |

## What must be tested

- New logic → meaningful unit tests (behavior + edges, not getters).
- **Any access-control change → allow AND deny tests.**
- New user-facing flow → e2e where applicable.

## Conventions

<fill: naming, fixtures, factories, how to seed test data, no real network/secrets.>

## Running tests

- Locally: <fill: commands.>
- CI: <fill: which suites gate merge — see deployment-cicd.md.>

## Quality bar

- Deterministic (no flakes); real coverage of new paths; intentionally untested areas justified.
