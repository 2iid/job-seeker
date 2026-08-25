#!/usr/bin/env bash
# =============================================================================
#  validate-agents.sh — catch the class of defect that made every persona's
#  "Skills you use" section decorative.
#
#  The v1 audit's single most consequential finding was invisible to review:
#  `tools:` is a WHITELIST, and not one of the fifteen personas listed `Skill`.
#  Every playbook reference in every role was therefore unreachable. Nothing in
#  the repo could have told you — so this script exists.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 1
ERR=0
err()  { echo "  ✗ $1"; ERR=1; }
warn() { echo "  ⚠ $1"; }

KNOWN_TOOLS="Read Grep Glob Bash Write Edit MultiEdit NotebookEdit WebFetch WebSearch Skill Task TodoWrite"
KNOWN_MODELS="opus sonnet haiku inherit"

fm() {  # $1 = file, $2 = key → the frontmatter value
  awk -v k="$2" '
    NR==1 && $0=="---" { inf=1; next }
    inf && $0=="---"   { exit }
    inf && index($0, k":")==1 { sub("^" k ":[[:space:]]*", ""); print; exit }
  ' "$1"
}

echo "→ validating agents/"
COUNT=0
for f in agents/*.md; do
  [ -e "$f" ] || continue
  base="$(basename "$f" .md)"
  [ "$base" = "README" ] && continue
  COUNT=$((COUNT + 1))

  head -1 "$f" | grep -q '^---$' || { err "$f: no YAML frontmatter on line 1"; continue; }

  name="$(fm "$f" name)"
  [ -n "$name" ] || err "$f: frontmatter has no 'name'"
  [ "$name" = "$base" ] || err "$f: name '$name' does not match the filename '$base'"

  desc="$(fm "$f" description)"
  [ -n "$desc" ] || err "$f: frontmatter has no 'description'"
  [ "${#desc}" -lt 40 ] && warn "$f: description is very short (${#desc} chars) — it is how the agent gets selected"

  model="$(fm "$f" model)"
  if [ -n "$model" ]; then
    case " $KNOWN_MODELS " in *" $model "*) : ;; *) err "$f: unknown model '$model'" ;; esac
  else
    warn "$f: no model declared — it inherits, which is rarely what you want for a gate role"
  fi

  tools="$(fm "$f" tools)"
  if [ -z "$tools" ]; then
    warn "$f: no explicit tools list (inherits everything)"
    continue
  fi

  # every listed tool must exist
  echo "$tools" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | while IFS= read -r t; do
    [ -n "$t" ] || continue
    case " $KNOWN_TOOLS " in *" $t "*) : ;; *) echo "  ✗ $f: tool '$t' does not exist"; ;; esac
  done | grep . && ERR=1

  # THE check: a persona that names playbooks must be able to invoke one.
  if grep -qiE '^-[[:space:]]*\*\*[a-z0-9-]+\*\*|^##[[:space:]]*Skills you use' "$f"; then
    case "$tools" in
      *Skill*) : ;;
      *) err "$f: names playbooks but 'Skill' is not in tools — every reference is inert" ;;
    esac
  fi

  # Substance. A nine-line persona reading "you are a senior Unity engineer,
  # 20 years, follow best practices" used to pass clean — which makes
  # /forge-agent's stated quality bar unenforced, on the artefact with the
  # largest blast radius in the kit (a persona writes code here for months).
  # Line count alone is a floor calibrated on the sample minimum: the shortest
  # shipped persona is exactly 25 lines, so "< 25" could never reject anything
  # that exists. Count SUBSTANCE instead — prose lines carrying an actual claim,
  # not headings or one-word bullets. A job title padded to length still fails.
  body="$(awk 'NR>1 && /^---$/{f=1;next} f' "$f")"
  # sort -u: ten copies of one sentence is one idea, not ten.
  substance="$(printf '%s\n' "$body" | grep -v '^##' | grep -v '^[[:space:]]*$' | awk 'length($0) >= 45' | sort -u | grep -c .)"
  sections="$(printf '%s\n' "$body" | grep -c '^## ')"
  # Every metric here used to be monotonic in word count, which made the floor a
  # filler-production incentive on the artefact with the largest blast radius in
  # the kit. Bulk alone is no longer an error; what is measured now is whether
  # the persona says anything only someone who knows the domain could say.
  [ "${substance:-0}" -lt 10 ] && err "$f: only $substance substantive lines — a persona needs judgement calls a generalist would get wrong, not a job title padded to length"
  [ "${sections:-0}" -lt 4 ] && err "$f: only $sections sections — see docs/_templates/agent.template.md"
  # Domain tokens: backticked identifiers, file paths, commands, versions,
  # numbers with units. Generic prose has almost none; a real specialist cannot
  # write four sentences without one. Cheap to satisfy honestly, expensive to
  # fake, and it does not reward length.
  tokens="$(printf '%s\n' "$body" \
            | grep -oE '`[^`]+`|[A-Za-z0-9_]+\.[a-z]{2,4}\b|[0-9]+(ms|s|kb|mb|MB|KB|px|%)\b|\b[A-Z][A-Za-z]+[A-Z][A-Za-z]*\b' \
            | sort -u | grep -c . || true)"
  # CamelCase alone satisfied the old floor, and CamelCase is what generic prose
  # is full of: "GitHub", "JavaScript", "TypeScript". A persona of pure filler
  # with zero domain content passed clean, was mirrored into .claude/agents/, and
  # /next would dispatch real work to it — the artefact with the longest blast
  # radius in the kit. So the floor now rests on the two signals prose cannot
  # produce by accident.
  #
  # 1. BACKTICKED identifiers. A specialist naming the things they touch reaches
  #    this without trying; filler scores zero, not few.
  ident="$(printf '%s\n' "$body" | grep -oE '`[^`]+`' | sort -u | grep -c . || true)"
  # 2. CONCRETE lines — a real sentence that names one of them. This measures
  #    whether the judgement is domain-specific rather than aphoristic, and it
  #    does not care which heading it lives under (nine shipped personas state
  #    judgement under their own headings; renaming is not substance).
  concrete="$(printf '%s\n' "$body" | grep -v '^##' | awk 'length($0)>=45' | grep -c '`' || true)"
  bodylines="$(printf '%s\n' "$body" | grep -c . || true)"
  [ "${ident:-0}" -lt 8 ] && err "$f: only $ident distinct backticked identifiers — a specialist names the files, commands and fields they actually touch. Generic prose scores zero here, which is the point."
  [ "${concrete:-0}" -lt 6 ] && err "$f: only $concrete concrete lines (a real sentence naming a specific identifier) — this reads as advice, not as a role"
  # /forge-agent documents a 25-line floor. It documented it and nothing enforced
  # it, so a 14-line body shipped.
  [ "${bodylines:-0}" -lt 25 ] && err "$f: body is $bodylines lines — /forge-agent asks for at least 25, and a role that fits in a paragraph is a job title"
  # A named "## Judgement" section is what /forge-agent calls the one that
  # matters, but only a minority of shipped personas use that exact heading —
  # making it a hard requirement would fail the roster on day one and the check
  # would be weakened within a week. So it is a nudge, while the domain-token
  # floor below measures the same property without caring what it is called.
  grep -qiE '^##[[:space:]]*(Judgement|Judgment)' "$f" \
    || warn "$f: no '## Judgement you are expected to have' section — the domain tokens below stand in for it, but the named section is what /forge-agent asks for"
  [ "${tokens:-0}" -lt 8 ] && err "$f: only $tokens distinct domain tokens — no file, command, identifier or measured quantity a specialist would name. Generic seniority prose reads exactly like this."
  grep -q '^## ' "$f" || err "$f: no sections at all — see docs/_templates/agent.template.md"
  grep -qiE '^##[[:space:]]*(Definition of Done|Done when|Output contract)' "$f" \
    || err "$f: no '## Definition of Done' — a role that cannot say when its work is finished cannot be held to it"
  # Filler that says seniority instead of demonstrating it.
  # One rephrase walked straight through the original five literals. This is
  # still a blocklist and still finite — the domain-token floor is the real
  # measure — but it should at least cost more than a synonym.
  filler="$(grep -ioE 'best[- ]practices?|years?.{0,3} (of )?experience|[0-9]+\+? ?(yrs?|years).{0,3} experience|world[- ]?class|cutting[- ]edge|highly experienced|battle[- ]tested|seasoned (expert|professional|engineer)|production[- ]grade|decades? of|industry[- ]leading|deep expertise|proven track record' "$f" | head -2 | tr '\n' ' ')"
  [ -n "$filler" ] && err "$f: seniority is asserted, not shown ($filler) — replace with the judgement calls this role actually makes"

  # a persona that can change code must own the verification playbook
  case "$tools" in
    *Write*|*Edit*)
      grep -q 'verify-change' "$f" || err "$f: can Write/Edit but never names verify-change" ;;
  esac

  # a persona whose playbooks require running things needs a shell
  if grep -qE 'verify-change|write-tests|ci-pipeline|design-review' "$f"; then
    case "$tools" in
      *Bash*) : ;;
      *) err "$f: owns a playbook that must RUN something, but has no Bash" ;;
    esac
  fi

  # Every playbook it names must exist.
  #
  # This check used to pipe its own output into `grep -v … >/dev/null || true`,
  # which discarded every finding AND the exit status: a persona citing a
  # playbook that did not exist passed cleanly. Proven by dropping a nine-line
  # fake persona into agents/ and watching this script print "valid".
  #
  # Scoped to the "Skills you use" list and to bold **entries**, because
  # backticked words appear all over a persona (agent names, file paths, tool
  # names) and matching those produced dozens of false positives — which is
  # presumably why the output got silenced instead of fixed.
  bad_skill="$(awk '
    /^##[[:space:]]+Skills you use/ { inb = 1; next }
    inb && /^##[[:space:]]/         { inb = 0 }
    # EVERY bold token on the line, not just the first: a line naming two
    # playbooks had its second one unchecked.
    # Every bold token BEFORE the em-dash. The house format is
    # "- **name** — description", so bold after the dash is emphasis, not a
    # second playbook; taking every bold on the line flagged "**inside**".
    inb && /^-[[:space:]]+\*\*[a-z]/ {
      l = $0
      if (index(l, " — ") > 0) l = substr(l, 1, index(l, " — "))
      while (match(l, /\*\*[a-z][a-z0-9-]+\*\*/)) {
        t = substr(l, RSTART + 2, RLENGTH - 4); print t
        l = substr(l, RSTART + RLENGTH)
      }
    }' "$f" | sort -u | while IFS= read -r s; do
      [ -n "$s" ] && [ ! -d "skills/$s" ] && printf '%s ' "$s"
    done)"
  [ -n "$bad_skill" ] && err "$f: names playbook(s) that do not exist: $bad_skill"
done

echo "  checked $COUNT persona(s)"

# The roster in agents/README.md is what /assemble-team reads to know which
# roles it may select. A persona that exists but is not listed there is shipped
# and unselectable — `debugger` was exactly that for two versions.
for f in agents/*.md; do
  base="$(basename "$f" .md)"
  [ "$base" = "README" ] && continue
  grep -q -- "- \`$base\`" agents/README.md 2>/dev/null \
    || err "agents/$base.md exists but is not listed in agents/README.md — /assemble-team reads that list, so this role can never be selected"
done

# The three roles the method cannot function without.
for core in tech-lead-orchestrator qa-test-engineer security-engineer; do
  [ -f "agents/$core.md" ] || err "non-prunable core role is missing: agents/$core.md"
done

echo "→ validating skills/"
SCOUNT=0
for d in skills/*/; do
  [ -d "$d" ] || continue
  s="$(basename "$d")"
  f="${d%/}/SKILL.md"
  SCOUNT=$((SCOUNT + 1))
  [ -f "$f" ] || { err "skills/$s has no SKILL.md"; continue; }
  head -1 "$f" | grep -q '^---$' || { err "$f: no frontmatter"; continue; }
  n="$(fm "$f" name)"
  [ "$n" = "$s" ] || err "$f: name '$n' does not match the directory '$s'"
  d2="$(fm "$f" description)"
  [ -n "$d2" ] || err "$f: no description"
  case "$d2" in *"Trigger words"*|*"trigger words"*) : ;; *) warn "$f: description has no trigger words — it may never fire" ;; esac
  grep -q '^## Done when' "$f" || warn "$f: no '## Done when' section"
done
echo "  checked $SCOUNT skill(s)"

# Every number this repo announces, checked against the directories. A count
# maintained by hand drifts the week after it is written — and a kit whose
# thesis is "no claim without evidence" cannot ship a claim nobody checks.
echo "→ validating the counts the repo announces"
# Scan every file that could carry a count, not an allowlist of four — the
# largest surface (46 playbooks, named all over skills/) was the one excluded,
# and two stale numbers sat in the flagship lifecycle commands.
for file in README.md AGENTS.md CONTRIBUTING.md skills/README.md skills/AUDIT.md agents/README.md \
            $(ls skills/*/SKILL.md 2>/dev/null); do
  [ -f "$file" ] || continue
  for word in playbooks skills; do
    for n in $(grep -oE "[0-9]+ $word\b" "$file" 2>/dev/null | grep -oE '^[0-9]+' | sort -u); do
      # Only numbers big enough to BE a total. "6 playbooks" in a findings table
      # is a subset and always will be; crying wolf on it is how a check gets
      # deleted, which is how the stale 42 survived in the first place.
      [ "$n" -ge 10 ] 2>/dev/null || continue
      [ "$n" = "$SCOUNT" ] || err "$file says '$n $word' — there are $SCOUNT"
    done
  done
  for word in "specialist roles" personas "senior roles"; do
    for n in $(grep -oE "[0-9]+ $word" "$file" 2>/dev/null | grep -oE '^[0-9]+' | sort -u); do
      [ "$n" -ge 10 ] 2>/dev/null || continue
      [ "$n" = "$COUNT" ] || err "$file says '$n $word' — there are $COUNT"
    done
  done
done
[ "$ERR" -eq 0 ] && echo "  ✓ every announced count matches the directories"

echo
[ "$ERR" -eq 0 ] && echo "✓ agents and skills are valid." || echo "✗ agent/skill validation FAILED."
exit "$ERR"
