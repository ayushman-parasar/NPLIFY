#!/usr/bin/env python3
"""Amendments of 9 October 2026 to ERD v5.3 (same version, recorded as amendments to D27, D29, D30 plus
stale-text corrections). Idempotent.   python3 scripts/apply-v5.3-amendments.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text()); E, R = d["E"], d["R"]
assert d["version"] == "5.3" and "CASH_LOCATION" not in E

def drop_field(name, field):
    e = E[name]; n = len(e["f"]); e["f"] = [f for f in e["f"] if f[0] != field]; assert len(e["f"]) == n - 1, (name, field)
def set_note(name, field, note):
    for f in E[name]["f"]:
        if f[0] == field:
            while len(f) < 4: f.append("")
            f[3] = note; return
    raise KeyError((name, field))
def ch(name, text):
    E[name].setdefault("ch", []).append(text); E[name]["v"] = E[name].get("v") or "changed"

# ------------------------------------------------------------------ D27 amended: one way to express a rebate
drop_field("PARTNER_REBATE_RULE", "pct_of_partner_fee")
set_note("PARTNER_REBATE_RULE", "pct", "the rebate in the chosen basis (v5.3, D27)")
ch("PARTNER_REBATE_RULE", "v5.3 amended 9 Oct: pct_of_partner_fee retired — basis + pct carry the rule")
E["PARTNER_REBATE_RULE"]["desc"] = "A partner rebating part of its fee to NPL (§4.2b: Jeton takes 1 % or 1.25 % and pays 0.4 % of the amount back; 0.3 % on Novi’s 0.9 %; Aquanow 0.3 % on 0.8 %). The rule has a basis (percentage of the amount, or of the partner’s fee) and an optional scope by sender or fee structure. Reconciled monthly through PARTNER_REBATE_ACCRUAL against the partner statement, which covers NPLify deals only. The rebate is NPL’s alone — never shared with an introducer or client party, never inside the share base — and is reported as its own stream (EARN_REBATE) (v5.3, D27)."

# ------------------------------------------------------------------ D29 amended: the cutoff is the partner's
drop_field("PARTNER_CONFIG", "bank_cutoff_time"); drop_field("PARTNER_CONFIG", "cutoff_timezone")
E["PARTNER_CONFIG"]["ch"] = [c.replace("v5.3 (D23, D29): + is_own_desk, bank_cutoff_time, cutoff_timezone", "v5.3 (D23): + is_own_desk") for c in E["PARTNER_CONFIG"]["ch"]]
E["PARTNER"]["f"] += [["bank_cutoff_time", "time", "", "the partner’s daily bank cutoff for pairs that need a bank lock (Ali 14:30) (v5.3, D29 amended 9 Oct — moved from PARTNER_CONFIG)"], ["cutoff_timezone", "string", "", "IANA zone, e.g. Asia/Hong_Kong (v5.3, D29)"]]
ch("PARTNER", "v5.3 (D29, amended 9 Oct): + bank_cutoff_time, cutoff_timezone — beside rate_expiry_time and holiday_calendar, the partner’s own clock")
E["PARTNER"]["desc"] += " v5.3 (D29): carries the partner’s daily bank cutoff, like its rate expiry and holiday calendar — a property of the partner, whichever project uses it."
d["INV"][27][0] = ["DEAL", "PARTNER", "PARTNER_PAIR", "CONVERSION"]   # D29

# ------------------------------------------------------------------ D30 amended: the city is a side of the currency pair
E["CASH_LOCATION"] = {"d": "config", "col": 0, "v": "new", "ch": ["new in v5.3 (D30, amended 9 Oct)"],
    "desc": "A city where a currency is handled as cash (INR in Delhi, INR in Mumbai, USD cash in Bangkok, SGD cash in Singapore). A currency pair names a cash location on its cash side — INR (Cash-Delhi) → USDT and INR (Cash-Mumbai) → USDT are two pairs — so partner pairs, fee structures and daily rate versions are per city by construction. Bank and crypto sides have no location. v5.3 (D30, amended 9 October).",
    "f": [["id", "int", "PK"], ["currency", "string"], ["city", "string", "", "Delhi, Mumbai, Bangkok, Singapore"], ["country", "string"], ["status", "string"]]}
d["ORDER"]["0"].append("CASH_LOCATION")
E["CURRENCY_PAIR"]["f"].insert(4, ["from_cash_location_id", "int", "FK", "nullable; set iff the from side is collected as cash — the pair reads INR (Cash-Delhi) → USDT (v5.3, D30 amended 9 Oct)"])
E["CURRENCY_PAIR"]["f"].insert(5, ["to_cash_location_id", "int", "FK", "nullable; set iff the to side is paid out as cash — USDT → JPY (Cash-Tokyo) (v5.3, D30 amended 9 Oct)"])
ch("CURRENCY_PAIR", "v5.3 (D30, amended 9 Oct): + from_cash_location_id, to_cash_location_id — the cash side of a pair names its city")
E["CURRENCY_PAIR"]["desc"] = "A pair the project trades, with quote direction and rate precision. A cash side names its CASH_LOCATION, so INR (Cash-Delhi) → USDT and INR (Cash-Mumbai) → USDT are two pairs with their own partner pairs, fee structures and rate days; bank and crypto sides carry no location (D30, amended 9 October). Rounding is a per-pair choice on each side (D25): amount_rounding with rounding_unit on payouts, cash_rounding with cash_rounding_unit on the collected cash amount; what is dropped stays client money, what is added by rounding up is NPL’s cost (EXP_ROUNDING). from_currency may equal to_currency: the leg still converts, at rate 1, so the fee is captured at conversion as on any other pair (D33)."
R += [["CASH_LOCATION", "CURRENCY_PAIR", "refs", "from_cash_location_id", "cash-in city (INR (Cash-Delhi) → …)", "1 : 0..n", "new"],
      ["CASH_LOCATION", "CURRENCY_PAIR", "refs", "to_cash_location_id", "cash-out city (… → JPY (Cash-Tokyo))", "1 : 0..n", "new"]]
drop_field("PARTNER_RATE_VERSION", "location")
E["PARTNER_RATE_VERSION"]["ch"] = [c.replace("v5.3 (D28, D30): + quoted_rate, quoted_direction, location; uniqueness partner × pair × day × location", "v5.3 (D28): + quoted_rate, quoted_direction; a cash city is its own pair, so no location here (D30 amended 9 Oct)") for c in E["PARTNER_RATE_VERSION"]["ch"]]
drop_field("DEAL", "cash_location")
E["DEAL"]["ch"] = [c.replace("v5.3 (D29, D30): + rate_locked_at, conversion_due_date, conversion_deferred_reason, cash_location", "v5.3 (D29): + rate_locked_at, conversion_due_date, conversion_deferred_reason; the cash city comes from the pair (D30 amended 9 Oct)") for c in E["DEAL"]["ch"]]
set_note("DEAL", "collection_method", "crypto / bank / cash — cash iff the pair’s from side names a CASH_LOCATION (D19, D30)")
set_note("DEAL", "cash_instructions", "free text for the hand-over; the city is on the pair, the token on the collection (D30)")
d["INV"][28] = [["CURRENCY_PAIR", "CASH_LOCATION", "DEAL", "COLLECTION"]   # D30, "A currency pair’s cash side names its CASH_LOCATION and a leg’s collection_method is cash if and only if its pair’s from side does (a cash payout if and only if the to side does); partner pairs, fee structures and rate versions are therefore per city by construction. A cash part is verified only after the partner’s count (counted_at) (v5.3, D30, amended 9 October)."]
d["FRS_VOCAB"] = [[a, b.replace("DEAL.cash_location; PARTNER_RATE_VERSION.location (D30)", "CURRENCY_PAIR.from_cash_location_id / to_cash_location_id → CASH_LOCATION (D30)")] for a, b in d["FRS_VOCAB"]]
d["FRS_VOCAB"] = [[a, b.replace("PARTNER_CONFIG.bank_cutoff_time", "PARTNER.bank_cutoff_time")] for a, b in d["FRS_VOCAB"]]
d["NOTES"]["Configuration"] = [n.replace("the partner’s bank cutoff (D29)", "the partner’s bank cutoff on PARTNER (D29)").replace("a rounding menu per pair (D25)", "a rounding menu per pair (D25), cash locations as a side of the currency pair (D30)") for n in d["NOTES"]["Configuration"]]
d["NOTES"]["Rates"] = [n.replace("cash pairs are priced per location (D30).", "a cash city is its own currency pair, so Delhi and Mumbai have their own rate days (D30).") for n in d["NOTES"]["Rates"]]
d["NOTES"]["Deal lifecycle"] = [n.replace("a cash part carries its token, agent and city (D30)", "a cash part carries its token and agent, the pair names the city (D30)") for n in d["NOTES"]["Deal lifecycle"]]

# ------------------------------------------------------------------ stale text (D23, D25, D26)
d["CONVENTIONS"] = [("Seven diagrams across four domains, one schema: 1a and 1b Configuration, 2 Rates, 3a and 3c Deal / collection / conversion / reroute, 3b Disbursement / confirmation / fees / losses, 4 Ledger & controls." if c.startswith("Five diagrams") else c) for c in d["CONVENTIONS"]]
d["NOTES"]["Configuration"] = [n.replace("Cash collections round to the nearest 100 / 500 / 1000 units by currency.", "The collected cash amount is rounded by the pair’s cash_rounding option to cash_rounding_unit (D25).") for n in d["NOTES"]["Configuration"]]
d["NOTES"]["Deal lifecycle"] = [n.replace("Amounts are truncated to whole units at conversion; the dropped fraction stays client money in the balance and is paid when it reaches a whole unit (Q8).", "Amounts are rounded at conversion by the pair’s option (D25): a dropped fraction stays client money in the balance and is paid when it reaches a unit; an amount added by rounding up is NPL’s cost.").replace("into one or many DISBURSEMENT_LINEs, in whole units;", "into one or many DISBURSEMENT_LINEs, rounded as the pair says;") for n in d["NOTES"]["Deal lifecycle"]]
E["OWN_WALLET"]["desc"] = "NPL’s own wallet: AQN-LT-Sub at Aquanow (Q10). Used for rerouting and pass-through, for recovered dues, and — under an own-desk partner configuration (NPL-GR, D23) — as the collection endpoint of a project in which NPL itself converts. Custody is allowed only under an approved REROUTE or in an own-desk project (invariant 3); the custody view is the standing control."
ch("OWN_WALLET", "v5.3 (D23): also the own-desk collection endpoint (COLLECTION_RECEIVING_ENDPOINT.own_wallet_id)")
E["CONVERSION"]["desc"] = E["CONVERSION"]["desc"].replace("and the rounding residual dropped to reach whole units (Q8).", "and the rounding residual (Q8); since v5.3 the residual is signed and follows the pair’s rounding option (D25).")
set_note("CONVERSION", "actual_out", "booked figure, rounded as the pair says (D25)")
E["DISBURSEMENT"]["desc"] = E["DISBURSEMENT"]["desc"].replace("into one or many lines, in whole units.", "into one or many lines, rounded as the pair says (D25).")
set_note("DISBURSEMENT", "total", "rounded as the pair says (D25)")
d["INV"][3][1] = "Disburse to the residual: under disburse_policy = to_zero a DISBURSEMENT pays the balance rounded by the pair’s option and leaves only the rounding residual (dust stays client money; a round-up is NPL’s cost — D25); under hold_allowed the balance may rest at the partner within the project’s exposure cap (Q5, Q8)."
for w in d["WALKS"]:
    for st in w["steps"]:
        st[1] = st[1].replace("actual_out is booked in whole units; the dropped fraction stays as client dust;", "actual_out is booked rounded as the pair says; a dropped fraction stays as client dust, a round-up is NPL’s cost (D25);").replace("Pays whole units from the partner’s holding", "Pays the balance, rounded as the pair says, from the partner’s holding").replace("actual_out in whole units, the fraction kept as dust.", "actual_out rounded as the pair says, the residual kept as dust (D25).")
d["FRS_DEV"] = [([a, "No custody except under an approved reroute or in an own-desk project (NPL-GR); OWN_WALLET + REROUTE for contingency, invariant 3 and the custody view as the control", "Decided (Q12 answered; D23, 9 October 2026)"] if a.startswith("P1") else [a, b, "Decided (Q12 answered: reroute with recover dues; partner accounts never net)"] if a.startswith("P3") else [a, b, c]) for a, b, c in d["FRS_DEV"]]
E["INTRODUCER"]["desc"] += " v5.3 (D26): may also be a client party (Raeen) who provides sub-accounts and shares NPL’s net markup — REFERRAL_RULE.party_kind says which."
ch("INTRODUCER", "v5.3 (D26): party_kind client_party on its rules")
E["REFERRAL_ACCRUAL"]["desc"] = E["REFERRAL_ACCRUAL"]["desc"].replace("paid out of NPL’s earnings.", "paid out of NPL’s earnings — or, when the party holds the converted funds (settlement_mode party_retains), netted into a receivable from the party and reconciled monthly (D26).")
for q in d["OPENQ"]:
    if q["q"].startswith("Reference workbooks per project archetype"):
        q["status"] = "answered"; q["a"] = "Fee Outlines v0.2 (8 October 2026): every line of NPL’s fee table as a fill-in outline with a worked calculation per transaction pattern, answered by NPL with the Project Context and Payment methods tabs."; q["impl"] = "v5.3: decisions D20–D33 were built from it; the workbook is the acceptance reference for the fee engine."
    if q["q"].startswith("Whole-unit conversion rounding rule"):
        q["impl"] += " Superseded in v5.3 by D25: a rounding menu per pair, signed residual, EXP_ROUNDING for round-ups."
d["DECISIONS"] += (
    "\nAMENDMENTS OF 9 OCTOBER 2026 (same day, same draft v5.3): D27 — pct_of_partner_fee retired; basis + pct carry the rebate rule. D29 — the bank cutoff moves from PARTNER_CONFIG to PARTNER beside rate_expiry_time and holiday_calendar: Ali’s 14:30 cutoff is Ali’s, whichever project uses it. D30 — the cash city is a side of the currency pair, not a column on the rate version and the deal: CASH_LOCATION (currency, city, country) referenced by CURRENCY_PAIR.from_cash_location_id / to_cash_location_id, so INR (Cash-Delhi) → USDT and INR (Cash-Mumbai) → USDT are two pairs and partner pairs, fee structures and rate days are per city by construction (NPL: ‘cash and location are specific to the currency; bank and crypto do not need it’). Stale wording corrected for D23 (OWN_WALLET, FRS P1/P3), D25 (whole-unit wording in notes, walkthroughs, invariant 4, CONVERSION, DISBURSEMENT), D26 (INTRODUCER, REFERRAL_ACCRUAL); seven diagrams; the reference-workbook question answered by Fee Outlines v0.2."
)

names = set(E)
for r in R: assert r[0] in names and r[1] in names, r
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("tables", sum(1 for e in E.values() if e["d"] != "view"), "views", sum(1 for e in E.values() if e["d"] == "view"), "relations", len(R))
