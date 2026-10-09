#!/usr/bin/env python3
"""D37 (9 October 2026): align model names with the FRS and NPL's own vocabulary. Renames tables, columns and
value sets across the model file, the ERD generator, the diagram definitions, the Mermaid labels, the
knowledge-base builder and the standalone map template. Kept unchanged at NPL's request:
COLLECTION_SENDING_ENTITY, COLLECTION_RECEIVING_ENDPOINT, CONVERSION.residual_in.
Idempotent.   python3 scripts/apply-v5.3-naming.py"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P = ROOT / "data/erd.v5.json"
d0 = json.loads(P.read_text())
assert "DISBURSEMENT" in d0["E"], "already applied"

# ordered: longest / most specific first; \b-bounded so DISBURSEMENT never hits DISBURSEMENT_LINE
RULES = [
    # tables
    (r"\bDISBURSEMENT_RETURN\b", "SETTLEMENT_RETURN"), (r"\bDISBURSEMENT_LINE\b", "SETTLEMENT_LINE"), (r"\bDISBURSEMENT\b", "SETTLEMENT"),
    (r"\bREFERRAL_ACCRUAL\b", "MARKUP_SHARE_ACCRUAL"), (r"\bREFERRAL_RULE\b", "MARKUP_SHARE_RULE"), (r"\bINTRODUCER\b", "MARKUP_SHARE_PARTY"),
    (r"\bSETTLEMENT_REGISTRATION\b", "DESTINATION_APPROVAL"),
    # columns
    (r"\bdisburse_policy\b", "settlement_policy"), (r"\btopped_up_disbursement_id\b", "topped_up_settlement_id"), (r"\bapplied_disbursement_id\b", "applied_settlement_id"),
    (r"\bdisbursement_line_id\b", "settlement_line_id"), (r"\bdisbursement_id\b", "settlement_id"), (r"\breturned_disbursement\b", "returned_settlement"),
    (r"\breferral_rule_id\b", "markup_share_rule_id"), (r"\bintroducer_id\b", "markup_share_party_id"),
    (r"\bsettlement_registration_id\b", "destination_approval_id"),
    (r"\bsender_share_pct\b", "sender_pays_pct"), (r"\breceiver_share_pct\b", "receiver_pays_pct"),
    (r"\bfloor_pct\b", "min_markup_pct"), (r"\bcap_pct\b", "max_markup_pct"),
    (r"\bdisplayed_fee_basis\b", "customer_facing_fee_basis"), (r"\bdisplayed_fee_pct\b", "customer_facing_fee_pct"), (r"\bdisplayed_source_rate\b", "customer_facing_rate"),
    (r"\bpartner_markup_pct\b", "partner_fee_pct"),
    # value sets
    (r"\bmarket_plus_pct\b", "fee_on_market"), (r"\bdisclosed_rate\b", "fee_in_rate"), (r"\bmarket_plus\b", "fee_on_market"),
    (r"\bsender_share_on_partner_rate\b", "sender_pays_on_agent_rate"),
    (r"\bREFERRAL_PAYABLE\b", "SHARE_PAYABLE"),
    (r"\bDisbursementReturn\b", "SettlementReturn"), (r"\bDisbursement\b(?= / |\")", "Settlement"),
    (r"holder_type: PartnerConfig / OwnWallet / Receiver / Sender / Introducer", "holder_type: PartnerConfig / OwnWallet / Receiver / Sender / MarkupShareParty"),
    (r"PartnerConfig / OwnWallet / Receiver / Sender / Introducer / Project / None", "PartnerConfig / OwnWallet / Receiver / Sender / MarkupShareParty / Project / None"),
    (r"holder = Introducer", "holder = MarkupShareParty"), (r"holder_type Introducer", "holder_type MarkupShareParty"), (r"source = Referral\b", "source = MarkupShare"),
    (r"Reroute / Referral / Rebate", "Reroute / MarkupShare / Rebate"), (r"sources BalanceConversion, DisbursementReturn, Referral and Rebate", "sources BalanceConversion, SettlementReturn, MarkupShare and Rebate"),
    (r"variance / referral / share / rounding", "variance / share / rounding"), (r"variance / referral / rounding", "variance / share / rounding"),
    (r"cost components gain referral and rounding", "cost components gain share and rounding"), (r"cost components referral, rounding", "cost components share, rounding"),
    (r"Cost components include referral, share, rebate", "Cost components include share, rebate"), (r"cost components rebate \(D27\), share \(D26\)", "cost component rebate (D27), share for the markup-share party (D26)"),
    # prose
    (r"\b([Dd])isbursements\b", lambda m: m.group(1).replace("D", "S").replace("d", "s") + "ettlements"),
    (r"\b([Dd])isbursement\b", lambda m: m.group(1).replace("D", "S").replace("d", "s") + "ettlement"),
    (r"\b([Dd])isbursing\b", lambda m: m.group(1).replace("D", "S").replace("d", "s") + "ettling"),
    (r"\b([Dd])isbursed\b", lambda m: m.group(1).replace("D", "S").replace("d", "s") + "ettled"),
    (r"\b([Dd])isburse\b", lambda m: m.group(1).replace("D", "S").replace("d", "s") + "ettle"),
    (r"\bsettlement registrations?\b", "destination approval"), (r"\bSettlement registration\b", "Destination approval"),
    (r"An external introducer who brought in a client and is owed referral commission", "A party who shares NPL’s markup: an external introducer who brought in a client, or a customer such as Raeen who provides sub-accounts"),
    (r"\bintroducers\b", "markup-share parties"), (r"\bintroducer\b", "markup-share party"), (r"\bIntroducer\b", "Markup-share party"),
    (r"referral commissions NPL pays", "markup shares NPL pays"), (r"Referral commission accrued", "Markup share accrued"), (r"referral commission terms", "markup-share terms"),
]

def apply(text):
    for pat, rep in RULES:
        text = re.sub(pat, rep, text)
    return text

# ------------------------------------------------------------------ model file
raw = P.read_text()
new = apply(raw)
d = json.loads(new)
E = d["E"]
for n in ("SETTLEMENT", "SETTLEMENT_LINE", "SETTLEMENT_RETURN", "MARKUP_SHARE_PARTY", "MARKUP_SHARE_RULE", "MARKUP_SHARE_ACCRUAL", "DESTINATION_APPROVAL"):
    assert n in E, n
for n in ("DISBURSEMENT", "INTRODUCER", "REFERRAL_RULE", "SETTLEMENT_REGISTRATION"):
    assert n not in E, n
assert "COLLECTION_SENDING_ENTITY" in E and "COLLECTION_RECEIVING_ENDPOINT" in E
assert any(f[0] == "residual_in" for f in E["CONVERSION"]["f"])
names = set(E)
for r in d["R"]: assert r[0] in names and r[1] in names, r
for col in d["ORDER"].values():
    for n in col: assert n in names, n
# vocabulary: old names as aliases
d["FRS_VOCAB"] += [
    ["Settlement (FRS) — was DISBURSEMENT", "SETTLEMENT, SETTLEMENT_LINE, SETTLEMENT_RETURN; PROJECT.settlement_policy (D37)"],
    ["Markup shared with a party — was INTRODUCER / REFERRAL_*", "MARKUP_SHARE_PARTY, MARKUP_SHARE_RULE, MARKUP_SHARE_ACCRUAL; purpose SHARE_PAYABLE (D37)"],
    ["Approved destination — was SETTLEMENT_REGISTRATION", "DESTINATION_APPROVAL (D37)"],
    ["Sender pays / receiver pays; lowest and highest markup; customer-facing calculation; fee on top of market / fee inside its rate; agent rate", "sender_pays_pct, receiver_pays_pct; min_markup_pct, max_markup_pct; customer_facing_fee_basis / _pct / _rate; partner_fee_pct with fee_on_market / fee_in_rate; rate_basis market / agent_rate (D37)"],
]
for f in E["FEE_STRUCTURE"]["f"]:
    if f[0] == "rate_basis":
        while len(f) < 4: f.append("")
        f[3] = "market / agent_rate (D37; was market / partner)"
d["DECISIONS"] += (
    "\nAGREED 9 OCTOBER 2026 (evening), IN v5.3 — D37, naming aligned with the FRS and NPL’s vocabulary: DISBURSEMENT → SETTLEMENT (and _LINE, _RETURN; disburse_policy → settlement_policy; funding_source returned_settlement; ledger sources Settlement / SettlementReturn); INTRODUCER → MARKUP_SHARE_PARTY, REFERRAL_RULE → MARKUP_SHARE_RULE, REFERRAL_ACCRUAL → MARKUP_SHARE_ACCRUAL, purpose REFERRAL_PAYABLE → SHARE_PAYABLE, ledger source Referral → MarkupShare, cost component referral merged into share; SETTLEMENT_REGISTRATION → DESTINATION_APPROVAL; sender_share_pct / receiver_share_pct → sender_pays_pct / receiver_pays_pct; floor_pct / cap_pct → min_markup_pct / max_markup_pct; displayed_fee_basis / displayed_fee_pct / displayed_source_rate → customer_facing_fee_basis / customer_facing_fee_pct / customer_facing_rate (basis value sender_share_on_partner_rate → sender_pays_on_agent_rate); partner_markup_pct → partner_fee_pct with partner_pricing values fee_on_market / fee_in_rate (were market_plus_pct / disclosed_rate); rate_basis values market / agent_rate (were market / partner). "
    "Why: the FRS and NPL say settlement, not disbursement; NPL’s fee table calls Jeton’s rebate a ‘referral commission’, so ‘referral’ in the model pointed the wrong way and since D26 the party is usually a customer; NPL’s word for a registration is ‘approved’; the remaining column names are the phrases NPL used when answering the fee outlines. Kept at NPL’s request: COLLECTION_SENDING_ENTITY, COLLECTION_RECEIVING_ENDPOINT, CONVERSION.residual_in. Earlier documents (Ledger v1.1, Lifecycle v1.1, Roles v1.0, Reading Guide v1.0, Fee Outlines v0.2, Proposals v1.0) still use the old names until regenerated; Appendix A.1 carries the aliases."
)
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("model renamed:", len(E), "entities")

# ------------------------------------------------------------------ generators, app, template
for rel in ("scripts/build-erd-doc.mjs", "scripts/erd-diagram-defs.mjs", "scripts/mermaid-diagrams.mjs", "scripts/build-erd-guide.mjs", "src/lib/kb.ts", "standalone/nplify-erd-map.html", "src/lib/map/engine.js"):
    f = ROOT / rel; t = f.read_text(); u = apply(t)
    if u != t: f.write_text(u); print("renamed in", rel)
    else: print("no change in", rel)
