---
name: refine-idea
description: Turn a raw, vague, or badly-worded idea into a precise, executable project brief BEFORE building. Runs a short expert discovery interview (3-5 sharp questions), reflects the idea back for confirmation, and writes docs/planning/project-brief.md. The front door to /bootstrap (and the intent step of /adopt). Trigger words — refine idea, clarify my idea, I have an idea, help me scope, discovery, requirements, project brief, before bootstrap.
---
# /refine-idea — from a fuzzy idea to an executable brief

**Use when:** the user has an idea but hasn't (or can't) express it precisely enough to build the right thing.
The **front door**: `/refine-idea "my idea"` → a sharp interview → a brief → `/bootstrap` executes it.
**Owner:** `product-strategist`.

## Procedure
1. **Read the idea + any context** (docs, links, an existing repo). Form a first hypothesis of the intent.
2. **Reflect back** — restate the idea in one paragraph: *"Here's what I understand you want… correct me."*
3. **Ask 3–5 high-leverage questions** — target the *fuzziest* parts (use `AskUserQuestion` with recommended
   defaults). Cover the gaps among: user & their #1 job · the core loop · the 8-week success metric · hard
   constraints (budget/stack/region/compliance) · explicit non-goals · the riskiest assumption. **Skip what's
   already clear — never ask what you can infer.**
4. **Surface the implicit** — call out contradictions, hidden complexity, and scope creep; propose a decision
   + recommended default for each.
5. **Write the brief** → `docs/planning/project-brief.md`, **from `docs/_templates/project-brief.template.md`**.
   Copy the template and fill it; do not improvise the headings. Three downstream skills read this file by its
   `##` section names — `/analyze-requirements` appends to `## Constraints` and `## Riskiest assumptions`,
   `/gtm-plan` reads the ICP and the metric, `/assemble-team` reads the stack. An improvised brief is a brief
   only a human can read. (problem · user · core loop · MVP scope · non-goals ·
   constraints · success metric · riskiest assumptions · open questions).
6. **Confirm** — one final *"this is the plan of record — go?"*.
7. **Hand off** — to `/bootstrap` (or feed `/adopt` as its intent). If the idea touches **money, personal
   data, health, or a regulated market**, offer `/analyze-requirements` first: it adds obligations, unit
   economics, and a `REQ-###` id per MUST. **Offer it, never impose it** — a weekend project does not need it.

## Guardrails
Few, sharp questions — never an interrogation. Don't invent scope the user didn't ask for; record open questions
instead. Put a recommended default on every decision so the user can just say "yes". **No code here** — this is
understanding, not building.

## If you are NOT running /analyze-requirements
`docs/_templates/project-brief.template.md` carries `## Obligations` and `## Unit economics`, which
`/analyze-requirements` fills. Skip that step — the documented weekend-project path — and those `<fill:>`
markers survive into `docs/planning/project-brief.md`, where `scripts/check-refs.sh` fails on them. That check
is `/bootstrap`'s **first** Done-when bullet, so the next ritual starts against a red gate it cannot clear.

**Delete both sections wholesale** rather than leaving them empty or half-answered. A section that says nothing
is worse than an absent one: `/bootstrap` reads the brief as the agreed scope, and an empty `## Obligations`
reads as "there are none", which is a claim nobody made. Then:

```bash
grep -rn '<fill:' docs/planning/project-brief.md   # must print nothing
bash scripts/check-refs.sh                          # must pass before /bootstrap
```

## Done when
`docs/planning/project-brief.md` is specific enough to build the right thing from alone, and the user confirmed it.
