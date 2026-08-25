<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Design System

> PURPOSE: The concrete tokens, components, and interaction rules that implement the design direction.
> STACK NOTE: token examples assume Tailwind v4 CSS variables in `globals.css`; adapt to your styling layer.

## Design tokens

### Color
| Token | Value | Usage |
|---|---|---|
| `--color-primary` | {{PRIMARY}} | <fill> |
| `--color-bg` | <fill> | <fill> |
| `--color-fg` | <fill> | <fill> |
<!-- include semantic tokens: success/warning/danger, borders, muted -->

### Typography
| Token | Value |
|---|---|
| `--font-heading` | {{HEADING_FONT}} |
| `--font-body` | {{BODY_FONT}} |
<fill: scale — sizes, weights, line-heights.>

### Spacing / radius / shadow / motion
<fill: scale values and where they apply; respect `prefers-reduced-motion`.>

## Components

For each component: anatomy, variants, states (default/hover/focus/disabled/loading), a11y notes.

### {{COMPONENT}}
- **Variants:** <fill>
- **States:** <fill>
- **A11y:** <fill: roles, labels, keyboard.>

<!-- repeat for the core component set (buttons, inputs, cards, nav, tables, dialogs, toasts) -->

## Patterns

<fill: layout shells, forms, empty/loading/error states, data tables, navigation.>

## Accessibility baseline

<fill: contrast target, focus visibility, target sizes, semantic HTML rules.>
