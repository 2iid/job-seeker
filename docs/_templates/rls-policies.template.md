<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# RLS Policies

> PURPOSE: Per-table row-level security — the DB-enforced expression of the permission matrix.
> STACK NOTE: This doc applies when the data store is Postgres with RLS (default: Supabase). If the
> project uses a different store, replace with the equivalent authorization-enforcement doc.

## Ground rules

1. Every user/role/PII/financial table has **RLS enabled** and policies in the **same migration**.
2. New tables **deny by default** — access is granted only by explicit policy.
3. The privileged/`service_role` key bypasses RLS; it is quarantined to trusted server contexts and paired with an app-layer guard + audit entry.
4. Each policy ships with a pgTAP test proving **both an allowed and a denied** access.
5. Policies mirror the [security-model](./security-model.md) permission matrix 1:1.

## Helper predicates

<fill: reusable SQL helpers, e.g. current_user_id(), has_role(), owns_row(), in_scope().>

## Per-table policies

### {{table_name}}
- **Access class:** <fill: owner-scoped | role-scoped | admin-only>
- **SELECT:** <fill: USING predicate in plain English + SQL sketch>
- **INSERT:** <fill: WITH CHECK predicate>
- **UPDATE:** <fill: USING + WITH CHECK>
- **DELETE:** <fill: predicate or "denied">
- **Tests:** <fill: pgTAP file path; the allow case and the deny case.>

<!-- repeat per table -->

## Storage object policies  *(if using object storage with path-scoped access)*

<fill: bucket, path convention, and the policy that scopes objects to owner/scope.>

## Testing

<fill: how RLS tests run locally and in CI (e.g. `supabase test db` / pgTAP).>
