# Strictness levels

> PURPOSE: `vantry.yml`'s `strictness:` key decides how hard the verification gate bites. There are three
> levels and no others. Pick the one that matches where the project actually is — a gate that is too tight
> for the repo does not raise quality, it gets deleted.

## The three levels

| | **relaxed** | **standard** *(default)* | **strict** |
|---|---|---|---|
| **Who it is for** | brownfield day one, prototypes, spikes | any project with a working `run.smoke` | production, money, PII, multi-agent fan-out |
| `gates.verify_change` | `warn` | `block` | `block` |
| `gates.security_review` | `warn` | `block_on_sensitive` | `block` |
| `gates.code_review` | `off` | `warn` | `block` |
| `gates.design_review` | `off` | `warn` | `block` |
| **Observation** | optional | recommended | **mandatory** — `--observe` required before the receipt counts |
| **pre-commit** | secret scan only | secret scan only | secret scan **+ the gate** |
| **pre-push** | warns, lets the push through | **blocks** the push | **blocks** the push |
| **CI** | reports | fails the PR | fails the PR |
| **Override** | not needed | `--override "<why, ≥20 chars>"`, committed | same, and it must be named in the PR body |
| `dispatch.max_parallel` | 1 | 2 | 4 (only with `gates.subagent_verify: block` and one worktree per subagent) |
| `merge.authority` | `human` | `human` | `human` |

The receipt is written identically at every level. Strictness changes **who is stopped**, never what is
recorded — so raising the level never invalidates yesterday's evidence.

## The two ramp rules

**`/adopt` ALWAYS starts `relaxed`.** A brownfield repo cannot pass a strict gate on day one: there is no
smoke command, the tests are amber, the build warns. Forcing `block` on day one guarantees the gate gets
deleted in week one, and a deleted gate protects nothing. Start at `relaxed`, let it *warn*, and let the
warnings tell you what to fix first.

**`/bootstrap` starts `standard`.** A greenfield project defines `run.smoke` before it has any code to
break, so there is no reason to run unguarded.

**Ramp `relaxed` → `standard` as soon as `run.smoke` is filled in and has passed once.** That single green
smoke run is the whole entry criterion. Do not wait for the backlog to be clean — the gate is what keeps
it clean.

Ramp `standard` → `strict` when the change costs real money or touches real user data, or when you start
fanning work out to parallel subagents (an unobserved change is far more expensive when four agents ship
at once).

## Instrumentation — read the ratio, not the excuses

Count the committed overrides in `.vantry/overrides/` against the blocks the gate issued.

**An override-to-block ratio above 20% means the contract in `vantry.yml` is wrong, not that people are
cheating.** A gate that has to be bypassed one time in five is measuring the wrong thing: usually
`run.smoke` is too slow, too flaky, or asserts something the team does not actually care about. Fix the
contract, not the humans. Every override is a bug report against `vantry.yml`.

Below 20%, read the override *reasons* instead of the count — they name the next thing to automate.

## Changing level

```bash
$EDITOR vantry.yml          # strictness: standard
scripts/validate-config.sh  # the contract must still be valid
scripts/verify.sh --status  # confirm the gate now reports what you expect
```

Commit the change on its own, with a message that says why. A strictness change is a policy decision and
belongs in the history where the next person can find it.
