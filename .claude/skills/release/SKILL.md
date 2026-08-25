---
name: release
description: Cut a release from the Conventional Commits since the last tag — derive the version, generate the changelog, tag, deploy, then smoke the DEPLOYED environment with scripts/verify.sh --smoke. Use when shipping a version, tagging, or publishing. Trigger words — release, cut a release, version, semver, tag, changelog, publish, ship it, deploy a version.
---
# Release (version from the commits, verified against the deployment)

**Use when:** shipping a tagged version of the software. **Owners:** devops-engineer;
tech-lead-orchestrator approves. This is what the mandated **Conventional Commits** are *for* — they are the
input to the version and the changelog, not decoration.

## Inputs
The last tag, `git log <last-tag>..HEAD` with commit types intact, `vantry.yml` (`run.smoke`, `merge.base`),
and the deploy target.

## Procedure
1. **Confirm the head is verified.** `scripts/verify.sh --status` must show a **passing, non-stale** receipt
   for the exact commit you are about to tag. If it is stale or absent, run `scripts/verify.sh` — do not tag
   around it.
2. **Derive the version from the commit types** since the last tag, highest wins:
   `feat:` → **minor** · `fix:`/`perf:` → **patch** · `!` or a `BREAKING CHANGE:` footer → **major**.
   `chore:`/`docs:`/`test:`/`refactor:` alone → no release. The commits decide; you do not.
3. **Generate the changelog** from those same commits — grouped Features / Fixes / Breaking changes, each
   line the commit subject with its short SHA. Generated, never hand-written.
4. **Tag** the verified commit (`vX.Y.Z`, annotated) and push the tag. Tag `merge.base`, never a branch head
   that has not merged.
5. **Deploy** to the target environment and wait for it to be healthy.
6. **Verify the deployment, not your laptop.** Point the environment at the deployed URL/host and run
   `scripts/verify.sh --smoke`, then `scripts/verify.sh --observe "<expected>" "<observed>"` quoting what the
   live system actually did. **A release verified only on a laptop is not verified.**
7. **If the smoke fails, go to the `rollback` playbook immediately** — revert the deployment first, diagnose
   after. Do not "fix forward" on a broken release.
8. **Announce** the version and the changelog entry to whoever consumes it.

## Guardrails
- ❌ **Never tag an unverified commit** — no passing receipt, no tag.
- ❌ **Never hand-edit a released changelog entry.** It is a record of what shipped; correct it with a new
  release, not a rewrite.
- ❌ Never move or delete a published tag; ❌ never release straight from a feature branch.
- If `merge.authority: human`, the merge that produced this commit was a human's — releasing does not
  transfer that authority to you.

## Naming the deployed target
"Smoke the deployed environment" is unfalsifiable unless the command can be pointed at it — otherwise the
honest-looking path is a green LOCAL receipt with an observation asserting production, which nothing can
contradict. Give the contract an environment:

```yaml
# vantry.yml
run:
  smoke: pnpm exec playwright test tests/smoke.spec.ts   # honours PLAYWRIGHT_BASE_URL
```

```bash
VANTRY_TARGET=https://app.example.com \
PLAYWRIGHT_BASE_URL=$VANTRY_TARGET scripts/verify.sh --smoke
scripts/verify.sh --observe "the released version serves the core flow in production" \
  "https://app.example.com/orders/9f31 → 200, version header v2.4.0, console clean"
```

The observed string must name the **host it hit**. An observation that could have been written about localhost
is not evidence of a release.

## The deploy smoke is NOT the verification
`scripts/verify.sh --smoke` exercises the **deployed** environment. It skips test and build by design, and
since v3.15.0 it writes `kind: "smoke"` — a receipt the push gate **refuses**. That is deliberate: before this,
a deploy smoke wrote `kind: "verify"` to the same path with `verdict: "pass"`, and one smoke could stand in for
a full verification that never ran.

So the order is: a full `scripts/verify.sh` on the commit you are tagging, **then** deploy, **then**
`--smoke` against the deployed URL as evidence that the thing you shipped is alive. Two receipts, two
questions, and neither answers the other's.

## Done when
The version follows from the commit types, the changelog is generated from those commits, the tag points at a
commit with a passing receipt, the deploy is live, and `scripts/verify.sh --smoke` passed **against the
deployed environment** with an observation recorded.
