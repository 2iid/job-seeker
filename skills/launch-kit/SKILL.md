---
name: launch-kit
description: Generate the concrete launch assets for a product — landing copy, Product Hunt post, build-in-public thread, Reddit/Show HN posts, and a welcome email sequence — each tuned to its channel. Trigger words — launch, launch kit, product hunt, build in public, launch thread, announce, show hn, launch assets, email sequence.
---
# /launch-kit — the assets that turn a launch into users

**Use when:** it's time to launch (or relaunch). Produces ready-to-post assets. **Owner:** `content-marketer`
(+ `growth-strategist`).

## Procedure
1. **Anchor** on `docs/growth/gtm-plan.md` (positioning, ICP, channel order) + the product itself.
2. **Write one asset per channel the plan ranked**, in that order — the `✅ first` row first, then `later`.
   Two are always required whatever the plan says, because every launch has a destination and a first hour:
   - **`landing.md`** — hero thesis, problem, outcome, proof, pricing, one CTA.
   - **`welcome-emails.md`** — 3–5 emails: activate → aha-moment → ask for feedback/referral.

   Never one copy-paste across channels: each asset is written for its own culture.

3. **The channel specimens below are an illustration, not a contract.** They are what a Western developer-tool
   launch needs. When `docs/growth/gtm-plan.md` ranks a WhatsApp broadcast, a Discord announcement, a local
   forum or a WeChat post first, **that** is the asset you write, and this list is void — writing four assets
   for channels the plan did not choose burns the "commit to one channel" guardrail `/gtm-plan` just set.
   - **`product-hunt.md`** — tagline, description, the maker's first comment (the story), a gallery shot-list.
   - **`build-in-public.md`** (X/LinkedIn) — the hook + the story + the ask.
   - **`show-hn.md`** / a Reddit post — human, non-salesy, leads with value and invites feedback.

4. **Bilingual** where the audience needs it (e.g. EN + FR).

Write to `docs/growth/launch-kit/`, one file per asset, from `docs/_templates/launch-asset.template.md`.

## Guardrails
Match each channel's culture — HN hates hype, Reddit wants a human, PH wants the story. Honest: no fake scarcity,
no invented proof. One CTA per asset. Specific beats clever.
**Original, not a clone:** positioning + copy must be unmistakably *this* product's — never a swapped-noun rewrite of a
competitor's launch, never the generic AI-design/AI-copy defaults. Any brand/product name gets `originality-check` first
(prior art + trademark + domain, human-cleared).

## Done when
Counted, not surveyed — the old wording quantified over whatever files happened to be there, so an **empty**
directory satisfied it, on the command a founder runs on launch day:
- `docs/growth/launch-kit/` contains **`landing.md`** and **`welcome-emails.md`**, plus **one file per channel**
  the gtm-plan marked `✅ first` or `later` — so
  `ls docs/growth/launch-kit/ | wc -l` ≥ `grep -c 'first\|later' docs/growth/gtm-plan.md`, and never 0.
- `grep -rc '<fill:' docs/growth/launch-kit/` prints `0` for every file — `bash scripts/check-refs.sh` exits 0.
- Each asset names its channel on line 1 and carries **exactly one** CTA.
- Any new brand or product name has been through `/originality-check` and cleared **by a human**.
