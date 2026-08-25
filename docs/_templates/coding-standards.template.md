<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Coding Standards

> PURPOSE: The conventions every contributor (human or agent) follows so the codebase stays consistent.

## Language & typing  *(stack-dependent — default: TypeScript strict)*

- <fill: strict mode; no `any`; no unjustified suppressions.>

## Naming

- **DB:** <fill: snake_case, plural tables, UUID PKs, created_at/updated_at.>
- **Code:** <fill: PascalCase types/components, camelCase vars/functions, SCREAMING_SNAKE consts.>

## Project structure

<fill: where routes, components, lib/services, db, messages live — mirror the repo layout.>

## Data & validation

- Validate all external input with {{VALIDATION_LIB}} at the boundary; share schemas client↔server.
- Money as integer minor units. Dates as {{DATE_TYPE}}; display in {{DEFAULT_TZ}}.

## Server vs client  *(stack-dependent)*

<fill: reads via server components; writes via server actions/handlers; third-party keys server-only.>

## Errors & logging

- Shared error shape `{ error: { code, message, details? } }`.
- Structured logs; never log secrets, tokens, or PII.

## i18n & accessibility

- No hardcoded user-facing strings; both/all locales updated together.
- <fill: accessibility baseline.>

## Git & PRs

- **Commits:** Conventional Commits (`feat:`/`fix:`/`chore:`/`docs:`/`test:`/`refactor:`).
- **One issue = one PR**, closing with `Closes #NN`. Scoped diffs; no drive-by changes.

## Secrets & config

- No secrets in code. Load from env, validated at boot (`{{ENV_MODULE}}`).
