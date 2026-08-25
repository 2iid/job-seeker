<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Data Model

> PURPOSE: The authoritative schema — every table, its columns, relationships, enums, and access class.

## Conventions  *(stack-dependent — default: Postgres)*

- `snake_case`, plural tables, UUID PKs (`gen_random_uuid()`), `created_at` / `updated_at TIMESTAMPTZ` on every table.
- Money as integer minor units (cents). Enums declared once and reused.
- Every table holding user/role/PII/financial data ships with RLS in the same migration (see [rls-policies](../security/rls-policies.md)).

## Entity-relationship overview

```
<fill: ERD sketch or mermaid — core entities and their cardinalities.>
```

## Enums

| Enum | Values |
|---|---|
| {{ENUM_NAME}} | <fill> |

## Tables

### {{table_name}}
- **Purpose:** <fill>
- **Access class:** <fill: public | owner-scoped | role-scoped | admin-only>
- **RLS:** <fill: which policies — link to rls-policies.md>

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| <fill> | <fill> | | | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

<!-- repeat the block per table; keep ordering roughly by dependency -->

## Relationships & integrity

<fill: FKs, cascade rules, unique constraints, indexes for hot query paths.>

## Migrations

<fill: where migrations live and the "new table → RLS + test in same PR" rule.>
