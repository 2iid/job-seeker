# Branch protection

> PURPOSE: The hooks stop the agent on your machine; branch protection stops **everything else** — a
> force-push, a web-UI edit, a second clone with `core.hooksPath` unset, a well-meaning collaborator. It is
> the last layer and the only one an agent cannot reach. Set it once, on day one.

## What must be required

Four checks, all from `.github/workflows/verify.yml`, by their job **display names**:

| Check | Fails when |
|---|---|
| `contract is valid` | `vantry.yml` is malformed or `run.smoke` is empty |
| `re-run the verification` | CI's own run of the contract does not pass — the local receipt is never trusted |
| `PR states its evidence` | the PR's `## Verification evidence` section is empty |
| `sensitive paths need a security review` | the diff touches `sensitive_paths` with no committed `.vantry/reviews/<slug>.security.json` |

Plus **code-owner review**, which is what routes a sensitive diff to a human.

## The call

Run once per repository, from the repo root. Replace `main` if `merge.base` in `vantry.yml` differs.

```bash
gh api --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/{owner}/{repo}/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "contract is valid",
      "re-run the verification",
      "PR states its evidence",
      "sensitive paths need a security review"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
```

`gh` substitutes `{owner}`/`{repo}` from the current repo. Every top-level key must be present — the API
treats an omitted key as "disable this", so a partial payload silently loosens protection.

Verify it took:

```bash
gh api "repos/{owner}/{repo}/branches/main/protection" \
  --jq '{checks: .required_status_checks.contexts, codeowners: .required_pull_request_reviews.require_code_owner_reviews, admins: .enforce_admins.enabled}'
```

## CODEOWNERS

`require_code_owner_reviews` does nothing without a `.github/CODEOWNERS`, and **that file is generated —
never hand-edited**:

```bash
scripts/gen-codeowners.sh @your-handle          # or @org/security-team
```

It reads `sensitive_paths` from `vantry.yml`, so "sensitive" has exactly one definition feeding three
consumers: the CI security job, the local gate, and this human review routing. Change `vantry.yml`, re-run
the script, commit both. Hand edits are overwritten on the next run.

## Notes

- **`enforce_admins: true` is not optional.** The owner is the person most likely to be in a hurry, and an
  admin bypass is how the gate stops meaning anything.
- **`strict: true`** forces a branch to be up to date with the base before merge, so the checks ran against
  the code that will actually land.
- Private repos on the free plan cannot use branch protection. Either make the repo public, upgrade, or
  accept that `.githooks/pre-push` is your outermost layer — and say so in the README.
- Rulesets are the newer API. This classic-protection call is kept because it is one call, works on every
  plan that supports protection at all, and is trivially auditable.
