#!/usr/bin/env python3
"""11 October 2026 (late) — v5.9: v5.8 plus the corrections of a cross-document review of the ERD, the Ledger Posting
Design and the Reading Companion. No new decision: D46 and its amendment are propagated to every passage of the model
that still described the pre-D46 ledger. (1) invariant 1 restated per owner; (2) invariant 31 restated — the collection
part stays verified after a loss; (3) SETTLEMENT_LINE.outcome gains short; (4) LOSS_RECOVERY posts once per state change;
(5) LOSS_EVENT records how the make-good was funded; (6) DEAL.rate_reused_from_deal_id names VAR_RATE_HONOUR;
(7) invariant 44 says the cash-rounding surplus goes to RESELL_REVENUE in the currency received; (8) open question 2 and
25, the FRS vocabulary row for rebates, the LEDGER_TRANSACTION / LEDGER_POSTING relationship label. Idempotent.
    python3 scripts/apply-v5.9.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text()); E, R, INV = d["E"], d["R"], d["INV"]
assert d["version"] == "5.8", f"expected 5.8, found {d['version']} (already applied?)"

def set_note(name, field, note):
    for f in E[name]["f"]:
        if f[0] == field:
            while len(f) < 4: f.append("")
            f[3] = note; return
    raise KeyError((name, field))
def ch(name, text):
    E[name].setdefault("ch", []).append(text); E[name]["v"] = E[name].get("v") or "changed"
def sub(s, old, new):
    assert s.count(old) == 1, (old[:60], s.count(old))
    return s.replace(old, new)

# ------------------------------------------------------------------ (1) invariant 1: per owner as well as per currency
INV[0] = [["LEDGER_POSTING", "LEDGER_TRANSACTION"], "Postings in one transaction sum to zero per currency and, separately, per ownership tag: client lines and company lines each balance on their own (restated v5.9 — the per-owner rule of D46, until now stated only inside invariant 16)."]
for r in R:
    if r[0] == "LEDGER_TRANSACTION" and r[1] == "LEDGER_POSTING" and r[4] == "balanced per currency": r[4] = "balanced per currency and per owner"

# ------------------------------------------------------------------ (2) invariant 31: the part stays verified after a loss
INV[30] = [["COLLECTION_RECEIVING_ENDPOINT", "RECEIVING_ENTITY_ACCOUNT", "LOSS_EVENT", "COLLECTION"], "A single_use endpoint or account is referenced by at most one collection or payout line, for the deal it was reserved for, and retires when that reference is verified or confirmed. A LOSS_EVENT’s shares sum to its amount, which never exceeds the amount verified or released. After a collection-side event the part stays verified — NPL’s funds stand in for the lost money — and the client balance never goes below zero; the part moves to reversed only when Management unwinds the deal (v5.3, D32; restated v5.9 to match D46)."]

# ------------------------------------------------------------------ (3) SETTLEMENT_LINE.outcome gains short
set_note("SETTLEMENT_LINE", "outcome", "sent / confirmed / short / returned — sent from release until the receiver’s confirmation; short when the CONFIRMATION has result short and a SHORTFALL row re-raises the missing part; every released line ends confirmed, short or returned (invariant 40; short added v5.9 so the invariant is a check on the column)")
E["SETTLEMENT_LINE"]["desc"] = sub(E["SETTLEMENT_LINE"]["desc"], "Outcome: sent / confirmed / returned (D6).", "Outcome: sent / confirmed / short / returned (D6; short added v5.9 so invariant 40 can be checked from the column).")
ch("SETTLEMENT_LINE", "v5.9: outcome + short")

# ------------------------------------------------------------------ (4) LOSS_RECOVERY: one transaction per state change
set_note("LOSS_RECOVERY", "state", "agreed / received — a client share is received at once (it is a reversal of the make-good, never a payment). Each state change posts one LEDGER_TRANSACTION naming this row: agreed raises LOSS_RECEIVABLE against EXP_LOSS (or, for the client, reverses part of the make-good), received clears the receivable into POOL or WALLET (v5.9)")
E["LOSS_RECOVERY"]["desc"] += " Each row posts at most twice — once when the share is agreed and once when it is received — and both transactions carry source LossRecovery with this row’s id (v5.9)."
ch("LOSS_RECOVERY", "v5.9: one transaction per state change, both under source LossRecovery")
E["LEDGER_TRANSACTION"]["desc"] += " A source row with a lifecycle — a share or rebate accrual, a loss recovery — produces one transaction per state change, each naming the same row (v5.9)."

# ------------------------------------------------------------------ (5) LOSS_EVENT: how the make-good was funded
E["LOSS_EVENT"]["f"] += [
    ["pool_funded", "decimal", "", "the part of the make-good taken from NPL’s pool at the partner (v5.9)"],
    ["wallet_funded", "decimal", "", "the part transferred from NPL’s own wallet to the partner; what neither covers is the unfunded part, posted as MAKEGOOD / LOSS_PAYABLE until NPL’s funds land (v5.9)"],
    ["funding_reference", "string", "", "the partner’s credit note or the own-wallet transfer behind the make-good (v5.9)"],
]
E["LOSS_EVENT"]["desc"] = sub(E["LOSS_EVENT"]["desc"], "Posts one reversing LEDGER_TRANSACTION (source LossEvent): the client balance is reduced by the client’s and sender’s shares, NPL’s share goes to EXP_LOSS, the partner’s share to a receivable from the partner. A collection side event sets COLLECTION.state = reversed. v5.3 (D32). v5.7 (D46): booked", "v5.3 (D32) posted it as one reversing transaction that reduced the client balance by the client’s and sender’s shares and set COLLECTION.state = reversed. v5.7 (D46): booked")
E["LOSS_EVENT"]["desc"] += " v5.9: pool_funded, wallet_funded and funding_reference record how the make-good was funded; the collection part stays verified (invariant 31 restated)."
ch("LOSS_EVENT", "v5.9: + pool_funded, wallet_funded, funding_reference; invariant 31 restated")

# ------------------------------------------------------------------ (6) DEAL.rate_reused_from_deal_id names the account
set_note("DEAL", "rate_reused_from_deal_id", "nullable; this leg was priced on the market rate and partner rate version of an earlier, expired leg at the sender’s request — an approved override of the automated rate; the difference against the day’s rate posts to VAR_RATE_HONOUR with component variance (v5.5 D45; the account named by D46, note corrected v5.9)")

# ------------------------------------------------------------------ (7) invariant 44: the surplus goes to RESELL_REVENUE in the currency received
INV[43][1] = sub(INV[43][1], "and no later transaction touches RESELL_REVENUE or RESELL_COST: the reseller revenue is intact by construction.", "and no later transaction touches RESELL_REVENUE or RESELL_COST in the invoice currency: the reseller revenue is intact by construction.")
INV[43][1] = sub(INV[43][1], "a cash-rounding surplus is NPL-GR’s revenue in the currency received, never a forex result;", "a cash-rounding surplus is NPL-GR’s revenue, posted to RESELL_REVENUE in the currency received, never a forex result;")
INV[43][1] = sub(INV[43][1], "(v5.7, D46 and amendment).", "(v5.7, D46 and amendment; worded per currency in v5.9).")

# ------------------------------------------------------------------ (8) open questions, FRS vocabulary
q = d["OPENQ"][1]; q["impl"] = sub(q["impl"], "Ownership flips at one event only.", "Ownership moved at one event only in v4.0; since D46 it moves only at the events invariant 16 names.")
q = d["OPENQ"][24]; q["impl"] += " v5.9: invariants 1 and 31 restated to match D46; SETTLEMENT_LINE.outcome gains short; LOSS_RECOVERY posts per state change; LOSS_EVENT records its funding; the diagram notes, the DEAL rate-reuse note and decisions D24, D29 and D45 name the VAR_ accounts."
for row in d["FRS_VOCAB"]:
    if row[1].startswith("PARTNER_REBATE_RULE (basis pct_of_amount or pct_of_partner_fee"):
        row[1] = row[1].replace("basis pct_of_amount or pct_of_partner_fee, scoped by sender or fee structure", "basis pct_of_amount in payout_currency, scoped by sender or fee structure")

# ------------------------------------------------------------------ record
d["NOTES"]["Ledger & controls"].append("v5.9 (11 Oct, late): corrections from a cross-document review of the ERD, the Ledger Posting Design and the Companion — no new decision. Invariant 1 restated per owner and invariant 31 restated so the collection part stays verified after a loss, both to match D46; SETTLEMENT_LINE.outcome gains short so invariant 40 is a check on the column; LOSS_RECOVERY posts once per state change (agreed, received) under source LossRecovery; LOSS_EVENT records how the make-good was funded; the diagram notes, DEAL.rate_reused_from_deal_id and decisions D24, D29 and D45 name the VAR_ accounts; invariant 44 says the cash-rounding surplus goes to RESELL_REVENUE in the currency received.")
d["DECISIONS"] += "\nV5.9 (11 October 2026, late): v5.8 plus the corrections of a cross-document review of the ERD, the Ledger Posting Design and the Reading Companion — no new decision; D46 and its amendment propagated to every passage that still described the pre-D46 ledger (invariants 1 and 31 restated; SETTLEMENT_LINE.outcome + short; LOSS_RECOVERY one transaction per state change; LOSS_EVENT pool_funded / wallet_funded / funding_reference; the notes, DEAL.rate_reused_from_deal_id and decisions D24, D29, D45 name the VAR_ accounts; invariant 44 worded per currency). 70 tables + 12 views, invariants 1–44, decisions D1–D46."
d["version"] = "5.9"
d["DOC_META"] = sub(d["DOC_META"], "Draft v5.8", "Draft v5.9")
d["DOC_META"] = sub(d["DOC_META"], "Supersedes v5.7, v5.6", "Supersedes v5.8, v5.7, v5.6")
names = set(E)
for r in R: assert r[0] in names and r[1] in names, r
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("tables", sum(1 for e in E.values() if e["d"] != "view"), "views", sum(1 for e in E.values() if e["d"] == "view"), "relations", len(R), "invariants", len(INV), "version", d["version"])
