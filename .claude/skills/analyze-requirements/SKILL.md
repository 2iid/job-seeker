---
name: analyze-requirements
description: The business-analyst pass between a confirmed brief and the build — one question salvo, then obligations (what THIS product is forced to do, each mapped to a technical control and a board row), unit economics (gross margin per user, arithmetic only), a REQ-### id on every MUST story, and this project's real performance/availability numbers. Writes no new file. Trigger words — analyze requirements, business analyst, obligations, compliance, GDPR, PCI, HIPAA, regulated, unit economics, margin, cost per user, pricing, REQ id, non-functional requirements, feasibility.
---
# /analyze-requirements — obligations, economics, and REQ ids

**Use when:** the brief is confirmed and the product touches money, personal data, health, or a regulated
market — before `/bootstrap` decomposes it. **Owners:** product-strategist; the obligations pass is
delegated to security-engineer. **It writes no new file** — it adds sections to files that already exist and
are already read downstream.

**Inputs:** `docs/planning/project-brief.md` (confirmed), `docs/specs/functional-spec.md` once `/bootstrap`
has written it, `docs/engineering/definition-of-done.md`.

## Procedure
1. **One salvo, at most four questions** — a single `AskUserQuestion`, every option carrying a recommended
   default, plus a "take the defaults" path. Ask only what you cannot infer from the brief: jurisdictions +
   data classes handled · price per user per month · the LLM tier and run count of the core loop · the
   hardest non-software dependency (licence, partner, regulator). If the defaults are taken, **write down
   what you assumed** — every derived value carries `(assumed — confirm)`. `skills/refine-idea/SKILL.md`
   forbids interrogation; that rule binds here.
2. **Add `## Obligations`** to `docs/planning/project-brief.md`, immediately after `## Constraints`:
   `OBL-n | Trigger (what in THIS product creates it) | Technical control | Where it lands`. Column four is
   the whole point — name the issue, area or REQ it becomes, never a paragraph. No row for a regulation you
   cannot tie to something this product actually does. Keep the template's two honesty lines verbatim.
3. **Add `## Unit economics`** — arithmetic, only on numbers the user supplied or confirmed in step 1, so it
   stays auditable and does not rot. Price per user/month minus LLM tokens for the core loop at the chosen
   tier, payment fees, per-seat SaaS, infra. Show the working. One bold line: **gross margin per user: $X**.
   If negative, one sentence and two levers. **Never look up a price on the web.**
4. **Rewrite row 1 of the existing `## Riskiest assumptions`** with the hardest NON-software thing — the
   licence, the partner, the regulatory artefact — and its cheapest disproof. Reuse that table; never build
   a parallel one.
5. **Number the MUSTs** in `docs/specs/functional-spec.md`: every MUST story becomes
   `#### REQ-004 · MUST — <title>`. **Only MUST stories get an id**, stable forever — never renumber. Fill
   the refusal criterion for every actor in the actors table; that is where the deny-tests come from.
6. **Write the real numbers** into `docs/engineering/definition-of-done.md`, replacing the template's
   hard-coded p95/p99, LCP and availability defaults with this project's. That is the entire
   "non-functional requirements" value without inventing an NFR namespace.
7. **Hand back** — `/bootstrap` reads the brief; `/decompose-feature` puts the REQ ids in the `req` column.

## Guardrails
- **Not legal advice**, and the model's knowledge has a cutoff — say it in the file, not only here.
- The **non-technical** obligations (a DPA per sub-processor, a privacy policy, cookie consent, a processing
  register) are out of the table and out of scope. "GDPR — covered by row security + a delete endpoint" is
  worse than no table.
- Never block. A red obligation is a warning the founder reads, never a gate on `/bootstrap`.
- No new document. If you are about to create `docs/planning/requirements.md`, you have misread this.

## Done when
The sections are FILLED, not merely present — a copied template satisfies a heading check and proves nothing:
- `## Obligations` has at least one OBL row with all four columns filled, and no `<fill` marker anywhere.
- `## Unit economics` shows the arithmetic and a numeric **gross margin per user** line.
- Every MUST story in `docs/specs/functional-spec.md` carries a `REQ-###` id.
- `bash scripts/check-refs.sh` exits 0 — it fails on any surviving marker.

## Superseded
`docs/planning/project-brief.md` carries `## Obligations`, `## Unit economics`, and a non-software row 1 in
`## Riskiest assumptions`; **every obligation row names where it lands**; the margin line is arithmetic over
stated numbers; every MUST story in `docs/specs/functional-spec.md` carries a `REQ-###` id; and
`docs/engineering/definition-of-done.md` states this project's numbers, not the template's.
