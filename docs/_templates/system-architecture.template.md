<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# System Architecture

> PURPOSE: How the system is put together at runtime — components, boundaries, data flow, and cross-cutting concerns.

## 1. High-level diagram

```
<fill: ASCII or mermaid — client → app/server → data store → third-party services.>
```

## 2. Components  *(stack-dependent — default: Next.js + Supabase)*

| Component | Responsibility | Tech |
|---|---|---|
| Web / client | <fill> | {{FRONTEND}} |
| Server / API | <fill: reads via RSC, writes via Server Actions/Route Handlers> | {{BACKEND}} |
| Data store | <fill> | {{DATABASE}} |
| Auth | <fill> | {{AUTH}} |
| Storage | <fill> | {{STORAGE}} |
| Realtime / jobs | <fill> | {{REALTIME_JOBS}} |
| Third-party | <fill: payments, video, AI, email> | {{INTEGRATIONS}} |

## 3. Request & data flow

- **Reads:** <fill: e.g. Server Components query the request-bound client → RLS enforced.>
- **Writes:** <fill: validated at boundary → server guard → DB.>
- **Auth path:** <fill: session cookie, middleware gating, role source.>

## 4. Environments & runtime

<fill: local / preview / staging / prod; where each component runs; hosting choice.>

## 5. Cross-cutting concerns

- **Security boundary:** <fill: where authz is enforced — see security-model.md.>
- **Observability:** <fill: logs, metrics, error reporting.>
- **Background work:** <fill: cron/queues and their triggers.>
- **Scaling & cost:** <fill: how it grows; known cost drivers.>

## 6. Key architectural decisions

Links to the ADRs that shaped this: <fill: ADR-0001, ADR-0002, …>.
