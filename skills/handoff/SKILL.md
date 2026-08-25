---
name: handoff
description: Write docs/planning/PROJECT-STATE.md so the next session — or the next human — starts cold without re-deriving state from three sources. Active sprint, what is in flight and on which branch, what is blocked, the last verified state per branch, open decisions, and the single next action. Use when ending a session, before compaction, or when handing work over. Trigger words — handoff, hand off, end of session, wrap up, project state, where were we, context, before compaction, take over.
---
# Handoff (write the state, not the story)

**Use when:** ending a session, before a context compaction, or handing work to another agent or human.
**Owners:** tech-lead-orchestrator, and whoever is finishing the session.
`.claude/hooks/session-start.sh` reads this file back on **startup, resume, clear and after compaction** — but
only its **first 25 lines**. Put the state at the top; anything below line 25 is for a human, not the next session.

## Procedure
Overwrite `docs/planning/PROJECT-STATE.md` — it is a snapshot, not a log — with these sections, in this order:
1. **Active sprint** — id + the one-line goal, and progress `done/total`.
2. **In flight** — one line per item: `#id · agent · branch (worktree) · <verification state>`, where the state
   is **pass** / **STALE** / **none**, read from `scripts/verify.sh --status`, never from memory.
3. **Blocked** — `#id — the blocker — what unblocks it — who owns that`. A blocker with no owner is not blocked,
   it is abandoned.
4. **Last verified** — per branch: the head sha and the one-line observation from its receipt, or `UNVERIFIED`.
   Receipts are gitignored and machine-local; this file is the only thing that carries their result across.
5. **Open decisions** — what is waiting on a human, and what each option costs. One line each.
6. **Next action** — exactly **one** imperative line, so the next session opens by doing it rather than by
   re-reading the board.

## Guardrails
- **State, not narrative.** No "we then tried…". Each line is a fact a reader can act on or check.
- **Absolute dates** (`2026-07-26`), never "yesterday", "earlier" or "recently" — a session has no memory of when.
- If a branch is unverified or its receipt is **stale**, say so in those words. Never write "done", "working" or
  "ready" for work with no passing receipt; write `UNVERIFIED`.
- Do not restate the sprint plan, the backlog or the architecture — link them. This file answers "where are we",
  once, in under a screen.

## Done when
`docs/planning/PROJECT-STATE.md` carries all six sections; every in-flight branch has an explicit verification
state; every blocker has an owner; every date is absolute; the next action is a single imperative line; and the
first 25 lines alone are enough to resume cold.
