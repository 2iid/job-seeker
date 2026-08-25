---
name: perf-profile
description: Fix performance with numbers — measure the baseline and write it down, profile to find the real hotspot, change one thing, measure again and quote both numbers, then set a budget whose regression fails a check. Use when something is slow or a perf audit found a problem. Trigger words — performance, slow, latency, profile, optimize, hotspot, N+1, benchmark, p95, bundle size, memory, perf budget.
---
# Perf profile (measure, profile, change one thing, measure again)

**Use when:** something is measurably slow, or an `/adopt` audit flagged performance with nothing behind it.
**Owners:** the engineer who owns the hot path (backend/frontend); qa-test-engineer owns the budget check.

## Inputs
The specific user-facing symptom ("the dashboard takes 6s to first paint", not "the app feels slow"), a
realistic workload and dataset, and the environment the number will be measured in — the same one every time.

## Procedure
1. **Measure before you change anything and write the number down** — the metric, the value, the percentile,
   the workload, the environment, the date. No baseline, no optimisation. State the target alongside it.
2. **Profile to find the real hotspot** — a CPU/flame profile, a query log, a trace, a bundle analysis.
   **Guessing is not profiling.** The bottleneck is almost never where it feels like it is; expect N+1
   queries, a missing index, an unbatched loop, or a payload nobody looked at.
3. **Fix one thing.** One hypothesis, one change. Two changes at once and you cannot attribute the win — or
   the regression.
4. **Measure again on the same workload and environment, and quote both numbers** — "p95 820 ms → 140 ms on
   the 10k-row fixture". A claim of "much faster" without both numbers is not a result.
5. **Verify correctness** with `scripts/verify.sh` — the faster path must do exactly the same thing. Record
   `scripts/verify.sh --observe` with the before/after numbers as the observation, with the profile output
   as an artifact.
6. **Set a budget and make its regression a failing check** — a threshold in CI on the metric you just moved
   (latency, query count, bundle bytes). An unenforced budget is a wish.
7. **If the fix did not move the number, revert it.** Complexity that bought nothing is a net loss; go back
   to step 2 with a better hypothesis.

## Guardrails
- ❌ **No optimisation without a before-and-after measurement.** Unmeasured "performance work" is refactoring
  with worse odds — use `refactor-safely` and be honest about it.
- ❌ **A micro-benchmark is not a user-facing improvement.** A function 40× faster inside a request dominated
  by one slow query changed nothing a user will feel.
- ❌ Never trade correctness for speed — **correctness first**; a cache, a batch, or a relaxed consistency
  rule is a behaviour change and owes the full verification.
- ❌ Never measure on a laptop under different load than you claim, and never compare numbers from two
  different environments.

## Postgres — the vendored reference
Once you have a **measured** baseline and the hotspot is a query, read
**`vendor/skills/supabase-postgres/SKILL.md`** (Supabase, MIT, vendored — not auto-invoked) for index
selection, EXPLAIN reading, pooling and locking. It is current and correct on those.

Read **`CONFLICTS.md`** beside it first: four of its rules are weaker than this project's, and two of them
(single-shot constraints, bare `CREATE INDEX`) are things `safe-migration` blocks outright.

Order still holds: a budget, then a measurement, then a change. This reference is for the change, never for
deciding whether to make one.

## Done when
- A **budget** existed before the change (a number with a unit and a percentile), and the profile named the
  actual hot path — not a guess.
- Before and after are **measured the same way**, and both numbers are in `--observe` with the artefact
  (the profile, the trace, the query plan) attached — `--observe` now refuses a path that does not exist, so the
  attachment is real evidence.
- **The budget is enforced from now on.** Promote it to `vantry.yml` `acceptance:` so it runs on every
  verification and lands in the receipt:
  ```yaml
  acceptance:
    - "AC-n | REQ-nnn | the orders list answers within 300ms at p95 | <the command that measures and asserts it>"
  ```
  A threshold that lives only in a pull-request description regresses the week after it is merged.
- `scripts/verify.sh` wrote a passing receipt.
The baseline number is recorded, the hotspot was identified by a profile rather than a guess, one change was
made, both numbers are quoted from the same workload and environment, `scripts/verify.sh` shows the behaviour
unchanged, and a budget check fails the build if the metric regresses.
