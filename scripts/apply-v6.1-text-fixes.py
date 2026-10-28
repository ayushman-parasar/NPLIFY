#!/usr/bin/env python3
"""Round 2, stage 2 (29 October 2026): field notes that still described the v6.0 pre-copy filter. Idempotent."""
import json, sys
P = "data/erd.v5.json"
d = json.load(open(P, encoding="utf-8")); E = d["E"]
f = next(x for x in E["PROJECT"]["f"] if x[0] == "is_test")
if "clean-target extract" in f[3] and not any(r[2] == "has" for r in d["R"]): sys.exit("already applied")
f[3] = "default false; a flagged dummy twin project for scripted test deals on staging (Cutover Approach, Section 3); the clean-target extract that builds production (Cutover Approach 7) leaves the project and every row that references it behind, through its deals, settlements, approvals, evidence and postings; nothing is deleted, staging keeps them as the read-only record"
E["PROJECT"].setdefault("ch", []).append("v6.1 (29 October 2026): is_test note restated for the extract (finding 02.1)")

# relationship verbs the map knows: owns (parent -> child), refs, poly, actor, view, self. The three Email OTP rows used "has".
VERB = {("DEAL_GROUP", "CUSTOMER_APPROVAL"): "owns", ("QUOTE_PACKAGE", "CUSTOMER_APPROVAL"): "refs", ("CUSTOMER_APPROVAL", "CUSTOMER_APPROVAL_EVENT"): "owns"}
for r in d["R"]:
    if r[2] == "has" and (r[0], r[1]) in VERB: r[2] = VERB[(r[0], r[1])]
json.dump(d, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1); print("applied: PROJECT.is_test note; relationship verbs")
