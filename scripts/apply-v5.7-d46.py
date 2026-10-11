#!/usr/bin/env python3
"""11 October 2026 — D46, the ledger-design decisions of 10–11 October applied to the model: variance by kind,
loss booked to NPL first and recovered share by share, accruals at conversion, the NPL-GR reseller books (two
invoices in EUR, remittance as an ordinary client deal), earnings kept in the unconverted balance and offset
between partners, the promise discharged on release, exact rounding on bank transfers, fee parts on the
principal, and NPL's profit as remittance plus reseller earnings. Idempotent.   python3 scripts/apply-v5.7-d46.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text()); E, R = d["E"], d["R"]
assert "EARNINGS_OFFSET" not in E, "already applied"

def set_note(name, field, note):
    for f in E[name]["f"]:
        if f[0] == field:
            while len(f) < 4: f.append("")
            f[3] = note; return
    raise KeyError((name, field))
def ch(name, text):
    E[name].setdefault("ch", []).append(text); E[name]["v"] = E[name].get("v") or "changed"
def new(name, dom, col, desc, fields, tag):
    E[name] = {"d": dom, "col": col, "desc": desc, "f": fields, "v": "new", "ch": [tag]}

# ------------------------------------------------------------------ 1. variance by kind; ledger vocabulary
set_note("LEDGER_ACCOUNT", "purpose", "COLLECTED / HELD / DUE / PAYABLE / SHORTFALL / CREDIT / MAKEGOOD / POOL / WALLET / EARN_GROSS / EARN_REBATE / RESELL_REVENUE / RESELL_COST / EXP_PARTNER / EXP_BANKFEE / EXP_NETWORK / EXP_ROUNDING / EXP_LOSS / VAR_CONVERSION / VAR_CUTOFF / VAR_RATE_HONOUR / VAR_FX_TIMING / SHARE_PAYABLE / SHARE_RECEIVABLE / REBATE_RECEIVABLE / LOSS_RECEIVABLE / LOSS_PAYABLE / VENDOR_PAYABLE / RESALE_RECEIVABLE / REMIT_CLAIM / FX_CLEARING (v5.7, D46: VARIANCE split into four; INTRANSIT retired — sent money is a line state)")
set_note("LEDGER_ACCOUNT", "holder_type", "PartnerConfig (incl. the own desk) / OwnWallet / Receiver (also the vendor of VENDOR_PAYABLE) / Sender (also LOSS_RECEIVABLE, RESALE_RECEIVABLE) / MarkupShareParty / Project / None (v5.7, D46)")
E["LEDGER_ACCOUNT"]["desc"] += " v5.7 (D46): VARIANCE becomes VAR_CONVERSION, VAR_CUTOFF, VAR_RATE_HONOUR and VAR_FX_TIMING, one per cause; LOSS_RECEIVABLE and the MAKEGOOD / LOSS_PAYABLE pair for a loss booked to NPL first; RESELL_REVENUE, RESELL_COST, VENDOR_PAYABLE, RESALE_RECEIVABLE and REMIT_CLAIM for NPL-GR’s reseller books in the invoice currency; FX_CLEARING for NPL’s own currency swaps (an earnings offset, a company balance settled in another currency); INTRANSIT retired — once money has left the partner it is out of NPL’s hands, so the promise is discharged on release and re-raised only by a return or a short delivery. A pool may be below zero only between a fee NPL absorbed in a currency where it held nothing and the next conversion, which then includes NPL’s own USDT."
ch("LEDGER_ACCOUNT", "v5.7 (D46): purposes VAR_CONVERSION / VAR_CUTOFF / VAR_RATE_HONOUR / VAR_FX_TIMING (was VARIANCE), LOSS_RECEIVABLE, MAKEGOOD, LOSS_PAYABLE, RESELL_REVENUE, RESELL_COST, VENDOR_PAYABLE, RESALE_RECEIVABLE, REMIT_CLAIM, FX_CLEARING; INTRANSIT retired")
set_note("LEDGER_TRANSACTION", "source_type", "Collection / Conversion / BalanceConversion / Settlement / SettlementReturn / Confirmation / BankFeeEvent / Reroute / MarkupShare / Rebate / LossEvent / LossRecovery / Invoice / EarningsOffset / Adjustment (v5.7, D46: + LossRecovery, Invoice, EarningsOffset)")
E["LEDGER_TRANSACTION"]["desc"] += " v5.7 (D46) adds LossRecovery (each recovered share of a loss), Invoice (NPL-GR’s vendor and resale invoices) and EarningsOffset (NPL’s margin swapped between partners)."
ch("LEDGER_TRANSACTION", "v5.7 (D46): sources + LossRecovery, Invoice, EarningsOffset")
set_note("LEDGER_POSTING", "cost_component", "principal / earnings / rebate / partner_cost / bank_fee / network_fee / variance / share / rounding / fx_timing / cutoff_timing / loss / resale (v5.7, D46: + resale for NPL-GR’s reseller books; network fees are stated in USDT and absent when none applies)")
E["LEDGER_POSTING"]["desc"] = "A debit or credit line; postings in one transaction sum to zero per currency and per owner. Ownership moves between client and company at margin recognition (conversion), at an earnings offset (both directions at one rate), at the forex true-up of a line that discharges an invoice obligation, and by partial reversal of a loss make-good when the client bears a share (invariant 16, v5.7). Cost components gain share (D37), rounding, and resale (D46)."
ch("LEDGER_POSTING", "v5.7 (D46): + resale; balanced per owner as well as per currency; the ownership events of invariant 16")

# ------------------------------------------------------------------ 2. loss first, recover later
new("LOSS_RECOVERY", "settle", 6,
    "One recovered share of a LOSS_EVENT. The whole loss is booked to NPL first (EXP_LOSS) and the client made whole in the same transaction; then each share the partner, the sender or the client agrees to bear is its own recovery posting (source LossRecovery): a receivable from the partner or sender, cleared when received, or a partial reversal of the make-good for the client’s share. The shares across a loss event sum to its amount (invariant 31). v5.7 (D46).",
    [["id", "int", "PK"], ["loss_event_id", "int", "FK"], ["party", "string", "", "sender / partner / client"], ["amount", "decimal", "", "≤ the matching share on the LOSS_EVENT"],
     ["state", "string", "", "agreed / received — a client share is received at once (it is a reversal of the make-good, never a payment)"], ["received_at", "datetime"], ["reference", "string", "", "the partner’s credit, the sender’s transfer, the client’s agreement"], ["approved_by", "int", "FK", "Management (approve_loss_split)"]],
    "new in v5.7 (D46)")
d["ORDER"]["6"].append("LOSS_RECOVERY")
E["LOSS_EVENT"]["desc"] += " v5.7 (D46): booked to NPL in full at approval — EXP_LOSS, funded from NPL’s pool at the partner or its own wallet (MAKEGOOD / LOSS_PAYABLE when it cannot be funded at once) — with the client made whole and the deal continuing; a partial loss posts the lost part only; each share is then a LOSS_RECOVERY. A settlement-side loss re-raises the promise and restores the balance from NPL’s pool."
ch("LOSS_EVENT", "v5.7 (D46): loss booked to NPL first; owns LOSS_RECOVERY")
set_note("COLLECTION", "state", "pending / verified / reversed (v5.3, D32); cash: token_issued → handed_over → counted → verified (D30). v5.7 (D46): after a loss the part stays verified — NPL’s funds stand in — and is reversed only when Management unwinds the deal")
R += [["LOSS_EVENT", "LOSS_RECOVERY", "owns", "loss_event_id", "recovered share by share", "1 : 0..4", "new"],
      ["USER", "LOSS_RECOVERY", "actor", "approved_by", "approved_by", "1 : n", "new"],
      ["LOSS_RECOVERY", "LEDGER_TRANSACTION", "poly", "source_type", "source = LossRecovery", "1 : n", "new"]]

# ------------------------------------------------------------------ 3. accruals at conversion; rebate payout currency
E["PARTNER_REBATE_RULE"]["f"].append(["payout_currency", "string", "", "the currency the partner pays the rebate in and the accrual is expressed in: the amount currency for pct_of_amount, the conversion’s own rate for pct_of_partner_fee (v5.7, D46)"])
ch("PARTNER_REBATE_RULE", "v5.7 (D46): + payout_currency")
E["MARKUP_SHARE_ACCRUAL"]["desc"] += " v5.7 (D46): created and posted by the conversion it arises on, in the same moment as the margin; the monthly statement settles it and a difference is a true-up, never a rewrite."
ch("MARKUP_SHARE_ACCRUAL", "v5.7 (D46): accrued at conversion")
E["PARTNER_REBATE_ACCRUAL"]["desc"] += " v5.7 (D46): created and posted by the conversion it arises on (REBATE_RECEIVABLE / EARN_REBATE), in the rule’s payout currency; the statement receipt clears it and a difference trues up EARN_REBATE."
ch("PARTNER_REBATE_ACCRUAL", "v5.7 (D46): accrued at conversion, in the rule’s payout currency")

# ------------------------------------------------------------------ 4. reseller project: two invoices, one remittance deal
E["INVOICE"]["f"].insert(2, ["kind", "string", "", "vendor (the vendor’s invoice to NPL-GR at the preferential price) / resale (NPL-GR’s invoice to its customer at retail price) (v5.7, D46)"])
E["INVOICE"]["f"].insert(4, ["sender_id", "int", "FK", "the customer invoiced, on a resale invoice (v5.7, D46)"])
set_note("INVOICE", "receiver_id", "the vendor owed, on a vendor invoice")
E["INVOICE"]["desc"] = "An obligation in its own currency, independent of how it is paid. In NPL-GR there are two per deal: the vendor’s invoice to NPL-GR (kind vendor, at the preferential price) and NPL-GR’s resale invoice to its customer (kind resale, at retail price), both in the vendor’s currency; the difference is the game reseller revenue, fixed when the two are posted and never touched afterwards (RESELLER_MARGIN). The customer pays the resale invoice through the remittance service, with NPL’s remittance markup on top, which pays for the service, covers the partner’s cost and absorbs the forex result of paying the vendor in instalments; what is left is remittance earnings (REMITTANCE_MARGIN). INVOICE_BALANCE = amount − Σ obligation_discharged over confirmed lines. Owned by the project. v5.3 (D24), v5.7 (D46)."
ch("INVOICE", "v5.7 (D46): + kind vendor / resale, + sender_id; the reseller books are two postings per deal in the invoice currency (source Invoice)")
set_note("DEAL_GROUP", "invoice_id", "nullable; the resale invoice this group collects (NPL-GR) — the obligation the deal pays (v5.3 D24, v5.7 D46)")
set_note("SETTLEMENT_LINE", "invoice_id", "nullable; the invoice this line discharges — the vendor invoice for a vendor line, the resale invoice for the margin line to NPL-GR’s own wallet (v5.3 D24, v5.7 D46)")
set_note("SETTLEMENT_LINE", "obligation_discharged", "in the invoice currency; the USDT reserved for it at the pricing rate versus the USDT paid at discharge_rate is the forex true-up posted to VAR_FX_TIMING against NPL’s pool (D24, D46)")
ch("SETTLEMENT_LINE", "v5.7 (D46): invoice_id names a vendor or a resale invoice; the forex true-up of D24 is posted per line; release discharges the promise")
E["PARTNER_CONFIG"]["desc"] += " v5.7 (D46): in NPL-GR the own desk holds NPL-GR’s remittance balances as ordinary partner-coded client accounts (D23 stands); the reseller books are separate EUR postings."
R += [["SENDER", "INVOICE", "refs", "sender_id", "customer invoiced (resale)", "1 : 0..n", "new"],
      ["INVOICE", "LEDGER_TRANSACTION", "poly", "source_type", "source = Invoice (reseller books)", "1 : n", "new"]]
E["RESELLER_MARGIN"] = {"d": "view", "col": 8, "v": "new", "ch": ["new in v5.7 (D46)"], "desc": "RESELLER_MARGIN(resale invoice) = RESALE_INVOICE.amount − VENDOR_INVOICE.amount, in the invoice currency, equal to RESELL_REVENUE − RESELL_COST posted for the pair: NPL-GR’s game reseller revenue, fixed when the two invoices are posted and untouched by anything the remittance side does (v5.7, D46).", "f": [["resale_invoice", "", ""]]}
E["REMITTANCE_MARGIN"] = {"d": "view", "col": 8, "v": "new", "ch": ["new in v5.7 (D46)"], "desc": "REMITTANCE_MARGIN(deal) = EARN_GROSS (net of markup shares) − EXP_PARTNER ± VAR_FX_TIMING − EXP_BANKFEE − EXP_NETWORK − EXP_ROUNDING on the deal’s postings, in the converted currency: NPL’s remittance earnings on one deal, including the forex result of instalments paid at different days’ rates (v5.7, D46).", "f": [["deal", "", ""]]}
E["NPL_PROFIT"] = {"d": "view", "col": 8, "v": "new", "ch": ["new in v5.7 (D46)"], "desc": "NPL_PROFIT(scope, period, currency) = remittance earnings (EARN_GROSS + EARN_REBATE − EXP_PARTNER − EXP_BANKFEE − EXP_NETWORK − EXP_ROUNDING − EXP_LOSS ± VAR_CONVERSION ± VAR_CUTOFF ± VAR_RATE_HONOUR ± VAR_FX_TIMING) + reseller earnings (RESELL_REVENUE − RESELL_COST), each callable on its own and together, by project, partner, pair or month, per currency; one figure across currencies is a REPORTING_VALUE (v5.7, D46).", "f": [["scope", "", ""], ["period", "", ""], ["currency", "", ""]]}
d["ORDER"]["8"] += ["RESELLER_MARGIN", "REMITTANCE_MARGIN", "NPL_PROFIT"]
R += [["INVOICE", "RESELLER_MARGIN", "view", "", "resale − vendor amount", "Σ", "new"],
      ["LEDGER_POSTING", "REMITTANCE_MARGIN", "view", "", "earnings, partner cost, fees, forex on the deal", "Σ", "new"],
      ["DEAL", "REMITTANCE_MARGIN", "view", "", "per deal", "Σ", "new"],
      ["LEDGER_POSTING", "NPL_PROFIT", "view", "", "remittance + reseller earnings", "Σ", "new"],
      ["NPL_PROFIT", "REPORTING_VALUE", "view", "", "one figure across currencies", "Σ", "new"]]

# ------------------------------------------------------------------ 5. earnings retention and offset between partners
set_note("CONVERSION", "residual_in", "the margin kept unconverted in the collection currency (NPL’s practice: earnings are taken out of money not yet converted); EARN_GROSS is then recognised in that currency and rests in NPL’s pool at the partner in that currency (v5.7, D46)")
E["CONVERSION"]["desc"] += " v5.7 (D46): residual_in is the margin kept in the collection currency; the partner converts amount_in − residual_in − any EARNINGS_OFFSET taken from this balance."
ch("CONVERSION", "v5.7 (D46): residual_in = earnings retained in the collection currency")
new("EARNINGS_OFFSET", "deal", 5,
    "NPL’s margin resting converted at one partner swapped for the same value of the client’s unconverted money at another, at the partner’s rate of the day: Jeton converted a collection in full, so NPL’s EUR margin sits at Jeton; Ali holds USDT that converts tomorrow; NPL leaves the USDT equivalent of its Jeton margin (and of its margin on the Ali deal) unconverted at Ali and converts only the rest. At Jeton NPL’s pool becomes the client’s balance; at Ali the same value of the client’s COLLECTED becomes NPL’s pool; the client’s promise is re-denominated by the same amounts, so its entitlement never changes. For NPL it is a currency swap recorded in FX_CLEARING. Nothing moves physically; neither partner sees anything. Recovers the EARNINGS_RECEIVABLE rows at the from-partner. Finance requests, Management approves (earnings_offset). v5.7 (D46).",
    [["id", "int", "PK"], ["project_id", "int", "FK"], ["from_partner_config_id", "int", "FK", "where NPL’s converted margin rests"], ["from_currency", "string"], ["from_amount", "decimal", "", "NPL’s margin handed to the client there"],
     ["to_partner_config_id", "int", "FK", "where the client’s unconverted money is"], ["to_currency", "string"], ["to_amount", "decimal", "", "= from_amount ÷ the rate used, taken from the client’s unconverted balance"],
     ["partner_rate_version_id", "int", "FK", "the to-partner’s rate of the day (NPL, 11 Oct: the partner’s rate, not market)"], ["market_rate_id", "int", "FK", "the market snapshot of the day, for reference"],
     ["requested_by", "int", "FK", "Finance"], ["approved_by", "int", "FK", "Management"], ["state", "string", "", "requested / approved / posted"], ["posted_at", "datetime"]],
    "new in v5.7 (D46)")
d["ORDER"]["5"].append("EARNINGS_OFFSET")
E["EARNINGS_RECEIVABLE"]["f"].insert(6, ["recovered_by_offset_id", "int", "FK", "nullable; the EARNINGS_OFFSET that moved this margin to another partner’s unconverted balance (v5.7, D46)"])
E["EARNINGS_RECEIVABLE"]["desc"] += " v5.7 (D46): also recovered by an EARNINGS_OFFSET, the everyday counterpart of the netting on a reroute."
ch("EARNINGS_RECEIVABLE", "v5.7 (D46): + recovered_by_offset_id")
R += [["PROJECT", "EARNINGS_OFFSET", "owns", "project_id", "earnings offsets", "1 : n", "new"],
      ["PARTNER_CONFIG", "EARNINGS_OFFSET", "refs", "from_partner_config_id", "margin given up here", "1 : n", "new"],
      ["PARTNER_CONFIG", "EARNINGS_OFFSET", "refs", "to_partner_config_id", "USDT taken here", "1 : n", "new"],
      ["PARTNER_RATE_VERSION", "EARNINGS_OFFSET", "refs", "partner_rate_version_id", "rate used", "1 : n", "new"],
      ["MARKET_RATE", "EARNINGS_OFFSET", "refs", "market_rate_id", "reference snapshot", "1 : n", "new"],
      ["EARNINGS_OFFSET", "EARNINGS_RECEIVABLE", "refs", "recovered_by_offset_id", "recovers", "1 : 0..n", "new"],
      ["USER", "EARNINGS_OFFSET", "actor", "requested_by", "requested_by", "1 : n", "new"],
      ["USER", "EARNINGS_OFFSET", "actor", "approved_by", "approved_by", "1 : n", "new"],
      ["EARNINGS_OFFSET", "LEDGER_TRANSACTION", "poly", "source_type", "source = EarningsOffset", "1 : n", "new"]]
set_note("ROLE_RIGHT", "action", "a controlled action: price_quote, extend_quote_validity, cross_group_payout, cover_bank_fee, enable_own_desk, approve_loss_split, override_screening_reject, earnings_offset (v5.7, D46), …")
E["APPROVAL"]["desc"] += " v5.7 (D46) adds earnings_offset — Finance requests, Management approves."
ch("APPROVAL", "v5.7 (D46): + action earnings_offset")

# ------------------------------------------------------------------ 6. payout mechanics, rounding, fee parts, network fees
set_note("CURRENCY_PAIR", "amount_rounding", "exact / truncate_unit / nearest_unit / round_up_unit / nearest_n / round_up_n (v5.3, D25; v5.7, D46: exact is the default for bank transfers — cents go out; the unit options apply where the pair says so, in practice to cash hand-overs)")
ch("CURRENCY_PAIR", "v5.7 (D46): amount_rounding + exact")
E["SETTLEMENT"]["desc"] += " v5.7 (D46): release discharges the promise — once the money has left the partner it is out of NPL’s hands, so CL.PROJECT.<CCY>.PAYABLE is debited at released_at; a return or a short confirmation re-raises it. What is sent and not yet confirmed is read from SETTLEMENT_LINE.outcome, never from a ledger account (INTRANSIT retired)."
ch("SETTLEMENT", "v5.7 (D46): release discharges the promise")
E["CONFIRMATION"]["desc"] = "The receiver’s confirmation of a line: full or short. v5.7 (D46): a full confirmation posts nothing (the promise was discharged on release); a short one re-raises the promise for the missing part and opens a SHORTFALL; every released line ends confirmed, short or returned."
ch("CONFIRMATION", "v5.7 (D46): posts only when short")
E["FEE_STRUCTURE"]["desc"] += " v5.7 (D46): the sender and receiver parts are each a percentage of the principal at the basis rate, never compounded — fee_sender_part = amount_in × rate × sender_pays_pct, fee_receiver_part = amount_in × rate × receiver_pays_pct, client_net = amount_in × rate × (1 − sender_pays_pct − receiver_pays_pct); the partner’s cost then comes out of NPL’s parts (fee_in_rate) or is booked separately (fee_on_market). Evo USDT → EUR: sender pays 1 % or 1.4 % by sender type, receiver always 0.6 %; EUR → EUR 2.8 % split 1.4 / 1.4."
ch("FEE_STRUCTURE", "v5.7 (D46): fee parts on the principal at the basis rate, not compounded")
set_note("PROJECT", "network_fee_policy", "absorbed / charged_back (project default; per-transaction override via FEE_DECISION). A network fee may or may not apply; when it does it is stated in USDT, when it does not it is zero and nothing posts (v5.7, D46)")

# ------------------------------------------------------------------ invariants
INV = d["INV"]
INV[15] = [["LEDGER_POSTING", "CONVERSION", "EARNINGS_OFFSET", "SETTLEMENT_LINE", "LOSS_RECOVERY"], "Ownership moves between client and company at four events only: margin recognition at conversion (client → company); an EARNINGS_OFFSET (company → client at one partner and client → company at another, the same value at the partner’s rate of the day); the forex true-up of a line that discharges an invoice obligation (either way); and the partial reversal of a loss make-good when a Management-approved share is borne by the client. NPL never advances money to a receiver (Q13). Every transaction balances per owner as well as per currency (restated v5.7, D46)."]
INV[24] = [["MARKUP_SHARE_RULE", "MARKUP_SHARE_ACCRUAL", "PARTNER_REBATE_ACCRUAL", "CONVERSION"], "Σ pct of the share_of_net_markup rules active on one leg ≤ 100 %; the share base is the leg’s fee parts less its partner cost and never includes a partner rebate. A MARKUP_SHARE_ACCRUAL is created and posted by the conversion it arises on; a party_retains accrual is a receivable from the party, reconciled monthly (v5.3, D26; restated v5.7, D46)."]
INV[25] = [["PARTNER_REBATE_ACCRUAL", "LEDGER_ACCOUNT", "DEAL", "CONVERSION"], "Rebate income posts only to EARN_REBATE, never to EARN_GROSS; every rebate accrual names the NPLify deal it arises on, is created and posted by that deal’s conversion in the rule’s payout currency, and the partner statement is reconciled against those deals alone (v5.3, D27; restated v5.7, D46)."]
INV[27][1] = INV[27][1].replace("posts to VARIANCE with component cutoff_timing", "posts to VAR_CUTOFF with component cutoff_timing")
INV[38][1] = INV[38][1].replace("posts to VARIANCE — NPL’s cost, chosen", "posts to VAR_RATE_HONOUR — NPL’s cost, chosen")
INV += [
  [["SETTLEMENT", "SETTLEMENT_LINE", "CONFIRMATION", "SETTLEMENT_RETURN", "LEDGER_ACCOUNT"], "A settlement discharges CL.PROJECT.<CCY>.PAYABLE when the partner releases the money (released_at); a SETTLEMENT_RETURN re-raises it for what came back and a short CONFIRMATION for the part not delivered; a full confirmation posts nothing; a hop (partner_transit) posts only when the far side credits and never touches the promise. Every released line ends confirmed, short or returned, and ‘sent, not yet confirmed’ is read from the line, never from an account (v5.7, D46)."],
  [["LEDGER_ACCOUNT", "CONVERSION", "BANK_FEE_EVENT", "SETTLEMENT_RETURN"], "CO.<PARTNER>.<CCY>.POOL may be below zero only between a fee NPL absorbed in a currency where it held nothing at that partner and the next conversion there, which then includes NPL’s own USDT converted alongside the client’s (a Conversion with a company part through FX_CLEARING); Finance squares every negative pool within the month (v5.7, D46)."],
  [["FEE_STRUCTURE", "DEAL", "CONVERSION"], "Fee parts are percentages of the principal at the basis rate and never compound: fee_sender_part = amount_in × rate × sender_pays_pct, fee_receiver_part = amount_in × rate × receiver_pays_pct, client_net = amount_in × rate × (1 − sender_pays_pct − receiver_pays_pct) (v5.7, D46)."],
  [["EARNINGS_OFFSET", "EARNINGS_RECEIVABLE", "LEDGER_POSTING", "PARTNER_RATE_VERSION"], "An EARNINGS_OFFSET is neutral for the client: from_amount at the from-partner becomes the client’s and to_amount = from_amount ÷ the to-partner’s rate of the day becomes NPL’s, with the client’s promises re-denominated by the same amounts; to_amount never exceeds the client’s unconverted balance at the to-partner, from_amount never exceeds NPL’s pool at the from-partner, and the receivables it recovers are marked recovered_by_offset_id (v5.7, D46)."],
  [["INVOICE", "LEDGER_POSTING", "RESELLER_MARGIN"], "In NPL-GR the vendor and resale invoices are posted once each, in the invoice currency (RESELL_COST / VENDOR_PAYABLE; RESALE_RECEIVABLE / RESELL_REVENUE), and no later transaction touches RESELL_REVENUE or RESELL_COST: the reseller revenue is intact by construction. The customer’s payment clears RESALE_RECEIVABLE into REMIT_CLAIM; each discharging line clears VENDOR_PAYABLE or REMIT_CLAIM; the forex result of instalments posts to VAR_FX_TIMING on the remittance side (v5.7, D46)."],
]

# ------------------------------------------------------------------ notes, fee practice, open questions, decision record, meta
d["NOTES"]["Ledger & controls"] += [
  "v5.7 (D46): variances by cause — VAR_CONVERSION (the partner did something other than expected, and basis variance on a reroute), VAR_CUTOFF (D29), VAR_RATE_HONOUR (D45), VAR_FX_TIMING (an obligation priced on one day and discharged on another, D24); each can be a gain or a loss.",
  "v5.7 (D46): a loss is NPL’s first — the whole amount to EXP_LOSS and the client made whole in one transaction, funded from NPL’s pool at the partner or its wallet (MAKEGOOD / LOSS_PAYABLE if not fundable at once); each agreed share is a LOSS_RECOVERY posting; a partial loss posts the lost part only.",
  "v5.7 (D46): NPL-GR keeps two invoices per deal in the invoice currency — the vendor’s and its own resale invoice — posted once as cost and revenue; the remittance deal that collects the resale invoice posts like any client project with NPL-GR as the client; the forex result of paying the vendor in instalments is a true-up to VAR_FX_TIMING against NPL’s pool, so the reseller revenue is never diluted. NPL’s profit = remittance earnings + reseller earnings (NPL_PROFIT), each callable on its own.",
  "v5.7 (D46): earnings may be kept in the unconverted balance (CONVERSION.residual_in, EARN_GROSS in the collection currency) and offset between partners (EARNINGS_OFFSET at the partner’s rate of the day, recorded for NPL in FX_CLEARING); the promise is discharged on release and re-raised by a return or a short delivery (INTRANSIT retired); bank transfers go out exact, cents included; a pool may be negative only until the next conversion squares it with NPL’s own USDT.",
]
d["NOTES"]["Deal lifecycle"].append("v5.7 (D46): fee parts are on the principal at the basis rate (client net = amount × rate × (1 − fee)); network fees are stated in USDT and absent when none applies; a cash collection is rounded to the pair’s cash unit at quote and the surplus over an invoice is the client’s.")
fp = d["FEE_PRACTICE"]
fp["answers"] += [
  ["How are the sender and receiver fee parts computed?", "Both on the principal at the basis rate, never compounded: 300,000 USDT × 0.9000 − 2 % = 264,600 EUR, of which the sender pays 1.4 % (3,780) and the receiver 0.6 % (1,620) (NPL, 11 Oct)."],
  ["Evo USDT → EUR fee types", "Two sender types: 1.4 % + 0.6 % receiver (2.0 %), or 1 % + 0.6 % receiver (1.6 %); the receiver always pays 0.6 %. Priced on the market rate; Ali’s cost (assumed 1 %, it changes daily) is inside its rate and comes out of NPL’s parts; Jeton charges 1.25 % on Evo transactions, stated separately (NPL, 11 Oct)."],
  ["Evo EUR → EUR (bank transfers)", "2.8 %, split 50 / 50: sender pays 1.4 %, receiver pays 1.4 %; converted at rate 1 so the fee is captured at conversion (NPL, 11 Oct)."],
  ["Where do NPL’s earnings sit?", "Partners convert everything they receive, so the margin is converted with the client’s money and rests at the partner, invisible to it. NPL’s practice is to take its earnings out of collections not yet converted and to offset between partners: the USDT equivalent of the margin earned at Jeton is left unconverted at Ali and only the rest converts — Jeton’s EUR balance becomes fully the client’s, Ali’s USDT balance NPL’s. Recorded as CONVERSION.residual_in and EARNINGS_OFFSET at the partner’s rate of the day (NPL, 11 Oct)."],
  ["What if NPL has no balance in the fee’s currency at a partner?", "The partner fronts the absorbed fee out of the one balance it holds; NPL’s pool in that currency goes negative and is squared at the next conversion by converting the equivalent of NPL’s own USDT alongside the client’s (NPL, 11 Oct)."],
  ["Is money in transit NPL’s?", "No. Once a transfer is initiated it is out of NPL’s hands; the promise is discharged on release and comes back only if the funds return or arrive short. Bank transfers may carry cents; rounding to a unit applies to cash (NPL, 11 Oct)."],
  ["NPL-GR: how is the reseller profit kept apart from remittance earnings?", "Two invoices in EUR — the vendor’s at the preferential price and NPL-GR’s resale invoice at retail — fix the reseller revenue when posted. The customer pays the resale invoice in THB cash (rounded to the thousand) through the remittance service with the 2 % markup on market; Ali’s cost and the forex result of paying the vendor in USDT instalments come out of the markup (2 % → 1.3 % after Ali → 1.2 % after a 0.1 % forex loss), never out of the reseller revenue. NPL’s profit is both together (NPL, 10–11 Oct)."],
]
for row in fp["documents"]:
    if row[0] == "ERD & Data Model": row[1] = "Draft v5.7, 11 October 2026 — this model (70 tables, 12 views, invariants 1–44, decisions D1–D46)"
    if row[0] == "Ledger Posting Design & Chart of Accounts": row[1] = "v5.7, 11 October 2026 — numbered with the ERD edition; the chart of accounts and 59 worked transactions, all of D46 applied (variance by kind, loss first, accruals at conversion, reseller books, earnings offset, promise discharged on release)"
    if row[0] == "Ledger Patterns — Reading Companion": row[1] = "v5.7, 11 October 2026 — the same worked transactions with a plain-language explanation and the arithmetic beside each table"
d["OPENQ"].append({"q": "Review point (v5.7): the ledger design — accrual timing, loss events, the NPL-GR reseller P&L, variance accounts, earnings kept unconverted and offset between partners, money in transit, fee arithmetic.",
    "blocks": "Ledger Posting Design; Calculation Specification", "status": "answered",
    "a": "NPL (10–11 Oct): accrue shares and rebates at conversion; book a loss to NPL first and recover share by share; run NPL-GR’s full reseller P&L inside NPLify with two invoices in EUR and the remittance markup absorbing partner cost and forex; one variance account per cause; earnings taken out of unconverted collections and offset between partners at the partner’s rate of the day; sent money is not NPL’s — the promise is discharged on release; bank transfers carry cents, cash rounds; fee parts on the principal; Jeton 1.25 %, Ali assumed 1 %; EUR → EUR 2.8 % split 50/50; NPL’s profit = remittance + reseller earnings.",
    "impl": "v5.7 D46: LEDGER_ACCOUNT purposes (VAR_ × 4, LOSS_RECEIVABLE, MAKEGOOD, LOSS_PAYABLE, RESELL_REVENUE, RESELL_COST, VENDOR_PAYABLE, RESALE_RECEIVABLE, REMIT_CLAIM, FX_CLEARING; INTRANSIT retired), sources LossRecovery / Invoice / EarningsOffset, component resale; LOSS_RECOVERY and EARNINGS_OFFSET tables; INVOICE.kind, sender_id; EARNINGS_RECEIVABLE.recovered_by_offset_id; PARTNER_REBATE_RULE.payout_currency; CURRENCY_PAIR.amount_rounding exact; views RESELLER_MARGIN, REMITTANCE_MARGIN, NPL_PROFIT; invariants 16, 25, 26, 28, 39 restated, 40–44 new."})
d["DECISIONS"] += (
    "\nAGREED 10–11 OCTOBER 2026, IN v5.7 — D46, the ledger design: (1) variance by cause — VARIANCE becomes VAR_CONVERSION, VAR_CUTOFF, VAR_RATE_HONOUR, VAR_FX_TIMING; (2) a loss is booked to NPL in full and the client made whole at once (EXP_LOSS; MAKEGOOD / LOSS_PAYABLE when unfunded), then recovered share by share (LOSS_RECOVERY, source LossRecovery; LOSS_RECEIVABLE from partner or sender; the client’s share by partial reversal of the make-good); a partial loss posts the lost part only; (3) markup-share and rebate accruals are created and posted by the conversion, the rebate in PARTNER_REBATE_RULE.payout_currency; (4) NPL-GR keeps two invoices per deal in EUR — INVOICE.kind vendor / resale with sender_id — posted once as RESELL_COST / VENDOR_PAYABLE and RESALE_RECEIVABLE / RESELL_REVENUE (source Invoice, component resale), so the reseller revenue is intact by construction (RESELLER_MARGIN); the remittance deal that collects the resale invoice posts like any client project with NPL-GR as the client, the customer’s THB collected as cash and rounded, and each instalment’s forex result is a true-up to VAR_FX_TIMING against NPL’s pool (REMITTANCE_MARGIN); NPL_PROFIT = remittance + reseller earnings, each callable alone; D23 stands for the own desk’s balances; (5) earnings may be kept in the unconverted balance (CONVERSION.residual_in; EARN_GROSS in that currency) and offset between partners (EARNINGS_OFFSET at the to-partner’s rate of the day, recovering EARNINGS_RECEIVABLE rows, Finance requests, Management approves, ROLE_RIGHT action earnings_offset), recorded for NPL in FX_CLEARING; (6) FX_CLEARING for any company balance settled in another currency; (7) the promise is discharged on release — INTRANSIT retired, a return or a short confirmation re-raises PAYABLE, a full confirmation posts nothing, a hop posts on credit only; CURRENCY_PAIR.amount_rounding gains exact (bank transfers carry cents; unit rounding is for cash); a pool may be negative only until the next conversion squares it with NPL’s own USDT; (8) fee parts are percentages of the principal at the basis rate, never compounded (client net = amount × rate × (1 − fee)); network fees in USDT, absent when none applies. Invariants 16, 25, 26, 28, 39 restated; 40–44 new. NPL’s data: Evo USDT → EUR sender 1 % or 1.4 % with receiver 0.6 %; EUR → EUR 2.8 % split 50/50; Jeton 1.25 % on Evo; Ali assumed at 1 % inside its rate; NPL-GR THB collected as cash. Why (NPL): the ledger must show where NPL’s margin physically is, prove the reseller revenue untouched, answer ‘NPL’s profit’ with both businesses, and treat sent money as out of NPL’s hands. Rejected: a single VARIANCE account; the reseller books as invoice records with views only; the market rate for an offset; INTRANSIT as a client asset."
    "\nV5.7 (11 October 2026): v5.6 plus D46. 70 tables + 12 views, invariants 1–44, decisions D1–D46."
)
d["DOC_META"] = "NPLify · P0 Technical Baseline. Deliverable 1 — Entity-Relationship Diagram & Data Model, Draft v5.7. New XP Technologies Limited, 11 October 2026, Confidential — internal baseline document; client deliverables are derived from it. Supersedes v5.6, v5.5, v5.4 and v5.3 (the working drafts of 8–9 October), v5.2, v5.1, v5.0, v4.0 and v3.0 in full."
d["version"] = "5.7"; d["generatedAt"] = "2026-10-11"
d["CONVENTIONS"] = [c.replace("month volume, client position, wallet registry) are views", "month volume, client position, wallet registry, reseller and remittance margins, NPL profit) are views") for c in d["CONVENTIONS"]]

names = set(E)
for r in R: assert r[0] in names and r[1] in names, r
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("tables", sum(1 for e in E.values() if e["d"] != "view"), "views", sum(1 for e in E.values() if e["d"] == "view"), "relations", len(R), "invariants", len(d["INV"]))
