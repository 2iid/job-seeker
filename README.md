# job-seeker

**An agent that watches the job market, applies on your behalf, and accounts for every action it
takes in your name.**

Most job boards are a race. An attractive posting collects hundreds of applications within a day,
and the ones read are the ones that arrived first. A person checking LinkedIn twice a day discovers
the posting six to forty-eight hours late, rewrites their CV by hand, and gives up after three weeks.
The selection ends up rewarding availability rather than competence.

This product closes that gap: it polls employers' own applicant-tracking boards every few minutes,
scores each posting against a canonical career profile, tailors the CV and the letter, and — at a
level of autonomy the person controls — submits the application and reports back with a receipt.

> 🇫🇷 The working language of this repository is **French**. Specifications, decision records and the
> backlog are in French; code, identifiers and commit messages are in English.

---

## Status — no application code yet

This repository currently holds the plan, not the product. What exists:

| | |
|---|---|
| [`docs/planning/project-brief.md`](docs/planning/project-brief.md) | The problem, the user, the core loop, the MVP cut, the obligations, the riskiest assumptions |
| [`docs/specs/functional-spec.md`](docs/specs/functional-spec.md) | 15 active MUST requirements, each with acceptance and refusal criteria |
| [`docs/architecture/decisions/`](docs/architecture/decisions/) | ADR-0001 stack · ADR-0002 the tiered watch engine |
| [`docs/design/design-system.md`](docs/design/design-system.md) | Measured tokens, type scale, status language, the G1–G6 contract |
| [`docs/design/job-seeker/project/`](docs/design/job-seeker/project/) | The design itself — system, screens, signature components, journeys, 16 design stories |
| [`docs/planning/kanban-backlog.md`](docs/planning/kanban-backlog.md) | 82 atomic issues across six sprints |

## The one open question that can still change the product

Public ATS board APIs are **read-only**. They list openings; they do not receive applications.
Submitting therefore goes through the employer's public application form — a driven browser, with
per-employer custom fields, variable screening questions, and sometimes an anti-bot challenge.

Issue `JOB-002` is a one-week spike: twenty real submissions across five ATS providers, measuring
success and escalation rates. **Below 70% success the product refocuses** on "prepare in ten seconds,
send in one click" — still valuable, but a different product. That is worth knowing in week one
rather than week twenty.

Two rules are written into the specification and are not negotiable: **no anti-bot challenge is ever
circumvented** — the agent stops and hands control back — and **job-posting text is treated as
hostile input**, since it is written by a third party and fed to a language model that then writes
emails and fills forms.

## Architecture, in three sentences

A Next.js application on Supabase (Postgres with row-level security, Auth, Storage) carries the
product surface; a separate containerised worker carries the watch loop, the queues, the generation
and the driven browser. The front never writes an outbound action; the worker never holds a user
session. Sources are organised in three tiers — watched ATS boards at 2–5 minutes, aggregators and
public national portals at 15–60 minutes, and assisted platforms the agent will not submit to — and
the tier is displayed wherever a posting's age is displayed, because overstating freshness would
destroy the only promise this product makes.

## How this repository is engineered

Built under [Vantry](https://github.com/2iid/vantry-universal): specialist agent roles, playbooks,
and a verification gate that produces evidence rather than a sentence. A change that claims to work
carries a receipt from a real run of the software, or it does not merge. `main` is protected: no
force-push, linear history, and the gate applies to the owner too.

## Contributing

This is a commercial product developed in the open, not a community project. Pull requests are not
being accepted at this time. Issues and security reports are welcome — see [`SECURITY.md`](SECURITY.md).

## Licence

**This is source-available, not open source.** You may read this code; you may not run, deploy, copy
or redistribute it. See [`LICENSE`](LICENSE).

Third-party components — the Vantry kit (MIT) and its vendored skills — keep their own licences and
are inventoried in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
