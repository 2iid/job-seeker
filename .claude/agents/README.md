# Roles

Specialist personas — adopt the one that fits the task (see [AGENTS.md](../AGENTS.md)).

- `agent-architect`
- `ai-integration-engineer`
- `backend-engineer`
- `content-marketer`
- `database-architect`
- `debugger`
- `devops-engineer`
- `frontend-engineer`
- `growth-strategist`
- `payments-engineer`
- `product-strategist`
- `qa-test-engineer`
- `security-engineer`
- `sprint-planner`
- `tech-lead-orchestrator`
- `ui-ux-designer`

## Frontmatter rules

`tools:` is a **whitelist** — a tool absent from it cannot be called. Every persona must list **`Skill`**,
or its "Skills you use" section is inert and no playbook it names will ever run.

Any persona with **`Write` or `Edit`** must list **`verify-change`** among its skills: if it can change the
software, it owes evidence that the software still works. No exemptions — copy and instrumentation ship to
users too. `scripts/validate-agents.sh` enforces both rules; a persona that breaks them fails the check.

**Model tier follows authority:** `opus` for roles that **decide or block** — tech-lead-orchestrator,
security-engineer, qa-test-engineer, **debugger** (it decides whether a failure is actually fixed),
database-architect, payments-engineer, product-strategist. `sonnet` for roles that **produce under a spec** —
backend, frontend, ui-ux, devops, ai-integration, sprint-planner, agent-architect, content-marketer,
growth-strategist.

**This list is checked.** `scripts/validate-agents.sh` requires every file in `agents/` to appear in the roster
above — a role that exists but is not listed is invisible to `/assemble-team`, which reads this file to know
what it may select. `debugger` was exactly that for two versions: shipped, referenced by `verify-change` as the
recipient of every FAILED verdict, and structurally unselectable.

## The two gates, and where a failure goes

`qa-test-engineer` is the **done** gate and `security-engineer` the **security** gate. Neither is ever pruned
from a project, and neither can be overruled by the role whose work it is judging.

A gate that can say **no** needs somewhere for the **no** to go, or the agent that wrote the bug ends up
diagnosing its own bug. Every `FAILED` or `CANNOT_VERIFY` verdict goes to **`debugger`**, which reproduces
before it fixes and keeps the regression test. `tech-lead-orchestrator`, `qa-test-engineer` and
`security-engineer` are the **non-prunable core**: an unused role is marked inactive, never deleted.
