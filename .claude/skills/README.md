# Skill Library

Reusable, verification-first **skills** that make the specialist agents faster and more reliable. A skill
encodes the *best procedure* for a recurring task, with the checks baked in — so quality doesn't depend on
an agent re-deriving it each time.

## Agents vs Skills vs Commands
- **Agent** (`agents/*.md`) — a persona (who): responsibilities + judgment.
- **Skill** (`skills/<name>/SKILL.md`) — a procedure (how): auto-invoked when a task matches its
  `description`. Any agent can use any skill.
- **Command** — a user-typed `/shortcut`. On Claude Code a skill IS the command: `/next` resolves to
  `skills/next/` via the mirror in `.claude/skills/`. On other agents, invoke the same playbook by name
  ("follow the `next` playbook from `skills/`"). There is no separate commands directory.

## Catalog

Every build playbook states an **invariant contract**, then closes with a
`## Stack notes — <name> (illustration, not contract)` block. When `vantry.yml`'s `stack:` names something
else, that block is void and the procedure above it still applies. A Go team gets a true document, not a
Next.js one with an apology at the top.

| Skill | Use for | Primary agents |
|---|---|---|
| `rls-policy` | Row authorization at the DATA layer, deny-by-default, with an **executed** allow AND deny test | security, database |
| `safe-migration` | A schema change the safe way: additive-first, never edit a shipped migration, policy + test in the same PR | database |
| `threat-model` | STRIDE threat model for a feature | security |
| `vulnerability-scan` | Known CVEs in dependencies on ANY stack — native tools plus OSV.dev; blocks only what a change introduced | security, devops |
| `security-review` | Audit a diff vs OWASP + project guardrails | security |
| `api-endpoint` | A server entry point: validate at the boundary, re-check authz server-side, shared error shape, allow+deny test | backend |
| `webhook-handler` | Signature verify + idempotency + state machine + audit | payments, backend |
| `background-job` | Idempotent scheduled/queued job with audit | backend, devops |
| `llm-feature` | LLM feature: provider abstraction + context scoping + injection defense + cost caps | ai-integration |
| `ui-component` | Accessible, mobile-first, i18n, state-complete component | frontend |
| `design-review` | Audit UI for WCAG AA + responsive + tokens + states | ui-ux, frontend |
| `write-tests` | Meaningful unit/integration/e2e (+ failure modes) | qa |
| `code-review` | Review a diff for correctness bugs + reuse/simplification | all |
| `verify-change` | Run the app and confirm behavior (not just tests) | qa, all |
| `ci-pipeline` | A CI pipeline that is fast and budget-aware, and re-runs the verification contract | devops |
| `observability-setup` | Error reporting, uptime, alerts, structured logs that leak nothing | devops |
| `decompose-feature` | Feature → atomic issues appended to `scripts/kanban/issues.csv` | tech-lead |
| `write-adr` | Turn a decision into an ADR | tech-lead |
| `autopilot` | **The green light** — work the backlog to completion, decide without asking, log every decision | tech-lead |
| `refine-idea` | A vague idea → a precise, executable brief (the front door) | product-strategist |
| `analyze-requirements` | Obligations, unit economics, a `REQ-###` per MUST | product-strategist |
| `bootstrap` | Greenfield inception: docs + team + backlog + sprints + board, one pass | tech-lead, sprint-planner |
| `kickoff` | **Alias of `bootstrap`** — routes the word, produces nothing itself | — |
| `adopt` | Brownfield: read-only audit → stabilize-first backlog | tech-lead, security |
| `assemble-team` | Select the roles that fit, forge the gaps, prune the rest | agent-architect |
| `forge-agent` | Create a new senior specialist that meets the quality floor | agent-architect |
| `standup` | Status across the board, read from the repo not from memory | sprint-planner |
| `sprint-review` | Close a sprint on a mechanical Definition of Done | sprint-planner |
| `refine-backlog` | Re-groom and refill the next sprint while backlog remains | sprint-planner |
| `gtm-plan` | Shipped → users & revenue: positioning, ICP, channels, pricing, AARRR | growth-strategist |
| `launch-kit` | The launch assets, one per channel the plan actually chose | content-marketer |
| `growth-review` | Judge the experiments, log them, file the next work as issues | growth-strategist |
| `originality-check` | Prior-art check on a name/brand/UI/concept so you never ship a clone | product, content, all |

### Before a line of code (v3)
| Skill | Use for | Primary agents |
|---|---|---|
| `analyze-requirements` | Obligations (what you are REQUIRED to do), unit economics, and a REQ id on every MUST | product, security |

### Security surfaces the kit used to demand and never teach (v3)
| Skill | Use for | Primary agents |
|---|---|---|
| `audit-log` | What a defensible audit row contains, what must never be in it, and why it ships in the same transaction | security, backend |
| `rate-limit` | Per-identity limits before the expensive work, a 429 that leaks nothing, proven by an executed test | security, backend |
| `auth-boundary` | The seam the identity provider does NOT own: tenant mapping, idempotent provisioning, redirect allowlist, session revocation | security, backend |

### When something goes wrong (v2)
A gate that can say **no** needs somewhere for the **no** to go. These close the loops the gate opens.

| Skill | Use for | Primary agents |
|---|---|---|
| `debug-issue` | Reproduce → narrow (`git bisect`) → fix the cause → keep the regression test | debugger, all |
| `flaky-test` | Confirm the flake rate, quarantine with an owner and a deadline, fix the cause | qa, debugger |
| `rollback` | Revert vs forward-fix, migration reversibility, the incident note | devops, debugger |
| `perf-profile` | Measure → profile → fix one thing → measure again, against a budget | devops, backend |
| `refactor-safely` | Characterisation tests → seam → strangler-fig → prove equivalence | all |

### Shipping and staying shipped (v2)
| Skill | Use for | Primary agents |
|---|---|---|
| `pickup-issue` | Start one issue properly: branch, criteria, contract, verify, PR | all |
| `handoff` | Write `docs/planning/PROJECT-STATE.md` so the next session starts warm | tech-lead, all |
| `release` | Version from the commits, changelog, tag, deploy, verify **in prod** | devops |
| `feature-flag` | Merge behind a flag, roll out in stages, verify BOTH states, then delete it | backend, frontend |
| `dependency-upgrade` | Read the lockfile diff, upgrade in tiers, verify each tier | devops, security |
| `data-backfill` | Batched, resumable, idempotent, dry-run first, reconcile at the end | database |

## Delivery & project management (the `/`-commands you drive the project with)
These are **user-invoked** commands (you type them), not auto-invoked build playbooks. Together they are the
**continuous-flow** delivery loop — throughput-based, never time-boxed: when a sprint's Definition of Done
passes, the next one starts immediately (see `agents/sprint-planner.md`).

| Command | What it does | When to run it |
|---|---|---|
| `/refine-idea` | Fuzzy idea → an **executable brief** via a short expert interview (front door to `/bootstrap`) | Before building — the idea isn't crisp yet |
| `/bootstrap` | Idea → full `CLAUDE.md` + `/docs` + assembled team + atomic backlog + sprint plan (S1 ACTIVE) + board, one pass (`/kickoff` = alias) | Starting a new project |
| `/adopt` | **Existing** codebase → deep multi-agent audit → `CLAUDE.md` from real code → stabilize-first backlog + board (brownfield counterpart to `/bootstrap`) | Onboarding a project that already has code |
| `/next` | Reconciles merged/open PRs first, then hands you the next unblocked issue of the **ACTIVE** sprint — or **fans out** the independent ones in parallel (own worktree each, cap from `vantry.yml dispatch.max_parallel`, default 2) | After each finished issue |
| `/sprint-review` | Quality **GATE** at a sprint boundary: verify the DoD, log a retro, mark the next sprint ACTIVE | When a sprint's work is done |
| `/refine-backlog` | Groom the backlog + slice the next sprint from it (unscheduled → `Backlog`, never empty); **keeps the loop fed** | When a sprint closes with backlog left |
| `/standup` | PM status snapshot: shipped / in-progress / blocked / next / % progress | Any time you want status |

## Team assembly (fit any stack — web, mobile, game, data, embedded)
The kit isn't web-only. The `agent-architect` puts the right senior team on any project — and **forges** what's missing.

| Command | What it does | When to run it |
|---|---|---|
| `/assemble-team` | Select the core agents the project needs + forge specialists for gaps (Flutter, Unity, Solidity, ML, …) + prune | At kickoff, once the stack is known |
| `/forge-agent` | The agent **builder**: mint one senior specialist (+ its skills) on demand | When the roster lacks the expertise a project needs |

## Growth & go-to-market (the "after" — turn the build into users & revenue)
The post-build half of the lifecycle, owned by `growth-strategist` + `content-marketer`. It mirrors the delivery
loop and **feeds learnings back into the same backlog** (growth issues → `/next`).

| Command | What it does | When to run it |
|---|---|---|
| `/gtm-plan` | Positioning · ICP · ranked channels · pricing · launch plan · 90-day plan · AARRR metrics | When the product works and you need users |
| `/launch-kit` | The concrete launch assets — landing copy, Product Hunt, build-in-public thread, Reddit/HN, welcome emails — channel-tuned | At launch (or relaunch) |
| `/growth-review` | The growth `/sprint-review`: judge experiments (keep/kill), log them, file learnings as backlog issues | Periodically after launch |

## Authoring convention (every skill follows this)
```
---
name: <kebab-name>
description: <one line — WHAT it does + WHEN to use it, with trigger words; this drives auto-invocation>
---
# <Title>
**Use when:** … **Owners:** <agents>
## Inputs        — what the skill needs to start
## Procedure     — numbered, deterministic steps with VERIFICATION baked in
## Guardrails     — never-do list (security, secrets, scope)
## Done when     — a checklist that defines success
```
Principles: **verification-first** (a skill that writes code also writes/updates its test); **stack-aware**
(default profile = Next.js + Supabase/Prisma; frame stack-specifics as "on the default profile — adapt to
the project's actual stack per CLAUDE.md"); **concise** (progressive disclosure — link to `/docs`, don't
inline everything); **secure-by-default** (server-authoritative validation, RLS where a row-secure DB is
used, no secrets). `/bootstrap` keeps the skills relevant to the chosen stack and prunes those a project
doesn't need.
```

## House shape — and its one exemption
Every playbook carries `**Use when:**` · `## Procedure` · `## Guardrails` (or `## Don't`) · `## Done when`, and
its `## Done when` names a command, a file or a count — never only prose.

**`kickoff` is exempt**: it is an alias that routes the word `/kickoff` to `/bootstrap` and produces no artefact
of its own. It is the only file in this directory that may skip the shape, and it is listed here so a shape
checker can skip it rather than a reader assuming the rule is soft.
