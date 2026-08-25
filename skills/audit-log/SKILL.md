---
name: audit-log
description: Write a defensible audit row — who did what to which resource, when, from where, the before/after, and the correlation id — in the SAME transaction as the change it records, append-only, with secrets and raw PII excluded and read access restricted. Use whenever a change must be provable after the fact. Trigger words — audit, audit log, audit trail, who changed this, tamper, append-only, forensics, repudiation, compliance log, retention.
---
# Audit log (the row that survives the argument)

**Use when:** any mutation of money, roles, auth state, PII, approval status, or file access — and whenever
`api-endpoint`, `background-job`, `webhook-handler` or `rls-policy` say "audit this."
**Owners:** security-engineer, backend-engineer (database-architect owns the table).

## Inputs
The events to record (from `docs/security/security-model.md` and any `threat-model` Repudiation findings), the
resource identity for each, who may read the log, and the retention this project actually needs.

## Procedure
1. **Fix the event list, and keep it short.** Audit *decisions and state changes* — role grant, refund, status
   transition, export, override, impersonation, deletion — not traffic. Reads are audited only for sensitive-data
   access (PII/health/payment export), never for every page view.
2. **Fix the row shape.** Each row carries **actor** (the server-verified identity + how it was obtained: session,
   service, cron, impersonation), **action** (a stable enum, not prose), **resource** (type + id + tenant),
   **when** (UTC, from the DB, never the client), **from where** (IP, user agent, entrypoint), **before/after**
   for the fields that matter, and the **request/correlation id** tying the row to the logs, the receipt, and the
   provider event.
3. **Redact by construction, not by review.** NEVER store passwords or hashes, tokens/keys/session ids, full card
   numbers, OTP or recovery codes, raw request bodies, or bulk PII — store the *field name* that changed plus a
   hash or last-4. An audit log is read by more people than the database (support, ops, auditors, responders):
   assume every field gets pasted into a ticket.
4. **Write it in the SAME transaction as the change** — same commit, same rollback. A row written after the
   commit, from a queue, or best-effort in a `finally` disagrees with reality on the one day it matters: the
   failed write. If the row cannot be written, the change does not happen.
5. **Append-only, and mean it.** Revoke `UPDATE`/`DELETE` from every application role; no ORM save path;
   corrections are a NEW row referencing the earlier one. A log the app can rewrite is not evidence.
6. **Restrict reads and declare retention.** The log concentrates who-did-what across every tenant, so deny it to
   normal users, scope tenant views to that tenant, and audit privileged reads of it. Set a retention per event
   class and write the number down — expiry is a scheduled purge (`background-job`), never a manual delete.
7. **Document it in `docs/security/audit-and-monitoring.md`**: events, fields, redaction rule, who may read,
   retention per class, and which alerts fire off which events (`observability-setup`).
8. **Test:** an integration test performing a real audited mutation that asserts (a) exactly one row with the
   right actor/action/resource/correlation id, (b) **a failed change rolls the row back**, (c) `UPDATE`/`DELETE`
   on the log is rejected, (d) a non-privileged reader is denied.
9. **Verify:** run `scripts/verify.sh`, drive the real mutation against the running app, and record with
   `scripts/verify.sh --observe "<expected>" "<observed>"` the **row you read back** (actor, action, resource,
   correlation id) and the **error text** from the rejected update.

## Guardrails
- ❌ Best-effort/async audit writes; ❌ a mutable audit table; ❌ client-supplied actor, timestamp, or IP.
- ❌ Secrets, tokens, card numbers, or raw PII in a row — no exception for "debugging"; ❌ undeclared retention.
- ❌ An audit log every user can read.
- The audit table is sensitive data: it lands in `vantry.yml` `sensitive_paths` and needs a committed
  `.vantry/reviews/<branch-slug>.security.json` with `verdict: pass` before merge.

## The two checks that actually test the thesis
This playbook says *"a log the app can rewrite is not evidence"* and *"redact by construction, not by review"*.
Both were unprovable by the tests it prescribed. A run against a real database found the log rewritable and
holding a password, an OTP, a session id and a full card number — with every prescribed assertion green.

**1. Run the tamper test on the connection the APPLICATION uses.** `REVOKE UPDATE, DELETE` binds a role. Asserting
it as a *test* principal proves nothing about the app, and the app is usually the schema owner — which is
exempt. The assertion must open the app's own `DATABASE_URL`:

```
-- as the application's real connection, not a test role
UPDATE audit_log SET action = 'x' WHERE id = <id>;   -- MUST error
DELETE FROM audit_log WHERE id = <id>;               -- MUST error
SELECT current_user;                                 -- record it in the observation
```

If the app connects as the table's owner, `REVOKE` does not apply to it: give the app a **non-owner role**, or
put the log where the app cannot reach it (append-only sink, separate database, a trigger that raises). Record
`current_user` in `--observe` — that one string is what makes this check non-vacuous.

**2. Assert the ABSENCE of every forbidden field, on a real row.** "Redact by construction" is a property of
the payload, so test the payload:

```
SELECT id FROM audit_log
WHERE before::text ~* '(password|passwd|otp|secret|token|session|authorization|card|pan|cvv|iban|ssn)'
   OR after::text  ~* '(password|passwd|otp|secret|token|session|authorization|card|pan|cvv|iban|ssn)';
-- MUST return zero rows
```

Run it over the rows the test just produced **and** over a sample of production-shaped rows. A redaction rule
nobody executes is a comment.

## Done when
- Every write to a sensitive table produced a row with actor, action, target, before/after and timestamp.
- **The tamper test ran on the application's own connection** and both `UPDATE` and `DELETE` errored;
  `current_user` from that connection is quoted in the `--observe` text.
- **The forbidden-field query returned zero rows** over the rows this change produced.
- `scripts/verify.sh` wrote a passing receipt and the observation names what was appended and what was refused.
Events + redaction rule are in `docs/security/audit-and-monitoring.md`; the table is append-only with
`UPDATE`/`DELETE` revoked and reads restricted; retention is declared with a purge job; and a **fresh passing
receipt** for this branch whose observation quotes the row read back after a real mutation, the rollback case,
and the rejected update. Delegate table + RLS to `safe-migration`/`rls-policy`, purge to `background-job`.

## Stack notes — Postgres/Supabase (illustration, not contract)
`audit_log(id, actor_id, actor_kind, action, resource_type, resource_id, tenant_id, changed_fields jsonb,
before jsonb, after jsonb, ip inet, user_agent text, request_id text, created_at timestamptz default now())`;
`REVOKE UPDATE, DELETE ON audit_log FROM authenticated, anon;` plus `ENABLE`+`FORCE` RLS with a SELECT policy
scoped to tenant admins; the insert runs inside the same `BEGIN` as the mutation. If `CLAUDE.md` names another
stack, this section is void and the Procedure above still applies.
