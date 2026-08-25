---
name: refactor-safely
description: Change the shape of code without changing its behaviour — characterisation tests first to pin what exists, find the seam, strangle the old path incrementally, and prove equivalence with scripts/verify.sh at every step. Use before restructuring, extracting, or replacing any working code. Trigger words — refactor, restructure, extract, clean up, strangler fig, characterisation test, legacy code, untangle, rewrite a module.
---
# Refactor safely (pin behaviour, then move it)

**Use when:** restructuring code that already works — extracting a module, replacing an implementation,
untangling a god object, retiring a legacy path. **Owners:** the engineer who owns the module
(backend/frontend), qa-test-engineer co-owns the characterisation suite.

## Inputs
The code as it stands, its current callers, and the **behaviour** you must preserve exactly — including the
bugs. A refactor has no user-visible outcome; that is the whole point.

## Procedure
1. **Characterise first.** Write Feathers-style characterisation tests that pin the behaviour that *exists*
   today — feed real inputs, record the actual outputs, assert those. **Bugs included.** You are not fixing
   behaviour here; a test that asserts what the code *should* do is a spec, not a characterisation.
2. **Run them green against the untouched code.** A characterisation suite that fails before you start is
   describing something other than the current behaviour — fix the test, not the code.
3. **Find the seam** — the narrowest interface every caller already goes through. If there is no seam,
   creating one is the first, separate, behaviour-preserving commit.
4. **Strangle incrementally.** Build the new path *behind* the old interface. Route callers across one at a
   time (a `feature-flag` if the switch is risky or user-facing). Never a big-bang replacement.
5. **Prove equivalence at each step** — run `scripts/verify.sh` after every routed caller, not once at the
   end. The receipt goes stale on the next edit, which is exactly the discipline this needs.
6. **Delete the old path only once nothing calls it.** Grep for callers, including tests, config and docs.
   Deleting dead code is its own commit.
7. **Keep the characterisation suite** unless it duplicates a real spec test — it is the regression net.

## Guardrails
- ❌ **Never refactor and change behaviour in one commit.** If you find a bug mid-refactor, land the refactor
  first, then fix the bug in a commit that says so and owes its own verification.
- ❌ If you **cannot characterise it**, you cannot safely refactor it — say so plainly and stop. Propose the
  observability or test seam needed first, rather than restructuring blind.
- ❌ Renaming plus reshaping in one diff — reviewers cannot see the behaviour through the churn.
- A refactor is not covered by `trivial_paths`. It changes code that runs; it owes a passing receipt.

## Wire the characterisation tests into the contract, or they prove nothing
The promise here is *"prove equivalence with `scripts/verify.sh`"*. That was false as written: `verify.sh` runs
`run.test`, `run.build`, `run.smoke` and the acceptance criteria — and **nothing routes a characterisation suite
into any of them**. A walk wrote a characterisation test pinning a legacy quirk, deleted the quirk, watched that
suite go red, and `scripts/verify.sh` printed `✓ VERIFIED`.

Before you change a single line, make the characterisation suite part of the contract:

- **Simplest:** have `run.test` in `vantry.yml` run it too — one command that runs both suites, or a test runner
  path that includes the characterisation directory.
- **Or, for the behaviours that matter most**, promote them to `acceptance:` so each lands in the receipt naming
  what it pins:
  ```yaml
  acceptance:
    - "AC-n | REQ-nnn | pre-2019 orders still export with the legacy VAT line | <command running that one test>"
  ```

Then confirm the wiring is real, *before* refactoring: **break the behaviour on purpose**, run
`scripts/verify.sh`, and check it FAILS. If it passes, the suite is not wired in and every "equivalence proof"
you are about to run is theatre. Restore, then start.

## Done when
- The characterisation suite existed and was **green before** any change, and is green after.
- It is **wired into `run.test` or `acceptance:`**, and that wiring was proven by breaking a pinned behaviour and
  watching `scripts/verify.sh` fail. Name that mutation in `--observe`.
- Behaviour is identical: no new public surface, no changed output, no changed error shape.
- `scripts/verify.sh` wrote a passing receipt and the observation says what you exercised and saw.
Characterisation tests exist and were green **before** the first change; every caller is routed through the
new path; the old path is deleted with no remaining references; `scripts/verify.sh` has written a passing
receipt matching the tree as it now stands; and no user-visible behaviour changed.
