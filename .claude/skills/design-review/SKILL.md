---
name: design-review
description: Audit a screen or component for accessibility (WCAG 2.1 AA), responsive behavior, design-token adherence, and state coverage (loading/empty/error) — then report ranked findings each with a concrete fix. Use before merging UI, when polishing a screen, or when a component "looks off". Trigger words — design review, UI audit, accessibility, a11y, WCAG, responsive, contrast, tokens, states.
---
# Design review (a11y + responsive + tokens + states)

**Use when:** auditing any UI before merge or when a screen needs a quality pass. **Owners:** ui-ux-designer,
frontend-engineer.

## Inputs
The component/route to review, the design tokens + patterns from `docs/design/`, the locales in scope, and
the intended states of the screen. You audit real rendered output, never source alone.

## Procedure
1. **PRECONDITION — refuse to review unverified UI.** Run `scripts/verify.sh --gate`. If it is not `0`,
   print exactly `BLOCKED — unverified: run scripts/verify.sh first` and **stop**. A screen nobody has
   rendered cannot be audited; the smoke run is what puts it on screen.
2. **Accessibility — automated then manual.** Run the project's automated a11y scanner for baseline
   violations, then check by hand: tab order + full keyboard operability, a visible focus indicator, semantic
   landmarks/labels, reduced-motion respected, text contrast (≥4.5:1 body / 3:1 large), no color-only status.
3. **Responsive.** View at ~390px, tablet, and desktop. Flag overflow, truncation, tap targets <44px, and
   layout breaks — re-check at 390px with the **longest locale** (translated strings run longer).
4. **Design tokens.** Grep the diff for hardcoded colors/spacing/raw hex or pixel values; every value should
   map to a semantic token from `docs/design/`. Flag magic numbers and off-system one-offs.
5. **State coverage.** Confirm loading (skeleton), empty, error, and success states all exist and are
   reachable — not just the happy path. A missing empty/error state is a finding.
6. **Originality (not a clone).** Flag the generic AI-design defaults — cream+serif+terracotta; near-black + one
   acid/neon pop; purple→blue gradient hero; the default "safe" grotesk face; emoji section markers;
   everything centered; one uniform corner radius on everything; accent-bar-on-rounded-card — and any
   look-alike of a competitor.
   A screen that would fit *any* generic SaaS is a finding: demand deliberate, subject-specific choices. See `originality-check`.
7. **Report** ranked findings (blocker → major → minor), each with the exact selector/line and a concrete
   fix. Verify each finding in the running app before reporting it — no speculative nits. Then **write the
   verdict receipt**.

## Verdict receipt
**The slug, exactly.** Take the branch name, replace `/` with `-`, then remove every character outside
`A-Za-z0-9._-`. Do not re-derive it: `scripts/verify.sh --status` prints it on line 1 as `· branch <slug>` —
use that string, so the file you write is the file CI looks for.

Write `.vantry/reviews/<branch-slug>.design.json` (slug = branch name, `/` → `-`):

```json
{ "schema": "vantry.review/1", "kind": "design", "verdict": "pass",
  "reviewer": "ui-ux-designer", "at": "<UTC ISO-8601>", "head": "<git rev-parse HEAD>",
  "checklist": ["a11y-automated", "a11y-manual", "responsive", "locales", "tokens",
                "states", "originality"],
  "findings": [{ "severity": "blocker", "file": "<path>", "line": 88,
                 "summary": "…", "fix": "…" }] }
```

`verdict` is `block` while any blocker is open. This file is **tracked and committed** — the judgement travels
with the PR, so a later reader can see which screens were audited, at which HEAD, against what.

## When a gate blocks
1. Set the issue to status **`blocked-gate`** and post the findings on the PR.
2. Hand each finding **back to the implementing agent**. The reviewer never fixes its own finding — that
   destroys the second pair of eyes.
3. After the fix, **verification must be re-run and this review re-run end to end**: the edit staled both
   receipts, and a re-rendered screen is the only proof the fix landed.

## Guardrails
- Audit rendered behavior, not just source; a clean automated scan is necessary but not sufficient (still do the manual pass).
- Stay within the reviewed screen's scope; file separate follow-ups for systemic issues.
- Don't invent tokens — flag the gap and defer to the design system owner.

## Done when
The automated a11y scan is clean; keyboard + focus + contrast verified; no truncation/overflow in any locale
at 390px→desktop; tokens only; loading/empty/error/success all present; findings delivered ranked with fixes;
and `.vantry/reviews/<branch-slug>.design.json` is written and committed.

## Stack notes — Next.js + Tailwind + shadcn/ui (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.
- Automated scan: **axe** via `@axe-core/playwright` inside a **Playwright** run, or the axe browser
  extension for a one-off screen. Native apps use the platform accessibility inspector instead.
- Focus indicator = the `focus-visible` ring; reduced motion = the `prefers-reduced-motion` media query.
- Tokens live in the Tailwind theme + CSS custom properties; a raw hex or a `p-[13px]` arbitrary value in the
  diff is the tell. Uniform `rounded-lg` on every surface is the shadcn default look, not a decision.
