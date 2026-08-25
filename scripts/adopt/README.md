# Adopt an existing project (brownfield)

`/bootstrap` starts from an **idea**. `/adopt` starts from **code that already exists** — it audits your repo,
reverse-engineers a `CLAUDE.md` from reality, and turns the gaps into a sprinted backlog + a board. Full
procedure: [`.claude/skills/adopt/SKILL.md`](../../.claude/skills/adopt/SKILL.md).

## Three ways to point `/adopt` at a project (your choice)
The installer accepts a **local path** or a **git URL**:
```bash
DRY_RUN=1 ./scripts/adopt/install.sh /path/to/your-project   # preview — copies nothing
./scripts/adopt/install.sh /path/to/your-project             # 1 · a LOCAL folder, in place
./scripts/adopt/install.sh .                                 #     (or the current project, via the kit's abs path)
./scripts/adopt/install.sh https://github.com/you/repo       # 2 · clone a URL, then install into it
```
Or skip the install and let the skill resolve the target: `/adopt <url>` (clones + audits **read-only**) or
`/adopt ../local/path` (audits in place) — mode **3**.

The installer copies **only the kit's own files** (`.claude/`, the kanban + adopt scripts, doc templates,
secret-scan config). It **never touches your source code**, and it **backs up** anything it would overwrite to
`*.vantry-bak-<timestamp>` — so nothing is ever lost.

## Then run the onboarding
```bash
# The installer enables the secret guard itself, and refuses when doing so would break your repo.
# Do NOT set core.hooksPath by hand: pointing it at a missing directory — or over husky/lefthook —
# silently disables EVERY git hook in the repo.
cd /path/to/your-project && claude
/adopt            # full: audit → CLAUDE.md → backlog → sprints → board
/adopt audit      # just the deep review (the high-value report), change nothing else
```

## What you get
- `docs/audit/report.md` — a **severity-ranked audit** (security, bugs, architecture, data, tests, perf, a11y, ops),
  each finding with `file:line` + a fix, adversarially verified so false positives are filtered out.
- A `CLAUDE.md` that matches your **actual** stack and conventions.
- `scripts/kanban/issues.csv` — remediation **and** feature issues, atomic, prioritized.
- `docs/planning/sprint-plan.md` — **Sprint 1 = "Stabilize & Harden"** before new features.
- A GitHub board (via `import-kanban.sh --project new`).

## Safety
Read-only audit; every change lands as an **issue → branch → PR**; **characterization tests before refactors**;
no big-bang rewrites; declared **no-go zones are never touched** without sign-off.
