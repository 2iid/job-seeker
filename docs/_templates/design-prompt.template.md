<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Design Master Prompt (for Claude / a design tool)

> PURPOSE: A copy-paste brief that generates on-brand, accessible, high-fidelity UI for this product.
> Fill every placeholder, then paste into the design tool as a single prompt.

## Product context

You are designing **{{PROJECT_NAME}}**, <fill: one-line product description>. Users: {{PERSONAS}}.
Core loop: <fill: the primary journey>. Tone: <fill: e.g. trustworthy, focused, warm>.

## Brand & visual direction

- **Feel:** <fill: 3–5 adjectives.>
- **Palette:** {{PRIMARY}} / {{SECONDARY}} / {{ACCENT}} / neutrals. <fill: any brand constraints.>
- **Typography:** {{HEADING_FONT}} / {{BODY_FONT}}.
- **References / anti-references:** <fill: what to emulate; what to avoid.>

## Layout & platform  *(stack-dependent — default: Next.js + Tailwind + shadcn/ui)*

- **Mobile-first:** author for ~390px, enhance up (`sm:`/`md:`/`lg:`).
- **Component library:** {{UI_LIB}}.
- **Density / grid:** <fill.>

## Screens to design

1. {{SCREEN_1}} — <fill: purpose + key elements.>
2. {{SCREEN_2}} — <fill.>
<!-- list the priority screens -->

## Requirements & constraints

- **Accessibility:** <fill: WCAG target; contrast; focus; no meaning by color alone.>
- **States:** every screen shows loading / empty / error / success.
- **i18n:** copy must fit {{UI_LOCALES}} (allow for text expansion).
- **Deliverables:** <fill: hi-fi frames, tokens, component specs feeding design-system.md.>

## Output format

<fill: what to return — e.g. annotated screens + a token table + component notes.>
