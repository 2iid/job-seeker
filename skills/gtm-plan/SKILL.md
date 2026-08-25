---
name: gtm-plan
description: Produce a concrete go-to-market plan for a finished (or nearly-finished) product — positioning, ICP, ranked channels, pricing, launch plan, a 90-day growth plan, and the funnel metrics to track. Trigger words — gtm, go to market, growth plan, launch plan, how do I get users, marketing plan, sell my product, get audience.
---
# /gtm-plan — a path from "shipped" to "users & revenue"

**Use when:** the product works and the question is now *"how do I get users / an audience / sales?"*
**Owner:** `growth-strategist` (+ `content-marketer`).

## Procedure
1. **Anchor** — read `CLAUDE.md` and `docs/planning/project-brief.md`: what it is, who for, the region/market.
   If the brief carries a **`## Unit economics`** section (written by `/analyze-requirements`), read it: it is
   the only margin arithmetic this kit computes, and step 5's price has to agree with it or say why not.
2. **Positioning** — one sentence: *for [ICP] who [need], [product] is the [category] that [unique value]*.
3. **ICP** — the one beachhead customer to win first (not "everyone").
4. **Channels, ranked by fit** — pick the top 1–2 to start (SEO, communities, Product Hunt, X/build-in-public,
   partnerships, ads, local channels like WhatsApp/mobile-money). Justify the ranking; **commit to one first.**
5. **Pricing** — model + price points + the revenue math to the target (e.g. "$X × N customers = goal").
   **The revenue target is the founder's, not yours.** Ask for it. If it is not supplied, write
   `<target — not supplied>` and say so in the summary; never infer a goal and then plan against it. If the
   brief has `## Unit economics`, the price here matches it or the discrepancy is stated in one line.
6. **Launch plan** — the sequence + assets (hand to `/launch-kit`).
7. **90-day growth plan** — week-by-week focus, one primary metric per phase.
8. **Metrics (AARRR)** — define acquisition/activation/retention/referral/revenue + how each is instrumented.
Write it all to `docs/growth/gtm-plan.md` (template in `docs/_templates/gtm-plan.md`).

## Guardrails
One channel to first traction — don't spread thin. Retention before acquisition. Every metric has an owner and an
instrument. Region-aware (match channels + payments to the actual market). No vanity metrics.

**Claims here get published.** This is the first point in the closure sequence where a category claim ("the only
scheduler that…"), a competitor comparison and a price get committed to a file the founder will quote from.
Every competitor claim, market-size figure and price benchmark is a **human-verified fact** — never assert one
from model knowledge or a web search. Mark it `(assumed — confirm)` in the plan's *Claims that need a human*
table, or leave it out. If the positioning introduces a new **product name or category label**, run
`/originality-check` first (prior art + trademark + domain — human-cleared, never asserted from a search).

## Done when
Checked, not felt:
- `bash scripts/check-refs.sh` exits **0** — it fails while any `<fill:` marker survives, so a copied template
  cannot pass here. That is the whole reason the template uses that convention.
- `docs/growth/gtm-plan.md` has **exactly one** channel row flagged `✅ first` —
  `grep -c '✅ first' docs/growth/gtm-plan.md` prints `1`.
- The **`## ICP — the beachhead`** section names a segment, not "everyone" and not "SMBs".
- The **`## Metrics (AARRR)`** table has all five Instrument cells naming a real tool or event —
  **`/growth-review` step 1 reads that table and cannot run without it.**
- The price and the revenue target are both present, or the target is explicitly `<target — not supplied>`.
