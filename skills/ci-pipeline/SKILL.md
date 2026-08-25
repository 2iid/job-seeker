---
name: ci-pipeline
description: Create or optimize a GitHub Actions CI pipeline that is fast, reliable, and BUDGET-AWARE (the free 2000 Actions minutes/month). Use when setting up CI, adding a workflow, or a pipeline is slow/expensive/duplicated. Trigger words — CI, GitHub Actions, workflow, pipeline, minutes, .github/workflows.
---
# CI pipeline (optimized, minutes-aware)

**Use when:** setting up or tuning GitHub Actions. **Owners:** devops-engineer. Goal: every gate green to
merge, while conserving the free **2000 minutes/month**.

## Procedure
1. **Triggers — conserve the free minutes.** Use `pull_request` (every PR gets the cheap gates) + `push` to
   your **explicit production/promotion branch** — the branch you merge to ship, commonly `main`. This is a
   **deliberate choice and may NOT be the repo's default branch** (a project can develop on `feature` and
   promote to `main`). Do **not** trigger on every feature-branch push — that is what drains the free
   2000 min/month. Set the prod branch explicitly; don't auto-derive it from the repo default.
2. **Concurrency — cancel superseded runs:**
   a `concurrency:` block keyed on the workflow and ref (block style — the flow form
  `{ group: ${{ … }} }` is not valid YAML, and GitHub rejects the whole file).
3. **Split fast vs slow to protect the budget.** Cheap gates (lint, typecheck, unit) on every PR via
   `pull_request`. Heavy + security jobs (e2e/Playwright, pgTAP/RLS, full build) run at the **prod-gate push**
   (and, if desired, on PRs *into* the prod branch) — so the expensive suite runs at promotion, not on every
   feature commit. Use `needs:` so slow jobs skip when fast ones fail; `fail-fast: true`, minimal matrices.
   **Conscious tradeoff:** gating the RLS/security suite at the prod branch catches issues *before prod* but
   *later* than per-PR — if the minute budget allows, also run the (cheap) RLS allow/deny on PRs, since they're
   the security backstop. The only real anti-pattern is a **dead gate**: a branch condition that never actually
   receives the promotion merge, so the suite runs nowhere. `main`-as-prod-gate is correct and intentional.
4. **Cache aggressively** — package manager store (pnpm/npm), Prisma/ORM client, Next/build cache,
   Playwright browsers. Pin action versions.
5. **Prefer free binaries over paid marketplace actions** (e.g. the gitleaks binary, not the org-licensed
   action). `permissions:` least-privilege (`contents: read` unless more is needed).
6. **Minimal checkout** (`fetch-depth: 1`) except where full history is required (secret scanning).
7. **Offload what Actions shouldn't do:** enable GitHub-native **Secret Scanning + Push Protection**
   (Settings → Code security) so it doesn't consume Actions minutes.
8. **Verify** the workflow on a branch; confirm the gates match `docs/engineering/definition-of-done.md`.

## Reference skeleton
```yaml
# <prod> = the branch you promote to production (often main). It need NOT be the repo default branch.
on: { pull_request: {}, push: { branches: [<prod>] } }
concurrency:
  group: "${{ github.workflow }}-${{ github.ref }}"
  cancel-in-progress: true
permissions: { contents: read }
jobs:
  verify:            # fast gate, EVERY PR (cheap → runs often)
    steps: [checkout, setup+cache, lint, typecheck, unit]
  gate:              # heavy + security, only at the prod-gate push (conserves minutes)
    if: github.ref == 'refs/heads/<prod>'
    needs: verify
    steps: [build, rls-tests, e2e]
```

## Guardrails
- Never run the full matrix on every commit "to be safe" — it silently drains the free 2000-min budget; run
  the expensive suite at the prod gate, not per feature push.
- Choose the prod-gate branch **deliberately** (often `main`, may differ from the repo default). Avoid a
  **dead gate** — a branch condition that never receives the promotion merge, so the suite runs nowhere.
- Never store secrets in the workflow; use repo/environment secrets.

## Two GitHub Actions traps that produce a gate nobody can satisfy
Both of these shipped in this kit and were found in a real project, not by reading.

**1. `on: pull_request:` does not include `edited`.** The default types are
`opened`, `synchronize`, `reopened`. So a check that reads the PR body — an evidence block, a checklist, a
ticket reference — fails on a PR with no body, and then **never re-runs when the body is written**. Worse,
"Re-run jobs" replays the *frozen* event payload, so the empty body comes back forever. The gate demands a
proof and refuses to look at it, and nothing in the failure message tells you the only ways out are to push a
commit or reclose the PR.

Fix it on both sides, because each closes a different half:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]   # the edit case
```
```bash
# the re-run case: read it NOW, not as it was when the event fired
BODY="$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" --jq '.body // ""')"
```
The same staleness applies to **every** `github.event.*` value — a head SHA, a label, a base ref. If your check
is about the *current* state of the PR, ask the API for it.

**2. A ternary whose true-branch is falsy always yields the other side.** GitHub Actions has no real ternary:
`A && B || C` is `B` when both `A` and `B` are truthy, and `C` otherwise. So this,

```yaml
node-version: ${{ hashFiles('.nvmrc') != '' && '' || '20' }}   # ALWAYS '20'
```

pins everyone to 20 — and because `node-version-file` was set too, `setup-node` resolved the conflict by
**ignoring the file, silently**. A repo pinning Node 18 got 20 with no warning. Never write a ternary whose
true-branch is `''`, `0` or `false`. Use two steps with mutually exclusive `if:` instead.

`scripts/test/run-all.sh` now fails on both patterns, so neither can come back.

## The security job is not optional
A pipeline that runs tests and skips the sensitive-path gate is the expensive half of CI. Keep the job that
intersects the diff with `vantry.yml` `sensitive_paths` and fails a PR that touches one without a committed
`.vantry/reviews/<slug>.security.json` — it is three lines and it is the only thing standing between an auth
change and a merge.

## Done when
- A run is **green**, and you looked at it: `gh run list --limit 1` shows `success` for the workflow you changed.
- `.github/workflows/verify.yml` still re-runs the contract — `bash scripts/verify.sh --ci` — and the
  **sensitive-path job is present**: a pipeline that runs tests and drops that job is the expensive half of CI.
- `concurrency.cancel-in-progress` is set, so a force-push does not pay twice.
- Dependency caching is on for the package manager this project uses.
- The heavy suite runs at the **explicitly named** prod-gate branch, never one auto-derived from the ref.
- The measured cost fits the budget: read `gh api /repos/:owner/:repo/actions/runs --jq '.workflow_runs[0]'` or
  the Actions usage page, and quote the minutes-per-PR figure in `--observe`.
