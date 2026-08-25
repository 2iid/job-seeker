---
name: security-review
description: Audit a diff/PR against the OWASP Top 10 and the project security guardrails — data-layer authorization with executed allow/deny tests, no privileged credential on the user path, schema validation at the boundary + server authz re-check, no secret/PII in logs or errors, signed+idempotent webhooks, private storage + signed URLs, security headers/CSP, scoped AI context. Output CONFIRMED findings ranked by severity with the exact fix; block on any critical. Use to gate any change touching auth, RLS, payments, file access, PII, or AI. Trigger words — security review, audit, OWASP, gate, vulnerability, secure this PR.
---
# Security review (OWASP + project guardrails)

**Use when:** the diff touches any path listed in `vantry.yml` **`sensitive_paths`** — auth, RLS/roles,
payments, file access, PII, AI context. That intersection, not an opinion, makes this gate MANDATORY, and CI
enforces it. **Owners:** security-engineer. Check against `CLAUDE.md` §7 and
`docs/security/security-model.md`. The **data layer is the last line of defense** — an endpoint check the
data layer does not repeat is one bug away from being no check at all.

## Inputs
The diff/PR (`git diff` vs base), the tables/routes/files it touches, and the roles + data sensitivity in play.

> **Read the threat model first, if one covers this area.** `docs/security/threat-models/` holds what
> `/threat-model` produced: the assets, the trust boundaries, the ranked threats and the mitigation each one is
> supposed to have. Reviewing a diff against that is how you catch a mitigation that was designed and never
> built — the document existed and nothing ever opened it. If a model covers what this diff touches, name it in
> the verdict and check each mitigation it promised. If none exists and the change is significant, say so: that
> is a finding, not an omission.

## Procedure
1. **PRECONDITION — refuse to review unverified code.** Run `scripts/verify.sh --gate`. If it is not `0`,
   print exactly `BLOCKED — unverified: run scripts/verify.sh first` and **stop**. Auditing code nobody has
   run is theatre — and the receipt you would audit against does not exist yet.
2. **Decide MECHANICALLY whether this change needs me.** Not self-assessment — set intersection:
   `git diff --name-only <base>...HEAD` (base = `merge.base` in `vantry.yml`, usually `main`) filtered
   against `vantry.yml` **`sensitive_paths`**. One hit and this review is **mandatory**; CI enforces the same
   intersection and fails the PR without a committed `pass` verdict. Zero hits and it is optional judgement.
3. **Scope the blast radius** — list new/changed tables/collections, endpoints, mutations, webhook receivers,
   storage access, env/secrets, and LLM calls. Anything sensitive raises the bar.
4. **Run the checklist** — for each item, confirm in the diff (not by assumption):
   - **Data-layer authorization**: every new sensitive table/collection is deny-by-default and carries an **executed** allow AND deny test per principal (→ `rls-policy` skill).
   - **No privileged credential on the user path**: the service/admin credential appears only in trusted server contexts, each paired with an app-layer authz check + audit entry; never reachable from client-side code.
   - **Boundary validation**: a schema validator rejects all external input at the edge; the server re-checks authz even when the UI hid the control. No trust in a client-supplied role claim.
   - **Secrets & PII**: no secrets/tokens/PII in code, logs, or error responses; errors return the shared problem shape and leak no internals/stack.
   - **Webhooks**: signature verified + idempotent (replay-safe) + audited.
   - **Storage**: buckets/containers private; access via short-lived signed URLs, never public/guessable paths.
   - **Transport & headers**: security headers and a content security policy present and not weakened.
   - **AI context**: LLM prompts scoped to the caller's own data; injection-resistant; cost/token caps.
   - **OWASP Top 10 sweep**: injection, broken access control, SSRF, insecure deserialization, vulnerable deps, auth/session flaws.
5. **VERIFY, don't speculate** — reproduce or trace each candidate to a concrete line before reporting it.
   Discard anything you cannot confirm from the diff/code.
6. **Rank confirmed findings by severity** (Critical / High / Medium / Low), each with: the exact file:line,
   why it's exploitable, and the precise fix (name the policy, guard, schema, or config to add).
7. **Gate**: any Critical (or unmitigated High on auth/RLS/payments/PII/AI) blocks the PR until fixed.
8. **Write the verdict receipt** below. An unrecorded verdict is not a gate.

## Verdict receipt
**The slug, exactly.** Take the branch name, replace `/` with `-`, then remove every character outside
`A-Za-z0-9._-`. Do not re-derive it: `scripts/verify.sh --status` prints it on line 1 as `· branch <slug>` —
use that string, so the file you write is the file CI looks for.

Write `.vantry/reviews/<branch-slug>.security.json` (slug = branch name, `/` → `-`):

```json
{ "schema": "vantry.review/1", "kind": "security", "verdict": "pass",
  "reviewer": "security-engineer", "at": "<UTC ISO-8601>", "head": "<git rev-parse HEAD>",
  "checklist": ["data-authz", "privileged-credential", "boundary-validation", "secrets-pii",
                "webhooks", "storage", "headers-csp", "ai-context", "owasp-top-10"],
  "findings": [{ "severity": "critical", "file": "<path>", "line": 17,
                 "summary": "…", "fix": "…" }] }
```

This file is **tracked and committed** — a judgement has to travel with the PR. **CI reads this exact file**:
a PR touching `vantry.yml` `sensitive_paths` with no `pass` verdict here **fails**. `verdict: "block"` fails
the PR too. And **editing any file during or after the review flips the verdict back to `block`** — the
verification receipt went stale, so the code you audited is no longer the code in the PR. Re-verify, re-review.

## When a gate blocks
1. Set the issue to status **`blocked-gate`** and post the confirmed findings on the PR.
2. Hand each finding **back to the implementing agent**. The reviewer never fixes its own finding — that
   destroys the second pair of eyes.
3. After the fix, **verification must be re-run and this review re-run end to end**, because both receipts
   went stale. A previously-blocked PR never merges on a verbal "fixed".

## Guardrails
- Report only CONFIRMED findings — no speculative noise; if unsure, verify or drop it.
- A "make it work" privileged query on the user path is always a finding — fix the policy, not the symptom.
- Never approve a sensitive change lacking its allow/deny test.
- Don't rubber-stamp: absence of a control is itself a finding.

## Done when
The gate was green before the review started; every checklist item is confirmed against the diff; all findings
are reproduced and ranked with an exact fix; no Critical remains open; and
`.vantry/reviews/<branch-slug>.security.json` carries the explicit `pass`/`block` verdict and is committed.

## Stack notes — Next.js + Supabase Postgres (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.
- Data-layer authorization = RLS with `ENABLE`+`FORCE` and a **pgTAP** allow/deny test per principal.
- The privileged credential is the `service_role` key: server-only, never imported into a Client Component
  and never in `NEXT_PUBLIC_*`. `anon`-key access is whatever RLS lets through — treat it as public.
- Boundary validation = **Zod** at every Route Handler and Server Action; a Server Action is a public
  endpoint, so it re-checks authz even though no route file names it.
- Headers/CSP live in `next.config` or middleware; storage = private Supabase buckets + signed URLs.
