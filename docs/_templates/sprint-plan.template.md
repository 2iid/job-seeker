<!-- TEMPLATE: the sprint-planner / /refine-backlog maintain this. /next reads the sprint marked ACTIVE. -->

# Sprint plan — {{PROJECT_NAME}}

> Source of truth for sprint sequencing. `/next` reads the sprint marked **ACTIVE** and returns the next
> unblocked issue; `/sprint-review` closes it, and while backlog remains `/refine-backlog` refills the next.
> Maintained by the `sprint-planner` agent. The board's single-select **Sprint** field (`S1 … SN · Backlog`)
> mirrors this file.

## Cadence & rules
- **One goal per sprint** — a demoable outcome, not a layer. **P0 first.** Deps never point forward.
- **Exactly one sprint `ACTIVE`.** Continuous-flow — **no timeboxes**; a sprint ends on its DoD, not a date.
- **No "No Sprint".** Every issue is in `S1…SN` or an explicit **`Backlog`** — never an empty Sprint value.
- `‖ parallel: #x #y` marks issues that share no dependency — `/next` auto-dispatches them (each agent in its own worktree, cap from `vantry.yml` `dispatch.max_parallel`, default **2**).

## Sprint 1 — <goal> · **ACTIVE**
- **Goal:** <the demoable outcome>
- **Issues:** `#id title` · `#id title` …   <!-- ‖ parallel: #a #b -->
- **DoD:** every issue meets the Definition of Done; tests / lint / build green (+ RLS allow-deny where relevant).
- **Demo:** <what a stakeholder sees at the end>

## Sprint 2 — <goal>
- **Goal:** …
- **Issues:** …
- **DoD:** …
- **Demo:** …

<!-- … add sprints as the backlog is sliced … -->

## Backlog
- Unscheduled issues live here (Sprint value `Backlog`) until `/refine-backlog` slices them into a sprint.
