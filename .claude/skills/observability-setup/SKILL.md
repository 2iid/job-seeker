---
name: observability-setup
description: Wire up production observability — error tracking, uptime checks, alerting, structured logs that never leak secrets/PII, a health endpoint, and dashboards. Use when adding monitoring, setting up on-call/alerts, chasing "we didn't know it broke", or hardening a service for launch. Trigger words — observability, monitoring, Sentry, alerts, uptime, health check, structured logs, SLO, on-call.
---
# Observability setup (errors / uptime / alerts / logs)

**Use when:** standing up monitoring for a service, or a failure went undetected. **Owners:** devops-engineer.
`vantry.yml` carries a free-text `stack:` naming the real stack; the **Stack notes** below are one
illustration of this contract, not the contract.

## Inputs
The deployed surfaces (web, API, cron, webhooks), the secrets/PII the app handles, the alert
recipients + channel, and the SLOs from `docs/engineering/*` (error rate, latency, uptime).

## Procedure
1. **Health endpoint FIRST:** one unauthenticated route returning `{ status, version, checks: { db, ... } }`
   with a **real dependency probe** (a cheap read against each hard dependency), not a static `ok`. It must not
   leak internals. Confirm it answers 200 healthy and **fails closed** (503) when a dependency is down. Declare
   it as `run.ready` in `vantry.yml` so every verification waits on the real thing.
2. **Error tracking:** install an error reporter in **every runtime the app executes in** (server, client,
   background worker, edge). Wire the release/version and upload symbol/source maps so a stack trace resolves
   to real lines. **Scrub PII before transmit** (strip emails, tokens, request bodies). Confirm a deliberate
   test error arrives in the dashboard, then remove the test throw.
3. **Structured logs:** log machine-readable records with a `level`, `event`, `request_id`, and safe context —
   **never** secrets, tokens, full card numbers, passwords, or other users' PII (grep the logger call sites to
   confirm). Ship them to the platform's log drain, not to a file nobody reads.
4. **Uptime:** an external check hitting the health route on an interval **from outside the app's own
   infrastructure**, and from a second region; alert on 2 consecutive failures (avoid single-blip noise).
5. **Alert set — wire each with an owner + channel:** failed-login spikes, authorization denials, webhook
   signature-verification failures, payment anomalies (unexpected refunds/chargebacks/amount mismatch),
   error-rate breach, latency-SLO breach. Prefer alerting on rate/anomaly, not every single event.
6. **Dashboards:** one ops board (error rate, p95 latency, request volume, uptime) + one security board
   (auth failures, authorization denials, webhook failures). Link both from `docs/engineering/`.
7. **Verify** each alert actually fires: trigger a synthetic breach in staging and confirm it reaches the
   channel. Run `scripts/verify.sh` — it executes the commands declared in `vantry.yml`, whatever the stack —
   and record with `scripts/verify.sh --observe "<expected>" "<observed>"` which alerts you tripped and where
   they landed. Add the health check's fail-closed behaviour to `vantry.yml` `acceptance:` as
   `AC-n | REQ-n | health returns 503 when the database is unreachable | <command>`.

## Guardrails
- Never send secrets/PII to a third-party monitoring service — scrub before transmit.
- Never let the health check or an error payload leak stack traces or internal hosts/config to the public.
- **Rate-limit the public health endpoint** and keep its probe cheap/cached — an unauthenticated route that
  hits the DB on every call is a small DoS/enumeration surface; gate any verbose build/version detail behind auth.
- Alerts must be actionable and owned; a noisy alert nobody acts on is worse than none — tune thresholds.

## Done when
Health endpoint live, probed, and declared as `run.ready`; the error reporter captures from every runtime with
PII scrubbed; logs structured and secret-free; uptime check + the full alert set firing to an owned channel
(each one tripped once and observed); ops + security dashboards linked in docs; a **fresh passing receipt**
whose observation names the alerts you actually saw arrive.

## Stack notes — Next.js on Vercel + Supabase (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.
- Step 1: `GET /api/health` at `app/api/health/route.ts`, probing Supabase with one indexed read.
- Step 2: **Sentry** with `sentry.client|server|edge.config.ts`; scrub in `beforeSend`; source maps uploaded
  at build so the release matches the deploy.
- Step 3: JSON to `console` — Vercel and Supabase both drain stdout; add the drain destination in project settings.
