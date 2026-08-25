---
name: webhook-handler
description: Build a provider webhook handler (Stripe, PayDunya, CinetPay, etc.) the reliable way — verify the signature over the RAW body, dedupe by event id for idempotency, process on the trusted server path in a transaction, advance the state machine, and audit. The provider is the source of truth, not the client redirect. Use when adding or changing any payment/provider webhook. Trigger words — webhook, Stripe, PayDunya, CinetPay, callback, signature, event, refund, idempotency.
---
# Webhook handler (provider callback)

**Use when:** adding/changing any provider webhook or payment callback. **Owners:** payments-engineer, backend-engineer.
`vantry.yml` carries a free-text `stack:` naming the real stack; the **Stack notes** below are one
illustration of this contract, not the contract.

## Inputs
The provider + its event types, the signing secret (from env), the raw-body requirement, the state machine you
advance (e.g. `pending → paid → refunded`), and the amount/currency contract from `docs/specs/api-reference.md`.

## Procedure
1. **Read the RAW body first.** Take the exact bytes off the wire and hold them; **never deserialize before
   verifying**. Signature verification hashes those exact bytes, so any parse-and-re-serialize breaks it.
   Disable or bypass whatever automatic body parsing the transport layer applies to this route.
2. **Verify the signature** with the provider's SDK or an HMAC over the raw body + timestamp. On failure →
   `400`, log nothing sensitive, stop. Reject stale timestamps to defend against replay.
3. **Dedupe by event id (idempotency).** Insert the provider's event id into an insert-once ledger table with
   a **unique constraint**. Already present → return `2xx` and do nothing (a retry/replay, not new work). This
   is the single most important correctness step — providers WILL deliver duplicates and out-of-order.
4. **Process on the trusted path in a transaction.** Use the server/service context (this is a legitimate
   privileged path — pair with an app-layer check + audit). Look up the referenced order/payment by the
   provider's ids, NOT by anything a client sent.
5. **Never trust client amounts.** Take amount, currency, and status from the verified payload only; assert they
   match your recorded order (money as integer minor units). Mismatch → do not fulfill; audit + alert.
6. **Advance the state machine idempotently.** Guard each transition with a conditional update on the current
   status; tolerate out-of-order events (a late `paid` after `refunded` must not un-refund). Ledger insert +
   state update commit together.
7. **Audit** every state change (event id, from→to, amount). Return `2xx` only after the work is durably
   committed, so the provider stops retrying.
8. **Test with the provider CLI/sandbox:** success, failure, refund, AND a **replay of the same event id**
   proving it is a no-op. Assert the deny/mismatch path rejects tampered amounts.
9. **Verify:** run `scripts/verify.sh` — it executes the commands declared in `vantry.yml`, whatever the stack
   — then **post a real signed payload** at the running handler and **post it again**. Record with
   `scripts/verify.sh --observe "<expected>" "<observed>"` the status of both deliveries, the ledger row count
   (unchanged on the second), and the state after the replay. Add the replay to `vantry.yml` `acceptance:` as
   `AC-n | REQ-n | a replayed event id is a no-op | <command>` so it keeps proving itself.

## Guardrails
- Never fulfill on the client redirect / return URL alone — it is not authenticated; the webhook is the source of truth.
- Never parse the body before verifying the signature. Never trust a client-sent amount, currency, order id, or status.
- Never log the signing secret, full payload PII, or card data. No privileged path without an audit row.
- A payment webhook lands in `vantry.yml` `sensitive_paths`: the PR cannot merge without a committed
  `.vantry/reviews/<branch-slug>.security.json` with `verdict: pass`.

## Persist BEFORE you act — the ordering is the design
Implementing the steps in the order they are numbered loses a payment on any crash. Reproduced: a crash between
"verify + dedupe" and "advance the state machine" left an order stuck at `pending` forever, while the provider's
retry hit the dedupe ledger and got a cheerful `200 duplicate, no-op`. All five prescribed tests were green on
that code, because none of them crashes anything.

**The ledger row and the state change belong to ONE transaction**, or the ledger row is written with a status
you have to clear:

```
BEGIN;
  INSERT INTO webhook_events (provider, event_id, status) VALUES (…, 'received')
    ON CONFLICT (provider, event_id) DO NOTHING;   -- 0 rows ⇒ already handled ⇒ 200, stop
  <advance the domain state machine, conditionally on the current status>
  UPDATE webhook_events SET status = 'processed' WHERE provider = … AND event_id = …;
COMMIT;
```

A row left at `received` is a **crashed delivery**, and it must be visible: a retry from the provider re-enters
it, and a sweeper alerts on rows older than N minutes. "Already seen ⇒ no-op" is only safe when *seen* means
*finished*.

**Then test the three things the prescribed five do not:**
1. **Crash mid-handler.** Kill the process between the insert and the state change (an env flag is fine), then
   replay the event. The order must reach its final state. Before the fix, it never does.
2. **A forged signature is refused.** Send the same body with a wrong signature, and with a valid signature over
   a *different* body. Both must be rejected **and leave no ledger row** — otherwise a forgery poisons the
   dedupe key and blocks the genuine event.
3. **Out-of-order delivery.** Deliver `paid` then the older `pending`. The final state must be `paid`. This is
   what makes the state machine's condition load-bearing rather than decorative.

Remove each guard in turn and confirm the matching test goes red. A test that passes with the guard deleted is
not testing the guard.

## Done when
- The signature is verified over the **raw body** before parsing, and a forged one is refused **with no ledger
  row written** — proven by an executed test.
- The ledger insert and the state change are in **one transaction**, and a **crash mid-handler followed by the
  provider's retry** still reaches the final state — proven by an executed test that actually kills the handler.
- A **replay** is a no-op returning the same result, and an **out-of-order** delivery cannot regress the state —
  both proven by executed tests.
- Each guard was **removed in turn** and the matching test went red. Name the mutations in `--observe`.
- The endpoint returns 2xx fast and does the slow work out of band.
Raw-body signature verified; event-id dedupe ledger enforced; transactional state machine tolerant of
retry/replay/out-of-order; amounts validated against the recorded order; audited; a **fresh passing receipt**
for this branch whose observation shows the **second delivery was a no-op** (same ledger count, unchanged
state); `scripts/verify.sh` passes and CI re-runs the same contract; committed security review with
`verdict: pass`. Delegate the schema/row authorization for the ledger to `rls-policy`/`safe-migration`.

## Stack notes — Next.js App Router + Supabase (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.
- Step 1: a Route Handler at `app/api/**/route.ts` reading `await req.text()` — never `req.json()` before
  verify. A Server Action is the wrong surface: the provider is not your UI.
- Steps 2-3: `stripe.webhooks.constructEvent(rawBody, sig, secret)`; the ledger is a `webhook_events` table
  with `UNIQUE (provider, event_id)`, so a duplicate is a constraint violation you catch and answer `200`.
- Steps 4-6: one Postgres transaction (Supabase service client or Prisma `$transaction`) doing the ledger
  insert plus `UPDATE orders SET status='paid' WHERE id=$1 AND status='pending'`.
