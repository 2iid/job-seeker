---
name: background-job
description: Build a durable, idempotent scheduled or queued job (daily cron, timeout/auto-forward, reconciliation sweep) the safe way — a secret-guarded entrypoint or real queue, idempotent + retry-safe work, bounded batches, observability, and audit where it mutates sensitive data. Never fire time-based logic off a user request read-path. Use when adding any cron, scheduled task, queue worker, or reconciliation job. Trigger words — cron, scheduled, background job, queue, worker, pg_cron, Inngest, timeout, reconciliation, sweep.
---
# Background job (scheduled / queued)

**Use when:** adding/changing any cron, queued, or time-triggered job. **Owners:** backend-engineer, devops-engineer.
The contract below holds for any scheduler or queue; the concrete one is a Stack notes detail.

## Inputs
The trigger (schedule or queue event), what it mutates, the idempotency key/window, the batch bound, and where
the run is observable. Time-based rules (a submission auto-forwarding after N hours) must live HERE, not in a read path.

## Procedure
1. **Guard the entrypoint.** Cron → a protected Route Handler that checks a `CRON_SECRET` header (constant-time
   compare) and rejects otherwise → `401`. Queue → authenticate the worker; never a public URL that mutates.
2. **Make the work idempotent.** Assume the job runs twice (overlap, retry, redeploy). Key each unit of work
   (order id + date, event id) and guard mutations (`WHERE status = 'pending'`, upsert-on-conflict) so a
   re-run is a no-op. Never rely on "it only runs once."
3. **Bound the work.** Process a capped batch (e.g. `LIMIT 200`), oldest-first, with pagination/cursor across
   runs. No unbounded scans that grow with the table and eventually time out.
4. **Do the work in `lib/`** (pure, testable) — the entrypoint stays thin. Wrap each unit so one failure doesn't
   abort the batch; record per-item outcome and continue.
5. **Don't fire time-based logic from a request read-path.** A page load must never be what "expires" or
   "auto-forwards" something — the state must be correct even if no one visits. That is exactly this job's reason to exist.
6. **Observe every run.** Log start/end, counts (processed/skipped/failed), and duration. Emit a heartbeat so a
   silent failure is detectable. Alert on repeated failures.
7. **Audit sensitive mutations** (money, grades, status, PII) with an audit-log row per change, same as a request path.
8. **Test:** a unit test that the job is idempotent (run twice → one effect), that the batch bound holds, and
   that an unauthenticated entrypoint call is rejected.
9. **Verify:** run `scripts/verify.sh`, then **trigger the job for real** against the running app, trigger it
   a **second** time, and record with `scripts/verify.sh --observe "<expected>" "<observed>"` the row counts
   before/after each run (identical after the second) and the **quoted log line** with processed/skipped/failed.

## Guardrails
- No public, unauthenticated URL that mutates. No secret in the URL/query string — use a header.
- No unbounded batch. No time-based business rule hidden in a GET/RSC read path.
- No privileged DB writes without an audit row. Never log the cron secret.
- A job mutating money, PII, auth state or file access lands in `vantry.yml` `sensitive_paths`: the PR cannot
  merge without a committed `.vantry/reviews/<branch-slug>.security.json` with `verdict: pass`.

## A job that always fails must stop, loudly
At-least-once and retry-safety are handled above. The failure not addressed is the **poison message**: a job that
fails every time, retried forever, filling the queue and the logs while real work starves behind it.

- Every job row carries an **attempt counter**, incremented before the work, not after.
- A **max-retries** bound (5 is a reasonable default) with **exponential backoff and jitter** — constant-interval
  retries synchronise across workers and become a self-inflicted load test.
- On exhaustion the job moves to a **dead-letter** state or table. Never silently dropped, never retried again,
  and something alerts on a non-empty dead-letter.
- Retries are bounded in **time** as well as count: a payment retried successfully 40 minutes late can be worse
  than one that failed.

Prove it: enqueue a job that always throws, run the worker, and assert the attempt counter stops at the bound,
the row lands in dead-letter, and the queue drains.

## Done when
Entrypoint secret-guarded (with a named deny test); batch bounded; run observable; sensitive mutations audited;
a **fresh passing receipt** for this branch whose observation shows the **second run changed nothing** and
quotes the run's log line; `scripts/verify.sh` passes and CI re-runs the same contract. Delegate schema/RLS to
`rls-policy`/`safe-migration`.

## Stack notes — Vercel Cron / pg_cron / Inngest / BullMQ (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.

- Vercel Cron calls an HTTP entrypoint: guard it with a shared secret in a header, never by obscurity of path.
- `pg_cron` runs inside the database: the job has the database's privileges, so scope its role deliberately.
- Inngest / BullMQ give you retries and a dead-letter queue for free — use them rather than a retry loop you
  wrote, and make the handler idempotent because at-least-once delivery is the contract you actually get.
