#!/usr/bin/env python3
"""Apply the v5.3 decisions (D20–D33: the fee-practice gaps A–M and the same-currency pass-through) to
data/erd.v5.json. Idempotent: refuses to run twice.   python3 scripts/apply-v5.3.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text())
assert d["version"] == "5.2", d["version"]
E, R = d["E"], d["R"]
TAG = "(v5.3, D{})"

def add_fields(name, fields, ch):
    e = E[name]
    names = {f[0] for f in e["f"]}
    for f in fields:
        assert f[0] not in names, (name, f[0])
        e["f"].append(f)
    e.setdefault("ch", []).append(ch)
    if e.get("v") != "new":
        e["v"] = "changed"

def set_field_note(name, field, note):
    for f in E[name]["f"]:
        if f[0] == field:
            while len(f) < 4: f.append("")
            f[3] = note
            return
    raise KeyError((name, field))

def new_table(name, dom, col, desc, fields, order_col):
    assert name not in E, name
    E[name] = {"d": dom, "col": col, "desc": desc, "f": fields, "v": "new", "ch": ["new in v5.3"]}
    d["ORDER"][str(order_col)].append(name)

def rel(a, b, kind, fk, label, card):
    R.append([a, b, kind, fk, label, card, "new"])

# ------------------------------------------------------------------ D20 (A) override with its own split
add_fields("FEE_OVERRIDE", [
    ["sender_share_pct", "decimal", "", "optional; with receiver_share_pct replaces the structure’s proportion " + TAG.format(20)],
    ["receiver_share_pct", "decimal", "", "optional; both blank → structure’s proportion; both set → sum = pct " + TAG.format(20)],
], "v5.3 (D20): + sender_share_pct, receiver_share_pct — an override carries its own split")
E["FEE_OVERRIDE"]["desc"] += " v5.3 (D20): may carry its own sender / receiver split instead of inheriting the structure’s proportion (Evo’s selected senders pay 1.0 % while Evo still pays 0.6 %)."

# ------------------------------------------------------------------ D21 (B) volume tiers
new_table("FEE_TIER", "config", 3,
    "A volume tier of a fee structure (GDC: 2.5 % from USD 0, 2.25 % from USD 500,000 in the calendar month). A structure with tiers has one tier at volume 0. The tier applied is chosen at quote from the project’s month-to-date Σ amount_in; a deal that crosses a threshold is split across two tiers (DEAL_FEE_TIER). v5.3 (D21).",
    [["id", "int", "PK"], ["fee_structure_id", "int", "FK"], ["min_monthly_volume", "decimal", "", "threshold in volume_currency, per calendar month"], ["volume_currency", "string"],
     ["pct", "decimal"], ["sender_share_pct", "decimal", "", "optional"], ["receiver_share_pct", "decimal", "", "optional"], ["effective_from", "datetime"]], 3)
new_table("DEAL_FEE_TIER", "deal", 5,
    "The tier portions of one leg: one row normally, two when the leg takes the month’s volume past a threshold — the part below the threshold at the lower tier’s pct, the part above at the next tier’s. The leg’s fee parts are the blended sum. v5.3 (D21).",
    [["id", "int", "PK"], ["deal_id", "int", "FK"], ["fee_tier_id", "int", "FK"], ["amount_in_portion", "decimal", "", "Σ over a leg = amount_in"], ["pct", "decimal", "", "the tier’s pct at quote"]], 5)
add_fields("DEAL", [
    ["fee_override_id", "int", "FK", "nullable; the override that priced this leg " + TAG.format(20)],
    ["fee_tier_id", "int", "FK", "nullable; base tier at quote " + TAG.format(21)],
    ["tier_volume_basis", "decimal", "", "project month-to-date volume that justified the tier, stamped at quote " + TAG.format(21)],
], "v5.3 (D20, D21): + fee_override_id, fee_tier_id, tier_volume_basis")
rel("FEE_STRUCTURE", "FEE_TIER", "owns", "fee_structure_id", "volume tiers (one at volume 0)", "1 : n")
rel("FEE_OVERRIDE", "DEAL", "refs", "fee_override_id", "override that priced the leg", "1 : 0..n")
rel("FEE_TIER", "DEAL", "refs", "fee_tier_id", "base tier at quote", "1 : 0..n")
rel("DEAL", "DEAL_FEE_TIER", "owns", "deal_id", "tier portions (1..2)", "1 : n")
rel("FEE_TIER", "DEAL_FEE_TIER", "refs", "fee_tier_id", "tier applied to the portion", "1 : n")

# ------------------------------------------------------------------ D22 (C) displayed fee
add_fields("FEE_STRUCTURE", [
    ["displayed_fee_basis", "string", "", "actual / sender_share_on_partner_rate / fixed " + TAG.format(22)],
    ["displayed_fee_pct", "decimal", "", "when displayed_fee_basis = fixed (BF via Ali shows 1 %) " + TAG.format(22)],
], "v5.3 (D22): + displayed_fee_basis, displayed_fee_pct — what the quote prints, derived never typed")
add_fields("DEAL_GROUP", [
    ["displayed_fee_pct", "decimal", "", "stamped at quote " + TAG.format(22)],
    ["displayed_source_rate", "decimal", "", "= sender_rate ÷ (1 − displayed_fee_pct); the ‘market rate’ the quote prints " + TAG.format(22)],
    ["invoice_id", "int", "FK", "nullable; the obligation this group pays " + TAG.format(24)],
], "v5.3 (D22, D24): + displayed_fee_pct, displayed_source_rate, invoice_id")

# ------------------------------------------------------------------ D23 (D) own desk — NPL-GR
add_fields("PARTNER_CONFIG", [
    ["is_own_desk", "bool", "", "default false; NPL converts in its own wallet for this project (NPL-GR); enabling needs Management approval " + TAG.format(23)],
    ["bank_cutoff_time", "time", "", "daily cutoff for pairs that depend on the banking channel (Ali 14:30) " + TAG.format(29)],
    ["cutoff_timezone", "string", "", "IANA zone, e.g. Asia/Hong_Kong " + TAG.format(29)],
], "v5.3 (D23, D29): + is_own_desk, bank_cutoff_time, cutoff_timezone")
E["PARTNER_CONFIG"]["desc"] += " v5.3 (D23): an own-desk configuration is NPL itself as the converting party; its PARTNER_PAIR rows are priced market_plus_pct with NPL’s markup and its endpoints are NPL’s own wallets."
add_fields("COLLECTION_RECEIVING_ENDPOINT", [
    ["own_wallet_id", "int", "FK", "nullable; set when the endpoint is NPL’s own wallet under an own-desk configuration " + TAG.format(23)],
    ["risk_band", "string", "", "standard / elevated — which screening decisions may land here " + TAG.format(31)],
    ["usage", "string", "", "standing / single_use (ad hoc local deposit accounts) " + TAG.format(32)],
    ["reserved_for_deal_id", "int", "FK", "nullable; the one deal a single_use endpoint serves " + TAG.format(32)],
    ["expected_amount", "decimal", "", "nullable; the amount a single_use endpoint was arranged for " + TAG.format(32)],
], "v5.3 (D23, D31, D32): + own_wallet_id, risk_band, usage, reserved_for_deal_id, expected_amount")
rel("OWN_WALLET", "COLLECTION_RECEIVING_ENDPOINT", "refs", "own_wallet_id", "own-desk endpoint", "1 : 0..n")
d["INV"][2][1] = ("No custody in the normal path: CL.OWN.*.HELD may be debited only by a collection on a deal with an approved REROUTE, or on a leg whose PARTNER_CONFIG is an own desk (v5.3, D23 — the NPL-GR game-reseller project); "
                  "the custody aging view reports both and is the standing control.")
d["INV"][2][0] = ["OWN_WALLET", "REROUTE", "COLLECTION", "CUSTODY", "PARTNER_CONFIG"]
E["CUSTODY"]["desc"] = ("CUSTODY(own_wallet) = Σ collections into the own wallet under open reroutes + Σ recovered dues resting there + Σ own-desk client balances (v5.3, D23) − Σ forwarded or paid out; each row with deal, reason, age. The standing control on money in NPL’s hands.")
E["CUSTODY"].setdefault("ch", []).append("v5.3 (D23): includes own-desk balances with their age")

# ------------------------------------------------------------------ D24 (E) invoices and per-line discharge
new_table("INVOICE", "deal", 5,
    "An obligation in its own currency, independent of how it is paid: a vendor’s EUR invoice that a reseller customer settles in THB or USDT, in parts, over days. Owned by the project, names the vendor (a counterparty receiver). INVOICE_BALANCE = amount − Σ obligation_discharged over confirmed lines. v5.3 (D24).",
    [["id", "int", "PK"], ["project_id", "int", "FK"], ["receiver_id", "int", "FK", "the vendor owed"], ["currency", "string"], ["amount", "decimal"], ["reference", "string"], ["issued_at", "datetime"], ["status", "string", "", "open / settled / void"]], 5)
add_fields("DISBURSEMENT_LINE", [
    ["invoice_id", "int", "FK", "nullable; the obligation this line discharges " + TAG.format(24)],
    ["obligation_discharged", "decimal", "", "in the invoice currency " + TAG.format(24)],
    ["discharge_rate", "decimal", "", "payout currency per invoice currency at payment " + TAG.format(24)],
    ["discharge_market_rate_id", "int", "FK", "nullable; the market snapshot used " + TAG.format(24)],
    ["token_ref", "string", "", "cash settlement: serial of the token handed to the receiver’s agent " + TAG.format(30)],
], "v5.3 (D24, D30): + invoice_id, obligation_discharged, discharge_rate, discharge_market_rate_id, token_ref")
rel("PROJECT", "INVOICE", "owns", "project_id", "obligations to vendors", "1 : n")
rel("RECEIVER", "INVOICE", "refs", "receiver_id", "vendor owed", "1 : n")
rel("INVOICE", "DEAL_GROUP", "refs", "invoice_id", "obligation this group pays (advance, balance)", "1 : 0..n")
rel("INVOICE", "DISBURSEMENT_LINE", "refs", "invoice_id", "discharged by", "1 : 0..n")
rel("MARKET_RATE", "DISBURSEMENT_LINE", "refs", "discharge_market_rate_id", "discharge snapshot", "1 : 0..n")
E["INVOICE_BALANCE"] = {"d": "view", "col": 8, "desc": "INVOICE_BALANCE(invoice) = INVOICE.amount − Σ DISBURSEMENT_LINE.obligation_discharged over lines with outcome confirmed. The open part of a vendor obligation paid in another currency, in parts (v5.3, D24).", "f": [["invoice", "", ""]], "v": "new"}
d["ORDER"]["8"].append("INVOICE_BALANCE")
rel("INVOICE", "INVOICE_BALANCE", "view", "", "amount", "Σ")
rel("DISBURSEMENT_LINE", "INVOICE_BALANCE", "view", "", "− Σ obligation_discharged (confirmed)", "Σ")
E["PROJECT_MONTH_VOLUME"] = {"d": "view", "col": 8, "desc": "PROJECT_MONTH_VOLUME(project, month, currency) = Σ DEAL.amount_in over forward legs of the project collected in the calendar month, in the tier’s volume currency. Read at quote to choose the FEE_TIER; stamped on the leg as tier_volume_basis (v5.3, D21).", "f": [["project", "", ""], ["month", "", ""], ["currency", "", ""]], "v": "new"}
d["ORDER"]["8"].append("PROJECT_MONTH_VOLUME")
rel("DEAL", "PROJECT_MONTH_VOLUME", "view", "", "Σ amount_in per calendar month", "Σ")

# ------------------------------------------------------------------ D25 (F) rounding menu; D33 same-currency pair
set_field_note("CURRENCY_PAIR", "amount_rounding", "truncate_unit / nearest_unit / round_up_unit / nearest_n / round_up_n (v5.3, D25; was truncate_whole_unit only)")
add_fields("CURRENCY_PAIR", [
    ["rounding_unit", "decimal", "", "required for nearest_n / round_up_n (1,000 for THB, INR, JPY payouts) " + TAG.format(25)],
], "v5.3 (D25, D33): amount_rounding is a menu; + rounding_unit; from_currency may equal to_currency (same-currency pass-through, converted at rate 1)")
E["CURRENCY_PAIR"]["desc"] = E["CURRENCY_PAIR"].get("desc", "") + " v5.3 (D25): rounding is a per-pair choice — truncate, nearest or round up, to the unit or to rounding_unit; what is dropped stays client money, what is added by rounding up is NPL’s cost (EXP_ROUNDING). v5.3 (D33): from_currency may equal to_currency; the leg still converts, at rate 1, so the fee is captured at conversion as on any other pair."
set_field_note("CONVERSION", "rounding_residual", "signed (v5.3, D25): positive = fraction dropped, stays client money; negative = amount added by rounding up, NPL’s cost posted to EXP_ROUNDING")
E["CONVERSION"].setdefault("ch", []).append("v5.3 (D25): rounding_residual signed; rate 1 on a same-currency pair (D33)")

# ------------------------------------------------------------------ D26 (G) markup shared with a party
set_field_note("REFERRAL_RULE", "basis", "share_of_earnings / fixed_pct / share_of_net_markup (v5.3, D26: base = fee parts − partner cost on the leg, on amount × market; rebates never in the base)")
add_fields("REFERRAL_RULE", [
    ["fee_structure_id", "int", "FK", "optional scope: only deals priced on this structure (Raeen sub-account 50 %, Raeen direct downlines 75 %) " + TAG.format(26)],
    ["party_kind", "string", "", "introducer / client_party " + TAG.format(26)],
    ["settlement_mode", "string", "", "npl_pays / party_retains — the party holds the converted funds and pays NPL the remainder monthly " + TAG.format(26)],
], "v5.3 (D26): basis share_of_net_markup; + fee_structure_id scope, party_kind, settlement_mode; several parties per project with Σ shares ≤ 100 %")
E["REFERRAL_RULE"]["desc"] += " v5.3 (D26): also the customer who provides a sub-account and shares NPL’s markup (Raeen): basis share_of_net_markup, several rules with different shares on one project, and settlement by the party itself when it holds the converted money."
add_fields("REFERRAL_ACCRUAL", [
    ["direction", "string", "", "payable (NPL pays the party) / receivable (the party holds the funds and owes NPL its remainder) " + TAG.format(26)],
    ["period", "string", "", "YYYY-MM; receivables reconcile monthly like rebates " + TAG.format(26)],
    ["received_amount", "decimal", "", "on receivables " + TAG.format(26)],
], "v5.3 (D26): + direction, period, received_amount; states accrued / reconciled / settled")
set_field_note("REFERRAL_ACCRUAL", "state", "accrued / reconciled / settled (v5.3, D26; was accrued / paid)")
rel("FEE_STRUCTURE", "REFERRAL_RULE", "refs", "fee_structure_id", "scoped to deals priced on this structure", "1 : 0..n")

# ------------------------------------------------------------------ D27 (H) rebates as their own stream
add_fields("PARTNER_REBATE_RULE", [
    ["basis", "string", "", "pct_of_partner_fee / pct_of_amount (Jeton: 0.4 % of amount on a 1 % or 1.25 % fee, 0.3 % for Novi’s 0.9 %) " + TAG.format(27)],
    ["pct", "decimal", "", "the rebate in the chosen basis; pct_of_partner_fee stays for rules expressed that way " + TAG.format(27)],
    ["fee_structure_id", "int", "FK", "optional scope " + TAG.format(27)],
    ["sender_id", "int", "FK", "optional scope (Novi) " + TAG.format(27)],
], "v5.3 (D27): + basis, pct, fee_structure_id, sender_id; income posts to EARN_REBATE, never EARN_GROSS")
E["PARTNER_REBATE_RULE"]["desc"] += " v5.3 (D27): the rebate is NPL’s alone — never shared with an introducer or client party, never inside the share base — and is reported as its own stream (EARN_REBATE). The partner’s statement covers only deals NPLify handled, so every accrual names its deal."
add_fields("PARTNER_REBATE_ACCRUAL", [
    ["statement_ref", "string", "", "the partner statement line it reconciled against " + TAG.format(27)],
], "v5.3 (D27): + statement_ref; deal_id stays required — the statement is reconciled only against NPLify deals")
rel("FEE_STRUCTURE", "PARTNER_REBATE_RULE", "refs", "fee_structure_id", "scoped rebate", "1 : 0..n")
rel("SENDER", "PARTNER_REBATE_RULE", "refs", "sender_id", "sender-specific rebate", "1 : 0..n")
set_field_note("LEDGER_ACCOUNT", "purpose", "COLLECTED / HELD / DUE / INTRANSIT / PAYABLE / SHORTFALL / CREDIT / POOL / WALLET / EARN_GROSS / EARN_REBATE / EXP_PARTNER / EXP_BANKFEE / EXP_NETWORK / EXP_ROUNDING / EXP_LOSS / VARIANCE / REFERRAL_PAYABLE / SHARE_RECEIVABLE / REBATE_RECEIVABLE")
E["LEDGER_ACCOUNT"].setdefault("ch", []).append("v5.3: + purposes EARN_REBATE (D27), EXP_ROUNDING (D25), SHARE_RECEIVABLE (D26), EXP_LOSS (D32)")
E["LEDGER_ACCOUNT"]["desc"] += " v5.3 adds EARN_REBATE (rebate income, its own stream — D27), EXP_ROUNDING (round-up cost — D25), SHARE_RECEIVABLE (NPL’s remainder owed by a party that holds the funds — D26) and EXP_LOSS (NPL’s share of a loss event — D32)."
set_field_note("LEDGER_POSTING", "cost_component", "principal / earnings / rebate / partner_cost / bank_fee / network_fee / variance / referral / share / rounding / fx_timing / cutoff_timing / loss (v5.3: + rebate, share, fx_timing, cutoff_timing, loss)")
E["LEDGER_POSTING"].setdefault("ch", []).append("v5.3: + cost components rebate (D27), share (D26), fx_timing (D24), cutoff_timing (D29), loss (D32)")
set_field_note("LEDGER_TRANSACTION", "source_type", "Collection / Conversion / BalanceConversion / Disbursement / DisbursementReturn / Confirmation / BankFeeEvent / Reroute / Referral / Rebate / LossEvent / Adjustment")
E["LEDGER_TRANSACTION"].setdefault("ch", []).append("v5.3 (D32): + source type LossEvent")

# ------------------------------------------------------------------ D28 (I) quoted direction; D30 (K) location
add_fields("PARTNER_RATE_VERSION", [
    ["quoted_rate", "decimal", "", "as the partner stated it (Ali: 1.1738 EUR→USDT style) " + TAG.format(28)],
    ["quoted_direction", "string", "", "out_per_in / in_per_out; rate = quoted_rate, or 1 ÷ quoted_rate at the pair’s precision when the directions differ — derived, never typed " + TAG.format(28)],
    ["location", "string", "", "nullable; required on cash pairs — INR cash in Delhi and in Mumbai are two versions on one day " + TAG.format(30)],
], "v5.3 (D28, D30): + quoted_rate, quoted_direction, location; uniqueness partner × pair × day × location")
set_field_note("PARTNER_RATE_VERSION", "rate", "normalised to CURRENCY_PAIR.quote_direction; derived from quoted_rate (v5.3, D28)")

# ------------------------------------------------------------------ D29 (J) cutoff, rate lock, next-day conversion
add_fields("PARTNER_PAIR", [
    ["needs_bank_lock", "bool", "", "conversion depends on the banking channel and the partner’s cutoff (Evo pairs into EUR; USDT → USD / SGD at Ali) " + TAG.format(29)],
], "v5.3 (D29): + needs_bank_lock")
add_fields("DEAL", [
    ["rate_locked_at", "datetime", "", "when the partner confirmed the rate; before the cutoff → converts the same day, after → next business day " + TAG.format(29)],
    ["conversion_due_date", "date", "", "derived from rate_locked_at and the partner’s cutoff; Converting may not start earlier " + TAG.format(29)],
    ["conversion_deferred_reason", "string", "", "set when the due date is pushed because the next day’s rate breaches the minimum margin (ask for a better rate, or wait a day) " + TAG.format(29)],
    ["cash_location", "string", "", "city of the cash hand-over; required on cash legs — rates and agents differ by city " + TAG.format(30)],
], "v5.3 (D29, D30): + rate_locked_at, conversion_due_date, conversion_deferred_reason, cash_location")
add_fields("BALANCE_CONVERSION", [
    ["rate_locked_at", "datetime", "", TAG.format(29)],
    ["conversion_due_date", "date", "", "banking-ready balances (USD, SGD) wait for the next business morning " + TAG.format(29)],
], "v5.3 (D29): + rate_locked_at, conversion_due_date")
E["CLIENT_BALANCE"]["desc"] += " v5.3 (D29): also reports a pending column — the expected_out of legs whose rate is locked with the partner but whose money has not yet been collected or converted; a void removes it. Pending is never a posting."
E["CLIENT_BALANCE"].setdefault("ch", []).append("v5.3 (D29): + pending converted value of rate-locked legs")

# ------------------------------------------------------------------ D30 (K) cash by token
add_fields("COLLECTION", [
    ["sending_address", "string", "", "crypto: the sender’s declared wallet " + TAG.format(31)],
    ["wallet_screening_id", "int", "FK", "nullable; the screening that admitted the sending wallet " + TAG.format(31)],
    ["screening_skipped", "bool", "", "projects that do not screen every sender up front (Evo) " + TAG.format(31)],
    ["token_ref", "string", "", "cash: serial of the token (local-currency bill) that identifies the agent " + TAG.format(30)],
    ["agent_contact_ref", "string", "", "cash: the receiving agent’s contact, external store " + TAG.format(30)],
    ["counted_at", "datetime", "", "cash: the partner counted and confirmed the funds " + TAG.format(30)],
], "v5.3 (D30, D31, D32): + sending_address, wallet_screening_id, screening_skipped, token_ref, agent_contact_ref, counted_at; state gains reversed")
set_field_note("COLLECTION", "state", "pending / verified / reversed (v5.3, D32); cash: token_issued → handed_over → counted → verified (D30)")
E["COLLECTION"]["desc"] = E["COLLECTION"].get("desc", "") + " v5.3: a cash part carries the token and the agent (D30); a crypto part carries the sending address and its screening (D31); a part can be reversed by a LOSS_EVENT (D32)."

# ------------------------------------------------------------------ D31 (L) wallet screening
new_table("WALLET_SCREENING", "config", 2,
    "A screening of one wallet address on one day — a sender’s declared sending wallet before a collection, or a receiver’s wallet before a settlement — with the result, the decision and who made it. Operations records it as part of transaction coordination; a reject may be overridden only by Finance. The decision picks the endpoint: accept_alternate lands only on an elevated-band endpoint. v5.3 (D31).",
    [["id", "int", "PK"], ["project_id", "int", "FK"], ["subject_kind", "string", "", "sender_wallet / receiver_wallet"], ["sender_id", "int", "FK", "when subject_kind = sender_wallet"], ["receiving_entity_account_id", "int", "FK", "when subject_kind = receiver_wallet"],
     ["network", "string"], ["address", "string"], ["provider_ref", "string", "", "screening tool reference"], ["result", "string", "", "standard / elevated / unacceptable"], ["decision", "string", "", "accept / accept_alternate / reject"],
     ["screened_by", "int", "FK", "Operations"], ["screened_at", "datetime"], ["evidence_ref", "string"]], 2)
add_fields("SETTLEMENT_REGISTRATION", [
    ["wallet_screening_id", "int", "FK", "nullable; the receiver-side screening of a wallet account " + TAG.format(31)],
], "v5.3 (D31): + wallet_screening_id")
rel("PROJECT", "WALLET_SCREENING", "owns", "project_id", "screenings", "1 : n")
rel("SENDER", "WALLET_SCREENING", "refs", "sender_id", "sending wallet screened", "1 : 0..n")
rel("RECEIVING_ENTITY_ACCOUNT", "WALLET_SCREENING", "refs", "receiving_entity_account_id", "receiver wallet screened", "1 : 0..n")
rel("WALLET_SCREENING", "COLLECTION", "refs", "wallet_screening_id", "admitted the sending wallet", "1 : 0..n")
rel("WALLET_SCREENING", "SETTLEMENT_REGISTRATION", "refs", "wallet_screening_id", "receiver wallet screened", "1 : 0..n")
rel("USER", "WALLET_SCREENING", "actor", "screened_by", "screened_by", "1 : n")

# ------------------------------------------------------------------ D32 (M) single-use accounts and loss events
add_fields("RECEIVING_ENTITY_ACCOUNT", [
    ["usage", "string", "", "standing / single_use — a local account the receiver gives for one payout " + TAG.format(32)],
    ["reserved_for_deal_id", "int", "FK", "nullable; the one deal a single_use account serves " + TAG.format(32)],
], "v5.3 (D32): + usage, reserved_for_deal_id")
new_table("LOSS_EVENT", "settle", 6,
    "Money lost after it was verified or released — a frozen receiving account, cash found short, a wrong-chain transfer — on either side, by any method, for a partial or full amount, with the loss split across sender, NPL, partner and client (the shares sum to the amount; Management approves the split). Posts one reversing LEDGER_TRANSACTION (source LossEvent): the client balance is reduced by the client’s and sender’s shares, NPL’s share goes to EXP_LOSS, the partner’s share to a receivable from the partner. A collection side event sets COLLECTION.state = reversed. v5.3 (D32).",
    [["id", "int", "PK"], ["side", "string", "", "collection / settlement"], ["collection_id", "int", "FK", "when side = collection"], ["disbursement_line_id", "int", "FK", "when side = settlement"],
     ["amount", "decimal", "", "≤ the verified or released amount"], ["reason", "string", "", "account_frozen / cash_short / wrong_chain / other"], ["occurred_at", "datetime"],
     ["sender_share", "decimal"], ["npl_share", "decimal"], ["partner_share", "decimal"], ["client_share", "decimal", "", "shares sum to amount"],
     ["state", "string", "", "open / approved / posted"], ["approved_by", "int", "FK", "Management"]], 6)
rel("DEAL", "COLLECTION_RECEIVING_ENDPOINT", "refs", "reserved_for_deal_id", "single-use endpoint reserved for", "1 : 0..n")
rel("DEAL", "RECEIVING_ENTITY_ACCOUNT", "refs", "reserved_for_deal_id", "single-use account reserved for", "1 : 0..n")
rel("COLLECTION", "LOSS_EVENT", "refs", "collection_id", "loss on a verified part", "1 : 0..n")
rel("DISBURSEMENT_LINE", "LOSS_EVENT", "refs", "disbursement_line_id", "loss on a released line", "1 : 0..n")
rel("LOSS_EVENT", "LEDGER_TRANSACTION", "poly", "source_type", "source = LossEvent", "1 : n")
rel("USER", "LOSS_EVENT", "actor", "approved_by", "approved_by", "1 : n")
E["SHORTFALL"]["desc"] += " v5.3 (D32): cash found short at hand-over is an ordinary short confirmation — topped up at the next settlement or by an explicit separate payout — and becomes a LOSS_EVENT only if it is not recoverable."
E["APPROVAL"]["desc"] += " v5.3 adds enable_own_desk (D23), approve_loss_split (D32) and override_screening_reject (D31)."
E["APPROVAL"]["v"] = "changed"; E["APPROVAL"].setdefault("ch", []).append("v5.3: + actions enable_own_desk, approve_loss_split, override_screening_reject")

# ------------------------------------------------------------------ invariants
d["INV"] += [
    [["FEE_OVERRIDE", "FEE_STRUCTURE", "DEAL"], "A FEE_OVERRIDE with its own split has both share columns set and they sum to its pct; with neither set the structure’s proportion applies. The leg stamps the override that priced it (v5.3, D20)."],
    [["FEE_TIER", "DEAL_FEE_TIER", "DEAL", "PROJECT_MONTH_VOLUME"], "The base tier stamped on a leg is the tier with the highest min_monthly_volume not exceeding the project’s calendar-month volume at quote (PROJECT_MONTH_VOLUME); a leg that takes the month past a threshold is split into two DEAL_FEE_TIER portions whose amounts sum to amount_in, and its fee parts are the blended sum (v5.3, D21)."],
    [["FEE_STRUCTURE", "DEAL_GROUP"], "Displayed figures are derived, never typed: displayed_source_rate = sender_rate ÷ (1 − displayed_fee_pct), stamped at quote; the true rates and fee parts are stored beside them and Operations sees the displayed pair only (v5.3, D22)."],
    [["INVOICE", "DISBURSEMENT_LINE", "DEAL_GROUP", "INVOICE_BALANCE"], "Σ obligation_discharged over an invoice’s confirmed lines never exceeds its amount; a line that names an invoice names a deal_id whose deal group is on that invoice (v5.3, D24)."],
    [["CURRENCY_PAIR", "CONVERSION", "LEDGER_POSTING"], "Rounding is the pair’s configured option; the residual is signed — a dropped fraction stays client money in the balance, an amount added by rounding up is NPL’s cost posted to EXP_ROUNDING — so every rounding difference has an owner (v5.3, D25)."],
    [["REFERRAL_RULE", "REFERRAL_ACCRUAL", "PARTNER_REBATE_ACCRUAL"], "Σ pct of the share_of_net_markup rules active on one leg ≤ 100 %; the share base is the leg’s fee parts less its partner cost and never includes a partner rebate. A party_retains accrual is a receivable from the party, reconciled monthly (v5.3, D26)."],
    [["PARTNER_REBATE_ACCRUAL", "LEDGER_ACCOUNT", "DEAL"], "Rebate income posts only to EARN_REBATE, never to EARN_GROSS, and every rebate accrual names the NPLify deal it arises on; the partner statement is reconciled against those deals alone (v5.3, D27)."],
    [["PARTNER_RATE_VERSION", "CURRENCY_PAIR"], "A partner rate version stores the rate as quoted and its direction; the normalised rate is derived (1 ÷ quoted when the directions differ, at the pair’s precision) and is subject to the breach check like any other, so a direction slip freezes the pair instead of pricing a deal (v5.3, D28)."],
    [["DEAL", "PARTNER_CONFIG", "PARTNER_PAIR", "CONVERSION"], "On a pair that needs a bank lock, a leg’s conversion_due_date is the lock date when rate_locked_at precedes the partner’s cutoff and the next business day otherwise; Converting may not start before it. The sender’s figures are write-once (invariant 5); the difference between the stamped partner rate and the rate actually used posts to VARIANCE with component cutoff_timing — NPL absorbs it (v5.3, D29)."],
    [["PARTNER_RATE_VERSION", "DEAL", "COLLECTION"], "A rate version is unique per partner × pair × day × location; a cash leg carries its cash_location and prices on a version of that location; a cash part is verified only after the partner’s count (counted_at) (v5.3, D30)."],
    [["WALLET_SCREENING", "COLLECTION", "COLLECTION_RECEIVING_ENDPOINT"], "A crypto collection names its sending address and, unless the project skips up-front screening, the screening that admitted it; a screening decided accept_alternate may land only on an endpoint whose risk_band is elevated, and no collection exists for a decision of reject unless Finance overrides it (v5.3, D31)."],
    [["COLLECTION_RECEIVING_ENDPOINT", "RECEIVING_ENTITY_ACCOUNT", "LOSS_EVENT", "COLLECTION"], "A single_use endpoint or account is referenced by at most one collection or payout line, for the deal it was reserved for, and retires when that reference is verified or confirmed. A LOSS_EVENT’s shares sum to its amount, which never exceeds the amount verified or released; a collection-side event moves the part to reversed and the client balance never goes below zero (v5.3, D32)."],
    [["CURRENCY_PAIR", "CONVERSION", "DEAL"], "A pair whose two currencies are the same is converted at rate 1 like any other pair, so the sender and receiver fee parts are captured at conversion and the balance arithmetic is unchanged (v5.3, D33)."],
]

# ------------------------------------------------------------------ notes, vocabulary, open questions, record
d["NOTES"]["Configuration"] += [
    "v5.3 adds the configuration behind NPL’s fee practice: FEE_TIER volume tiers per calendar month (D21), FEE_OVERRIDE with its own split (D20), displayed-fee settings on FEE_STRUCTURE (D22), REFERRAL_RULE as a share of the net markup settled by the party (D26), PARTNER_REBATE_RULE with a basis and a scope (D27), an own-desk PARTNER_CONFIG for NPL-GR whose endpoints are NPL’s own wallets (D23), the partner’s bank cutoff (D29), a rounding menu per pair (D25), single-use endpoints and accounts (D32) and WALLET_SCREENING (D31).",
]
d["NOTES"]["Rates"] += [
    "v5.3: a partner rate version stores the rate as quoted and its direction, and the normalised rate is derived (D28); cash pairs are priced per location (D30).",
]
d["NOTES"]["Deal lifecycle"] += [
    "v5.3: a leg stamps the override and tier that priced it, split across two tiers when it crosses a threshold (D20, D21); a deal group may pay an INVOICE and each payout line records how much of it was discharged and at what snapshot (D24); a leg records when the rate was locked and when the conversion is due (D29); a cash part carries its token, agent and city (D30); a crypto part its sending address and screening (D31); a LOSS_EVENT reverses a part or a line, in full or in part, with the loss split across parties (D32).",
]
d["NOTES"]["Ledger & controls"] += [
    "v5.3 account purposes: EARN_REBATE keeps rebate income apart from EARN_GROSS (D27); SHARE_RECEIVABLE holds NPL’s remainder owed by a party that keeps the converted funds (D26); EXP_ROUNDING takes the cost of rounding up (D25); EXP_LOSS takes NPL’s share of a loss event (D32). New transaction source LossEvent; new cost components rebate, share, fx_timing, cutoff_timing, loss. Own-desk deals (NPL-GR) use the ordinary partner-coded accounts with the own-desk configuration as holder, EXP_PARTNER zero by construction, and appear in the custody view (D23).",
]
d["FRS_VOCAB"] += [
    ["Commission / rebate (Jeton 0.4 %, Aquanow 0.3 %)", "PARTNER_REBATE_RULE (basis pct_of_amount or pct_of_partner_fee, scoped by sender or fee structure) + PARTNER_REBATE_ACCRUAL; income in EARN_REBATE (D27)"],
    ["Markup shared with a customer (Raeen sub-accounts, downlines)", "REFERRAL_RULE basis share_of_net_markup, party_kind client_party, settlement_mode party_retains; SHARE_RECEIVABLE (D26)"],
    ["Fee by monthly volume (GDC)", "FEE_TIER under FEE_STRUCTURE; DEAL_FEE_TIER portions; PROJECT_MONTH_VOLUME (D21)"],
    ["Game reseller / NPL-GR", "PROJECT with an own-desk PARTNER_CONFIG; OWN_WALLET as COLLECTION_RECEIVING_ENDPOINT; INVOICE paid in parts (D23, D24)"],
    ["Customer-facing calculation (‘market rate’, ‘fee 1 %’)", "FEE_STRUCTURE.displayed_fee_basis / pct; DEAL_GROUP.displayed_source_rate (D22)"],
    ["Token (cash collection / settlement)", "COLLECTION.token_ref, agent_contact_ref, counted_at; DISBURSEMENT_LINE.token_ref; DEAL.cash_location; PARTNER_RATE_VERSION.location (D30)"],
    ["Bank cutoff (2.30 pm GMT+8)", "PARTNER_CONFIG.bank_cutoff_time; PARTNER_PAIR.needs_bank_lock; DEAL.rate_locked_at, conversion_due_date (D29)"],
    ["Wallet screening", "WALLET_SCREENING; COLLECTION.sending_address; COLLECTION_RECEIVING_ENDPOINT.risk_band (D31)"],
    ["Reversal of collection; cash short", "LOSS_EVENT with its split; SHORTFALL for recoverable cash shortages (D32)"],
]
d["OPENQ"].append({
    "q": "Review point (v5.3): can the model express NPL’s fee practice as described in the fee table, NPL’s workbook answers and the Project Context / Payment methods tabs (gaps A–M)?",
    "blocks": "Fees, rebates, shared markup, own desk, invoices, rounding, rates, cutoff, cash, screening, losses",
    "status": "answered",
    "a": "NPL (8–9 Oct): all thirteen confirmed with parameters — receiver part fixed (A); calendar-month tiers, a crossing deal split across tiers (B); displayed 1 % is a BF-only rule (C); run NPL-GR inside NPLify as an own desk (D); invoice tracking wanted (E); rounding menu, round up to 1,000 for Asian currencies (F); markup shared = fee − partner fee, several parties, party holds the funds, rebate NPL’s alone (G); rebates reported apart, statement covers NPLify deals only (H); Ali quotes inverted (I); NPL absorbs the next-day rate difference, pending converted value shown from the lock (J); cash by token, rates by city (K); screening is an Operations action (L); losses partial and shared, both sides, any method (M); same-currency pass-through stays in scope.",
    "impl": "v5.3, D20–D33: FEE_TIER, DEAL_FEE_TIER, INVOICE, WALLET_SCREENING, LOSS_EVENT; views INVOICE_BALANCE, PROJECT_MONTH_VOLUME; invariants 20–32 and invariant 3 restated; purposes EARN_REBATE, SHARE_RECEIVABLE, EXP_ROUNDING, EXP_LOSS.",
    "ents": ["FEE_TIER", "DEAL_FEE_TIER", "INVOICE", "WALLET_SCREENING", "LOSS_EVENT", "FEE_OVERRIDE", "FEE_STRUCTURE", "REFERRAL_RULE", "PARTNER_REBATE_RULE", "PARTNER_CONFIG", "PARTNER_RATE_VERSION", "DEAL", "COLLECTION", "DISBURSEMENT_LINE", "CURRENCY_PAIR"],
})
d["DECISIONS"] += (
    "\nV5.3 UPDATE (9 October 2026): the thirteen fee-practice gaps (A–M of ‘Model Gaps & Proposals v1.0’) and the same-currency pass-through, confirmed by NPL on 8–9 October, applied as D20–D33; 59 tables + 6 views."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D20 (A): FEE_OVERRIDE carries its own sender / receiver split; DEAL stamps fee_override_id. Why: Evo’s selected senders pay 1.0 % while Evo still pays 0.6 %; a proportional override priced both sides wrong."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D21 (B): FEE_TIER under FEE_STRUCTURE, chosen from the project’s calendar-month volume (PROJECT_MONTH_VOLUME); a leg that crosses a threshold is split across two tiers (DEAL_FEE_TIER) and its fee is the blended sum. Why: GDC’s 2.5 % → 2.25 % above USD 500,000 a month, switched by hand today."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D22 (C): FEE_STRUCTURE.displayed_fee_basis / pct; DEAL_GROUP stamps displayed_fee_pct and displayed_source_rate = sender_rate ÷ (1 − displayed). Why: BF quotes via Ali show ‘fee 1 %’ while the recorded parts add to 1.4 %; the ‘market rate’ was recomputed by hand. BF-only rule; cleared when NPL moves to partner rate + markup."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D23 (D): PARTNER_CONFIG.is_own_desk; an own wallet is a COLLECTION_RECEIVING_ENDPOINT under it; invariant 3 restated to allow own-desk custody, reported by the custody view. NPL’s framing: NPL-GR, a business unit of NPL, is the client of the game-reseller project; Management confirmed running it inside NPLify. Rejected: keeping the no-custody principle intact and running the reseller flows outside the system."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D24 (E): INVOICE owned by the project, naming the vendor; DEAL_GROUP.invoice_id; DISBURSEMENT_LINE carries obligation_discharged, discharge_rate and the market snapshot; INVOICE_BALANCE view. Why: a vendor’s EUR invoice paid in USDT in parts over days needs an open-balance figure that the currency-of-movement model could not give."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D25 (F): CURRENCY_PAIR.amount_rounding becomes a menu (truncate / nearest / round up, to the unit or to rounding_unit); CONVERSION.rounding_residual signed; EXP_ROUNDING for the cost of rounding up. NPL’s convention: round up to the nearest 1,000 for Asian currencies, nearest unit for USD, SGD, HKD; USDT paid by reseller customers rounded up."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D26 (G): REFERRAL_RULE basis share_of_net_markup (base = fee parts − partner cost, rebates excluded), scoped by fee structure, several parties per project (Σ ≤ 100 %), settlement_mode party_retains with SHARE_RECEIVABLE; REFERRAL_ACCRUAL gains direction, period, received_amount. NPL’s rule: Raeen’s share is half of (4 % − partner fee) — 1.5 % via Ali, 1.6 % via Aquanow; downlines 0.2 % split 75 / 25; Raeen holds the converted EUR and pays NPL monthly; future deals may have several parties with different shares."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D27 (H): rebate income in EARN_REBATE, never EARN_GROSS; PARTNER_REBATE_RULE gains basis (pct_of_amount / pct_of_partner_fee) and a scope by sender or fee structure; PARTNER_REBATE_ACCRUAL keeps deal_id required and gains statement_ref. NPL: the rebate is NPL’s alone and never visible to a sharing party; the partner statement is reconciled only against NPLify deals (customers who work with Jeton or Aquanow directly are out of scope). Novi: 0.9 % fee, 0.3 % rebate."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D28 (I): PARTNER_RATE_VERSION stores quoted_rate and quoted_direction; rate is derived and breach-checked. Why: Ali sometimes quotes 1.1738 (EUR→USDT style) for 0.851934; a direction slip must freeze the pair, not price a deal."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D29 (J): PARTNER_CONFIG.bank_cutoff_time / cutoff_timezone; PARTNER_PAIR.needs_bank_lock; DEAL and BALANCE_CONVERSION carry rate_locked_at and conversion_due_date; a deferral reason when the next day’s rate breaches the margin; CLIENT_BALANCE shows a pending converted value from the lock, removed on void. NPL: locked before 14:30 GMT+8 converts the same day, after it the next business day; NPL absorbs the rate difference (VARIANCE, cutoff_timing); if Ali’s next-day rate is unacceptable, ask for a better one or wait a day."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D30 (K): DEAL.cash_location; PARTNER_RATE_VERSION.location with uniqueness per location; COLLECTION.token_ref, agent_contact_ref, counted_at; DISBURSEMENT_LINE.token_ref. NPL’s process: a cash collection or settlement is arranged by token (a local-currency bill whose serial identifies the agent), closed by a photo and the partner’s count; rates differ by city."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D31 (L): WALLET_SCREENING per address and day, for sending and receiving wallets; COLLECTION.sending_address, wallet_screening_id, screening_skipped; COLLECTION_RECEIVING_ENDPOINT.risk_band; SETTLEMENT_REGISTRATION.wallet_screening_id. NPL: screening is an Operations action (transaction coordination); Finance only overrides a reject. Evo senders may skip up-front screening."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D32 (M): COLLECTION_RECEIVING_ENDPOINT and RECEIVING_ENTITY_ACCOUNT gain usage single_use with a reserved deal; LOSS_EVENT on either side, any method, partial or full, with the loss split across sender, NPL, partner and client (shares sum to the amount; Management approves); source LossEvent; EXP_LOSS; COLLECTION.state reversed. Cash found short at hand-over is a short confirmation topped up at the next settlement or by a separate payout. NPL: losses can be partial and shared, on collections and settlements alike."
    "\nAGREED 9 OCTOBER 2026, IN v5.3 — D33: same-currency pass-through (Evolution bank transfers) stays in scope: a pair may have the same currency on both sides and converts at rate 1 so the fee is captured at conversion. NPL: the fee is still applied because the currency is collected and then settled separately."
)
d["DOC_META"] = "NPLify · P0 Technical Baseline. Deliverable 1 — Entity-Relationship Diagram & Data Model, Draft v5.3. New XP Technologies Limited, 9 October 2026, Confidential — internal baseline document; client deliverables are derived from it. Supersedes v5.2, v5.1, v5.0, v4.0 and v3.0 in full."
d["CONVENTIONS"] = [c for c in d["CONVENTIONS"] if not c.startswith("Derived figures")] + ["Derived figures (client balance, entitlement, offsets, custody, invoice balance, month volume) are views over postings and deals — never stored."]
d["version"] = "5.3"
d["generatedAt"] = "2026-10-09"

# sanity
names = set(E)
for r in R:
    assert r[0] in names and r[1] in names, r
for n, e in E.items():
    if e["d"] != "view":
        for f in e["f"]:
            assert len(f) >= 2, (n, f)
tables = [n for n in E if E[n]["d"] != "view"]; views = [n for n in E if E[n]["d"] == "view"]
print("tables", len(tables), "views", len(views), "relations", len(R), "invariants", len(d["INV"]))
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("wrote", P)
