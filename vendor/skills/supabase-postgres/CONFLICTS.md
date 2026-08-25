# Where this reference is weaker than this project's rules

Found by audit before vendoring. **Nothing upstream was edited** — the corrections live here so the next
refresh stays a clean three-way merge. When the upstream text and this file disagree, **this file wins**, and
the named playbook wins over both.

## 1. Constraints added in one shot — `safe-migration` blocks this

Upstream's `schema-constraints.md` shows `alter table … add constraint … unique / check / foreign key` as a
single statement. On a live, populated table that takes an `ACCESS EXCLUSIVE` lock for the full validation
scan — the exact pattern `skills/safe-migration` names as a hard block. The words `NOT VALID`, `VALIDATE` and
`CONCURRENTLY` appear nowhere in that file.

**The safe forms, which are what to actually do:**
```sql
-- UNIQUE: build the index without a write lock, then adopt it
CREATE UNIQUE INDEX CONCURRENTLY orders_ref_key ON orders (ref);      -- outside a transaction
ALTER TABLE orders ADD CONSTRAINT orders_ref_key UNIQUE USING INDEX orders_ref_key;

-- CHECK and FOREIGN KEY: two migrations, never one
ALTER TABLE orders ADD CONSTRAINT orders_total_positive CHECK (total_cents > 0) NOT VALID;
-- …then, in a SEPARATE migration once the backlog of rows is clean:
ALTER TABLE orders VALIDATE CONSTRAINT orders_total_positive;
```

## 2. 27 bare `CREATE INDEX` statements

`CONCURRENTLY` appears only in that repo's contributing guide, never in the rules a reader follows. In a
migration against a live table it is always `CREATE INDEX CONCURRENTLY`, **outside a transaction** — which also
means such a migration cannot be wrapped in one. The bare form in the upstream examples is for new or empty
tables only.

## 3. `numeric(10,2)` for money

`schema-data-types.md` uses `price numeric(10,2)`. This project's convention is **integer minor units**
(`AGENTS.md`, *Conventions*): `price_cents bigint`. `numeric` is exact and therefore not wrong the way a float
is wrong — but mixing the two representations across a codebase is where rounding disputes come from, and the
convention exists to stop that. Use `bigint` cents.

## 4. `gen_random_uuid()` primary keys labelled "Incorrect"

`schema-primary-keys.md` argues against random UUID PKs on index-locality grounds, and offers a 53-byte
`concat(to_char(…), gen_random_uuid()::text)` text key. The performance reasoning about B-tree locality is
sound and worth reading; the conclusion is not this project's. `AGENTS.md` sets **UUID PKs** as the DB
convention, and a 53-byte text primary key propagates into every foreign key and every index in the schema.

If a specific table genuinely has a write-throughput problem that locality would fix, that is an ADR
(`skills/write-adr`) — not a default.

## 5. RLS on a session GUC, without the caveat that makes it safe

`security-rls-basics.md` presents

```sql
using (user_id = current_setting('app.current_user_id')::bigint)
```

as the **Correct** pattern. It is only correct when that GUC is set by trusted server code on a connection no
client can reach, and it **fails open in the wrong direction** if the setting is missing: the cast raises,
which aborts the query, but any code path that catches and continues sees no policy at all.

Prefer the provider's verified-claim function (`auth.uid()`), and if a GUC is genuinely required, fail closed:

```sql
using (
  current_setting('app.current_user_id', true) IS NOT NULL
  AND user_id = current_setting('app.current_user_id', true)::bigint
)
```

**And whichever form you use, `skills/rls-policy` still applies in full**: the policy and an **executed** allow
test and an **executed** deny test ship in the same change, and the deny test is promoted to `acceptance:` so a
regression fails every future verification.

## 6. A literal password in an example

`security-privileges.md` contains a `create role … password '…'` example with a literal. Never commit one —
inject from the platform's secret store. The pre-commit secret scan will refuse most shapes, but the habit is
the control.

---

**What is genuinely good here**, and why it was vendored despite the above: `(select auth.uid())` wrapping to
stop per-row re-evaluation, keyset pagination over `OFFSET`, `for update skip locked` for queues, `GIN` vs
`jsonb_path_ops` selection, `BRIN` for time-series, and the connection-pooling material. That content is
current, correct, and not otherwise in this kit.
