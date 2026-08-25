---
name: originality-check
description: Guarantee a deliverable is ORIGINAL — no clones, no copy-paste, no name/brand/design collisions. Verify names/brands against prior art (web + same-space products + trademark + domain + GitHub/npm), reject look-alike designs and generic AI clichés, and demand a distinctive point of view. Run BEFORE committing to any public-facing name, brand, landing page, UI, or headline. Trigger words — originality, original, prior art, name check, brand check, trademark, domain, is this taken, avoid clone, distinctive, duplicate, plagiarism, generic.
---
# /originality-check — ship original work, never a clone

**Use when:** you're about to commit to anything **public-facing or identity-defining** — a product/project **name**,
a brand, a **landing page**, a **UI/design language**, a tagline/headline, or the core concept. The rule it enforces:
**what we ship must be original and verifiably NOT a copy of something that already exists.**

**Owners:** `product-strategist` (names/brand), `ui-ux-designer` (design), `content-marketer` (copy) — and any agent
producing outward-facing work.

## Why this exists (learned the hard way)
AI clusters on the obvious: the first name it invents is often already a company; the first design it draws is the
same look everyone ships; the first headline is a cliché. **Originality does not happen by default — it must be
verified.** A cloned name is a legal + brand disaster; a generic design is instantly forgettable.

## Procedure

### A. Names & brands — the highest risk
1. **Search prior art BEFORE committing** — the exact name **and near-variants** (one letter off, plurals, common
   prefixes/suffixes, the "-ly/-ify/-io/-ai" mutations) across: the open web, **the same industry/space** (this
   matters most), a **trademark** database ([WIPO](https://branddb.wipo.int/) / USPTO / EUIPO), **domain**
   availability (`.com` / `.dev` / `.ai`), and **GitHub / npm / PyPI**.
2. **Check each candidate INDIVIDUALLY.** Batched "A OR B OR C" searches miss collisions — verify one name at a time.
3. **Reject a name if** a product exists in the same or adjacent space, a strong trademark exists, it's a near-clone
   of a known brand, or even the *root* is crowded (e.g. an over-used stem like `corv-`, `squad-`, `adept-`).
4. **Prefer coined / invented words** — they're the safest to own and the truest "exists nowhere else".
5. **Never assert a name is "available" from a web search.** "No web hit" ≠ free domain ≠ clear trademark. State what
   you verified; the final **domain + trademark clearance is a human step** — hand it off explicitly.
6. Deliver 3–5 candidates, each with its prior-art status + a recommendation; the human confirms the domain/trademark.

### B. Design & UI
7. **Name the generic AI-design defaults and refuse them:** cream (#F4F1EA) + serif + terracotta; near-black + one
   acid-green/vermilion pop; broadsheet hairline rules; purple→blue gradient hero on white; Inter/Space-Grotesk as
   the "safe" face; emoji as section markers; everything centered; `rounded-lg` everywhere; accent-bar-on-rounded-card.
8. **Make deliberate, subject-specific choices** — palette, type pairing, layout, and **one real aesthetic risk** that
   comes from *this* product's world, not a template. If a choice would fit any generic SaaS, redo it.
9. **Never copy a competitor's UI.** Draw from the subject's own materials/vernacular, not a look-alike.

### C. Content & concept
10. **No swapped-noun clones.** Headlines, docs, and marketing must say something specific and true to *this* product
    — not a competitor's page with the name changed.
11. **The concept needs a distinct point of view (a wedge).** If the pitch is indistinguishable from an existing
    product, sharpen it until it isn't.

### D. Persist the finding
12. **Write the check to `docs/product/originality/<name>.md`** — the candidates, what was searched (web, same
    space, trademark register, domain, GitHub/npm), what was found, the recommendation, and the date. A
    clearance that lives in a chat window gets redone badly six weeks later, or worse, assumed. Mark the
    **domain + trademark clearance as OUTSTANDING (human)** until a human records the confirmation in that file.

## Guardrails
Never claim a name/domain/trademark is "clear" from a web search alone — that's a human clearance step. Never ship a
design that matches the generic AI cluster. Never clone a competitor's name, UI, or copy. If originality can't be
confirmed, **STOP and flag it** rather than shipping a likely duplicate.

## Done when
The name has documented prior-art status (with the domain/trademark left to the human to confirm), the design makes
deliberate distinctive choices (not the generic defaults), and the copy/concept is specific to this product — all
**verifiably not a clone**, and all written down in `docs/product/originality/<name>.md`.
