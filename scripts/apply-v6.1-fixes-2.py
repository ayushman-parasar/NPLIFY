#!/usr/bin/env python3
"""Round 2, stage 2 (29 October 2026): corrections from the 360-degree review of edition 6.1. Idempotent."""
import json, sys
P = "data/erd.v5.json"
d = json.load(open(P, encoding="utf-8")); E, INV = d["E"], d["INV"]
if any(f[0] == "event" for f in E["LEDGER_TRANSACTION"]["f"]): sys.exit("already applied")
def note(t, f, new):
    for x in E[t]["f"]:
        if x[0] == f:
            while len(x) < 4: x.append("")
            x[3] = new; return
    raise SystemExit(f"{t}.{f}")
# A4 the old Finance override sentence
E["WALLET_SCREENING"]["desc"] = E["WALLET_SCREENING"]["desc"].replace("Operations records it as part of transaction coordination; a reject may be overridden only by Finance.", "Operations records it as part of transaction coordination.")
# A5 the event column rule 1b relies on
E["LEDGER_TRANSACTION"]["f"].insert(3, ["event", "string", "", "the step of the source the transaction records (released, confirmed, returned, booked, reversed …); (source_type, source_id, event) is unique, so one source event posts once (Ledger Posting Design rule 1b)"])
note("LEDGER_TRANSACTION", "idempotency_key", "unique; the key of the action that created the transaction, so a retried request on a new transport call is refused and returns the first result (Ledger Posting Design rule 1b)")
E["LEDGER_TRANSACTION"].setdefault("ch", []).append("v6.1 (29 October 2026): + event; (source_type, source_id, event) unique")
# A6 suspense and held opening kinds; equity
for x in E["OPENING_ENTRY"]["f"]:
    if x[0] == "kind" and "suspense" not in x[3]: x[3] += " / suspense (the part of a partner's balance the client sheets do not allocate, opened on the client side per partner and currency, Cutover Approach 4 step 3a) / held (client money resting in one of NPL's own wallets on the opening date)"
E["OPENING_ENTRY"].setdefault("ch", []).append("v6.1 (29 October 2026): kind + suspense, held")
note("LEDGER_ACCOUNT", "kind", "asset / liability / income / expense / equity (OPENING_BALANCE); FX_RESULT is income or expense by sign, per currency")
# B3 custody: four cases
for inv in INV:
    if inv[1].startswith("Custody in NPL’s own wallet is allowed in three cases only: a collection on a deal with an approved REROUTE;"):
        inv[1] = inv[1].replace("allowed in three cases only: a collection on a deal with an approved REROUTE;", "allowed in four cases only: a collection on a deal with an approved REROUTE before conversion; the balance of a reroute after conversion while it waits to be forwarded;")
# B6 notes mangled by the client-facing filter, and stale value sets
note("FEE_STRUCTURE", "rate_basis", "market / agent_rate")
note("PARTNER_REBATE_RULE", "basis", "pct_of_amount — the rebate is a percentage of the amount converted (Jeton 0.4 % of amount on a 1 % or 1.25 % fee, Novi 0.3 %, Aquanow 0.3 %)")
note("PROJECT", "archetype_code", "nullable; the archetype used to create the project (Client Operating Procedures Part C)")
note("PROJECT", "cloned_from_project_id", "nullable; the source project of a clone; every copied row carries clone_confirmed_at empty until a user confirms or changes it, and activation needs them all confirmed (Configuration Schema 1a and rule 15)")
json.dump(d, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("applied: fixes-2 (event column, suspense/held kinds, equity, four custody cases, notes)")
