---
name: write-tests
description: Write meaningful tests that prove behavior and failure modes — unit for pure logic/schemas/rules, integration for endpoints (valid + invalid + unauthorized), e2e for critical flows — not coverage padding. Use when adding tests for a feature, hardening authz, or reproducing a bug. Trigger words — test, unit test, integration test, e2e, coverage, Vitest, Playwright, pgTAP, allow/deny.
---
# Write tests (meaningful, failure-mode-first)

**Use when:** adding/extending tests for any feature or access-control change. **Owners:** qa-test-engineer.
`vantry.yml` carries a free-text `stack:` naming the real stack; the **Stack notes** below are one
illustration of this contract, not the contract.

Tests are **necessary and not sufficient**. The suite proves the **logic**; `run.smoke` — declared in
`vantry.yml`, executed by `scripts/verify.sh` — proves the **software**. A feature is **not done on green
tests alone**; it is done when a passing verification receipt matches the code as it stands. Never report a
change as working because the suite is green.

## Inputs
The unit under test, its contract and edge cases, the auth boundary it enforces, and the acceptance criteria
from the issue. Prefer testing observable behavior over implementation details.

## Procedure
1. **Pick the level by what you're proving.** Pure logic/schemas/rule engines → **unit**. Endpoint/service
   behavior → **integration**. A user-critical journey → **end-to-end**. Don't drive the whole app for what a
   unit test proves cheaper.
2. **Prove failure modes, not just success.** For every happy path add the edge/invalid cases: empty,
   boundary, malformed, and error paths. A test suite with no failing-input case is incomplete.
3. **Integration = allow + deny.** For each endpoint assert (a) valid input succeeds, (b) invalid input is
   rejected with the error shape, and (c) an **unauthorized caller is denied**.
4. **Security/authz code covers 100% of allow/deny branches.** Datastore row authorization, role checks,
   ownership — test owner ✓, other ✗, staff ✓/✗, admin ✓, anon ✗. Missing a deny branch fails review.
5. **Deterministic + isolated.** No shared state, no real clock/network/random; seed and tear down per test
   so any test can run alone and in any order.
6. **When a test reveals a real bug, report it** (repro + expected vs actual) — do not weaken the assertion
   to make it pass. If a test is **flaky**, never skip it and move on — run the `flaky-test` playbook
   (`skills/flaky-test`) to quarantine it, find the real cause, and fix it.
7. **Run** the suite locally until green; confirm new tests fail when the behavior is broken (mutate to check).
8. **Then verify the change itself** — `scripts/verify.sh` runs the commands declared in `vantry.yml`,
   whatever the stack, per the `verify-change` skill. Where a test is the thing that proves an agreed
   requirement, promote it to `vantry.yml` `acceptance:` as `AC-n | REQ-n | <statement> | <command>` — the
   command must name **one** behaviour, never the whole suite. Green tests are the entry price, not the finish
   line.

## Guardrails
- No coverage-padding tests (asserting getters, re-asserting the framework). Each test must be able to fail meaningfully.
- Never delete/loosen a test to go green — fix the code or the test's setup, or file the bug.
- Don't hardcode secrets or hit external services in tests.
- Never call a change verified, working or done on the strength of the suite — that is `verify-change`'s job.
- `validate-config.sh` refuses an acceptance command that is `run.test`/`run.smoke` verbatim, and one that starts with the same two tokens while selecting nothing (no file, no `-t`/`-k`/`--grep`, no test id). A genuinely different command that still runs everything is not detectable — that one is on you.

## The two shapes that assert nothing
A walk wrote a 7-test suite that satisfied nearly every clause below — allow and deny named, five principals
covered, malformed input handled — then mutated the authorization function to `return true` (everyone reads every
order) and **all 7 still passed**. It then rode that suite through `scripts/verify.sh` into an `acceptance:` line
that recorded REQ-001 *"only the owner can read an order"* as proven, on a codebase where nobody was protected.

Neither shape was forbidden anywhere. Both are now:

**1. A test that asserts on a double you defined in the test file proves the double.** Import the real unit. A
stub is for the thing at the *edge* of the change (the payment provider, the clock, the mailer) — never for the
thing under test. If the test file contains the logic the assertion checks, delete the test and start again.

**2. A test whose subject can be empty passes on nothing.** Any assertion inside a loop over a collection must be
preceded by an assertion that the collection is **non-empty**:

```
expect(errors.length).toBeGreaterThan(0)      // ← without this line the loop below is decorative
for (const e of errors) expect(e.message).not.toContain('stack trace')
```

The same applies to a query that returns no rows, a selector that matches no elements, and a glob that matches no
files. `for x in []` is a green test that ran nothing.

## Prove the test fails — as a step, with an artefact
"Proven to fail on regression" was a clause with no producing step and no record, so it was asserted from the
armchair. Make it a step:

1. **Break the production code on purpose** — one named change: invert the authorization condition, drop the
   `WHERE owner_id = …`, return a constant, delete the guard.
2. **Run the test. It must go red.** If it stays green, the test is one of the two shapes above.
3. **Restore the code**, re-run, green.
4. **Write the mutation into `--observe`**, by name: `mutation: authz.canRead → return true ⇒ deny test failed as
   expected`. That sentence is the only durable evidence the test has teeth, and the receipt carries it.

## Done when
- Each new test **imports the real unit** — no assertion whose subject is a double defined in the test file.
- Every assertion inside a loop is preceded by a **non-empty assertion** on what it loops over.
- Access-control changes ship an **allow AND a deny** test per principal, and each **names the branch it covers**
  — list them; "authz branches 100%" is a number nothing computes, and a Done-when nothing can compute is
  satisfied by whoever asserts it.
- **One named mutation** was introduced per new test, the test went red, the code was restored, and the mutation
  is quoted in the `--observe` text.
- `scripts/verify.sh` wrote a passing receipt; any criterion promoted to `acceptance:` runs **one** named
  behaviour, not the suite under a new name (`validate-config.sh` now refuses a reworded copy of `run.test`).
Failure modes covered; every endpoint has allow+deny; authz branches 100%; tests deterministic and isolated;
no ignored flakes; suite green and proven to fail on regression — **and** the change passes
`scripts/verify.sh` with a fresh passing receipt.

## Stack notes — Next.js App Router + Supabase (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.
- Levels: **Vitest** for unit and integration, **Playwright** for end-to-end, **pgTAP** for the RLS
  allow/deny matrix of step 4 — run as the owner role, another user's role, and anon.
- `run.test` is typically `pnpm vitest run`; an `acceptance:` command is a single named case
  (`pnpm vitest run -t "refund above the captured amount is rejected"`), never the bare runner.
