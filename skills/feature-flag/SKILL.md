---
name: feature-flag
description: Ship behind a flag correctly — default OFF, evaluated server-side, owned with a removal date, staged rollout with a metric and a kill switch, BOTH states verified, then the flag deleted. Use to merge incomplete or risky work without a long-lived branch. Trigger words — feature flag, flag, toggle, gradual rollout, canary, kill switch, dark launch, A/B, trunk-based, behind a flag.
---
# Feature flag (default off, both states verified, then deleted)

**Use when:** landing work that is not ready for everyone — risky changes, staged rollouts, or several
agents' parallel work merging into `merge.base` without long-lived branches. **Owners:** backend-engineer
(the flag's named owner); tech-lead-orchestrator owns the rollout decision. This is what makes `/next`'s
parallel dispatch land safely.

## Inputs
The behaviour being gated, who should see it and in what order, the metric that says it is working, and the
date by which the flag will be gone.

## Procedure
1. **Default OFF.** A missing, unreadable, or malformed flag value evaluates to off. Merging must change
   nothing for anyone until you turn it on deliberately.
2. **Evaluate server-side.** The server decides and sends the resolved outcome; **never trust the client** to
   evaluate a flag, and never ship the gated code path to a client that should not have it.
3. **Register the flag as a temporary object** — name, owner, created date, **removal date**, and the one
   sentence describing what deleting it will mean. A flag without a removal date is permanent dead weight.
4. **Roll out in stages** — internal → small cohort → percentage ramp → everyone. Each stage names **the
   metric to watch** and how long to watch it before advancing.
5. **Wire a kill switch** that returns everyone to the off path **without a deploy**, and confirm it works
   before the first real cohort.
6. **Verify BOTH states.** Run `scripts/verify.sh` with the flag off and again with it on, recording an
   observation for each. **A flag verified in one state is half verified** — the off path is what every user
   is on right now.
7. **Remove the flag** when the rollout completes: delete the flag, delete the dead branch of code, delete
   the registry entry, and verify again. That deletion is a normal change and owes its own receipt.

## Guardrails
- ❌ **Never nest flags.** Two flags gating each other is four states nobody tested; split the work instead.
- ❌ **Never use a flag to hide an unverified change.** Off is not a substitute for a passing receipt — a
  flagged change is verified in both states or it is not done.
- ❌ No flag on a security control or an authorization check — those do not get a "maybe".
- ❌ No client-evaluated flag deciding what data the server returns; ❌ no flag that outlives its removal date
  unrenewed.

## Recording both states
`--observe` writes ONE observation per receipt, so "verified in both states" cannot be two of them. Put both in
the single observed string, naming each explicitly:

```
scripts/verify.sh --observe "the export flow works with the flag off and on" \
  "OFF: /export returns the legacy CSV, 200, 1.2s. ON: /export returns the streamed CSV, 200, 0.4s, same row count."
```

A flag verified in one state is half verified, and the half you did not check is the one that ships to
everyone when you roll it out.

## Done when
The flag defaults off, is evaluated server-side, has an owner and a removal date on record, the staged plan
names its metric and kill switch, `scripts/verify.sh` recorded a passing observation in **both** the on and
off states — and, after rollout, the flag and its dead branch are deleted and verified gone.
