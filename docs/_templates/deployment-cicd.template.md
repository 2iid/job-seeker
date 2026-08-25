<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Deployment & CI/CD

> PURPOSE: How the app is built, tested in the pipeline, and deployed across environments.

## Environments  *(stack-dependent — default: Vercel + Supabase)*

| Env | Purpose | Host | Data |
|---|---|---|---|
| local | dev | <fill> | <fill> |
| preview | per-PR | <fill> | <fill> |
| staging | pre-prod | <fill> | <fill> |
| production | live | {{HOST}} | {{DATA_HOST}} |

## CI pipeline  *(default: GitHub Actions)*

Merge is blocked unless all pass:
- [ ] lint
- [ ] typecheck
- [ ] unit tests
- [ ] <fill: RLS/pgTAP if Postgres>
- [ ] e2e
- [ ] build
- [ ] <fill: security/secret scans>

## Migrations in CI/CD

<fill: how DB migrations are validated and applied per env; never edit a shipped migration.>

## Secrets & config

<fill: where secrets live per env; env validated at boot; rotation policy.>

## Deploy flow

<fill: branch → preview → merge → staging → production; approvals/gates.>

## Observability & DR

<fill: monitoring, alerting, error reporting, backups/PITR, rollback plan.>

## Cost & scaling

<fill: known cost drivers; scaling levers; where the managed→self-hosted line is (link ADR if any).>
