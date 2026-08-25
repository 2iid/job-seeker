<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Functional Spec

> PURPOSE: What the product does, feature by feature and role by role, as testable user stories.

## How to read this

Features are grouped by area. Each **MUST** story carries a stable `REQ-###` id; acceptance criteria map 1:1
to tests, to Definition-of-Done checks, and to the `req` column on the board. Non-goals prevent scope creep.

## Actors

Everyone and everything that touches this system — **not only end users**. Operators, external systems,
sub-processors, the regulator and the attacker are what produce the integration inventory, the webhook
surface and the trust boundaries that `threat-model`, `webhook-handler` and `security-review` consume.

Every actor gets a **refusal criterion**: the thing it must never be able to do. That column is where the
deny-tests come from. See [security-model](../security/security-model.md) for the authoritative matrix.

| Actor | Kind | Can do | MUST be refused |
|---|---|---|---|
| {{ROLE_1}} | end user | <fill> | <fill: e.g. read another tenant's rows> |
| {{OPERATOR}} | operator / support | <fill: what support can see and act on> | <fill: e.g. read plaintext secrets> |
| {{PROVIDER}} | external system (payments, email, LLM) | <fill: which endpoints it calls, which it receives> | <fill: e.g. an unsigned or replayed webhook> |
| {{SUB_PROCESSOR}} | sub-processor (hosting, analytics, model vendor) | <fill: what data it holds, where> | <fill: e.g. receive PII it has no purpose for> |
| Regulator / auditor | oversight | <fill: what they can demand — export, deletion, records> | — |
| Attacker | hostile | — | <fill: the capability the whole design refuses> |

## Feature areas

### {{FEATURE_AREA}}  (e.g. Onboarding, Core loop, Billing, Admin)

#### REQ-001 · MUST — <fill: short title>

**Story:** As a {{ROLE}}, I want <fill> so that <fill>.

- **Acceptance criteria:**
  - [ ] <fill: observable, testable condition>
  - [ ] <fill: refusal — which actor above is denied, and what they get instead>
  - [ ] <fill: edge case — empty / late / duplicate>
- **Notes / dependencies:** <fill: linked tables, APIs, integrations.>

<!-- Repeat per story; keep stories atomic so one maps to one issue.
     ONLY MUST stories get an id, and ids are stable forever — never renumber, never reuse.
     SHOULD/COULD stories stay unnumbered prose under the same feature area.
     More than ~15 MUST means your MVP is wrong — cut before you number. -->

## Cross-cutting requirements

- **i18n:** all user-facing strings localized ({{UI_LOCALES}}).
- **Accessibility:** <fill: target, e.g. WCAG 2.1 AA.>
- **Notifications:** <fill: in-app / email triggers.>

## Explicit non-goals

- <fill: what these features deliberately do NOT do in this phase.>
