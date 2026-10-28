#!/usr/bin/env python3
"""Round 2, stage 2 (29 October 2026): walkthrough and flow texts of the model that still said three custody cases, Finance approving every reroute, OWN.HOLDER and a proposed amendment. Idempotent."""
import json, sys
P = "data/erd.v5.json"
d = json.load(open(P, encoding="utf-8"))
s = json.dumps(d, ensure_ascii=False)
if "four cases only (a reroute before conversion" in s: sys.exit("already applied")
rep = [
 ("The only way partner_pair / facilitating_entity change after quote. Pre- or post-collection; post-collection outcome is via the own wallet or a refund to the sender (Q3). Approved by Finance.",
  "The only way the partner pair or partner entity changes after quote. Before collection, after collection or after conversion: after collection the outcome is via the own wallet or a refund to the sender; after conversion the balance comes back through the own wallet to the alternate partner. Finance approves a reroute before conversion; Management approves one after conversion and ratifies every emergency action."),
 ("CL.OWN.*.HELD may only be debited by a collection on a deal with an approved reroute", "CL.OWN.*.HELD may be debited in four cases only (a reroute before conversion, the balance of a reroute after conversion, an own-desk leg, a bridge collection)"),
 ("Accounts coded OWN.HOLDER.CCY.PURPOSE", "Accounts coded OWNER.HOLDER.CCY.PURPOSE"),
 ("a model amendment is proposed for this (invariant 30, D31)", "the bridge role of OWN_WALLET covers this (invariant 30)"),
 ("Custody is allowed only in those three cases;", "Custody is allowed only in those four cases (a reroute before conversion, the balance of a reroute after conversion, an own-desk leg, a bridge collection);"),
 ("Custody is allowed only in those three cases (invariant 3);", "Custody is allowed only in those four cases (invariant 3: a reroute before conversion, the balance of a reroute after conversion, an own-desk leg, a bridge collection);"),
 ("MarkupShare, Rebate, LossEvent.", "MarkupShare, Rebate, LossEvent, LossRecovery, Invoice, EarningsOffset, Opening."),
]
n = 0
for a, b in rep:
    if a in s: s = s.replace(a, b); n += 1
d = json.loads(s)
json.dump(d, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1); print("applied: fixes-3,", n, "of", len(rep), "texts")
