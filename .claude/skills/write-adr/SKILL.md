---
name: write-adr
description: Capture an architectural decision as a short ADR in docs/architecture/decisions/ using the 0000-adr-template.md — Status/Date/Deciders/Context/Decision/Rationale/Consequences/Alternatives — link related ADRs, and update anything the decision contradicts. Use when choosing a stack/pattern/boundary, reversing a prior decision, or a task implies deviating from the docs. Trigger words — ADR, architecture decision, decision record, trade-off, we decided, supersede.
---
# Write an ADR (architecture decision record)

**Use when:** a decision with lasting architectural impact is made (or a task implies deviating from the
docs). **Owners:** tech-lead-orchestrator. A decision record is stack-neutral by definition — it records
why this project chose what it chose.

## Inputs
The decision + the forces driving it, the alternatives weighed, who signed off, and the existing ADRs in
`docs/architecture/decisions/` (for the next number + any records this one relates to or supersedes).

## Procedure
1. **Number it:** find the highest `NNNN-*.md` in `docs/architecture/decisions/` and use the next integer,
   zero-padded (e.g. `0004-...`). File name is `NNNN-short-kebab-title.md`.
2. **Copy the template** `0000-adr-template.md` and fill every section — delete the template comment and all
   `{{...}}` / `<fill:...>` placeholders:
   - **Status** (Proposed | Accepted | Superseded by ADR-#### | Deprecated), **Date**, **Deciders**.
   - **Context** — the requirements/constraints/problem forcing a decision; state hard requirements
     explicitly (security target, scale, team model).
   - **Decision** — the choice in 1–2 crisp sentences (what we WILL do).
   - **Rationale** — why it wins; a requirement → satisfaction table works well.
   - **Consequences** — positive + negative/trade-offs, each negative with a mitigation.
   - **Alternatives considered** — the real options and why each was rejected.
3. **Keep it short** — a page. It records a decision, not a design doc; link `docs/specs/*` for detail.
4. **Link related ADRs** both ways: set this ADR's `Supersedes`, and edit the superseded ADR's Status to
   `Superseded by ADR-####`. Cross-reference siblings it builds on.
5. **Reconcile contradictions:** if the decision changes something in `CLAUDE.md` or another doc, update that
   doc in the SAME change so the docs never disagree with the ADR (docs-vs-ADR mismatch is a bug).
6. **Verify** the file renders, has no leftover placeholders, and appears in the decisions index/README if one exists.

## Guardrails
- Never edit an already-Accepted ADR's decision to change history — supersede it with a new ADR instead.
- Never leave `{{...}}`/`<fill:...>` placeholders or an empty Alternatives section.
- Never let an ADR and `CLAUDE.md`/specs disagree — reconcile in the same change.

## Done when
- `docs/adr/NNNN-<slug>.md` exists, numbered one above the highest present, created from
  `docs/_templates/0000-adr-template.md` with **every section filled**.
- `bash scripts/check-refs.sh` exits **0** — it fails while any `<fill:` marker survives, so a half-filled ADR
  cannot pass here.
- **Status** is one of `Proposed` / `Accepted` / `Superseded by NNNN`, never blank.
- Related ADRs are linked **both ways**: the new one names what it supersedes, and that file names this one.
- Any doc the decision contradicts was updated **in the same change** — list the paths.
