#!/usr/bin/env python3
"""Refresh the standalone map (the claude.ai artifact) from data/erd.v5.json.

standalone/nplify-erd-map.html is the page as last published; this script rewrites its data constants
(E, ORDER, R, INV, WALKS, DOC_META, CONVENTIONS, NOTES, OPENQ, UND_NEW, UNDERSTANDING, DECISIONS,
SCENARIOS, SCENARIO_V4, FRS_VOCAB, FRS_DEV, FEE_PRACTICE) and the header counts, in place. Publish the
result to https://claude.ai/artifact/UcLWqFB6cHtmT4ksojG7G2.   python3 scripts/build-map-artifact.py"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
T = ROOT / "standalone/nplify-erd-map.html"
d = json.loads((ROOT / "data/erd.v5.json").read_text())
NAMES = ["E", "ORDER", "R", "INV", "WALKS", "DOC_META", "CONVENTIONS", "NOTES", "OPENQ", "UND_NEW", "UNDERSTANDING", "DECISIONS", "SCENARIOS", "SCENARIO_V4", "FRS_VOCAB", "FRS_DEV", "FEE_PRACTICE"]

def js(v):
    return json.dumps(v, ensure_ascii=False).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029").replace("</script", "<\\/script")

lines = T.read_text().split("\n")
seen = set()
for i, l in enumerate(lines):
    m = re.match(r"const ([A-Z_0-9]+) ?=", l)
    if m and m.group(1) in NAMES:
        assert l.rstrip().endswith(";"), f"{m.group(1)} is not on one line"
        lines[i] = f"const {m.group(1)}=" + js(d[m.group(1)]) + ";"
        seen.add(m.group(1))
assert seen == set(NAMES), set(NAMES) - seen
h = "\n".join(lines)
tables = sum(1 for e in d["E"].values() if e["d"] != "view"); views = len(d["E"]) - tables
h = re.sub(r"draft v[\d.]+ · \d+ tables \+ \d+ views", f"draft v{d['version']} · {tables} tables + {views} views", h)
T.write_text(h)
print("refreshed", T, f"v{d['version']}", tables, "tables", views, "views", len(h), "bytes")
