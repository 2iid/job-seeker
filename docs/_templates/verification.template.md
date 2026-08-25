<!-- TEMPLATE: filled by /bootstrap (from the plan) or /adopt (from the real repo).
     Write to docs/engineering/verification.md. Replace {{...}} and <fill:...>. Delete this comment. -->

# How to verify {{PROJECT_NAME}}

> PURPOSE: The human-readable source of `vantry.yml`'s `run:` block. This file answers *"how does a person
> actually run this thing and see it work?"* — the question nothing in v1 could answer, which is why the
> agent guessed a stack it didn't have. Every command here must be **copy-pasteable and true today**.
> When it drifts, `scripts/verify.sh` starts lying. Change this file and `vantry.yml` in the same commit.

## Install

```bash
{{INSTALL_CMD}}          # → vantry.yml run.install
```

Prerequisites: <fill: runtime + version, package manager, Docker/DB, anything a fresh clone lacks.>
Environment: <fill: which `.env` file, which keys are required to boot, where to get them.>

## Run it

```bash
{{START_CMD}}            # → vantry.yml run.start   (empty for a CLI or a library)
```

<fill: what comes up and where — URL, port, TUI, binary path. Note anything that must be running first
(database, queue, a seeded fixture).>

## The readiness signal

```bash
{{READY_CMD}}            # → vantry.yml run.ready
```

The single check that proves `start` really came up — polled for 90 s by `scripts/verify.sh`. It must fail
while the app is still booting, not just when the port is open. <fill: e.g. a `/api/health` returning 200,
a log line, a socket handshake.>

## The smoke command  *(mandatory)*

```bash
{{SMOKE_CMD}}            # → vantry.yml run.smoke
```

**This is the command that exercises the software the way a user does. A test suite is not a smoke run.**
`scripts/verify.sh` exits 2 if it is empty — verification would be undefined.

What it asserts:
1. <fill: the first user-visible outcome it proves.>
2. <fill: the second.>
3. <fill: the third.>

It must fail loudly on a broken build, a 500, an empty render, or a missing record — not merely on an
unhandled exception.

## Test credentials

<fill: the seeded accounts/roles used by the smoke run and by manual checks — how to create them
(`{{SEED_CMD}}`), where they live, which role each has.> **Never commit a real credential**; point at the
secret store or the seed script instead.

## Critical user flows

The 3–5 flows that define "the product works". If one of these breaks, the release is broken.

1. **<fill: flow name>** — <fill: entry point → steps → the observable outcome.>
2. **<fill>** — <fill.>
3. **<fill>** — <fill.>
<!-- keep to 5 at most; these are the flows the smoke run should cover first -->

## Where the logs are

- **App:** `{{LOG_PATH}}` — `vantry.yml` `run.logs`; `scripts/verify.sh` scans it for errors after the smoke run.
- **Tests / smoke:** <fill: reports, traces, screenshots — e.g. `playwright-report/`.>
- **Client-side:** <fill: browser console + network tab, or the equivalent for this project type.>
- **Production:** <fill: the hosted log/error destination, if any.>

## Known-flaky areas

<fill: the tests, timings, and third-party dependencies that fail for reasons unrelated to the change —
and the *known* workaround for each. Be honest here: an undocumented flake teaches the next agent to
ignore a red run, which is exactly how an unverified change reaches production.>

| Area | Symptom | What to do |
|---|---|---|
| <fill> | <fill> | <fill> |
