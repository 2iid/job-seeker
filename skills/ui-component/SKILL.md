---
name: ui-component
description: Build a UI component the correct way — mobile-first, accessible (WCAG 2.1 AA), internationalized, and state-complete (loading/empty/error, not just the happy path), server-rendered by default. Use when adding or changing any screen, widget, form, or shared component. Trigger words — component, UI, screen, page, form, button, card, layout, shadcn, responsive, accessible, a11y.
---
# UI component (mobile-first, accessible, i18n, state-complete)

**Use when:** building/changing any user-facing component or screen. **Owners:** frontend-engineer.
`vantry.yml` carries a free-text `stack:` naming the real stack; the **Stack notes** below are one
illustration of this contract, not the contract.

## Inputs
The component's purpose and props, the roles/data it shows, every state it can be in (loading, empty,
partial, error, success), the locales in scope, and the relevant design tokens from `docs/design/`.

## Procedure
1. **Render on the server/host side by default.** Opt into a client-side runtime only for real interactivity
   (state, effects, event handlers), and push that boundary **leaf-ward** so as little code and data as
   possible ships to the device. Only serializable data crosses the boundary.
2. **Author mobile-first (~390px)** as the base styles, then enhance upward at larger breakpoints. Verify
   the layout does not overflow or truncate at 390px — including with a longer locale.
3. **Use the design tokens only** — the semantic tokens declared in `docs/design/` (a named surface, a named
   muted-text colour). No magic hex/rgb, no hardcoded pixel colours.
4. **Accessibility (WCAG 2.1 AA):** use the platform's real semantic controls (a button that is a button, a
   labelled input, real landmarks), visible focus indication, full keyboard/switch operability, respect the
   reduced-motion preference, and **never signal status by colour alone** (add icon/text). Meet contrast;
   give icon-only controls an accessible name.
5. **i18n:** every user-facing string comes from the i18n layer — no hardcoded text. If the app is
   multilingual, add the key to **all** locale files together.
6. **State-complete:** render loading (skeleton), empty, and error states — not just success. Errors degrade
   gracefully through the app's error boundary; never surface a raw stack trace.
7. **Verify:** run `scripts/verify.sh` — it executes the commands declared in `vantry.yml`, whatever the stack
   — then **render the screen and drive it**, at 390px and a desktop width, through its **loading, empty and
   error** states, moving focus with the keyboard only. Record what you saw with
   `scripts/verify.sh --observe "<expected>" "<observed>" <screenshot ...>`. Where a state is what a
   requirement demands, add it to `vantry.yml` `acceptance:` so it keeps proving itself. Delegate a full audit
   to `design-review` for non-trivial screens.

## Guardrails
- Never call a third-party/LLM/payment/secret-bearing API from client-side code — route it through the server.
- Never pass a non-serializable value (a component, a class instance, a closure) across the server→client boundary.
- No colour-only status, no missing empty/error state, no untranslated string.
- A screen showing auth, payment, PII or AI output lands in `vantry.yml` `sensitive_paths`: the PR cannot merge
  without a committed `.vantry/reviews/<branch-slug>.security.json` with `verdict: pass`.

## Aesthetic direction — the vendored reference
Before choosing a palette, a type scale or a layout point of view, read
**`vendor/skills/frontend-design/SKILL.md`** (Anthropic, Apache-2.0, vendored — not auto-invoked). It is the
best short statement of how to avoid the templated default look, and it names the same generic clusters
`originality-check` refuses.

Read **`vendor/skills/frontend-design/CONFLICTS.md`** with it: its accessibility floor names three of this
project's five AA requirements, and it is silent on i18n. Take direction from it; take the bar from here.

## Measure the contrast. Do not judge it.
A walk built the component this playbook prescribes, satisfied every clause of the old Done-when, and shipped
body text at **1.98:1** against its surface — AA needs 4.5:1 — with order status conveyed by a coloured dot and
nothing else. Contrast and colour-only meaning were in the Procedure, carried no number, had no measuring step,
and appeared nowhere in the Done-when. Two of the four WCAG criteria AGENTS.md names were unfalsifiable.

**Measure every token pair you use**, and write the ratios down:
- body text ≥ **4.5:1** against its background;
- large text (≥18.66px bold, or ≥24px) and the non-text parts of a control ≥ **3:1**;
- the focus indicator ≥ **3:1** against what it sits on.

Any contrast checker gives the number in seconds — a browser devtools colour picker, a CLI checker, an axe scan.
Paste the pairs and their ratios into `--observe`: `--text-muted on --surface = 4.62:1 ✓`. A ratio you did not
compute is an opinion about a colour.

**And never let colour be the only signal.** Every status, every error, every "required" carries a second cue —
an icon, a shape, or text. Check it the cheap way: view it in greyscale and confirm you can still tell the states
apart.

If an automated scan is available (`axe`, `pa11y`, `lighthouse --only-categories=accessibility`), run it and
attach the output as an artefact — `--observe` now refuses a path that does not exist, so an attached scan is
real evidence rather than a filename.

## Done when
- Every state ships: **loading, empty, error and the happy path** — the empty state is what a new user sees first.
- **Contrast measured**, not judged: every token pair listed with its ratio, ≥4.5:1 body / ≥3:1 large and
  controls / ≥3:1 focus ring. The ratios are in the `--observe` text.
- **No status conveyed by colour alone** — each carries an icon, a shape or text; confirmed in greyscale.
- Keyboard-operable end to end with a **visible focus indicator**; every control has an accessible name.
- No hardcoded user-facing string if the app is multilingual; `prefers-reduced-motion` respected.
- `scripts/verify.sh` wrote a passing receipt, and any screenshot or scan attached to `--observe` **exists** —
  the tool now refuses a path that does not.
Server-rendered first with client boundaries minimal; mobile-first and no truncation in any locale; tokens
only; keyboard + focus + reduced-motion + labels verified; strings in every locale; a **fresh passing receipt**
for this branch whose observation names the loading/empty/error states you actually drove (with screenshots
attached); `scripts/verify.sh` passes and CI re-runs the same contract.

## Stack notes — Next.js App Router + Supabase (illustration, not contract)
If `vantry.yml` `stack:` names something else, this section is void and the Procedure above still applies.
- Step 1: React Server Components by default; `'use client'` only at the interactive leaf. A Server Component
  may not hand a Client Component a non-serializable prop.
- Steps 2-3: Tailwind — base classes then `sm:`/`md:`/`lg:`; semantic tokens from `globals.css`
  (`bg-card`, `text-muted-foreground`); shadcn/ui primitives already carry the focus and label affordances.
- Step 5: `next-intl`, one key added to every locale file in the same commit.
