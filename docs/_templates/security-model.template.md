<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Security Model

> PURPOSE: The authoritative security spec — auth, authorization, data protection, OWASP mapping, threat model.
> Any change touching auth, authz, payments, file access, or PII is reviewed against this doc.

## 1. Principles

1. **Defense in depth** — <fill: the independent layers that must all agree (edge, session, server guard, DB/RLS).>
2. **Least privilege** — <fill: privileged keys quarantined.>
3. **Secure by default** — new tables/routes deny until explicitly granted.
4. **Validate at the boundary** — <fill: Zod on all input.>
5. **Auditable** — sensitive mutations write an append-only audit entry.
6. **No secrets in code/client.**

## 2. Authentication  *(stack-dependent — default: Supabase Auth)*

- **Methods:** <fill: email+password, OAuth, invitations.>
- **Sessions:** <fill: token lifetimes, cookie flags, rotation.>
- **MFA:** <fill: who requires it; step-up for sensitive areas.>
- **Email verification / reset / lockout:** <fill.>

## 3. Authorization — RBAC + ownership

- **Roles:** {{ROLES}} — sourced from the DB/session, never trusted from the client.
- **Rule:** authorization = role AND ownership/scope; the same predicates appear in server guards AND the DB layer (RLS).

### Permission matrix
| Capability | {{ROLE_1}} | {{ROLE_2}} | … |
|---|:--:|:--:|:--:|
| <fill> | | | |

Mirrored 1:1 by [rls-policies](./rls-policies.md).

## 4. Data protection

- **In transit / at rest:** <fill: TLS/HSTS; managed encryption; backups.>
- **Files:** <fill: private buckets, short-lived signed URLs, path scoping.>
- **PII minimization:** <fill: what's collected; never logged.>

## 5. OWASP Top 10 mapping

| Risk | Mitigation |
|---|---|
| A01 Broken Access Control | <fill> |
| A02 Cryptographic Failures | <fill> |
| A03 Injection | <fill> |
| A05 Misconfiguration | <fill: headers, CSP, env validation.> |
| A07 Auth Failures | <fill> |
| A08 Integrity (webhooks) | <fill: signature + idempotency.> |
<!-- fill remaining rows as relevant -->

## 6. AI / LLM security  *(if applicable)*

<fill: server-only calls, context scoping to requesting user, prompt-injection defense, guardrails, rate/cost caps.>

## 7. Abuse & rate limiting

<fill: per-IP/per-user limits on auth, uploads, AI, public endpoints; bot protection.>

## 8. Threat model (STRIDE)

| Threat | Example | Control |
|---|---|---|
| Spoofing | <fill> | <fill> |
| Tampering | <fill> | <fill> |
| Information disclosure | <fill> | <fill> |
| Elevation of privilege | <fill> | <fill> |

## 9. Compliance & privacy

<fill: PCI scope (SAQ-A if Stripe-hosted), GDPR/CCPA export & deletion, data residency.>

## 10. Non-negotiable checklist (every sensitive PR)

- [ ] <fill: e.g. RLS + policies in same migration; allow AND deny tests; no privileged key on user path; input validated; no secret/PII in logs; signed URLs; webhooks verified + idempotent.>
