#!/usr/bin/env python3
"""Merge Vantry's hook registrations into an EXISTING .claude/settings.json.

The installer treats settings.json as project data and preserves it whole — which
is right, because it holds the user's own permissions and hooks. But it meant the
kit's hook scripts were copied and never registered: on any brownfield repo that
already had a settings.json, the Stop gate and the bash guard simply did not run,
while the README's capability table said they did.

Preserving someone's file and installing nothing are not the same thing. This
merges, additively and idempotently:

  · Vantry's hook entries are added to their matcher, never replacing the user's.
  · Vantry's permission allows are added; nothing is ever removed.
  · Every other key is left exactly as found.
  · Running it twice changes nothing the second time.

    merge-claude-settings.py <kit-settings.json> <target-settings.json>
"""
import json
import sys
from pathlib import Path


def load(p):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return {}


def hook_cmds(entry):
    return {h.get("command", "") for h in entry.get("hooks", []) if isinstance(h, dict)}


def merge_hooks(theirs, ours):
    """Add our hook entries without touching theirs. Matched on matcher + command."""
    out = dict(theirs)
    added = []
    for event, our_entries in (ours or {}).items():
        their_entries = list(out.get(event, []))
        for oe in our_entries:
            matcher = oe.get("matcher")
            ocmds = hook_cmds(oe)
            # already registered, in any entry for this event?
            if any(ocmds & hook_cmds(te) for te in their_entries):
                continue
            same = next((te for te in their_entries if te.get("matcher") == matcher), None)
            if same is not None:
                same.setdefault("hooks", []).extend(oe.get("hooks", []))
            else:
                their_entries.append(json.loads(json.dumps(oe)))
            added.extend(sorted(ocmds))
        if their_entries:
            out[event] = their_entries
    return out, added


def merge_perms(theirs, ours):
    out = json.loads(json.dumps(theirs or {}))
    added = []
    for bucket in ("allow", "deny", "ask"):
        ours_b = (ours or {}).get(bucket) or []
        if not ours_b:
            continue
        cur = out.get(bucket) or []
        for rule in ours_b:
            # Count what was ACTUALLY added, not what was offered. Reporting
            # "30 permissions added" when 13 were new is the kind of number
            # nobody checks and everybody quotes.
            if rule not in cur:
                cur.append(rule)
                added.append(rule)
        out[bucket] = cur
    return out, added


def main():
    if len(sys.argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    kit_p, tgt_p = sys.argv[1], sys.argv[2]
    kit = load(kit_p)
    tgt_path = Path(tgt_p)

    if not tgt_path.exists() or not tgt_path.read_text().strip():
        tgt_path.parent.mkdir(parents=True, exist_ok=True)
        tgt_path.write_text(json.dumps(kit, indent=2) + "\n")
        print("  + .claude/settings.json written (you had none)")
        return 0

    tgt = load(tgt_p)
    if not tgt:
        # Present but unparseable. Do NOT overwrite someone's file because we
        # could not read it — say so and let a human look.
        print("  ! .claude/settings.json exists but is not valid JSON — left untouched.")
        print("    Vantry's hooks are NOT registered. Fix the JSON, then re-run:")
        print("      python3 scripts/lib/merge-claude-settings.py .claude/settings.json .claude/settings.json")
        return 1

    hooks, h_added = merge_hooks(tgt.get("hooks", {}), kit.get("hooks", {}))
    perms, p_added = merge_perms(tgt.get("permissions", {}), kit.get("permissions", {}))

    if not h_added and not p_added:
        print("  = .claude/settings.json already carries Vantry's hooks (nothing to do)")
        return 0

    tgt["hooks"] = hooks
    tgt["permissions"] = perms
    tgt.setdefault("$schema", kit.get("$schema", "https://json.schemastore.org/claude-code-settings.json"))
    tgt_path.write_text(json.dumps(tgt, indent=2) + "\n")

    print(f"  ~ .claude/settings.json MERGED — yours kept, {len(h_added)} hook(s) and "
          f"{len(p_added)} permission(s) added")
    for c in h_added:
        print(f"      + hook {c}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
