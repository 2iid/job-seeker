---
name: rollback
description: Undo a bad change safely — decide revert vs forward-fix on evidence, check whether the migration is even reversible before promising anything, tell the people affected, verify the rollback itself, and write the incident note. Use when a deploy broke production, a merge regressed users, or a change must come out. Trigger words — rollback, roll back, revert, undo the deploy, hotfix, incident, production is broken, forward fix, outage.
---
# Rollback (revert or forward-fix, decided on evidence)

**Use when:** a shipped change is hurting users or must come out. **Owners:** devops-engineer,
tech-lead-orchestrator. Route the cause hunt to `debug-issue` — this playbook is about stopping the bleeding.

## Procedure
1. **Decide revert vs forward-fix, and write the reason down.**
   **Revert** when users are affected **now** and the cause is unclear — recovery time must not depend on
   understanding. **Forward-fix** when the cause is understood, the fix is small, and you can test it in
   minutes. Undecided after five minutes = revert; you can always re-land it.
2. **Check migration reversibility BEFORE you promise a rollback.** An **additive** migration (new table, new
   nullable column, new index) is revertible. A **destructive** one (drop, rename, narrowing type, a backfill
   that overwrote values) is **not** — the code rolls back, the data does not. State which case you are in,
   out loud, before anyone plans around it.
3. **Execute as a new commit.** `git revert <sha>` on a branch off `merge.base`, then the normal PR path.
   Never rewrite shared history to make a change disappear.
4. **Tell people, twice at minimum** — at the start (who is affected, what you are doing, ETA) and at recovery.
   Silence during an incident costs more trust than the bug did.
5. **Verify the rollback — it is a change.** Run `scripts/verify.sh`, then
   `scripts/verify.sh --observe "<expected>" "<observed>"` recording that the reported symptom is gone. A
   revert that was never run is exactly the failure mode you are recovering from.
6. **Write `docs/ops/incidents/<YYYY-MM-DD>-<slug>.md`:** timeline with absolute times, user impact, the cause,
   what you did, and — the only section that pays for the rest — **what would have caught this**. Turn that
   answer into a backlog issue: a step added to `run.smoke`, a regression test, an alert.

## Guardrails
- Never force-push a shared branch to undo something — revert forward, always.
- Never revert a migration by hand-editing a shipped one; write a new, additive migration (`safe-migration`).
- Never skip the incident note because "it was quick" — the cheap incidents are the ones that repeat.

## When the rollback cannot produce a passing receipt
This is an incident playbook, and in an incident the revert frequently **cannot** verify: the suite is red for
an unrelated reason, the environment is degraded, the thing you are reverting is what the smoke run exercises.
A walk hit exactly that and found the playbook named no route out — `VANTRY_SKIP_GATE` and `git push --no-verify`
are both denied to an agent by `.claude/hooks/bash-guard.sh`, so you learn the answer only by tripping the gate.

**The sanctioned route is the committed override**, and it exists for this:

```bash
scripts/verify.sh --override "reverting <sha>: <what is broken in production>. Suite red on <reason>, unrelated to this revert."
git add .vantry/overrides/ && git commit -m "chore: record verification override for the rollback"
git push
```

Three things make it the right instrument rather than a bypass:
- the reason is **committed**, so it travels with the PR and a human reads it;
- CI still re-runs the contract and still reports;
- the gate refuses an override that is **not** committed — an untracked one blocks the push.

Use it **only** when you cannot verify, never to save time. Then open the follow-up issue in the same breath:
the override is a debt with a name on it, and `/sprint-review` will surface it.

## Done when
- Production is back to the known-good behaviour, and you **observed** it — not inferred it from a green deploy.
- The revert is a **new commit** (`git revert`), never a force-push over history.
- Either `scripts/verify.sh` wrote a passing receipt, **or** a committed `--override` records, in one line, why
  verification was impossible during the incident.
- A follow-up issue exists for the real fix, and for any override that was used.
- The incident note says what broke, what you saw, what you reverted, and how long it took.
The revert-vs-forward-fix decision and its reason are recorded; migration reversibility is stated explicitly;
the change landed as a new commit (no rewritten history); `scripts/verify.sh` wrote a **pass** receipt with an
observation that the symptom is gone; people were told at start and at close; the incident file exists with
timeline, cause and "what would have caught it"; and that answer is filed as an issue.
