---
name: code-review
description: Review a diff for (a) correctness bugs — logic, edge cases, error handling, race conditions, security — ranked by severity with a concrete failure scenario, and (b) reuse/simplification/efficiency cleanups. Verify each finding before reporting; stay within the diff's scope. Use before merge on any non-trivial change. Trigger words — code review, review diff, review PR, bugs, correctness, cleanup.
---
# Code review (correctness bugs + cleanups)

**Use when:** reviewing any non-trivial diff before merge. **Owners:** all agents (esp. qa-test-engineer,
tech-lead). Complements — does not replace — the mandatory `security-review` for auth/RLS/payments/PII/AI changes.

## Inputs
The diff (or `git diff` of the branch), the issue it implements, and its acceptance criteria. Review only
what changed and what the change directly affects.

## Procedure
1. **PRECONDITION — refuse to review unverified code.** Run `scripts/verify.sh --gate`. If it is not `0`,
   print exactly `BLOCKED — unverified: run scripts/verify.sh first` and **stop**. Reviewing code nobody has
   run is theatre: it spends the most expensive attention in the loop on behaviour no one has observed.
2. **Read the diff for correctness first.** Hunt logic errors, unhandled edge cases (null/empty/boundary),
   missing/incorrect error handling, race conditions, and security issues (injection, missing authz,
   leaked secrets/PII, trusting client input).
3. **Rank each bug by severity** (blocker → major → minor) and give it a **concrete failure scenario** —
   the specific input/sequence that triggers it and the resulting wrong behavior. No vague "this could break".
4. **Then look for cleanups:** duplicated logic that should reuse an existing helper, over-complex code that
   simplifies, and obvious inefficiency (N+1, redundant work). Keep these separate from the bug list.
5. **Verify before reporting.** Trace the code path to confirm each finding is real — no false positives.
   If you can't confirm it, mark it explicitly as a question, not a defect.
6. **Stay in scope.** Don't demand unrelated rewrites; file separate follow-ups for out-of-diff issues.
7. **Report** two ranked lists — bugs (with failure scenario + fix) and cleanups (with the simpler form) —
   plus a clear merge/block recommendation, **and write the verdict receipt** below.

## Verdict receipt
**The slug, exactly.** Take the branch name, replace `/` with `-`, then remove every character outside
`A-Za-z0-9._-`. Do not re-derive it: `scripts/verify.sh --status` prints it on line 1 as `· branch <slug>` —
use that string, so the file you write is the file CI looks for.

A review that exists only in a chat window cannot be depended on. Write
`.vantry/reviews/<branch-slug>.code.json` (slug = branch name, `/` → `-`):

```json
{ "schema": "vantry.review/1", "kind": "code", "verdict": "pass",
  "reviewer": "code-reviewer", "at": "<UTC ISO-8601>", "head": "<git rev-parse HEAD>",
  "checklist": ["correctness", "edge cases", "error handling", "concurrency", "scope", "cleanups"],
  "findings": [{ "severity": "blocker", "file": "<path>", "line": 42,
                 "summary": "…", "fix": "…" }] }
```

`verdict` is `block` if any blocker remains open, else `pass`. This file is **tracked and committed** — it is
the judgement, and a judgement travels with the PR. Editing a file after writing it invalidates both receipts.

## When a gate blocks
1. Set the issue to status **`blocked-gate`** and post the findings on the PR.
2. Hand the finding **back to the implementing agent**. The reviewer never fixes its own finding — that
   destroys the second pair of eyes.
3. After the fix, **verification must be re-run and this review re-run end to end**: the edit staled the
   verification receipt and the verdict receipt alike. A previously-blocked PR never merges on a verbal "fixed".

## Guardrails
- No false positives — a reported bug you didn't verify erodes trust; downgrade uncertain items to questions.
- Don't expand scope into unrelated files or bikeshed style the linter already owns.
- For sensitive surfaces (auth, RLS, payments, PII, AI), require `security-review` in addition to this.

## Done when
The gate was green before the review started; correctness findings are ranked with concrete failure scenarios
and fixes; cleanups listed separately; every finding verified; scope respected; a merge or block
recommendation given; and `.vantry/reviews/<branch-slug>.code.json` is written and committed.

## Stack notes — TypeScript + Next.js App Router (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.
- Recurring correctness traps here: a `use client` boundary crossed by a secret or a server-only import;
  `async` work started and never awaited; a Server Action trusting a hidden form field; `revalidate`/cache
  keys that outlive the data; unhandled `undefined` from an ORM `findFirst`.
- Efficiency: N+1 from per-row queries in a loop, and re-fetching in a child what the parent already loaded.
- Style belongs to ESLint + Prettier — if the linter owns it, do not spend review attention on it.
