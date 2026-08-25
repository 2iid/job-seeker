---
name: rate-limit
description: Put a real server-side limit on an abusable operation — keyed on identity AND IP AND resource, enforced before the expensive work and before the auth check on credential routes, answering 429 + Retry-After without revealing whether the account exists, and never lockable by an attacker against a victim. Proven by an executed test that gets blocked. Use for login, signup, reset, OTP, search, export, upload, and any paid/LLM call. Trigger words — rate limit, throttle, 429, Retry-After, brute force, credential stuffing, abuse, quota, backoff, lockout, enumeration, DoS.
---
# Rate limit (a limit you can watch block a request)

**Use when:** any endpoint that is expensive, guessable, or enumerable — login, signup, reset, OTP/magic link,
invite, search, export, upload, webhook replay, and every LLM or paid third-party call.
**Owners:** backend-engineer, security-engineer (devops-engineer owns the edge/proxy layer).

## Inputs
The operation, what it costs (money, CPU, an SMS, a token bill), the legitimate peak for one real user, and the
abuse case from `threat-model`. The budget is a number you can defend, not a round guess.

## Procedure
1. **Write the budget per key class.** e.g. *login: 5 per identity / 15 min, 20 per IP / 15 min, 50 per tenant /
   hour.* If you cannot state the number, you cannot test it.
2. **Key on identity AND IP AND resource — never IP alone.** A city behind a mobile carrier NAT shares one
   address, so an IP-only limit throttles thousands of innocents; a distributed attacker holds thousands of
   addresses, so it stops none of them. The identity key (account, API key, tenant) bounds the attack; the IP key
   catches the unauthenticated flood; the resource key stops one hot object being hammered.
3. **Enforce server-side, before the expensive work** — before the query, the SMS, the model call, the file parse.
   Client-side throttling is a UX affordance, not a control. **On credential routes, check before the
   password/token comparison**, or the expensive verify *is* the attack surface.
4. **Use a token bucket** unless you have a reason not to: steady average, tolerant of the short burst real users
   produce, one counter plus one timestamp per key. A fixed window is cheaper but lets a 2× burst straddle the
   boundary; a sliding log is exact but stores every hit. Pick one, say which, and keep the counter in a **shared
   store** — a per-process map silently multiplies every limit by the instance count.
5. **Answer `429` + `Retry-After`,** a stable generic message, nothing else — **identical for a real account and a
   non-existent one**, same status, same body, same timing class. A limiter that only trips on real accounts is
   an account-enumeration oracle you built on purpose.
6. **Never let an attacker lock out a victim.** Do NOT disable or freeze an account because *someone* failed N
   logins against it — that is a denial-of-service any stranger can aim at any user knowing only their email.
   Throttle the *attempt source*, add friction the owner can pass (delay, CAPTCHA, step-up), and reserve a real
   lock for evidence of compromise plus a self-service recovery path.
7. **Log every trip** with key class, endpoint, and correlation id — never the credential, token, or full email.
   Alert when one endpoint's trip rate jumps (`observability-setup`); audit security-relevant trips (`audit-log`).
8. **Test — executed, not read.** Fire budget+1 requests and assert the last returns `429` with `Retry-After`;
   assert the counter is per key (user A blocked, user B still served); assert an unknown account gets the
   byte-identical response of a known one. A test asserting a config value is worth nothing.
9. **Verify:** run `scripts/verify.sh`, then hammer the real endpoint past the budget against the running app and
   record with `scripts/verify.sh --observe "<expected>" "<observed>"` the **request number that first returned
   429**, the `Retry-After` you got back, and that a second key was still served.

## Guardrails
- ❌ Per-IP-only limiting; ❌ in-process counters on a multi-instance deploy; ❌ client-side throttling as the control.
- ❌ A limiter that runs after the credential comparison on a login/reset/OTP route.
- ❌ Different status, body, or wording for existing vs unknown accounts; ❌ attacker-triggerable account lockout.
- ❌ "Rate limiting is enabled in the config" as evidence — the receipt must show a request that got blocked.
- A limiter on auth, payments, or PII lands in `vantry.yml` `sensitive_paths`: the PR cannot merge without a
  committed `.vantry/reviews/<branch-slug>.security.json` with `verdict: pass`.

## Two failures a 429 does not rule out
A run against a deliberately broken limiter passed every prescribed test: `budget+1 → 429`, one identity blocked
while another was served, and identical responses for known and unknown accounts. The limiter was still wrong in
the two ways this playbook's own guardrails name.

**1. The limit must be consulted BEFORE the expensive work.** A limiter checked after the password comparison
returns 429 and still performs the comparison — 40 blocked requests did 40 full bcrypt rounds, ~2s of CPU, which
is precisely the cost the limit existed to prevent. The check is the *first* statement in the handler, before
any hash, any query, any external call. Prove it by measuring, not by reading:

```
# time N blocked requests; the wall clock must be ~network cost, not N × hash cost
time (for i in $(seq 1 40); do curl -s -o /dev/null <endpoint>; done)
```
Record that number in `--observe`. If blocked requests cost the same as served ones, the limiter is decorative.

**2. The counter must be SHARED, or the budget multiplies by your instance count.** An in-process counter with a
budget of 5 serves 10 attempts behind two instances and 50 behind ten — and every single-instance test passes.
Prove it with two processes against one store:

```
# start two instances on different ports, one Redis/Postgres/store behind them
# send budget+1 requests ALTERNATING between them — the (budget+1)th must be 429
```
If you genuinely run one instance today, say so in the observation and name what breaks when you scale — do not
let a single-process test stand as proof of a distributed property.

## Done when
- A request over budget got a **429 with `Retry-After`**, and the receipt shows it.
- **Blocked requests are cheap**: the measured wall clock for N blocked requests is network-bound, not N × the
  cost of the work being protected — the number is in the `--observe` text.
- **The counter is shared**: budget+1 requests alternating across two instances produced a 429 — or the
  observation states plainly that this deploys as a single process and names what breaks on scale-out.
- Identities are isolated (one blocked, another served) and the response for an unknown account is
  byte-identical to a known one.
The budget per key class is written down; the check runs server-side before the expensive work and before the
credential comparison; the response is `429` + `Retry-After` and identical for unknown accounts; no path lets an
attacker lock a victim's account; and a **fresh passing receipt** for this branch whose observation names the
request number that was blocked and the `Retry-After` returned. `scripts/verify.sh` passes and CI re-runs it.

## Stack notes — Next.js + a shared counter store (illustration, not contract)
Middleware or the handler's first statement calls a token-bucket helper backed by Redis/Upstash (or a Postgres
counter row taken `FOR UPDATE`) keyed `rl:<op>:<user|ip|resource>`, returning status `429` with a `Retry-After`
header. An edge/WAF rule is a useful outer layer, never the only one — it cannot see your identity key. If
`CLAUDE.md` names a different stack, this section is void and the Procedure above still applies.
