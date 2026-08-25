# Skill Library — Security & Enforceability Audit

The playbooks are **meta-instructions every agent follows**, so a flaw here does not stay here — it
propagates to every project that installed the kit. This records their audit so the "reliable" claim is
something you can check rather than something we assert.

**48 skills**: 26 build playbooks (auto-invoked, verification-first) and 20 lifecycle rituals you invoke by
name (`refine-idea`, `bootstrap`/`kickoff`, `adopt`, `next`, `pickup-issue`, `sprint-review`,
`refine-backlog`, `standup`, `handoff`, `assemble-team`, `forge-agent`, `release`, `rollback`, `gtm-plan`,
`launch-kit`, `growth-review`, `originality-check`, …).

## Method

Every skill is reviewed against seven criteria. The first five are v1's; **(6) and (7) are new, and they are
the ones that would have caught the defect that shipped.**

1. Does it advise anything that weakens security?
2. Does it contradict the security golden rule or the `AGENTS.md` guardrails?
3. Does it omit a critical guardrail or verification for its domain?
4. Is the `description` scoped so it will fire when it should and not when it shouldn't?
5. Any technical error that leads to an insecure or incorrect implementation?
6. **Enforceability — does its "Done when" name a CHECKABLE artefact?** A step that ends in prose is graded
   by the agent that performed it. Name the file, the exit code, or the receipt.
7. **Wiring — is anything DEPENDENT on it?** A playbook nobody invokes is documentation, not process.

Plus a scan for embedded secret-shaped strings.

## Result

**Advice quality: PASS.** All 46 are verification-first and reinforce the posture — server-authoritative
validation, row security with allow **and** deny tests, no privileged key on the user path, no secrets or PII
in logs, webhooks verified over the raw body then deduped with a replay no-op, LLM context bound to the
requesting principal with injection defence and an adversarial exfiltration test, deny-by-default,
verify-before-report. No dangerous advice, no secret leakage, well-scoped triggers.

**Enforceability: PASS as of v2.** In v1 this criterion did not exist, and the consequence was the defect the
owner hit in production: **every** "Done when" in **every** playbook was prose, so nothing downstream could
depend on any of them. `verify-change` in particular was referenced by nothing in the delivery loop, and its
own "Done when" passed both when the change was broken ("or the mismatch is reported") and when nothing had
been run at all ("if you couldn't run it, say why").

## Findings and fixes

| # | Sev | Skill | Finding | Fix |
|---|---|---|---|---|
| 1 | **Critical** | `verify-change` | Invoked by nothing. Not in `AGENTS.md`, not in the Definition of Done, not in `/next`, `/sprint-review` or `/code-review`. The canonical loop was `implement → tests → PR` — no step executed the software. | Rewritten around `scripts/verify.sh` and wired into the loop, the DoD, the build playbooks and both review gates, which now **refuse** to review an unverified change. |
| 2 | **Critical** | all playbooks | Every "Done when" was unenforceable prose; the repo shipped no hook, no settings, no CI and no artefact. | Criteria (6) and (7) added and applied. Gate playbooks now emit a tracked verdict receipt; build playbooks require a fresh passing verification receipt. |
| 3 | **Critical** | `verify-change` | Its "Done when" was self-nullifying: it passed when the change was broken and when nothing was run. | Three exclusive verdicts — `VERIFIED`, `FAILED`, `CANNOT_VERIFY`. There is deliberately no verdict meaning "probably fine". |
| 4 | High | `verify-change` | Assumed a Next.js dev server, leaving verification **undefined** for a CLI, a library, a service or a mobile app — and an undefined criterion cannot be enforced. | Neutral by `project_type`, with a table of what "exercised" means per type. `run.smoke` is declared per project in `vantry.yml`; empty means verification is UNDEFINED and `verify.sh` exits 2 rather than passing. |
| 5 | High | `/next`, `/sprint-review` | The loop could not close: `gh pr merge` appeared **zero** times in the whole repo while `/sprint-review` defined done as "PR merged", so `/next` re-selected the same issues until the branch already existed. | Merge is a first-class step with a declared owner (`merge.authority`, default human). `/next` reconciles and reaps worktrees before dispatching. |
| 6 | High | `/next` | "Never co-dispatch two issues that share a file" was unmechanizable — the backlog held no file information. | Co-dispatch requires disjoint declared `paths` on both issues; an issue with no declared paths is not co-runnable. |
| 7 | Medium | `security-review` | "Which changes need me" was the agent's self-assessment. | Mechanical: the diff intersected with `vantry.yml` `sensitive_paths`, which also generates CODEOWNERS and drives the CI job. |
| 8 | Medium | 6 playbooks | Required "CI green" while the kit shipped no CI — an uncheckable box. | `.github/workflows/verify.yml` ships; CI re-runs the contract and does not trust the local receipt. |
| 9 | Medium | `code-review`, `adopt`, `next`, `llm-feature`, `decompose-feature` | Trigger-word collisions ("refactor", "continue", "audit my project", bare "agent", "sprint") meant the wrong playbook fired. | Disambiguated; "refactor" now belongs to the new `refactor-safely`. |
| 10 | Low (clarification) | `ci-pipeline` | Gating the heavy suite on the promotion push is an **intentional** cost optimisation for the free Actions minutes, not a hole. The wording implied that branch was the repo default. | Reframed as an explicit, deliberate prod gate; the only real anti-pattern is a **dead gate** — a branch condition that never receives the promotion merge. |
| 11 | Low | `observability-setup` | A public health endpoint hitting the DB per call is a small DoS and enumeration surface. | Rate-limit plus a cheap cached probe; verbose detail behind auth. |

No finding survived as an unpatched Critical or High.

## Re-auditing

Re-run after any skill edit — and note that this is now enforced rather than remembered:

```bash
bash scripts/validate-agents.sh   # frontmatter, tool whitelists, name/dir agreement, Done-when present
bash scripts/check-refs.sh        # no playbook points at a file that does not exist
bash evals/run.sh                 # does a real agent actually end up verifying?
```

`agents/**`, `skills/**` and `AGENTS.md` are deliberately **not** in `trivial_paths`: editing a playbook is a
behavioural change and owes a verification, exactly like editing a route handler.
