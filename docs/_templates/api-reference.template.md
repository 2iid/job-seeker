<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# API Reference

> PURPOSE: The contract for every endpoint — method, path, auth, request/response shape, and errors.

## Conventions

- Versioned under `/api/v1`. JSON in/out.
- **Error shape (shared):** `{ error: { code, message, details? } }`.
- All input validated with {{VALIDATION_LIB}} (default: Zod) at the boundary; authorization re-checked server-side.
- Auth: <fill: session cookie / bearer — how the caller is identified.>

## Standard error codes

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | <fill> |
| `forbidden` | 403 | <fill> |
| `not_found` | 404 | <fill> |
| `validation_error` | 422 | <fill> |
| `rate_limited` | 429 | <fill> |

## Endpoints

### {{METHOD}} /api/v1/{{resource}}
- **Auth / role:** <fill>
- **Request:** <fill: body/query schema or link to Zod schema>
- **Response 200:** <fill: shape>
- **Errors:** <fill: which codes>
- **Notes:** <fill: idempotency, pagination, rate limit.>

<!-- repeat per endpoint; group by resource -->

## Webhooks  *(if applicable — e.g. Stripe)*

- **{{PROVIDER}} webhook:** signature-verified, idempotent (dedupe by provider event id). <fill: events handled.>
