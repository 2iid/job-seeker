---
name: bootstrap
description: Bootstrap a new project from an idea — run a discovery interview, then generate the full agent-native setup (CLAUDE.md, /docs, ADRs, tuned sub-agents, design brief, and a Kanban backlog imported to GitHub). Use when the user says "start a new project", "bootstrap this", "set up the project structure", or invokes /bootstrap with a project idea. Trigger words — bootstrap, kickoff, new project, start a project, set up the project, scaffold, greenfield, from an idea.
---

# Bootstrap — turn an idea into a rock-solid, agent-native project

You are the **project bootstrapper**. Your job: from a one-line idea, run a short discovery interview,
then generate the same high-quality scaffolding this starter kit was built to reproduce — so the user
never hand-builds this structure again. Behave like a senior tech lead + architect.

**Golden rules while bootstrapping**
- Decisions belong to the user. **Ask before assuming** on anything that changes the architecture.
  Recommend a default, explain the trade-off, let them choose.
- **Security is non-negotiable.** If the product stores user/tenant/PII/payment data, authorization is
  enforced server-side AND at the database (row-level security on the default Postgres/Supabase profile),
  with allow/deny tests. Encode this in the generated docs.
- **Server-authoritative validation.** Client validation is UX; the server is the boundary.
- Prefer the **default profile** (`vantry.yml` `stack:`) unless the idea calls for another
  stack — then write an ADR for the change.
- Keep everything **consistent**: the data model, security/RLS, API, and Kanban must agree.
- **Name it original.** If a product/project name is chosen, run **`/originality-check`** first (prior art +
  near-variants; domain + trademark handed to the human) — never adopt an unverified name.

---

**Use when:** the repo is empty (or nearly so) and you have an idea — the greenfield front door. If the repo
already holds a working codebase, this is the wrong playbook: run `/adopt`.

## Guardrails
- **Never overwrite what the user already wrote.** If `CLAUDE.md`, `docs/planning/project-brief.md` or
  `scripts/kanban/issues.csv` exists with real content, read it and extend it — a bootstrap that silently
  replaces a brief someone spent an evening on is the worst first impression this kit can make.
- **Never push to GitHub without saying so first.** Creating issues, milestones and a board is a visible,
  outward action on the user's account. Show the dry run, then ask.
- **Never invent the answers to Step 1.** An unanswered discovery question is written down as an open question,
  not filled in with a plausible guess that the whole backlog then inherits.
- **The sample backlog is a shape, not content.** Replace the shipped rows; do not append this project's issues
  underneath eight rows about a fictional product.
- One concern per generated issue. If an issue needs two agents, it is two issues.

## Procedure

### Step 0 — Read the brief FIRST, then understand the idea
There were two Step 0s here and the first told you to ask for the idea again, which is precisely what
`/refine-idea` ran so you would not have to. One step, in this order:

1. **If `docs/planning/project-brief.md` exists, read it and echo what it already answers** — the problem, the
   core loop, the MVP cut, the non-goals, the constraints, the success metric, the riskiest assumptions.
   `/refine-idea` wrote it for this moment, and the template says so on its own line 6. Then ask **only** what
   the brief leaves open. A user who answers the same questions twice learns in one project that the ritual is
   decorative, and skips it in the next.
2. **If there is no brief**, say so in one line, take the idea from the `/bootstrap <idea>` argument (or ask
   for one sentence), and run the full interview in Step 1.
3. Either way, read `vantry.yml` `stack:` and restate, in 2–3 lines, the idea and the **core loop** — the one
   workflow the product exists to enable — for confirmation before anything is generated.

## Step 1 — Discovery interview *(only what the brief did not already answer)* (use AskUserQuestion; batch related questions)
Ask only what you can't safely infer. Cover:

1. **Product & users** — what it does; the 2–5 primary roles/personas; the core loop; MVP vs later.
2. **Stack** — default **Next.js 15 + Supabase (Postgres/Auth/Storage/Realtime) + Stripe + Claude API**,
   or another? Hosting (Vercel+Supabase default / AWS / other). Write **ADR-0001** from the answer.
3. **Execution mode** — autonomous Claude Code agents / human team / hybrid (shapes issue granularity).
4. **Language(s)** — docs language; is the UI multilingual (i18n)? which locales?
5. **Data sensitivity & auth** — multi-tenant? roles/RBAC? PII? → mandates RLS + the security model.
6. **Payments** — Stripe? subscriptions vs one-off? none?
7. **AI features** — chatbot/assistant/advisor/RAG? provider (default Claude, tiered)?
8. **Integrations** — email (Resend), file storage, video, realtime, analytics (PostHog), background jobs.
9. **Scale, timeline, budget** — MVP size, target users now/later.
10. **Design direction** — brand/mood, a reference template, mobile-first?, light/dark, accessibility bar.

Record every decision. Turn the material ones into **ADRs** under `docs/architecture/decisions/`
(use `0000-adr-template.md`).

## Step 2 — Generate the context docs
Fill the skeletons in `docs/_templates/` into real docs under `docs/` (delete the `<!-- TEMPLATE -->`
comments; replace `{{...}}`/`<fill:...>`). Keep them mutually consistent. Produce at least:
`architecture/project-overview.md`, `architecture/system-architecture.md`, `architecture/decisions/0001-…`,
`specs/data-model.md`, `specs/functional-spec.md`, `specs/api-reference.md`,
`security/security-model.md`, `security/rls-policies.md` (if a row-secure DB),
`engineering/coding-standards.md`, `engineering/testing-strategy.md`, `engineering/definition-of-done.md`,
`engineering/deployment-cicd.md`, `design/design-prompt.md`, `design/design-system.md`,
`planning/multi-agent-system.md`, `planning/project-management-tooling.md`, `planning/roadmap.md`,
`planning/modernization.md`, and `planning/kanban-backlog.md`.
Update `docs/README.md` (index) and the root **`CLAUDE.md`** (from `CLAUDE.md`'s template markers) with the
real stack table, the security golden rule, conventions, and guardrails.

> **Delegate for quality & speed.** Use the sub-agents in `agents/` the way a lead would:
> `database-architect` → data model; `security-engineer` → security model + RLS; `backend-engineer` →
> API; `ui-ux-designer` → design system + design prompt; `devops-engineer` → CI/deploy; `qa-test-engineer`
> → testing strategy; `tech-lead-orchestrator` → overview/architecture/roadmap and the Kanban. Write the
> foundation docs first (overview, data model, security) so the rest stays consistent.

## Step 3 — Assemble & tune the team
Run **`/assemble-team`** to put the right senior roster on this stack — it selects the core agents (from the 16
generic ones in `agents/`), **forges** specialists for any gap (mobile/game/data/ML…), and prunes what
the project doesn't need. Then lightly specialize the kept agents' intros to the project's stack & domain
(keep the roles/DoD).
The **skill library** in `skills/` (see its `README.md`) is what makes the agents reliable — each
skill is a verification-first playbook the agents auto-invoke. Keep the skills relevant to the chosen stack,
prune those the project won't use (e.g. `webhook-handler` if no payments), and adjust stack-specific wording
(RLS/migration/CI) to the project's actual stack. Every agent file's "Skills you use" section should point
to skills that exist.

## Step 4 — Build the backlog + plan sprints
Run **`decompose-feature`**: turn the MVP into **EPICS → atomic, agent-ready issues** in `scripts/kanban/issues.csv`
with **all 13 columns** `id,title,epic,area,agent,priority,size,deps,status,sprint,paths,req,security` — stable `STP-###`/`PRJ-###`
ids, one concern per issue, deps filled, foundation rows `status=todo` (rest `backlog`), `sprint=Backlog` by
default. Keep titles **comma-free** (the importer splits on commas and **aborts on a wrong column count**). Mirror
in `docs/planning/kanban-backlog.md`.
Then hand to the **`sprint-planner`**: slice the backlog into demoable sprints in `docs/planning/sprint-plan.md`
with **Sprint 1 `ACTIVE`** and each issue's `sprint` value set (`S1…SN`, unscheduled → `Backlog`) — continuous-flow,
no timeboxes. This is what makes `/next` work right after bootstrap.

## Step 4b — How this project is verified
Write `docs/engineering/verification.md` from `docs/_templates/verification.template.md`: how to install, how
to run it, the readiness signal, the smoke command and what it asserts, test credentials, the 3-5 critical
flows, and where the logs are. This is the document `vantry.yml`'s `run:` block is derived FROM — without it
the contract is a guess, and `verify-change` has nothing project-specific to read.

## Step 5 — Wire git & tooling
- **Declare the verification contract**: `scripts/verify.sh --init`, correct every `# guessed` line, then
  answer the one question no tool can: *what must a user be able to do for this to count as working?* — that
  becomes `run.smoke`. Check it with `scripts/verify.sh --probe`, then run `scripts/verify.sh` for real.
  Until this exists the gate is inert and every other guarantee in this kit is decoration.
- `git init -b main` (if needed); set remote.
- Enable the hooks with **`scripts/lib/enable-hooks.sh`**. It already handles every case this used to describe
  in prose — a missing directory, an existing husky or lefthook, hooks already live in `.git/hooks` — and it
  never overwrites yours: your hook becomes a subordinate stage that still runs first. Setting
  `core.hooksPath` by hand is denied by the kit's own Bash guard, because pointing it at a missing directory
  silently disables every hook in the repo. Check with `scripts/lib/enable-hooks.sh --status`.
- Copy `.env.example` → `.env.local` placeholders; confirm `.gitignore` ignores `.env*`.
- First commit (the hook runs). Remind the user to authenticate + push (never paste a token in chat —
  `git config --global credential.helper osxkeychain` then a manual first `git push`).

## Step 6 — Import the board (with consent)
Confirm, then: `DRY_RUN=1 ./scripts/kanban/import-kanban.sh` → show → real run. It auto-detects the repo
and derives labels/milestones from the CSV. Optionally set up a GitHub **Project** board for monitoring
(`gh auth refresh -s project`, `gh project create`, then `--project <n>`).

## Step 7 — Hand off
Summarize what was generated and the Sprint 1 goal, then end with **`/next`** — the first unblocked issue of the
ACTIVE sprint. Point to `docs/README.md`.

---

### Notes for the bootstrapper
- Scale effort to the idea: a small tool needs fewer agents/docs than a multi-role platform. Don't
  over-produce — but never skip the security model when there's user data.
- If the user is vague, ask 2–3 sharp questions rather than guessing.
- Everything you generate is a **living doc**: if a later decision contradicts one, fix it.
- This skill reproduces a proven setup; keep its opinions (RLS-first, server-authoritative validation,
  one-issue-per-PR, security review gate, mobile-first UI, i18n discipline) unless the user opts out.

## Done when
Checkable, not declarative — and each item is where a resumed run picks up:
- `CLAUDE.md`, the `/docs` suite and the ADR directory exist, with **no `{{VAR}}` or `<fill:>` left**
  (`bash scripts/check-refs.sh` passes).
- **`vantry.yml` exists and is real**: `bash scripts/validate-config.sh` passes AND `./scripts/verify.sh`
  prints `✓ VERIFIED` at least once. A project whose contract has never run is a project with no gate —
  this is the single item never to skip, and the first sprint's first story if the app is not runnable yet.
- `docs/engineering/verification.md` says how to install, run, smoke and log **this** project.
- The git hooks are on: `scripts/lib/enable-hooks.sh --status` shows all three ACTIVE.
- `scripts/kanban/issues.csv` holds atomic issues, each with acceptance criteria, a security flag and
  declared `paths`; the board is imported; Sprint 1 is `ACTIVE` in `docs/planning/sprint-plan.md`.
- **`docs/planning/team.md` exists and names a real team.** Step 3 was describable and skippable: nothing in
  this list mentioned the team, so `/bootstrap` could report done having never asked whether the roster fits
  the project. Checkable:
  ```bash
  test -f docs/planning/team.md                                  # it exists
  grep -c '^|' docs/planning/team.md                             # rows, not a copied template
  grep -q '<fill:' docs/planning/team.md && echo "UNFILLED"      # must print nothing
  bash scripts/validate-agents.sh                                # every listed persona is real
  ```
  Every id in it exists in `agents/`, and for a `game`, `embedded`, `contract`, `data`, `desktop` or `library`
  project at least one row is marked **forged** — those six have no engineering role in the shipped roster, so
  a team with none forged means the gap was not looked for.
- `/next` returns a concrete first issue rather than a question.
