---
name: data-backfill
description: Backfill existing rows safely — dry-run and count first, batch with a resumable cursor, make it idempotent, log progress, keep it stoppable, then reconcile expected vs actual. Use whenever a schema change, correction, or migration needs existing data rewritten. Trigger words — backfill, data migration, batch update, reprocess, populate column, rewrite rows, one-off script, reconcile.
---
# Data backfill (batched, resumable, idempotent)

**Use when:** existing rows must be written — populating a new column, correcting bad data, reprocessing
records. **Owners:** database-architect with backend-engineer; security-engineer if the rows are in
`sensitive_paths` territory (PII, payments, health). `safe-migration` gets you the column; this gets you
the data.

## Inputs
The exact row predicate, a production-shaped dataset to rehearse on, the expected row count, and the
deploy in which the schema change already landed.

## Procedure
1. **Dry-run first and count the rows.** Run the selection with no writes against production-shaped data and
   print the count plus a sample of before/after values. If the count surprises you, your predicate is wrong.
2. **Batch with a bounded size and a resumable cursor** — keyset pagination on an indexed, monotonic column,
   committing per batch. **Never one giant transaction**: it holds locks, blows the WAL, and cannot be stopped.
3. **Make it idempotent.** Re-running over already-processed rows must be a **no-op** — filter on the target
   state (`WHERE col IS NULL`), not on a "have I run yet?" assumption. Assume it will be run twice.
4. **Log progress** every batch: cursor position, rows written this batch, running total, elapsed. A human
   watching must be able to answer "where is it?" without querying the database.
5. **Make it stoppable and document how.** A kill signal between batches must leave the data consistent, and
   the next invocation must resume from the cursor. Write the stop-and-resume commands in the PR.
6. **Throttle** — sleep between batches under load, and watch replication lag. A backfill that degrades the
   live service is an incident.
7. **Reconcile at the end**: expected count vs actual count, plus a spot-check query proving the values are
   right. Report both numbers. A mismatch is a failure, not a rounding error.
8. **Verify** with `scripts/verify.sh` that the application reads the backfilled data correctly, and record
   the reconciliation with `scripts/verify.sh --observe "<expected rows>" "<actual rows + spot check>"`.

## Guardrails
- ❌ **Never backfill in the same deploy as the schema change that needs it.** Ship the column, deploy, then
  backfill — otherwise a rollback strands half-written rows.
- ❌ **Never write a backfill that cannot be stopped halfway** — no unbounded loop, no single transaction over
  the whole table, no cursor held in memory only.
- ❌ Never tighten a constraint (`NOT NULL`, `UNIQUE`) in the same step — that is `safe-migration` step (c),
  after reconciliation passes.
- ❌ Never run it from a laptop against production without a documented stop procedure and someone watching.

## Run it twice. That is the whole proof.
Every numbered step above can complete without ever executing the backfill a second time, while the Done-when
demands that a re-run is "provably a no-op". A proof with no producing step gets asserted from the armchair.

```bash
<the backfill command>            # run 1 — record the count of rows changed
<the backfill command>            # run 2 — MUST report 0 rows changed
```

If run 2 changes rows, the script is not idempotent and the backfill is not done, whatever run 1 reported. Paste
both counts into `--observe`.

## Done when
- The dry run printed a count, and the real run's count **matched it**; both numbers are in `--observe`.
- **The backfill was run a SECOND time and changed 0 rows** — this is an executed step, not an inference. Run it
  and paste the second run's count. Idempotency asserted without a second run is a wish.
- Reconciliation query returns the expected shape (no orphans, no duplicates, no nulls where the migration
  promised values).
- The script is resumable: it records progress, and re-running after an interrupt neither skips nor repeats.
- `scripts/verify.sh` wrote a passing receipt and the observation quotes the counts.
The dry-run count matched the plan, the job ran in bounded batches from a resumable cursor, a re-run is
provably a no-op, progress was logged throughout, expected and actual counts reconcile with a passing
spot-check, and a receipt records the observation.
