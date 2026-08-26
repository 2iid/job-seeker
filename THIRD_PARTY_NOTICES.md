# Third-party notices

This repository is public and redistributes work written by other people. Everything below travels
with its own terms, and **none of it is covered by this project's `LICENSE`** — which grants no
rights over third-party code and takes none away.

Our own code is proprietary: see `LICENSE`.

---

## The Vantry kit — the engineering method, the agents, the gate

- **Source:** [`2iid/vantry-universal`](https://github.com/2iid/vantry-universal), installed with
  `scripts/adopt/install.sh` at **v3.21.2**
- **Licence:** MIT — full text at `LICENSES/vantry-MIT.txt`
- **Copyright:** © 2026 Issa
- **What it covers, in this repository:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `agents/`, `skills/`,
  `scripts/` (except `scripts/kanban/issues.csv` and `scripts/kanban/details/`, which are this
  project's own backlog), `.githooks/`, `.github/workflows/`, `.claude/`, `.cursor/`, `.windsurf/`,
  `evals/`, `docs/_templates/`, `docs/engineering/`, `.gitleaks.toml`, `VERSION`.
- **Note:** MIT requires the copyright and permission notice to travel with the code. The installer
  does not copy the kit's `LICENSE`, so it is reproduced here deliberately.

## The `last30days` engine — the tiered ATS retrieval strategy

- **Source:** [`mvanhorn/last30days-skill`](https://github.com/mvanhorn/last30days-skill), file
  `skills/last30days/scripts/lib/jobs.py`
- **Licence:** MIT — full text at `LICENSES/last30days-MIT.txt`
- **Copyright:** © 2026 Matt Van Horn
- **What was ported, and how:** the *strategy*, reimplemented in TypeScript — not the code. Two
  things carry over and are the reason this notice exists:
  1. **Careers-page-first discovery.** The provider and slug are read off the embed or link published
     on the company's own careers page; slug probing is never the entry point. The rationale is his
     and it is sound: a guessed slug produces either a homonym's board shown under the wrong
     company's name, or a 404 read as "this company is not hiring". Both are worse than finding
     nothing. See `apps/worker/src/sources/ats/decouverte.ts`.
  2. **The list of ATS link patterns and the slug stopwords** (`embed`, `job_board`, `v1`, `api`…),
     which are the practical result of his work against real careers pages.
- **What is NOT taken:** no Python was copied, and the HTTP layer, the state model, the rate limiting
  and the parsers are this project's own — they are written against real recorded responses in
  `apps/worker/src/sources/ats/fixtures/`.

---


## `vendor/skills/frontend-design`

- **Source:** [`anthropics/skills`](https://github.com/anthropics/skills), path `skills/frontend-design`
- **Licence:** Apache License 2.0 — full text at `vendor/skills/frontend-design/LICENSE.txt`
- **Copyright:** © Anthropic PBC
- **Modifications** (Apache-2.0 §4(b)): the frontmatter `description` was rewritten to scope it to aesthetic
  direction and stop it competing with this project's `ui-component`; a deference header and a `CONFLICTS.md`
  were added beside it. **No line of the original body was changed.**
- **Trademarks** (§6): this licence grants no rights in Anthropic's marks. "Anthropic" and "Claude" do not
  appear in Vantry's branding, and must not.
- **Note:** the source repository carries no top-level LICENSE. The `LICENSE.txt` shipped *inside* the skill
  directory is the governing grant, which is why it is vendored verbatim alongside the text.

## `vendor/skills/supabase-postgres`

- **Source:** [`supabase/agent-skills`](https://github.com/supabase/agent-skills), path
  `skills/supabase-postgres-best-practices`
- **Licence:** MIT — full text at `vendor/skills/supabase-postgres/LICENSE`
- **Copyright:** © Supabase
- **Modifications:** the frontmatter `description` was narrowed to the performance lane and the claim "and the
  tests that verify them" removed (the skill ships no tests); a deference header and a `CONFLICTS.md` were
  added. **No upstream rule file was edited** — the four corrections live beside them.

---

## Reviewed and NOT included

Recorded because a rejection nobody wrote down gets proposed again. Neither author is hostile; both projects
are well built. They were refused on **shape**, not on trust.

| candidate | why not |
|---|---|
| [`vercel-labs/agent-browser`](https://github.com/vercel-labs/agent-browser) | Its frontmatter pre-grants `Bash(agent-browser:*)`. That wildcard covers `plugin add`, which spawns `npx -y <spec>` **at add time** — arbitrary, network-resolved code behind a command the permission system waves through. It also defers its real instructions to `agent-browser skills get core`, a corpus that is not in the file you review and changes per release. |
| [`vercel-labs/skills` → `find-skills`](https://github.com/vercel-labs/skills) | A package manager for *instructions* whose stated vetting is install count and GitHub stars, and which never tells the agent to read what it is about to install. Its recommended `-g` writes third-party instructions to the home directory — outside git, outside the diff, outside CI, and incapable of producing a receipt. |
| [`vercel-labs/agent-skills` → `react-best-practices`](https://github.com/vercel-labs/agent-skills) | **No LICENSE file exists anywhere in that repository** — not at the root, not in the skill directory. The `license: MIT` is a bare frontmatter string with no notice text behind it, so the default position is all rights reserved. Good content; not redistributable inside a template other people clone until upstream ships a real licence. |
| [`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT and mechanically inert, but it needs Python 3 while `vantry.yml` declares `stack: POSIX shell + git + markdown — no runtime dependency beyond bash and git`, and 56 of its 192 palettes emit button-text pairs measured at 3.2–3.8:1 against this project's 4.5:1 AA floor. Reconsider if the stack constraint changes and the sub-AA rows are annotated. |
