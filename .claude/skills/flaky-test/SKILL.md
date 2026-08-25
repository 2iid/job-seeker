---
name: flaky-test
description: Kill a non-deterministic test properly — confirm the flake with a measured failure rate, quarantine only with an owner and a deadline, classify the cause (time, ordering, shared state, network, async race, randomness), fix that cause, and prove it with N consecutive green runs. Use when a test passes and fails on the same code. Trigger words — flaky, flake, intermittent, sometimes fails, non-deterministic, retry, CI red again, quarantine, unstable test.
---
# Flaky test (measure it, classify it, kill the cause)

**Use when:** a test passes and fails on the same commit. **Owners:** qa-test-engineer. `write-tests` demands
deterministic tests; this is what to do when one is not.

## Procedure
1. **Confirm the flake and record the rate.** Re-run it in a loop (start at **N=20**) and write down the ratio,
   e.g. `3/20`. Run it both alone and inside the **full suite** — order-dependence only shows in the suite.
   Do not act on a single failure: one failure is a bug report, not a flake.
2. **Quarantine only with an owner and a deadline.** Mark it in the code —
   `FLAKY #142 — owner @name — remove by 2026-08-09` — file the issue, and keep it running in a non-blocking
   job if the runner allows. A silent `.skip` is a deletion that nobody voted for.
3. **Classify the cause, then apply its fix:**
   - **time** — freeze the clock (fake timers); never assert on wall-clock or "it takes under 200 ms".
   - **ordering** — the test must pass alone *and* under a shuffled suite; seed the runner's random order.
   - **shared state** — per-test fixture, schema, or tmpdir; tear down what you create.
   - **network** — stub at the boundary; no live third party in CI, ever.
   - **async race** — poll for the condition you actually need; never `sleep(n)`.
   - **randomness** — seed it and print the seed on failure so the run is reproducible.
4. **Fix the cause, not the symptom.** A retry wrapper is not a fix: it hides a real race that users will hit
   in production, where nothing retries for them.
5. **Prove it.** Run the test **N consecutive times green** (minimum 50, or 3× the observed failure interval,
   whichever is larger) plus one shuffled full-suite run. Record the new rate: `0/50`.
6. **Delete the quarantine marker,** close the issue, and re-run `scripts/verify.sh`.

## Guardrails
- Never make a test pass by widening its assertion — a test that cannot fail proves nothing.
- Never add a blanket retry at the runner level; it converts every future race into silence.
- A quarantined test with no owner and no date **is a deleted test** — treat it as a deletion in review.

## When it does not reproduce — the ordinary case
A 15%-rate flake shows up in 20 runs. The flake that actually wastes your week is 1-in-200, and on that one a
20-run loop returns **0 failures** — after which "3× the observed failure interval" is undefined and a 50-run
green streak on the *unfixed* test reads as proof. That is precisely the "re-run until green and call it fixed"
shape this playbook exists to prevent, arrived at by following the playbook.

**If step 1 does not reproduce it, you do not have a diagnosis, and you may not claim a fix.** Take one of these
routes instead, in order of preference:

1. **Go to the record.** CI history is the real sample: count failures of this test over the last N runs and
   compute the observed rate. `gh run list --limit 200` plus the job logs, or your CI's flaky-test report. A
   rate estimated from 3 failures in 400 runs is worth more than 20 green runs locally.
2. **Raise the pressure instead of the count.** Most flakes are timing, ordering or shared state. Run the suite
   with a randomised seed/order, with parallelism, on a loaded machine, with a clock skew — the conditions CI has
   and your laptop does not. `--repeat 200` on one machine reproduces almost nothing.
3. **Instrument and wait.** Land logging around the suspect boundary, leave it in CI, and come back when it
   fires. This is slow and it is honest.
4. **Quarantine, with an owner and a date.** If it is blocking others, mark it skipped **with an issue id and a
   name in the annotation**, never a bare skip. A silent skip is how a real bug lives for a year.

**Never** close a flake with "ran it N times, all green" when step 1 produced no failure — say
`not reproduced locally; observed rate <x/N> in CI` and pick a route above.

**When it DID reproduce**, the proof run is bounded by the observed rate: run at least `3 / rate` times (a 1-in-20
flake ⇒ ≥60 runs), and record both numbers — the rate you measured and the count you ran — in `--observe`.

## Done when
- The flake was **reproduced** and its rate measured — or step 1 recorded `not reproduced locally`, the CI-history
  rate is quoted, and one of the named routes was taken instead. Never a green streak standing in for a diagnosis.
- The **root cause** is named (timing, ordering, shared state, external dependency, resource), not "made it more
  reliable".
- The fix removes the cause; a retry or an increased timeout is recorded as a workaround **with an issue**, not
  as a fix.
- The proof run is `3 / observed-rate` runs or more, and both numbers are in the `--observe` text.
- No test was left silently skipped: any quarantine names an issue id and an owner.
The failure rate is recorded before (`n/N`) and after (`0/N`); the cause is named and classed; the fix addresses
that cause rather than the assertion; N consecutive green runs plus one shuffled suite run are recorded; the
quarantine marker is removed and its issue closed; `scripts/verify.sh` wrote a **pass** receipt.
