upstream:         supabase/agent-skills
upstream_path:    skills/supabase-postgres-best-practices
upstream_sha:     1207767388a0ffb55f21fb4e6988fee96942431d
upstream_license: MIT — vendor/skills/supabase-postgres/LICENSE (repo-level, verified)
vendored:         2026-08-08
modified:
  - The SKILL.md frontmatter `description` was rewritten. Upstream's is deliberately trigger-maximal
    ("Load this skill BEFORE writing or changing anything that lives in a Postgres database ... even for a
    one-column change") and would out-match safe-migration, rls-policy, perf-profile, background-job and
    data-backfill. Scoped to performance, and the file is no longer auto-invoked at all — it lives here and
    our own playbooks cite it.
  - The phrase "and the tests that verify them" was removed: the skill advertises RLS tests and ships none.
  - A DEFERENCE header was prepended to SKILL.md naming which vantry playbook owns each area it touches.
  - CONFLICTS.md was added, recording the four points where its guidance is weaker than this project's rules.
    Nothing in the upstream rule files was edited — the corrections live beside them, so the next refresh is a
    clean three-way merge.
