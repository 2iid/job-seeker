---
name: dependency-upgrade
description: Upgrade dependencies in tiers — read the LOCKFILE diff, check advisories, security patches first, then minors, then majors one at a time — verifying after each tier. Use for any dependency bump, dependabot PR, or audit fix. Trigger words — dependency, upgrade, bump, dependabot, renovate, lockfile, npm audit, CVE, advisory, transitive, supply chain, outdated.
---
# Dependency upgrade (tiered, lockfile-first)

**Use when:** bumping any dependency, clearing a dependabot/renovate queue, or responding to an advisory.
**Owners:** devops-engineer; security-engineer reviews anything advisory-driven or touching
`sensitive_paths`. Nobody owns a transitive dependency by default — on this change, you do.

## Inputs
The manifest diff, the **lockfile diff**, the advisory feed (`npm audit` / `pip-audit` / equivalent), and the
upstream changelogs for anything crossing a major.

## Procedure
1. **Read the lockfile diff, not just the manifest.** One line in `package.json` can move forty transitive
   packages. Enumerate what actually changed — that is the real diff under review.
2. **Check advisories** for every package that moved, direct and transitive. Note which upgrades are
   *security-driven* (they jump the queue) and which are merely newer.
3. **Upgrade in tiers, one PR per tier:**
   a. **Security patches alone**, first, smallest possible bump — this PR must be mergeable in minutes.
   b. **Minors and patches** in a batch, grouped by ecosystem.
   c. **Majors one at a time.** Never two majors in one PR, never a major mixed with anything else.
4. **Read the changelog / migration notes** for every major and for any minor flagged as behaviour-changing.
   Quote the breaking changes you had to handle in the PR body.
5. **Verify after each tier** — `scripts/verify.sh` per PR, including the smoke run. The receipt's
   `tree_digest` covers the lockfile, so a further bump correctly invalidates it.
6. **Scan the new transitive surface**: a package that changed maintainer, gained install scripts, or newly
   appeared unrequested is a **supply-chain event** — investigate before merging, and escalate to
   security-engineer if anything looks off.
7. **Record what you skipped and why** (pinned for a known incompatibility, etc.) so the next upgrade does
   not re-litigate it.

## Guardrails
- ❌ **Never bulk-upgrade to green a dependabot dashboard.** A clean dashboard is not a goal; a working,
  verified system is.
- ❌ Never merge a lockfile change unverified — **a lockfile change IS a behavioural change** and owes a
  passing receipt like any other. It is not a `trivial_paths` file.
- ❌ Never widen a range (`^`/`~`) to dodge a conflict; ❌ never regenerate the lockfile from scratch to
  "clean it up" — that hides the diff you are supposed to be reviewing.

## Done when
- Each tier landed as **its own PR**, each with a passing receipt from `scripts/verify.sh` — and the software was
  **run**, not merely built: a transitive break shows up as a runtime `undefined`, never as a failed install.
- The **lockfile diff was read**, not just regenerated: `git diff -- <lockfile>` and the count of packages that
  changed is quoted in `--observe`.
- The audit is clean or explicitly deferred: `npm audit` / `pip-audit` / `cargo audit` / `govulncheck` (whichever
  this stack uses) exits 0, or each remaining advisory has a one-line reason and an issue id.
- Every **major** carried its upstream changelog's breaking changes, quoted in the PR body.
- **What you skipped is recorded**, with the reason and an issue — an unrecorded skip becomes a permanent one.

## Stack notes — npm / pip idiom (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.

- The lockfile is the artefact that matters: `package-lock.json`, `poetry.lock`, `Cargo.lock`, `go.sum`,
  `Gemfile.lock`. Upgrade through the tool that owns it; never hand-edit it.
- `npm audit` / `pip-audit` / `cargo audit` / `govulncheck` report *known* advisories only — a clean report is
  not a safe upgrade, it is an absence of published ones.
- A transitive break usually shows as a type error or a runtime `undefined`, not as a failing install. That is
  why the software has to be RUN, not just built.
