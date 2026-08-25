<!-- One issue per PR. Title must be a Conventional Commit: feat(scope): … -->

Closes #

## What changed

<!-- One or two sentences. What a reviewer needs to know before reading the diff. -->

## Verification evidence

<!--
  REQUIRED — CI fails when this section is empty.

  "Tests pass" is not evidence. State what you RAN and what you SAW.
  Paste the tail of `scripts/verify.sh`, or the observation it recorded:

      $ scripts/verify.sh
      ✓ VERIFIED — receipt written to .vantry/receipts/feat-PRJ-014.verify.json

      expected: an order page shows the live carrier status for a paid order
      observed: GET /orders/9f31 → 200, status pill reads "In transit",
                console clean, 0 failed requests

  If you could not run it, write UNVERIFIED and why — do not leave this blank
  and do not describe the change as working.
-->

## Definition of Done

- [ ] Implements exactly the linked issue — no more, no less
- [ ] `scripts/verify.sh` passes on the code as it stands in this PR
- [ ] The behaviour above was **observed running**, not inferred from green tests
- [ ] Tests cover the new logic; an access-control change proves **allow AND deny**
- [ ] No secret, token or PII in logs, errors, responses or AI context
- [ ] Docs updated where behaviour, schema or contracts changed
- [ ] Anything not applicable is marked `N/A` with a one-line reason — never silently skipped

## Security

<!-- Delete if this PR touches no sensitive path (see vantry.yml: sensitive_paths). -->
- [ ] `security-review` run; verdict committed to `.vantry/reviews/<branch>.security.json`
- [ ] Authorization re-checked server-side; identity, role and amounts derived server-side
- [ ] New tables ship their access policy **and** its allow/deny test in the same change

## Override

<!--
  Fill ONLY if .vantry/overrides/<branch>.json exists. CI surfaces it as a
  warning either way — an override nobody sees is just a disabled gate.
-->
