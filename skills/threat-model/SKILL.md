---
name: threat-model
description: Run a STRIDE threat model on a feature before or during design — enumerate assets, entry points, and trust boundaries, then walk Spoofing/Tampering/Repudiation/Info-disclosure/DoS/Elevation, mapping each threat to a concrete control (data-layer authorization, server authz, audit, signed webhooks, rate limits, input validation). Use when designing anything touching auth, data access, payments, PII, uploads, webhooks, or AI. Trigger words — threat model, STRIDE, attack surface, trust boundary, abuse case, security design.
---
# Threat model (STRIDE)

**Use when:** designing a feature that handles auth, cross-user/tenant data, money, PII, file uploads,
webhooks, or AI context — ideally before code. **Owners:** security-engineer. Every control below must name
a real mechanism in **this** project, per `docs/security/security-model.md`.

## Inputs
The feature's design/spec, the roles that touch it, the data it reads/writes (esp. sensitive), and every
entry point (endpoints, mutations, webhook receivers, jobs, third-party callbacks, CLI/admin tools).

## Procedure
1. **Enumerate assets** — the data and capabilities worth protecting (rows, files, secrets, money movement,
   an admin action). Note sensitivity (PII / payment / health / credentials).
2. **Map entry points & trust boundaries** — every place untrusted input crosses into trusted code: request
   handlers, form/RPC mutations, webhook receivers, file uploads, LLM prompts, cron/job triggers. Draw the
   boundary between client (untrusted) and server/datastore (trusted).
3. **Walk STRIDE per boundary/asset** — for each, ask and record concrete threats:
   - **S**poofing → who could impersonate a user/service? Control: strong auth, verified session, signed webhooks.
   - **T**ampering → what input/state could be forged or replayed? Control: schema validation at the boundary, server authz re-check, idempotency keys, integrity checks.
   - **R**epudiation → could an actor deny an action? Control: append-only audit log of who/what/when.
   - **I**nfo disclosure → what leaks cross-user/tenant or into logs/errors? Control: data-layer authorization, private storage + signed URLs, no PII/secrets in logs, generic error copy, AI context scoped to the caller.
   - **D**oS → what is unbounded/expensive? Control: rate limits, pagination, size caps, LLM cost/token caps, timeouts.
   - **E**levation → could a lower role act as a higher one? Control: role check + ownership predicate in BOTH the data layer and the server guard; never a client-supplied role claim.
4. **VERIFY each control has a home** — every threat maps to a real, testable mechanism in this codebase (a
   named policy, a guard function, an audit call, a rate-limit config), not a good intention. If none exists,
   it's a must-fix.
5. **Produce the risk table**: `Threat | STRIDE | Likelihood×Impact | Control | Status (have/gap)`.
6. **Persist it** to `docs/security/threat-models/<feature>.md` — assets, entry points, boundaries, the risk
   table, and the date + HEAD it was modelled at. A threat model nobody can find is one nobody revisits: it
   is the document `security-review` reads first for any area it covers (see that playbook's Inputs), and the one you re-open when the
   feature changes. Link it from the feature's issue and from any ADR that decided its boundaries.
7. **Turn every must-fix gap into an issue** (append to the project's backlog), tagged for the owning agent;
   critical gaps block the feature until controlled.

## Guardrails
- Don't hand-wave "we validate input" — name the schema, the policy, the audit call.
- Assume the client is hostile and the UI control is bypassable; the server and the datastore are the only
  real boundaries.
- When a rule is ambiguous, model the deny-by-default outcome, not the happy path.
- Ambiguity between "unlikely" and "catastrophic" resolves toward must-fix.

## Done when
Assets, entry points, and boundaries are listed; every STRIDE category is walked per boundary; each threat
has a concrete mapped control with a have/gap status; the model is committed at
`docs/security/threat-models/<feature>.md`; and every gap is filed as an issue (criticals block).

## Stack notes — Next.js + Supabase Postgres (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.
- Entry points that are easy to miss here: Server Actions (a public endpoint with no route file), `middleware`,
  and any Route Handler under a `(public)` segment.
- Typical control homes: RLS policy + pgTAP deny test (info disclosure, elevation); Zod schema at the handler
  (tampering); an `audit_log` insert in the same transaction (repudiation); Supabase signed URLs (storage
  disclosure); a rate limit in middleware or at the edge (DoS).
- The `service_role` key crossing into a user-facing path is an elevation threat, not a convenience.
