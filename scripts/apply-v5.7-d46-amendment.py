#!/usr/bin/env python3
"""11 October 2026 (evening) — amendment of D46, same draft v5.7, from the independent re-derivation of the
calculations: (1) PROJECT_BALANCE and GROUP_ENTITLEMENT defined over postings, LEDGER_POSTING.receiver_group_id;
(2) the two-invoice model — INVOICE.vendor_invoice_id, DEAL_GROUP.invoice_amount / invoice_rate, INVOICE_BALANCE by
kind, invariant 23 restated; (3) FX_CLEARING replaced by FX_RESULT, a P&L account per currency; (4) invariant 16
restated as two lists; (5) invariant 42 gains the target-out rule. Idempotent.   python3 scripts/apply-v5.7-d46-amendment.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text()); E, R, INV = d["E"], d["R"], d["INV"]
assert "receiver_group_id" not in [f[0] for f in E["LEDGER_POSTING"]["f"]], "already applied"

def set_note(name, field, note):
    for f in E[name]["f"]:
        if f[0] == field:
            while len(f) < 4: f.append("")
            f[3] = note; return
    raise KeyError((name, field))
def ch(name, text):
    E[name].setdefault("ch", []).append(text); E[name]["v"] = E[name].get("v") or "changed"

# ------------------------------------------------------------------ (1) views over postings
E["LEDGER_POSTING"]["f"].append(["receiver_group_id", "int", "FK", "nullable; set on every CL.PROJECT.<CCY>.PAYABLE line: the leg’s group at collection and conversion, the paying leg’s group on a release, return or short confirmation (SETTLEMENT_LINE.deal_id), the served group on a balance conversion, the deal’s group on a loss share or an earnings offset — so GROUP_ENTITLEMENT is a sum over postings (D46 amendment, 11 Oct)"])
ch("LEDGER_POSTING", "D46 amendment: + receiver_group_id on promise lines; the entitlement view reads it")
E["PROJECT_BALANCE"]["desc"] = "PROJECT_BALANCE(project, partner, currency) = the balance of CL.<PARTNER>.<CCY>.DUE for the partner configuration: Σ debits − Σ credits over postings — conversions in, top-ups, make-goods, offsets and hops in, releases and offsets out — never a sum over deals (D46 amendment: the v5.3 definition summed conversions’ actual_out, which includes NPL’s margin, and had no term for the v5.7 events). Was CLIENT_BALANCE until v5.4 (D38). Also reports a pending column — the expected_out of legs whose rate is locked with the partner but whose money has not yet been collected or converted; a void removes it; pending is never a posting (D29)."
ch("PROJECT_BALANCE", "D46 amendment: defined as the DUE account balance, over postings")
E["GROUP_ENTITLEMENT"]["desc"] = "GROUP_ENTITLEMENT(group, currency) = Σ credits − Σ debits over CL.PROJECT.<CCY>.PAYABLE postings carrying receiver_group_id = the group: promises raised at collection and conversion, re-raised on a return or a short confirmation, re-denominated by an offset or a balance conversion, reduced by a release or a client loss share. A payout to a group-less receiver carries the paying leg’s group (SETTLEMENT_LINE.deal_id, D17). Σ over a project’s groups = the PAYABLE balance = Σ client assets, per currency (invariant 7). D46 amendment: over postings, no longer over legs and lines."
ch("GROUP_ENTITLEMENT", "D46 amendment: a sum over PAYABLE postings by receiver_group_id")
R[:] = [r for r in R if not (r[1] in ("PROJECT_BALANCE", "GROUP_ENTITLEMENT") and r[0] in ("CONVERSION", "BALANCE_CONVERSION", "SETTLEMENT_RETURN", "SETTLEMENT", "DEAL", "ENTITLEMENT_REATTRIBUTION", "SETTLEMENT_LINE"))]
R += [["LEDGER_POSTING", "PROJECT_BALANCE", "view", "", "the DUE account balance by partner", "Σ", "new"],
      ["LEDGER_POSTING", "GROUP_ENTITLEMENT", "view", "", "PAYABLE postings by receiver_group_id", "Σ", "new"],
      ["RECEIVER_GROUP", "LEDGER_POSTING", "refs", "receiver_group_id", "attribution of a promise line", "1 : n", "new"]]
INV[6] = [["PROJECT_BALANCE", "GROUP_ENTITLEMENT", "LEDGER_POSTING", "RECEIVER_GROUP"], "Entitlement conservation, over postings: Σ GROUP_ENTITLEMENT over a project’s groups = the balance of CL.PROJECT.<CCY>.PAYABLE = Σ COLLECTED + Σ HELD + Σ DUE + Σ SHORTFALL + MAKEGOOD − Σ CREDIT, per currency, after every transaction — because every transaction balances per owner and every PAYABLE line carries a receiver_group_id. Return and hop legs preserve it by inheriting the parent leg’s group (D13); a payout to a group-less receiver carries the paying leg’s group (D17) (restated, D46 amendment)."]

# ------------------------------------------------------------------ (2) the two-invoice model
E["INVOICE"]["f"].insert(3, ["vendor_invoice_id", "int", "FK", "on a resale invoice: the vendor invoice it marks up (self-reference); RESELLER_MARGIN pairs the two through it (D46 amendment)"])
E["INVOICE"]["desc"] += " D46 amendment: a resale invoice names the vendor invoice it marks up (vendor_invoice_id); its balance is a receivable balance — amount − Σ DEAL_GROUP.invoice_amount of the groups that have collected it (advance, then balance) — while a vendor invoice’s balance is a payable balance, amount − Σ obligation_discharged over released lines."
ch("INVOICE", "D46 amendment: + vendor_invoice_id; balance by kind")
E["DEAL_GROUP"]["f"] += [["invoice_amount", "decimal", "", "nullable; the part of the resale invoice this group collects, in the invoice currency — an advance, then the balance; Σ over the invoice’s groups ≤ its amount (D46 amendment)"],
                         ["invoice_rate", "decimal", "", "nullable; payout currency per invoice currency at pricing (same direction as SETTLEMENT_LINE.discharge_rate): the stored base for the amount reserved per instalment and for the forex true-up (D46 amendment)"]]
ch("DEAL_GROUP", "D46 amendment: + invoice_amount, invoice_rate")
set_note("SETTLEMENT_LINE", "obligation_discharged", "in the invoice currency; reserved = obligation_discharged × DEAL_GROUP.invoice_rate, paid = obligation_discharged × discharge_rate; reserved − paid is the forex true-up posted to VAR_FX_TIMING against NPL’s pool (D24, D46 amendment)")
E["INVOICE_BALANCE"]["desc"] = "INVOICE_BALANCE(invoice): for a vendor invoice, INVOICE.amount − Σ SETTLEMENT_LINE.obligation_discharged over released lines not returned (a payment discharges on release, D46); for a resale invoice, INVOICE.amount − Σ DEAL_GROUP.invoice_amount over the groups that collected it with a verified collection. Σ VENDOR_PAYABLE = Σ vendor-invoice balances; Σ RESALE_RECEIVABLE = Σ resale-invoice balances (v5.3 D24; restated D46 amendment)."
ch("INVOICE_BALANCE", "D46 amendment: by invoice kind; vendor balance over released lines")
E["RESELLER_MARGIN"]["desc"] = "RESELLER_MARGIN(resale invoice) = resale INVOICE.amount − the amount of INVOICE.vendor_invoice_id, in the invoice currency, equal to RESELL_REVENUE − RESELL_COST posted for the pair: NPL-GR’s game reseller revenue, fixed when the two invoices are posted and untouched by anything the remittance side does (v5.7, D46; paired through vendor_invoice_id, amendment)."
R[:] = [r for r in R if not (r[1] == "INVOICE_BALANCE" and r[0] == "SETTLEMENT_LINE")]
R += [["INVOICE", "INVOICE", "self", "vendor_invoice_id", "resale marks up vendor", "1 : 0..n", "new"],
      ["SETTLEMENT_LINE", "INVOICE_BALANCE", "view", "", "− Σ obligation_discharged (released, vendor invoice)", "Σ", "new"],
      ["DEAL_GROUP", "INVOICE_BALANCE", "view", "", "− Σ invoice_amount collected (resale invoice)", "Σ", "new"]]
INV[22] = [["INVOICE", "SETTLEMENT_LINE", "DEAL_GROUP", "INVOICE_BALANCE"], "Σ obligation_discharged over a vendor invoice’s released lines never exceeds its amount, and Σ DEAL_GROUP.invoice_amount over a resale invoice’s groups never exceeds its amount. A line that names a vendor invoice names a deal whose group collects the resale invoice that marks it up (vendor_invoice_id), or, outside a reseller project, whose group is on that invoice; the margin line names the resale invoice itself (v5.3 D24; restated D46 amendment)."]
INV[43] = [["INVOICE", "LEDGER_POSTING", "RESELLER_MARGIN"], "In NPL-GR the vendor and resale invoices are posted once each, in the invoice currency (RESELL_COST / VENDOR_PAYABLE; RESALE_RECEIVABLE / RESELL_REVENUE), and no later transaction touches RESELL_REVENUE or RESELL_COST: the reseller revenue is intact by construction. Each group’s collection clears its invoice_amount of RESALE_RECEIVABLE into REMIT_CLAIM; each vendor line clears VENDOR_PAYABLE and REMIT_CLAIM by its obligation_discharged on release; the margin line clears the rest of REMIT_CLAIM; a cash-rounding surplus is NPL-GR’s revenue in the currency received, never a forex result; the forex true-up of each instalment posts to VAR_FX_TIMING on the remittance side (v5.7, D46 and amendment)."]

# ------------------------------------------------------------------ (3) FX_CLEARING → FX_RESULT
s = json.dumps(d, ensure_ascii=False, indent=1)
s = s.replace("FX_CLEARING for NPL’s own currency swaps (an earnings offset, a company balance settled in another currency)", "FX_RESULT for NPL’s own currency exchanges (an earnings offset, a pool squared from USDT, a company balance settled in another currency): a profit-and-loss account per currency — currency NPL sold is a debit, currency it bought a credit — whose reporting-currency value is NPL’s realised currency result; it needs no later closing (D46 amendment: FX_CLEARING, an asset that could never be closed under per-currency balancing, is withdrawn)")
s = s.replace("FX_CLEARING", "FX_RESULT")
d = json.loads(s); E, R, INV = d["E"], d["R"], d["INV"]
set_note("LEDGER_ACCOUNT", "kind", "asset / liability / income / expense; FX_RESULT is income or expense by sign, per currency")

# ------------------------------------------------------------------ (4) invariant 16 as two lists
INV[15] = [["LEDGER_POSTING", "CONVERSION", "EARNINGS_OFFSET", "SETTLEMENT_LINE", "LOSS_RECOVERY", "BANK_FEE_EVENT", "LOSS_EVENT"], "Ownership moves between client and company at named events only, and every transaction balances per owner as well as per currency. Client → company: margin recognition at conversion; the client side of an EARNINGS_OFFSET at the to-partner; a forex true-up gain on a line discharging an invoice; the client’s share of a loss, by partial reversal of the make-good. Company → client: a fee NPL absorbs or covers (bank, network, rounding up), a shortfall top-up, a bounce make-whole, a loss make-good; the company side of an EARNINGS_OFFSET at the from-partner; a forex true-up loss. NPL never advances money to a receiver (Q13) (restated, D46 amendment)."]

# ------------------------------------------------------------------ (5) invariant 42: target-out
INV[41] = [["FEE_STRUCTURE", "DEAL", "DEAL_GROUP", "CONVERSION"], "Fee parts are percentages of the principal and never compound. Fixed-in (amount_mode fixed_in): principal = amount_in × basis rate; fee_sender_part = principal × sender_pays_pct; fee_receiver_part = principal × receiver_pays_pct; client_net = principal × (1 − sender_pays_pct − receiver_pays_pct). Target-out (amount_mode target_out): the fee is a markup on the target — amount_in = target_out × (1 + sender_pays_pct) ÷ basis rate, then cash-rounded if collected in cash; fee_receiver_part = target_out × receiver_pays_pct; client_net = target_out × (1 − receiver_pays_pct) + any cash-rounding surplus; the sender rate printed is basis rate ÷ (1 + sender_pays_pct) (v5.7, D46; target-out added by the amendment — NPL’s quotes use × (1 + fee), not ÷ (1 − fee))."]
E["FEE_STRUCTURE"]["desc"] += " Target-out quotes apply the fee as a markup on the target: amount_in = target × (1 + sender_pays_pct) ÷ rate (D46 amendment)."
set_note("DEAL", "amount_mode", "target_out / fixed_in — fixed_in takes the fee off the principal, target_out adds it as a markup on the target (invariant 42, D46 amendment)")

# ------------------------------------------------------------------ record
d["NOTES"]["Ledger & controls"].append("D46 amendment (11 Oct, evening, same draft v5.7), from an independent re-derivation of the calculations against the ledger: PROJECT_BALANCE and GROUP_ENTITLEMENT are sums over postings (LEDGER_POSTING.receiver_group_id on promise lines), no longer over deals; a resale invoice names the vendor invoice it marks up and has a receivable balance (DEAL_GROUP.invoice_amount, invoice_rate) while a vendor invoice has a payable balance over released lines; FX_CLEARING becomes FX_RESULT, a P&L account per currency for NPL’s own currency exchanges that needs no closing; invariant 16 lists both directions of ownership movement; invariant 42 states the target-out rule.")
d["DECISIONS"] += "\nAMENDMENT OF 11 OCTOBER 2026 (evening, same draft v5.7), D46: an independent re-derivation of every calculation from the ERD and the ledger found five gaps, all applied — (1) the derived views PROJECT_BALANCE and GROUP_ENTITLEMENT no longer agreed with the accounts the ledger says they equal (actual_out includes NPL’s margin; no term for top-ups, make-goods, offsets, hops, re-raised promises): both are now sums over postings, with LEDGER_POSTING.receiver_group_id on every promise line, and invariant 7 is restated over postings; (2) the invoice model could not produce Pattern M’s figures: INVOICE.vendor_invoice_id pairs the resale invoice with the vendor invoice it marks up, DEAL_GROUP.invoice_amount and invoice_rate carry the part collected and the pricing rate, INVOICE_BALANCE is a receivable balance for a resale invoice and a payable balance over released lines for a vendor invoice, invariant 23 restated, discharge_rate direction kept as payout currency per invoice currency; (3) FX_CLEARING, an asset, could never be closed under per-currency balancing and was also carrying a cash-rounding surplus: replaced by FX_RESULT, a profit-and-loss account per currency (currency sold a debit, currency bought a credit, valued through REPORTING_VALUE), and the surplus is NPL-GR’s revenue in the currency received; (4) invariant 16 listed only the client → company events: restated as two lists; (5) invariant 42 covered fixed-in only: the target-out rule (fee as a markup on the target, NPL’s convention) added. No worked figure changes except the T51 surplus line and the printed direction of the discharge rates."
names = set(E)
for r in R: assert r[0] in names and r[1] in names, r
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("tables", sum(1 for e in E.values() if e["d"] != "view"), "views", sum(1 for e in E.values() if e["d"] == "view"), "relations", len(R), "invariants", len(INV), "FX_CLEARING left:", json.dumps(d).count("FX_CLEARING"))
