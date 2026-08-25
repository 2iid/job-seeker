# Where this reference stops short of this project's bar

Found by audit before vendoring. **Nothing upstream was edited.** These are gaps and one factual slip, not
contradictions — this skill is an ally on originality, and it defers by design (*"the brief's own words always
win"*). Read it for direction; take the bar from `ui-component` and `design-review`.

## 1. Its accessibility floor names three of five

Upstream's quality floor is *"responsive down to mobile, visible keyboard focus, reduced motion respected"*.
`AGENTS.md` requires five things, and the two missing ones are the two that get shipped wrong most often:

- **4.5:1 contrast**, measured for every text/background pair — and ≥3:1 for large text, controls, and the
  focus ring itself. `ui-component` requires the ratios written into the `--observe` text; a ratio you did not
  compute is an opinion about a colour.
- **No meaning carried by colour alone**, and **every control labelled**. Check the first the cheap way: view
  it in greyscale and confirm the states are still distinguishable.

This matters more here than usual because the same document urges *"take one real aesthetic risk you can
justify"* — good advice, and exactly the moment a low-contrast accent gets chosen.

## 2. Silent on i18n

`AGENTS.md`: never hardcode a user-facing string in a multilingual app; format dates, numbers and money per
locale. Two design consequences this skill does not mention:

- copy lives in the message catalogue, never as a literal in the markup;
- the layout has to survive a locale ~40% longer than English. A headline tuned to break perfectly at two lines
  in English breaks at four in German.

## 3. One factual error in the CSS section

It describes `.section` and `.cta` as "type-based" and "element-based" selectors of differing specificity. Both
are **class** selectors at specificity (0,1,0). The behaviour it is reaching for is real, but the cause is
source order: at equal specificity, the later rule wins. Follow the advice, ignore the explanation.

## 4. Trademark — this repo is distributed

Apache-2.0 §6 grants **no** trademark rights. "Anthropic" and "Claude" must not appear in Vantry's own
branding, docs or marketing. Attribution in `THIRD_PARTY_NOTICES.md` and in `VENDOR.md` is the correct and
sufficient acknowledgement.

---

**What is genuinely good here**, and why it was vendored: it names the generic-AI-design clusters precisely —
the same ones `originality-check` refuses and `design-review` flags — and it pushes toward *looking* at the
result (*"critique your own work as you build, taking screenshots if your environment supports it"*), which is
the same instinct as verifying by observation rather than by intention.
