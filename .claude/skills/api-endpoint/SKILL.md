---
name: api-endpoint
description: Build a server endpoint the correct, secure way — schema validation at the boundary, server-authoritative authorization with an allow AND deny test, the shared error shape, and idempotency where needed. Use when adding or changing any API route, mutation, or form action. Trigger words — endpoint, route handler, server action, API, mutation, POST/GET.
---
# API endpoint (server-side mutation or data route)

**Use when:** adding/changing any server endpoint or form mutation. **Owners:** backend-engineer.
`vantry.yml` carries a free-text `stack:` naming the real stack; the **Stack notes** below are one
illustration of this contract, not the contract.

## Inputs
The operation, its input shape, the caller roles allowed, the data it touches, and the success/error contract
from `docs/specs/api-reference.md`.

## Procedure
1. **Choose the surface.** A mutation driven by the app's own UI belongs on the framework's server-side entry
   point for that UI; an endpoint consumed by a third party, another service, or a mobile client belongs on a
   public transport route with a versioned, documented shape. A read the server already renders stays there —
   do not add a round trip to fetch what the server had.
2. **Validate input at the boundary with a schema validator** — one declared schema per operation, and derive
   the request type from that schema rather than declaring it twice. Reject bad input with the shared error
   shape `{ error: { code, message, details? } }`.
3. **Authorize server-side** — re-check role AND ownership from the verified session and the datastore, even
   if the UI hid the control. Never trust client-supplied identity, role, price, or ownership. Where the
   datastore enforces row-level authorization, run the query on the **request-bound (caller) connection**, not
   a privileged one, so that enforcement stays a real backstop.
4. **Do the work** in a plain service module (pure, testable) — keep transport and plumbing thin. Money as
   integer minor units.
5. **Idempotency** for unsafe/retryable ops (payments, webhooks, submissions): dedupe by a key.
6. **Audit** sensitive mutations (write an audit-log row). **Never** log secrets/PII.
7. **Errors:** map to the shared shape + the correct transport status; never leak internals or stack traces.
8. **Test:** an integration test that proves (a) valid input succeeds, (b) invalid input is rejected, and
   (c) an **unauthorized caller is denied** (the allow/deny pair). Document the endpoint in `api-reference.md`.
9. **Verify:** run `scripts/verify.sh` — it executes the commands declared in `vantry.yml`, whatever the stack
   — then **call the real endpoint** against the running app (valid, invalid, and unauthorised) and record the
   **status codes you actually got** with `scripts/verify.sh --observe "<expected>" "<observed>"`. Add the deny
   case to `vantry.yml` `acceptance:` as `AC-n | REQ-n | <statement> | <command>` so it keeps proving itself on
   every future verification. A green test suite is not a verification.

## Guardrails
- No third-party/LLM/payment call from client-side code — keys stay server-side.
- No privileged datastore credential on the user path. No un-validated input reaching the service.
- An endpoint touching auth, payments, file access, PII or AI lands in `vantry.yml` `sensitive_paths`: the PR
  cannot merge without a committed `.vantry/reviews/<branch-slug>.security.json` with `verdict: pass`.

## Done when
Schema-validated at the boundary; authz re-checked with a passing deny test; shared error shape; audit on
sensitive writes; documented; a **fresh passing receipt** for this branch whose observation quotes the three
status codes (200/4xx-validation/401-403); `scripts/verify.sh` passes and CI re-runs the same contract; a
committed security review with `verdict: pass` if the route is sensitive. Delegate schema/row authorization to
`rls-policy`/`safe-migration`; webhooks to `webhook-handler`.

## Stack notes — Next.js App Router + Supabase (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.
- Step 1: form/page mutation → **Server Action** (`'use server'`); external/3rd-party/mobile or GET data API →
  **Route Handler** (`app/api/**/route.ts`). Reads that can be RSC stay RSC.
- Step 2: **Zod**; derive the TypeScript type with `z.infer` and share it client/server.
- Step 3: the row-level backstop is Postgres **RLS**, reached through the request-bound Supabase client —
  the service-role key never touches a user-facing path.
