#!/usr/bin/env python3
"""Round 2, stage 2 (29 October 2026): field notes that still described the v6.0 pre-copy filter. Idempotent."""
import json, sys
P = "data/erd.v5.json"
d = json.load(open(P, encoding="utf-8")); E = d["E"]
f = next(x for x in E["PROJECT"]["f"] if x[0] == "is_test")
if "clean-target extract" in f[3]: sys.exit("already applied")
f[3] = "default false; a flagged dummy twin project for scripted test deals on staging (Cutover Approach, Section 3); the clean-target extract that builds production (Cutover Approach 7) leaves the project and every row that references it behind, through its deals, settlements, approvals, evidence and postings; nothing is deleted, staging keeps them as the read-only record"
E["PROJECT"].setdefault("ch", []).append("v6.1 (29 October 2026): is_test note restated for the extract (finding 02.1)")
json.dump(d, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1); print("applied: PROJECT.is_test note")
