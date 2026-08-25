---
name: adopt
description: Bring an EXISTING / in-progress codebase into the system — a deep multi-agent audit (security, bugs, architecture, data model, tests, perf, a11y, ops), a CLAUDE.md reverse-engineered from the real code, then an atomic backlog + a stabilize-first sprint plan + the GitHub board. The brownfield counterpart to /bootstrap. Trigger words — adopt, existing project, in-progress project, inherited/legacy codebase, audit my project, review my repo, deep review, I'm lost in my project, retrofit, onboard an existing repo, brownfield.
---
# /adopt — bring an existing project into the crew

**Use when:** the code already exists — an in-progress project, an inherited/legacy codebase, a repo you want
reviewed before building further, or *"I'm a bit lost in my own project and want it better."* This is the
**brownfield** counterpart to `/bootstrap` (greenfield: idea → project). Here the backlog is derived from the
**gap between what the code IS and what it SHOULD be** — not from an idea.

## Three ways to point /adopt at a project — all first-class, user's choice
Both the installer and the skill accept a **local path** or a **git URL**, so pick whichever fits:

1. **In place** — you're in the project (or point at its folder):
   ```bash
   /path/to/kit/scripts/adopt/install.sh .          # or: … /path/to/your-project  (non-destructive)
   cd your-project && claude
   /adopt
   ```
2. **From a URL** — clone + set up in one step, or just evaluate read-only:
   ```bash
   ./scripts/adopt/install.sh https://github.com/you/repo   # clone + install the kit, then /adopt
   /adopt https://github.com/you/repo                       # …or only review: clones to scratch, audits READ-ONLY
   ```
3. **A local folder** — `./scripts/adopt/install.sh ../some/path` then `/adopt`, or `/adopt ../some/path` to audit in place.

**Phase 0 · Resolve the target** is the skill's first act: a URL → clone to a scratch dir; a path → use it; nothing
→ the current repo. Whichever mode, **Phases 1–2 (recon + audit) never modify your code.** The only files they create are the reports under
`docs/audit/` — nothing else changes until you approve.

## Modes
- `/adopt` **(full, default)** — audit → CLAUDE.md → backlog → sprint plan → board.
- `/adopt audit` — **stop after the report.** Just the deep review (the high-value deliverable); change nothing else.

## Procedure

### Phase 0 · Intent — a short interview (4–5 questions, no more)
The code shows *how*; only the human knows *why*. Ask: what is this product + who is it for; the goal for the
next 4–8 weeks; the single biggest pain right now; any **no-go zones** (code that must not be touched); and
deploy/stack constraints. Write it to `docs/audit/intent.md`. This anchors the gap analysis so the audit judges
against the *real* goal, not a generic ideal.

### Phase 1 · Recon — map the codebase (READ-ONLY, fan-out)
Detect: language(s), framework + versions, structure, entry points, routes/endpoints, the data model +
migrations, the auth/authz model, state management, tests + rough coverage, CI, and how secrets/env are handled.
→ `docs/audit/codebase-map.md`. Use parallel read-only explorers — one per subsystem — for speed.

### Phase 2 · Deep audit — across dimensions (specialist agents, adversarially verified)
Run each dimension with its owning agent. **Every finding is then checked by a second agent prompted to REFUTE
it** — false positives die before they reach the backlog (never model-trust; require evidence at `file:line`).

| Dimension | Owner | Looks for |
|---|---|---|
| Security & privacy | security-engineer | authz/authn gaps, missing row-security, secrets in code, injection, PII exposure, vulnerable deps |
| Correctness | backend / frontend + qa | bug hotspots, error handling, edge cases, races |
| Architecture & debt | tech-lead | coupling, layering, dead code, duplication, god-modules |
| Data model | database-architect | missing indexes/constraints, migration hygiene, N+1 shapes |
| Tests | qa | coverage gaps on critical paths, missing allow/deny tests, brittle patterns |
| Performance | backend / devops | slow queries, N+1, bundle size, missing caching |
| UX · a11y · i18n | ui-ux / frontend | WCAG issues, non-responsive layouts, hardcoded user-facing strings |
| DX · CI · ops | devops | no CI, no secret-scan, unvalidated env, no observability/backups |

> This is a natural **multi-agent Workflow**: fan out the dimensions in parallel → dedup findings → adversarial
> verify each → rank. Scale the finder/verifier count to how thorough the user asked for.

Rank every finding **P0–P3**:
- **P0** — exploitable security / data-loss / broken core flow → fix before anything else.
- **P1** — serious bug, missing authz check, no tests on a critical path, debt blocking velocity.
- **P2** — maintainability, moderate debt, coverage gaps, a11y/i18n.
- **P3** — polish / cosmetic / nice-to-have.

→ `docs/audit/report.md` from `docs/_templates/audit-report.md` (executive summary + a health-at-a-glance grade
per dimension + the ranked table, each finding with `file:line`, impact, and a concrete fix).

**The grade is computed, not felt** — the rubric is in the template's first block and is a pure function of the
P-ranks above: **F** = any P0 · **D** = any P1 · **C** = any P2 · **B** = only P3 · **A** = no findings. Two
runs over the same commit must produce the same letter; a grade that does not follow from the table is a defect
in the report, not a judgement call.

### Phase 3 · Reconcile to standards
Generate `CLAUDE.md` **from the real code** — the actual stack table, the conventions genuinely in use, and the
deltas vs best practice (don't invent an ideal that isn't there; record the gap instead). Tailor and **prune** the
agents + skills to the detected stack (a no-payments app doesn't ship the payments agent).

### Phase 3b · Declare the contract — **the gate is inert until this is done**
Without `vantry.yml` the whole verification layer no-ops: `scripts/verify.sh --gate` returns 0 for a repo that
has no contract, on purpose. So an adopted project ships 16 agents, 48 playbooks and three hooks with **zero**
verification unless this phase runs. You have just mapped the codebase in Phase 1 — you know how it builds
better than any file-sniffing script does, so **you** write the contract, not a guess.
1. `scripts/verify.sh --init` for a starting point, then **correct every line** against what Phase 1 found.
   Every generated line it could not infer is blank, and every line it did infer is marked `# guessed`.
2. `scripts/verify.sh --probe` — it runs each declared line and prints a truth table. Iterate until nothing
   is `✗`. The probe writes no receipt, so this costs you nothing but time.
3. **Ask the human the one question no tool can answer:** *"what must a user be able to do for this to count
   as working?"* Their answer, turned into a command, is `run.smoke`. Never substitute the test suite — that
   substitution is the exact failure this kit exists to prevent.
4. Set `strictness: relaxed`. **Always**, for a brownfield repo. A codebase with years of history cannot pass
   a strict gate on day one, and forcing it guarantees the gate gets deleted rather than adopted. Write into
   the audit report: *switch to `standard` at the end of the first sprint, once `run.smoke` is trusted.*
5. Fill `sensitive_paths` from the **real** auth, payment and migration directories Phase 1 found — this list
   also generates CODEOWNERS and drives the CI security job.
6. Run `scripts/verify.sh` for real. It must print `✓ VERIFIED`. If it cannot, the contract is still wrong:
   fix it now, or the first thing the developer learns is that the gate cries wolf.

### Phase 3c · Assemble the team
`skills/assemble-team` says it runs "after `/refine-idea` (greenfield) or **`/adopt`** (brownfield)" — and
until now nothing in this playbook invoked it, so the brownfield half of that sentence was false and an
adopted project got the default roster whatever its stack was.
1. Run **`/assemble-team`** with what Phase 1 found: the real languages, frameworks, datastores and surfaces.
2. **Select** from `agents/` what this project actually needs. `tech-lead-orchestrator`, `qa-test-engineer`
   and `security-engineer` are the non-prunable core; a role with no surface in this codebase is marked
   inactive, never deleted.
3. **Forge** what is missing via `/forge-agent` — a Flutter, Unity, Rust, ML or Solidity specialist is not in
   the shipped roster and should not be faked by a generalist. Every forged persona must pass
   `bash scripts/validate-agents.sh` before it is used.
4. Write the roster to `docs/planning/team.md` (from `docs/_templates/team.md`) including the **"why it is on this project"** column — a team nobody
   can justify is a team nobody will trim.
5. Assign a lead `agent` to every issue in Phase 4. `scripts/kanban/lint-kanban.sh` fails on an issue assigned
   to a persona that does not exist, so this is checked rather than intended.

### Phase 4 · Gap → backlog
**Run `/decompose-feature`** on the findings rather than hand-rolling rows — it is the
playbook that knows the 13-column schema, writes `scripts/kanban/details/<id>.md`, and fills `paths`, `req`
and `security`, which is what makes the downstream gates mechanical.
Turn findings + missing features into **atomic issues** in `scripts/kanban/issues.csv` (with the `sprint` column).
Two streams: **remediation** (fix P0/P1, add a characterization-test safety net, pay down debt) **and** **forward
features** (from the Phase-0 intent). Tag `priority / size / deps / agent` per issue; P0 leads.

### Phase 5 · Plan — stabilize-first
Hand to the `sprint-planner`. For a brownfield repo, **Sprint 1 = "Stabilize & Harden"**: the P0 fixes + a
characterization-test net around the risky areas — **before** any new feature. Then continuous flow (no time-boxes).

### Phase 6 · Board
`./scripts/kanban/import-kanban.sh --project new` → the full GitHub board (labels, milestones, issues, Sprint
field, every issue in its column). One command.

## Safety rails (non-negotiable for existing code)
- **Read-only audit** — Phases 1–2 never modify a single source file.
- **Non-destructive** — every change lands as **issue → branch → PR**, never an in-place rewrite; git history preserved.
- **Characterization tests first** — pin current behavior with tests *before* refactoring a risky area (Feathers),
  so an "improvement" can't silently break what already works.
- **Strangler-fig** — modernize incrementally behind seams; no big-bang rewrite.
- **Human-confirmed** — the audit *proposes*; the developer approves severity + scope before anything is scheduled.
- **No-go zones are sacred** — never schedule or touch declared no-go code without explicit sign-off.

## Outputs
`docs/audit/{intent,codebase-map,report}.md` · a real `CLAUDE.md` · a populated `scripts/kanban/issues.csv` ·
`docs/planning/sprint-plan.md` (Sprint 1 = Stabilize & Harden) · a GitHub board.

## Done when
The developer has: a severity-ranked audit they trust, a `CLAUDE.md` that matches reality, a sprinted backlog
that leads with stabilization, and a board — and can run `/next` to start improving **with confidence, not fear**.

And the one item that is checkable rather than felt: **`scripts/verify.sh` prints `✓ VERIFIED` in their repo
before you hand it back.** An adopted project whose contract has never run once has been given the appearance
of a verification gate and none of the substance — which is worse than being given nothing, because they will
believe it is protecting them.

## Guardrails
Never edit source during the audit. Never inflate severity — if unsure, mark a finding "needs human confirmation."
Never invent findings to look thorough. **Secrets discovered in code become a P0 remediation issue** (rotate +
purge from history) — never logged, echoed, or committed anywhere. Respect every no-go zone.
