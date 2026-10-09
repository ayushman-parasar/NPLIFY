#!/usr/bin/env python3
"""9 October 2026 (evening), NPL's answers to the operational questions — D39 partner methods, D40 bridge
wallets and the wallet registry view, D41 cash settlement evidence and the recommend-then-approve path for
fee concessions. Idempotent.   python3 scripts/apply-v5.4-d39-d41.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text()); E, R = d["E"], d["R"]
assert "supported_methods" not in [f[0] for f in E["PARTNER"]["f"]]

def set_note(name, field, note):
    for f in E[name]["f"]:
        if f[0] == field:
            while len(f) < 4: f.append("")
            f[3] = note; return
    raise KeyError((name, field))
def ch(name, text):
    E[name].setdefault("ch", []).append(text); E[name]["v"] = E[name].get("v") or "changed"

# ------------------------------------------------------------------ D39 partner methods; cutoff optional
E["PARTNER"]["f"].insert(5, ["supported_methods", "string", "", "crypto / bank / cash / local_deposit — the methods this partner offers (Ali: all four; Jeton and Aquanow: crypto, bank). Networks are implied by its wallet endpoints (v5.4, D39)"])
set_note("PARTNER", "bank_cutoff_time", "nullable: the partner’s standing daily bank cutoff for pairs that rely on the banking channel (Ali and other Asian partners, 14:30); empty for Jeton and Aquanow, which bind nothing. Governs locking the rate for same-day conversion and initiating an outgoing bank settlement; per-day changes in PARTNER_CUTOFF_OVERRIDE (v5.3 D29, v5.4 D39)")
ch("PARTNER", "v5.4 (D39): + supported_methods; bank_cutoff_time nullable — a partner’s methods and clock are configuration, not code")
E["PARTNER"]["desc"] += " v5.4 (D39): supported_methods says which collection and settlement methods the partner offers; cash and local deposits have no standing endpoint, so they are declared here, while networks are read from the vehicle’s wallet endpoints."
d["INV"].append([["PARTNER", "DEAL", "SETTLEMENT", "COLLECTION_RECEIVING_ENDPOINT", "PARTNER_ENTITY"], "A partner offers only what its record says: a leg’s collection_method, and the method of any settlement through the partner, must be in PARTNER.supported_methods; a wallet endpoint’s network must already exist as an endpoint of that partner’s vehicle before a collection may name it. Adding a method or a network is a Management-approved configuration change (v5.4, D39)."])

# ------------------------------------------------------------------ D40 bridge wallets; wallet registry view
E["OWN_WALLET"]["f"].insert(4, ["role", "string", "", "reroute_contingency / own_desk / collection_bridge — LT Sub at Aquanow is the NPL-GR own desk; NPL’s ERC-20 wallet is a bridge for partners without that network (v5.4, D40)"])
E["OWN_WALLET"]["f"].insert(5, ["networks", "string", "", "networks the wallet receives on (ERC-20 where Ali cannot) (v5.4, D40)"])
ch("OWN_WALLET", "v5.4 (D40): + role, networks — a collection bridge is a third allowed custody case (invariant 3)")
E["OWN_WALLET"]["desc"] = "NPL’s own wallets, by role: reroute contingency (AQN-LT-Sub at Aquanow, Q10), the own desk of the NPL-GR project (D23), and a collection bridge — a wallet on a network a partner does not support (ERC-20 for Ali) or one that isolates risk, on which NPL collects and from which it forwards to the leg’s partner as a hop within custody_max_hours (D40). Custody is allowed only in those three cases (invariant 3); the custody view is the standing control. Also receives recovered dues."
set_note("COLLECTION_RECEIVING_ENDPOINT", "own_wallet_id", "nullable; set when the endpoint is NPL’s own wallet — under an own-desk configuration (D23) or as a collection bridge for a partner that lacks the network or for risk isolation (D40); the endpoint still belongs to the leg’s partner configuration")
ch("COLLECTION_RECEIVING_ENDPOINT", "v5.4 (D40): own_wallet_id also names a collection-bridge wallet")
d["INV"][2] = [["OWN_WALLET", "REROUTE", "COLLECTION", "CUSTODY", "PARTNER_CONFIG", "SETTLEMENT_LINE"], "Custody in NPL’s own wallet is allowed in three cases only: a collection on a deal with an approved REROUTE; a leg whose PARTNER_CONFIG is an own desk (D23, the NPL-GR project); or a collection on a wallet with role collection_bridge, which is forwarded to the leg’s partner as a hop (a SETTLEMENT_LINE to the partner_transit receiver) within the wallet’s custody_max_hours (D40). CL.OWN.*.HELD is debited by nothing else; the custody aging view reports all three and is the standing control."]
E["CUSTODY"]["desc"] = "CUSTODY(own_wallet) = Σ collections into the own wallet under open reroutes + Σ recovered dues resting there + Σ own-desk client balances (D23) + Σ bridge collections not yet forwarded (D40) − Σ forwarded or paid out; each row with deal, reason, role and age. The standing control on money in NPL’s hands."
ch("CUSTODY", "v5.4 (D40): includes bridge collections awaiting their hop")
E["WALLET_REGISTRY"] = {"d": "view", "col": 8, "v": "new", "desc": "WALLET_REGISTRY(network, address) = every wallet address the model knows, with its owner and role: the partners’ receiving wallets (COLLECTION_RECEIVING_ENDPOINT kind wallet, with risk_band), NPL’s own wallets (OWN_WALLET with role), receivers’ wallets (RECEIVING_ENTITY_ACCOUNT kind wallet, with their DESTINATION_APPROVALs) and the sender addresses seen in WALLET_SCREENING with their latest decision. A view, never a second copy of an address: it answers which networks a partner accepts, which wallet is the bridge, and whether an address was seen before under another owner — the FRS ‘wallet registry’ (v5.4, D40).", "f": [["network", "", ""], ["address", "", ""]]}
d["ORDER"]["8"].append("WALLET_REGISTRY")
R += [["COLLECTION_RECEIVING_ENDPOINT", "WALLET_REGISTRY", "view", "", "partner wallets", "Σ"], ["OWN_WALLET", "WALLET_REGISTRY", "view", "", "NPL’s wallets by role", "Σ"],
      ["RECEIVING_ENTITY_ACCOUNT", "WALLET_REGISTRY", "view", "", "receivers’ wallets", "Σ"], ["WALLET_SCREENING", "WALLET_REGISTRY", "view", "", "sender addresses and decisions", "Σ"]]
d["FRS_VOCAB"] = [([v[0], "COLLECTION_RECEIVING_ENDPOINT (kind wallet) under PARTNER_ENTITY for the partner’s wallets; the FRS ‘wallet registry’ across all owners is the WALLET_REGISTRY view (D15, D40)"] if v[0].startswith("Facilitating Entity / Wallet registry") else v) for v in d["FRS_VOCAB"]]
d["CONVENTIONS"] = [c.replace("month volume, client position) are views", "month volume, client position, wallet registry) are views") for c in d["CONVENTIONS"]]

# ------------------------------------------------------------------ D41 cash settlement evidence; recommend-then-approve
set_note("SETTLEMENT_LINE", "token_ref", "cash settlement: the receiver’s token, provided up front and relayed NPL → partner → agent (v5.3 D30, v5.4 D41)")
E["SETTLEMENT_LINE"]["f"].append(["evidence_ref", "string", "", "cash settlement: the agent’s photo of the receiver’s token after hand-over, relayed partner → NPL → receiver; the receiver’s CONFIRMATION closes the loop (v5.4, D41)"])
ch("SETTLEMENT_LINE", "v5.4 (D41): + evidence_ref — the agent’s token photo on a cash payout")
set_note("COLLECTION", "token_ref", "cash: serial of the token (local-currency bill) that identifies the agent; the partner may replace the agent and the token before hand-over — the collection holds the current token, the audit log the previous one; the rate locked at quote is unchanged (v5.3 D30, v5.4 D41)")
E["FEE_DECISION"]["f"].insert(6, ["recommended_by", "int", "FK", "Finance — reviews and recommends before Management approves a covered bank fee or a markup above the cap (v5.4, D41)"])
set_note("FEE_DECISION", "approved_by", "Management for a covered bank fee or a markup above max_markup_pct; Finance for the other one-off decisions")
ch("FEE_DECISION", "v5.4 (D41): + recommended_by — Finance recommends, Management approves")
E["FEE_DECISION"]["desc"] += " v5.4 (D41): covering a bank fee, or going above the fee cap after discussing with the customer, is reviewed and recommended by Finance and approved by Management; the decision records both."
E["APPROVAL"]["desc"] += " v5.4 (D41) adds cover_bank_fee and raise_fee_cap — Finance recommends (FEE_DECISION.recommended_by), Management approves; a rate below the breach limit only warns and never refuses a quote."
ch("APPROVAL", "v5.4 (D41): + actions cover_bank_fee, raise_fee_cap")
R.append(["USER", "FEE_DECISION", "actor", "recommended_by", "recommended_by", "1 : n", "new"])
set_note("CURRENCY_PAIR", "cash_rounding_unit", "100 / 500 / 1000 by currency — the unit the collected cash amount is rounded to; AED cash 100, USD cash in Dubai 10 (NPL, 9 Oct)")

d["NOTES"]["Configuration"].append("v5.4 (D39, D40): a partner’s methods are declared on PARTNER.supported_methods and its cutoff is optional (none for Jeton or Aquanow); NPL’s own wallets have a role — contingency, own desk or collection bridge — and WALLET_REGISTRY lists every known address with its owner and role.")
d["NOTES"]["Deal lifecycle"].append("v5.4 (D40, D41): a collection on a bridge wallet is forwarded to the leg’s partner as a hop within the wallet’s custody limit; on a cash settlement the receiver provides the token and the agent’s photo is the line’s evidence; covering a bank fee or exceeding the fee cap is recommended by Finance and approved by Management.")
d["OPENQ"].append({"q": "Review point (v5.4): NPL’s answers to the operational questions of the scenario catalogue — alternate wallets, partner methods, cutoff scope, cash settlement token, fee cover, local deposits.", "blocks": "Partner configuration; custody; cash settlement; approvals", "status": "answered",
    "a": "NPL (9 Oct, evening): partners have designated wallets for unscreened senders and NPL bridges unsupported networks on its own wallet; a partner’s methods are configuration; the cutoff exists only for Ali-type partners and only on bank-side pairs; on a cash payout the receiver issues the token and the agent photographs it; a cash deposit into a bank account is a local payment; Finance recommends and Management approves fee concessions.",
    "impl": "v5.4 D39 PARTNER.supported_methods, cutoff nullable, invariant 36; D40 OWN_WALLET.role / networks, invariant 3 restated, WALLET_REGISTRY view; D41 SETTLEMENT_LINE.evidence_ref, FEE_DECISION.recommended_by, approval actions cover_bank_fee and raise_fee_cap.", "ents": ["PARTNER", "OWN_WALLET", "WALLET_REGISTRY", "SETTLEMENT_LINE", "FEE_DECISION", "APPROVAL"]})
d["DECISIONS"] += (
    "\nAGREED 9 OCTOBER 2026 (evening), IN v5.4 — D39: PARTNER.supported_methods (crypto / bank / cash / local_deposit) and a nullable bank_cutoff_time; invariant 36. Why (NPL): Jeton has no cash or local methods and no cutoff, Aquanow likewise; a partner record must be customizable, not hard-coded; cash and local deposits have no standing endpoint from which support could be read."
    "\nAGREED 9 OCTOBER 2026 (evening), IN v5.4 — D40: OWN_WALLET.role (reroute_contingency / own_desk / collection_bridge) and networks; invariant 3 restated to allow a bridge collection forwarded to the leg’s partner as a hop within custody_max_hours; CUSTODY includes bridge balances; WALLET_REGISTRY view over partner wallets, own wallets, receiver wallets and screened sender addresses. Why (NPL): where a partner lacks a network (Ali: no ERC-20) NPL collects on its own alternate wallet and forwards on a supported network, without the risk exposure — a routine flow invariant 3 forbade; and the FRS ‘wallet registry’ had no single home."
    "\nAGREED 9 OCTOBER 2026 (evening), IN v5.4 — D41: SETTLEMENT_LINE.evidence_ref (the agent’s photo of the receiver’s token); COLLECTION.token_ref replaceable before hand-over with the locked rate unchanged; FEE_DECISION.recommended_by (Finance) beside approved_by (Management); APPROVAL actions cover_bank_fee and raise_fee_cap; AED cash rounds to 100, USD cash in Dubai to 10. Why (NPL): on a cash payout the receiver provides the token and the agent photographs it; a fee cover or a markup above the cap is reviewed by Finance and approved by Management; a rate below the limit warns and never refuses."
)
names = set(E)
for r in R: assert r[0] in names and r[1] in names, r
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("tables", sum(1 for e in E.values() if e["d"] != "view"), "views", sum(1 for e in E.values() if e["d"] == "view"), "relations", len(R), "invariants", len(d["INV"]))
