<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Definition of Done

> PURPOSE: The merge gate. A change is *done* only when every applicable box is checked. Boxes that
> genuinely don't apply are marked `N/A` with a one-line reason — never silently skipped. **Verification
> is the one section that has no `N/A`.**

## Verification  *(blocking — never N/A)*

> A change is not done until `scripts/verify.sh` has written a passing receipt matching the code as it
> stands now. A green test suite is not a verification. If you cannot run the software, write the single
> word UNVERIFIED and stop — do not describe the change as working, done, fixed, ready, or verified.

- [ ] **`scripts/verify.sh` passes** on the code as it stands — verdict `pass` in
      `.vantry/receipts/<branch-slug>.verify.json`.
- [ ] **The receipt is fresh:** its `tree_digest` matches the current code. One more edit to a
      non-trivial file makes it **stale** and the gate re-blocks. Re-run `scripts/verify.sh --smoke`.
- [ ] **The behaviour was OBSERVED running** — recorded with
      `scripts/verify.sh --observe "<expected>" "<observed>"` and quoted in the PR's
      **`## Verification evidence`** section. CI fails a PR whose evidence block is empty.
- [ ] **Logs, console and network checked** — `run.logs` scanned for errors, no unexplained console
      errors, no failed requests.
- [ ] **`qa-test-engineer` returned VERIFIED**, not "looks correct".

**This section has no `N/A`.** If it cannot be verified, it is not done. The only legitimate exit is
`scripts/verify.sh --override "<why, ≥20 chars>"` — a committed, reviewed decision that a human reads,
not a way past the gate.

## Functionality
- [ ] Implements exactly what the linked issue requires — no more, no less.
- [ ] **Happy path OBSERVED RUNNING** (not merely tested); edge cases handled (empty, max, duplicate, concurrent, unauthorized, late).
- [ ] Errors use the shared shape `{ error: { code, message, details? } }`; user copy localized.
- [ ] No regression in the core loop.

## Security  *(blocking on sensitive PRs)*
- [ ] Any diff touching `vantry.yml` **`sensitive_paths`** carries a committed verdict at
      `.vantry/reviews/<branch-slug>.security.json` with `verdict: "pass"`. CI fails the PR without it.
- [ ] RLS/authz enabled on **every new table**, with policies in the **same migration** (if Postgres/RLS).
- [ ] Access-control change proves **allow AND deny**.
- [ ] No privileged key on the user path; trusted-path use has a guard **and** an audit entry.
- [ ] Input validated at the boundary; authz re-checked server-side; identity/role/amounts derived server-side.
- [ ] No secret/token/PII leakage in logs, errors, responses, or AI context.
- [ ] Private files via short-lived signed URLs; webhooks signature-verified + idempotent.

## Tests
- [ ] Meaningful unit tests for new logic.
- [ ] Allow/deny tests for any access-control change.
- [ ] E2E for new/changed flows where applicable; deterministic; run in CI.

## Internationalization
- [ ] No hardcoded user-facing strings; all locales updated together.
- [ ] Numbers/dates/currency/plurals formatted correctly; default TZ {{DEFAULT_TZ}}.

## Accessibility
- [ ] Keyboard-operable end to end; visible focus; focus moved and trapped correctly in dialogs.
- [ ] Every input has a programmatic label; icon-only controls have an accessible name.
- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 for large text and UI boundaries); never colour alone to convey state.
- [ ] Loading, empty and error states are announced, not just drawn.

## Originality  *(public-facing work — name, brand, UI, copy, concept)*
- [ ] Any new **name or brand** cleared via `originality-check` (prior art: same-space products + trademark + domain + GitHub) — domain/trademark clearance is a **human** step, never asserted "available" from a web search.
- [ ] UI/design is not a generic AI-design cliché or a competitor look-alike; the choices are subject-specific and deliberate.
- [ ] Public copy says something true and specific — not a swapped-noun clone of another product's page.

## Performance
- [ ] No N+1; indexes for new query paths; pagination on unbounded lists.
- [ ] Within targets: **p95 < 500 ms** / **p99 < 1 s** on the changed path; LCP < 2.5 s, INP < 200 ms,
      CLS < 0.1 on any changed screen. Tighten per project in `docs/engineering/verification.md`.

## Observability
- [ ] Structured logs (no secrets/PII); sensitive mutations audited; errors reported.

## Documentation
- [ ] `/docs` updated when behavior/schema/contracts changed; `CLAUDE.md` stays consistent.
- [ ] `docs/engineering/verification.md` updated when the way to run, start or smoke the app changed —
      and `vantry.yml` `run:` updated with it.

## CI
- [ ] **CI green:** the `verify` workflow — *contract is valid*, *re-run the verification*,
      *PR states its evidence*, and *sensitive paths need a security review*. Plus the project's own
      lint / typecheck / unit / e2e jobs. No unjustified suppressions.

## PR hygiene
- [ ] One issue per PR; description ends with `Closes #NN`; Conventional Commit title.
- [ ] Scoped diff; UI changes include before/after screenshots; self-reviewed against this list.
