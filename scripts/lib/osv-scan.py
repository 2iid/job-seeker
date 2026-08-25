#!/usr/bin/env python3
"""Read this project's dependency lockfiles and ask OSV.dev what is wrong with them.

Why OSV rather than a vendor scanner: it is the ecosystem-agnostic one. Snyk and
SonarQube are good and cover the ecosystems they cover; OSV.dev covers npm, PyPI,
Go, crates.io, Maven, NuGet, RubyGems, Packagist, Pub, Hex, and the OS
distributions — free, no account, no token, no rate-limit sign-up. A kit that
claims to work on any stack cannot depend on a scanner that does not.

This is the FALLBACK layer. scan-vulns.sh prefers a native tool when one is
installed (npm audit, pip-audit, cargo audit, govulncheck …) because those know
things a lockfile does not — reachability, dev-vs-prod, transitive paths. This
covers everything else, which on an unusual stack is everything.

    osv-scan.py <project-root> [--json]

Exit: 0 nothing found · 1 findings · 2 could not scan (no python json, no net)
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

OSV_BATCH = "https://api.osv.dev/v1/querybatch"
OSV_ONE = "https://api.osv.dev/v1/vulns/"
RANK = {"CRITICAL": 4, "HIGH": 3, "MODERATE": 2, "MEDIUM": 2, "LOW": 1, "": 0, None: 0}


# --------------------------------------------------------------- lockfile readers
def npm(root):
    out = []
    for name in ("package-lock.json", "npm-shrinkwrap.json"):
        p = root / name
        if not p.exists():
            continue
        try:
            d = json.loads(p.read_text())
        except Exception:
            continue
        # lockfileVersion 2/3
        for path, meta in (d.get("packages") or {}).items():
            if not path or not isinstance(meta, dict):
                continue
            v = meta.get("version")
            n = meta.get("name") or path.split("node_modules/")[-1]
            if n and v:
                out.append(("npm", n, v))
        # lockfileVersion 1
        def walk(deps):
            for n, meta in (deps or {}).items():
                if isinstance(meta, dict) and meta.get("version"):
                    out.append(("npm", n, meta["version"]))
                    walk(meta.get("dependencies"))
        walk(d.get("dependencies"))
    p = root / "yarn.lock"
    if p.exists():
        cur = None
        for line in p.read_text(errors="ignore").splitlines():
            m = re.match(r'^"?([^@"][^@]*)@', line)
            if m and line.rstrip().endswith(":"):
                cur = m.group(1)
            m2 = re.match(r'^\s+version:?\s+"?([^"\s]+)"?', line)
            if m2 and cur:
                out.append(("npm", cur, m2.group(1)))
                cur = None
    p = root / "pnpm-lock.yaml"
    if p.exists():
        for m in re.finditer(r"^\s+/([^:@\s][^:]*?)@([0-9][^:\s(]*)", p.read_text(errors="ignore"), re.M):
            out.append(("npm", m.group(1), m.group(2)))
    return out


def pypi(root):
    out = []
    for name in ("requirements.txt", "requirements-dev.txt", "constraints.txt"):
        p = root / name
        if p.exists():
            for line in p.read_text(errors="ignore").splitlines():
                m = re.match(r"^\s*([A-Za-z0-9._-]+)\s*==\s*([^\s;#]+)", line)
                if m:
                    out.append(("PyPI", m.group(1), m.group(2)))
    p = root / "poetry.lock"
    if p.exists():
        n = v = None
        for line in p.read_text(errors="ignore").splitlines():
            m = re.match(r'^name\s*=\s*"([^"]+)"', line)
            if m:
                n = m.group(1)
            m = re.match(r'^version\s*=\s*"([^"]+)"', line)
            if m and n:
                out.append(("PyPI", n, m.group(1)))
                n = None
    p = root / "Pipfile.lock"
    if p.exists():
        try:
            d = json.loads(p.read_text())
            for sect in ("default", "develop"):
                for n, meta in (d.get(sect) or {}).items():
                    v = (meta or {}).get("version", "").lstrip("=")
                    if v:
                        out.append(("PyPI", n, v))
        except Exception:
            pass
    p = root / "uv.lock"
    if p.exists():
        n = None
        for line in p.read_text(errors="ignore").splitlines():
            m = re.match(r'^name\s*=\s*"([^"]+)"', line)
            if m:
                n = m.group(1)
            m = re.match(r'^version\s*=\s*"([^"]+)"', line)
            if m and n:
                out.append(("PyPI", n, m.group(1)))
                n = None
    return out


def go(root):
    out = []
    p = root / "go.sum"
    if p.exists():
        seen = set()
        for line in p.read_text(errors="ignore").splitlines():
            parts = line.split()
            if len(parts) >= 2 and not parts[1].endswith("/go.mod"):
                v = parts[1]
                key = (parts[0], v)
                if key not in seen:
                    seen.add(key)
                    out.append(("Go", parts[0], v))
    return out


def cargo(root):
    out = []
    p = root / "Cargo.lock"
    if p.exists():
        n = None
        for line in p.read_text(errors="ignore").splitlines():
            m = re.match(r'^name\s*=\s*"([^"]+)"', line)
            if m:
                n = m.group(1)
            m = re.match(r'^version\s*=\s*"([^"]+)"', line)
            if m and n:
                out.append(("crates.io", n, m.group(1)))
                n = None
    return out


def rubygems(root):
    out = []
    p = root / "Gemfile.lock"
    if p.exists():
        for m in re.finditer(r"^\s{4}([A-Za-z0-9._-]+) \(([^)<>=~ ]+)\)", p.read_text(errors="ignore"), re.M):
            out.append(("RubyGems", m.group(1), m.group(2)))
    return out


def packagist(root):
    out = []
    p = root / "composer.lock"
    if p.exists():
        try:
            d = json.loads(p.read_text())
            for sect in ("packages", "packages-dev"):
                for pkg in d.get(sect) or []:
                    if pkg.get("name") and pkg.get("version"):
                        out.append(("Packagist", pkg["name"], pkg["version"].lstrip("v")))
        except Exception:
            pass
    return out


def nuget(root):
    out = []
    p = root / "packages.lock.json"
    if p.exists():
        try:
            d = json.loads(p.read_text())
            for _tfm, deps in (d.get("dependencies") or {}).items():
                for n, meta in (deps or {}).items():
                    v = (meta or {}).get("resolved")
                    if v:
                        out.append(("NuGet", n, v))
        except Exception:
            pass
    return out


def pub(root):
    out = []
    p = root / "pubspec.lock"
    if p.exists():
        n = None
        for line in p.read_text(errors="ignore").splitlines():
            m = re.match(r"^  ([A-Za-z0-9_]+):\s*$", line)
            if m:
                n = m.group(1)
            m = re.match(r'^\s+version:\s*"?([^"\s]+)"?', line)
            if m and n:
                out.append(("Pub", n, m.group(1)))
                n = None
    return out


def hexpm(root):
    out = []
    p = root / "mix.lock"
    if p.exists():
        for m in re.finditer(r'"([a-z0-9_]+)":\s*\{:hex,\s*:[a-z0-9_]+,\s*"([^"]+)"', p.read_text(errors="ignore")):
            out.append(("Hex", m.group(1), m.group(2)))
    return out


def maven(root):
    out = []
    for p in list(root.glob("**/pom.xml"))[:20]:
        txt = p.read_text(errors="ignore")
        for m in re.finditer(
            r"<groupId>([^<]+)</groupId>\s*<artifactId>([^<]+)</artifactId>\s*<version>([^<${]+)</version>", txt):
            out.append(("Maven", f"{m.group(1)}:{m.group(2)}", m.group(3).strip()))
    return out


READERS = [npm, pypi, go, cargo, rubygems, packagist, nuget, pub, hexpm, maven]


def severity_of(v):
    ds = (v.get("database_specific") or {}).get("severity")
    if ds:
        return ds.upper()
    for s in v.get("severity") or []:
        if s.get("type") in ("CVSS_V3", "CVSS_V4"):
            sc = s.get("score", "")
            m = re.search(r"/AV:", str(sc))
            if m:
                return "UNKNOWN"
    for aff in v.get("affected") or []:
        sev = (aff.get("database_specific") or {}).get("severity")
        if sev:
            return sev.upper()
    return "UNKNOWN"


def fixed_version(v, name):
    for aff in v.get("affected") or []:
        if aff.get("package", {}).get("name") != name:
            continue
        for r in aff.get("ranges") or []:
            for ev in r.get("events") or []:
                if ev.get("fixed"):
                    return ev["fixed"]
    return None


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    want_json = "--json" in sys.argv

    pkgs, seen = [], set()
    for r in READERS:
        try:
            for eco, name, ver in r(root):
                key = (eco, name, ver)
                if key not in seen:
                    seen.add(key)
                    pkgs.append(key)
        except Exception:
            continue

    if not pkgs:
        if want_json:
            print(json.dumps({"scanned": 0, "findings": []}))
        else:
            print("  · no dependency lockfile found — nothing for OSV to check.")
            print("    (A manifest without a lockfile cannot be scanned: the versions")
            print("     that actually install are not written down. Commit the lockfile.)")
        return 0

    queries = [{"package": {"name": n, "ecosystem": e}, "version": v} for e, n, v in pkgs]
    results = []
    CHUNK = 500
    try:
        for i in range(0, len(queries), CHUNK):
            body = json.dumps({"queries": queries[i:i + CHUNK]}).encode()
            req = urllib.request.Request(OSV_BATCH, data=body,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=45) as r:
                results.extend(json.loads(r.read()).get("results", []))
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        msg = f"could not reach OSV.dev ({e.__class__.__name__})"
        if want_json:
            print(json.dumps({"error": msg, "scanned": len(pkgs), "findings": []}))
        else:
            print(f"  ✗ {msg} — this is NOT a clean result, it is no result.")
            print("    Do not record 'no vulnerabilities' from a scan that did not run.")
        return 2

    findings = []
    for (eco, name, ver), res in zip(pkgs, results):
        for v in res.get("vulns") or []:
            findings.append({
                "ecosystem": eco, "package": name, "version": ver,
                "id": v.get("id"), "severity": severity_of(v),
                "summary": (v.get("summary") or "").strip()[:160],
                "fixed": fixed_version(v, name),
                "aliases": v.get("aliases") or [],
            })

    findings.sort(key=lambda f: (-RANK.get(f["severity"], 0), f["package"]))

    if want_json:
        print(json.dumps({"scanned": len(pkgs), "findings": findings}, indent=2))
        return 1 if findings else 0

    print(f"  · {len(pkgs)} package(s) across "
          f"{len(set(e for e, _, _ in pkgs))} ecosystem(s), checked against OSV.dev")
    if not findings:
        print("  ✓ no known vulnerability in any locked dependency")
        return 0

    print(f"  ✗ {len(findings)} known vulnerabilit(y/ies):")
    for f in findings:
        fix = f"→ fixed in {f['fixed']}" if f["fixed"] else "→ NO FIX PUBLISHED"
        alias = f" ({f['aliases'][0]})" if f["aliases"] else ""
        print(f"      [{f['severity']:8}] {f['ecosystem']}/{f['package']}@{f['version']}  {fix}")
        print(f"                 {f['id']}{alias}  {f['summary']}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
