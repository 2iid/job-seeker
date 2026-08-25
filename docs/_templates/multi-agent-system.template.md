<!-- TEMPLATE: filled by /bootstrap. Replace {{...}} and <fill:...>. Delete this comment. -->

# Multi-Agent Engineering System

> PURPOSE: The team of specialized Claude Code sub-agents that build this project, and how work routes between them.
> Agent definitions live in [`.claude/agents/`](../../.claude/agents/); this doc is the catalog + routing rules.

## Why specialize

<fill: specialists keep domain standards loaded and create review boundaries (e.g. nothing touching
auth/security merges without the security reviewer).>

## The team

| Agent | Exp. | Specialty | Responsibilities | Model |
|---|---|---|---|---|
| tech-lead-orchestrator | <fill> | planning/architecture | decompose, sequence, route, own ADRs | opus |
| frontend-engineer | <fill> | UI | <fill> | sonnet |
| backend-engineer | <fill> | API/domain | <fill> | sonnet |
| database-architect | <fill> | schema/migrations | <fill> | opus |
| security-engineer | <fill> | authz/security | **mandatory gate** on sensitive changes | opus |
| devops-engineer | <fill> | CI/CD/cloud | <fill> | sonnet |
| qa-test-engineer | <fill> | testing | <fill> | sonnet |
<!-- add/remove agents to match this project's needs (e.g. payments, ai, design) -->

## Routing rules (who picks up what)

- New / multi-domain feature → tech-lead-orchestrator decomposes, then routes.
- UI / screen → <fill: designer then frontend>.
- Endpoint / server logic → backend (+ database-architect if schema changes).
- Schema / migration → database-architect.
- **Anything touching auth, authz, payments, file access, PII, or AI context → security-engineer review before merge. Non-negotiable.**
- Tests / verification → qa-test-engineer before merge on non-trivial work.

## Collaboration model (one issue → merge)

```
tech-lead decomposes → specialist implements → qa writes tests
   → (if sensitive) security reviews → CI gates → green → merge → next issue
```

Rules of engagement: <fill: one issue = one PR; delegate out-of-domain work; docs are binding;
security can block; DoD is the shared merge contract.>

## How to invoke

<fill: call the Agent tool with subagent_type = agent name and a self-contained brief (files to read,
exact deliverable, DoD). Agents are defined in `.claude/agents/<name>.md`.>
