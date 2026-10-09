#!/usr/bin/env python3
"""9 October 2026, later: at NPL's request the D30 amendment is withdrawn — the cash city returns to
PARTNER_RATE_VERSION.location and DEAL.cash_location as in the first v5.3 draft; CASH_LOCATION and the
CURRENCY_PAIR location columns are removed. D27 and D29 amendments stand. Idempotent.
   python3 scripts/apply-v5.3-location-revert.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text()); E, R = d["E"], d["R"]
assert "CASH_LOCATION" in E

def drop_field(name, field):
    e = E[name]; n = len(e["f"]); e["f"] = [f for f in e["f"] if f[0] != field]; assert len(e["f"]) == n - 1, (name, field)
def set_note(name, field, note):
    for f in E[name]["f"]:
        if f[0] == field:
            while len(f) < 4: f.append("")
            f[3] = note; return
    raise KeyError((name, field))

del E["CASH_LOCATION"]
d["ORDER"]["0"] = [n for n in d["ORDER"]["0"] if n != "CASH_LOCATION"]
d["R"] = [r for r in R if r[0] != "CASH_LOCATION" and r[1] != "CASH_LOCATION"]
drop_field("CURRENCY_PAIR", "from_cash_location_id"); drop_field("CURRENCY_PAIR", "to_cash_location_id")
E["CURRENCY_PAIR"]["ch"] = [c for c in E["CURRENCY_PAIR"]["ch"] if "cash_location_id" not in c]
E["CURRENCY_PAIR"]["desc"] = "A pair the project trades, with quote direction and rate precision. Rounding is a per-pair choice on each side (D25): amount_rounding with rounding_unit on payouts, cash_rounding with cash_rounding_unit on the collected cash amount; what is dropped stays client money, what is added by rounding up is NPL’s cost (EXP_ROUNDING). from_currency may equal to_currency: the leg still converts, at rate 1, so the fee is captured at conversion as on any other pair (D33). Cash pairs are priced per city on the rate version and the deal, not on the pair (D30)."

E["PARTNER_RATE_VERSION"]["f"].append(["location", "string", "", "nullable; required on cash pairs — INR cash in Delhi and in Mumbai are two versions on one day (v5.3, D30)"])
E["PARTNER_RATE_VERSION"]["ch"] = [c.replace("v5.3 (D28): + quoted_rate, quoted_direction; a cash city is its own pair, so no location here (D30 amended 9 Oct)", "v5.3 (D28, D30): + quoted_rate, quoted_direction, location; uniqueness partner × pair × day × location") for c in E["PARTNER_RATE_VERSION"]["ch"]]
E["DEAL"]["f"].append(["cash_location", "string", "", "city of the cash hand-over; required on cash legs — rates and agents differ by city (v5.3, D30)"])
E["DEAL"]["ch"] = [c.replace("v5.3 (D29): + rate_locked_at, conversion_due_date, conversion_deferred_reason; the cash city comes from the pair (D30 amended 9 Oct)", "v5.3 (D29, D30): + rate_locked_at, conversion_due_date, conversion_deferred_reason, cash_location") for c in E["DEAL"]["ch"]]
set_note("DEAL", "collection_method", "crypto / bank / cash")
set_note("DEAL", "cash_instructions", "free text for the hand-over; the city is cash_location, the token is on the collection (D30)")
assert d["INV"][28][1].startswith("A currency pair’s cash side")
d["INV"][28] = [["PARTNER_RATE_VERSION", "DEAL", "COLLECTION"], "A rate version is unique per partner × pair × day × location; a cash leg carries its cash_location and prices on a version of that location; a cash part is verified only after the partner’s count (counted_at) (v5.3, D30)."]
d["FRS_VOCAB"] = [[a, b.replace("CURRENCY_PAIR.from_cash_location_id / to_cash_location_id → CASH_LOCATION (D30)", "DEAL.cash_location; PARTNER_RATE_VERSION.location (D30)")] for a, b in d["FRS_VOCAB"]]
d["NOTES"]["Configuration"] = [n.replace(", cash locations as a side of the currency pair (D30)", "") for n in d["NOTES"]["Configuration"]]
d["NOTES"]["Rates"] = [n.replace("a cash city is its own currency pair, so Delhi and Mumbai have their own rate days (D30).", "cash pairs are priced per location (D30).") for n in d["NOTES"]["Rates"]]
d["NOTES"]["Deal lifecycle"] = [n.replace("a cash part carries its token and agent, the pair names the city (D30)", "a cash part carries its token, agent and city (D30)") for n in d["NOTES"]["Deal lifecycle"]]
d["DECISIONS"] += "\nWITHDRAWN 9 OCTOBER 2026 (later the same day), at NPL’s request: the D30 amendment that made the cash city a side of the currency pair (CASH_LOCATION). The city stays on PARTNER_RATE_VERSION.location and DEAL.cash_location as in the first v5.3 draft; a rate version is unique per partner × pair × day × location. The D27 and D29 amendments stand."

names = set(E)
for r in d["R"]: assert r[0] in names and r[1] in names, r
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("tables", sum(1 for e in E.values() if e["d"] != "view"), "views", sum(1 for e in E.values() if e["d"] == "view"), "relations", len(d["R"]))
