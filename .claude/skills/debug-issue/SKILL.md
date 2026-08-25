---
name: debug-issue
description: Find the ROOT CAUSE of a failure and fix that — reproduce with a failing test first, narrow by bisect/binary search, one written hypothesis at a time, then keep the regression test forever. The home for a failed verification receipt. Use when the gate returns fail, a test regresses, or a bug is reported. Trigger words — debug, root cause, bug, reproduce, bisect, regression, intermittent failure, verification failed, why is this broken.
---
# Debug issue (root cause, not symptom)

**Use when:** `scripts/verify.sh` wrote a **fail** verdict, a test regressed, or a reported bug needs a cause.
**Owners:** debugger (hand the failure over — the agent that wrote the bug is the worst reader of it).

## Inputs
The failing receipt `.vantry/receipts/<branch-slug>.verify.json` — read the failing step's `cmd`, `exit_code`
and `tail`, plus `log_scan.errors` — the repro steps, and the last known-good commit.

## Procedure
1. **Reproduce first, as a failing test.** Write the smallest test that fails *because of this bug* and run it
   red. **No repro, no fix** — without it you cannot tell a fix from a coincidence.
2. **Narrow the search space.** `git bisect run <cmd>` between the last known-good commit and HEAD;
   binary-search the input (halve it until the failure disappears); disable half the system and re-run.
3. **One hypothesis at a time.** Write it down as a falsifiable sentence ("the session is null because the
   cookie is set after the redirect"), then run the one experiment that disproves it. Record the result.
   Do not move to the next hypothesis until the current one is disproved or confirmed.
4. **Fix the cause.** Name it in one sentence before you edit anything. If the sentence is "the value is
   sometimes undefined", you have found a symptom, not a cause — keep going.
5. **Keep the regression test forever.** It stays in the suite under the bug's id; it is the only thing that
   stops this returning. Confirm it fails on the pre-fix code and passes on the fixed code.
6. **Re-run `scripts/verify.sh`**, then `scripts/verify.sh --observe "<expected>" "<observed>"` recording that
   the original repro no longer reproduces. Report the cause, the fix, and the hypotheses you disproved.

## Guardrails
- Never "fix" by widening a `catch`, adding a null-guard at the call site, or retrying — that hides the cause.
- Never change two things at once; you will not know which one worked, and neither will the next reader.
- If the bug does **not** reproduce, say so plainly. An unreproduced bug is not fixed, it is hidden — report
  what you tried, what you could not reach, and what evidence would settle it.

## Done when
A test that failed before the fix passes after it and stays in the suite; the cause is stated in one sentence
(not the symptom); disproved hypotheses are recorded; `scripts/verify.sh` has written a **pass** receipt for
the current tree with an observation that the original repro is gone.
