# Merge policy

> PURPOSE: v1 conditioned "done" on "PR merged" and never said who merges or how — `gh pr merge` appeared
> nowhere in the repo. This file closes the loop: the delivery cycle is **implement → verify → PR → MERGE →
> reap**, and it ends here.

## Who merges

`vantry.yml`:

```yaml
merge:
  authority: human    # human | agent
  base: main
```

**Default `human`.** With `authority: human`, `.claude/hooks/bash-guard.sh` **denies** an agent's
`gh pr merge` outright. The agent's job ends at a green PR; the merge is a human decision because it is the
one action with no undo cheap enough to delegate.

Set `authority: agent` only when branch protection is on (see [branch-protection.md](./branch-protection.md))
— then the protected branch, not the agent's judgement, is what actually admits the change.

## Before merging — all of it, no exceptions

1. **A fresh passing receipt.** `.vantry/receipts/<branch-slug>.verify.json` has `verdict: "pass"` and its
   `tree_digest` matches the head commit. A receipt from three commits ago is stale, and stale is
   unverified. `scripts/verify.sh --status` says which.
2. **CI green** — all four `verify` jobs, plus the project's own. CI re-runs the contract and does **not**
   trust the local receipt; if CI and your machine disagree, CI is right.
3. **Evidence in the PR.** The `## Verification evidence` section states what was run and what was
   *observed*. "Tests pass" is not evidence.
4. **A committed security review** when the diff touches `vantry.yml` `sensitive_paths`:
   `.vantry/reviews/<branch-slug>.security.json` with `verdict: "pass"`. Receipts are machine-local;
   a judgement travels with the PR.
5. **One issue per PR.** The body ends with `Closes #NN`, the title is a Conventional Commit. A PR that
   closes two issues cannot be reverted cleanly and cannot be reviewed honestly.
6. **The Definition of Done is checked**, with every `N/A` carrying a one-line reason — and the Verification
   section carries no `N/A` at all.

If an override is in play (`.vantry/overrides/<branch-slug>.json`), it is named and justified in the PR
body. An override nobody reads is just a disabled gate.

## The merge

```bash
gh pr merge <number> --squash --delete-branch
```

Squash by default: one issue, one commit, one revert. Use `--merge` only where the branch's individual
commits carry meaning worth keeping.

## After merging — reap, then continue

Merged work that is not cleaned up becomes a stale worktree, a branch that looks active, and an issue that
looks open. **`/next` reaps this at step 0, before it decides anything** — but do it now if you are merging
by hand:

```bash
gh issue close <NN> --comment "Shipped in #<pr>"   # if Closes #NN didn't already
git worktree remove ../wt-<id>                     # parallel dispatch leaves one per issue
git worktree prune
git branch -d <branch>                             # --delete-branch handled the remote
```

Then move the issue to Done on the board and run `/next`. When the sprint's last issue merges,
`/sprint-review` closes the sprint — a review is a gate, not a stop.

## Don't

- Don't merge your own PR on a repo with more than one human, and never with `--admin`.
- Don't merge to get CI to run. CI runs on the PR.
- Don't merge a red PR "because the failure is unrelated". Fix the failure or record an override — those
  are the only two options, and one of them is written down.
