# `vendor/` — third-party agent instructions, frozen and reviewed

Everything under `vendor/skills/` is text written by someone else that this project's agents read.

**It is vendored, never fetched at run time.** That is the whole point of this directory, and the reason is
worth stating plainly: an agent skill is not a library. A library runs in a sandbox you can reason about; an
instruction file runs in *the agent's judgement*, on your repository, with whatever permissions the session
already holds. There is no CVE database for prose and no lockfile hash for persuasion. The only control that
actually works is: read it, freeze it, and notice when it changes.

## Why these are not in `skills/`

`skills/` is auto-invoked. A skill lands there and its `description` competes to be selected — so a third-party
description written to be trigger-maximal will win matches away from the playbook that carries this project's
rules. A real example from the audit that produced this directory: Supabase's skill says *"Load this skill
BEFORE writing or changing anything that lives in a Postgres database … even for a one-column change"*, which
sits directly on top of `safe-migration`, `rls-policy`, `perf-profile`, `background-job` and `data-backfill`.

Nothing here is auto-invoked. **Our own playbooks cite these files by path** when they want them. The
third-party content is a reference the house procedure reaches for — never a procedure that replaces it.

## What every vendored skill must carry

A `VENDOR.md` beside it with this header, and a real licence file:

```
upstream:         <owner>/<repo>
upstream_path:    <path inside that repo>
upstream_sha:     <full 40-character commit SHA>
upstream_license: <SPDX id> — <where the text lives>
vendored:         <YYYY-MM-DD>
modified:         <every change made, one per line — or "none">
```

`modified:` is not bookkeeping. For Apache-2.0 material it is a §4(b) obligation, and for everything it is what
turns the next refresh into a three-way merge instead of a guess.

## What enforces this

`scripts/check-vendored.sh`, wired in as an acceptance criterion so it runs on **every** verification:

- every vendored directory has a `VENDOR.md` with a resolvable `upstream_sha` and a licence file;
- the recorded SHA-256 of each directory matches the committed manifest — **if the bytes change, the gate goes
  red**, which is the honest version of a pin;
- **no vendored `SKILL.md` may declare a wildcard `allowed-tools:`**. A pre-approved shell grant pointing at
  third-party instructions is the one thing this directory exists to prevent.

`vendor/**` is also in `vantry.yml` `sensitive_paths`, so changing anything here needs a committed
`security-review` verdict. That is deliberate: editing what your agent believes is a security change.

## Refreshing

One skill at a time, through `dependency-upgrade` — never a bulk update. Read the upstream diff in full (it is
prose, it is short), re-apply the `modified:` list, re-run the audit rubric on anything new, then
`scripts/verify.sh` and `--observe`. Update the manifest with `scripts/check-vendored.sh --update`.

## What was refused, and why

Two candidates from the same review were **not** vendored. Recorded here because a rejection nobody wrote down
gets proposed again in six months:

- **`vercel-labs/agent-browser`** — its frontmatter pre-grants `Bash(agent-browser:*)`, and that wildcard
  covers `plugin add`, which spawns `npx -y <spec>` at add time: arbitrary, network-resolved code behind one
  allowlisted-looking command. It also defers its real instructions to `agent-browser skills get core`, a
  corpus that is not in the file you review and changes per release. Good project, wrong shape for a kit whose
  premise is an enumerable, reviewed instruction surface.
- **`vercel-labs/skills` → `find-skills`** — a package manager for instructions whose own vetting step is
  install count and GitHub stars, and which never tells the agent to *read* what it is about to install. Its
  recommended `-g` writes third-party instructions to the home directory: outside git, outside the diff,
  outside `tree_digest`, outside CI. A change to how every agent behaves, that can produce no receipt.

Neither author is hostile and both projects are well built. They are refused on shape, not on trust.
