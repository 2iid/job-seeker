upstream:         anthropics/skills
upstream_path:    skills/frontend-design
upstream_sha:     f17010c9bb483898c1d9c9f42dde2b3a98889434
upstream_license: Apache-2.0 — vendor/skills/frontend-design/LICENSE.txt (ships inside the skill; the repo has
                  no top-level LICENSE, so this file is the governing grant)
vendored:         2026-08-08
modified:
  - The frontmatter `description` was rewritten so it cannot out-match `ui-component`. It is scoped to
    aesthetic direction, and this copy is not auto-invoked: `ui-component` cites it.
  - CONFLICTS.md was added noting the two gaps against this project's quality bar (its accessibility floor
    names three of AGENTS.md's five AA requirements; it is silent on i18n) and one factual CSS error.
  - No line of the upstream body was edited. Apache-2.0 §4(b) notice: this is a modified distribution — the
    modifications are the two files added beside it, not changes to the original text.
  - Apache-2.0 §6 grants no trademark rights: "Anthropic" and "Claude" must not appear in Vantry branding.
