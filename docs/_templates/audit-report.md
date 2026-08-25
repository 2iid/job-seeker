# Audit report — <project>

> **How the grade is computed.** It is a function of the ranked findings below, not an impression — so two
> runs over the same commit produce the same letter. Per dimension:
> **F** = at least one P0 · **D** = at least one P1 · **C** = at least one P2 · **B** = only P3 ·
> **A** = no findings. A grade that does not follow from the table is a defect in the report.

> Produced by `/adopt` (read-only review). Every fix is proposed as an **issue → branch → PR**, never applied
> in place. **Date:** <YYYY-MM-DD> · **Commit:** <sha> · **Intent:** see `docs/audit/intent.md`.

## Executive summary
<3–5 sentences: overall health, the biggest risks, and the single recommended first move. Written for a busy
founder, not a linter — say what's dangerous and what to do first.>

## Health at a glance
| Dimension | Grade | Headline |
|---|---|---|
| Security & privacy | A–F | <one line> |
| Correctness | | |
| Architecture & debt | | |
| Data model | | |
| Tests | | |
| Performance | | |
| UX · a11y · i18n | | |
| DX · CI · ops | | |

## Findings (severity-ranked)
> P0 = exploitable / data-loss / broken core flow · P1 = serious bug or missing authz/tests · P2 = maintainability/debt · P3 = polish.

| # | Sev | Dimension | Finding | Where | Suggested fix | Issue |
|---|-----|-----------|---------|-------|---------------|-------|
| 1 | P0 | Security | <what & why it matters> | `path/file:line` | <the fix> | #NN |
| 2 | P1 | Tests | <…> | `…` | <…> | #NN |

## Remediation plan
- **Sprint 1 — Stabilize & Harden:** <the P0/P1 set + a characterization-test net around the risky areas>.
- **Then:** <P2/P3 + the forward features from `intent.md`, sliced into later sprints>.

## Notes & assumptions
- <anything that needs human confirmation — don't inflate severity when unsure>
- **No-go zones respected:** <list from `intent.md`>
- **Secrets:** <if any were found in code → filed as P0: rotate + purge from history. Never reproduced here.>
