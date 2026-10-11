#!/usr/bin/env python3
"""11 October 2026 (late) — v5.9 wording corrections in the three document builders (ERD, Ledger Posting Design,
Reading Companion). Every replacement must match exactly once; the script refuses otherwise, so it is safe to re-run
only on an untouched v5.8 tree.    python3 scripts/apply-v5.9-docs.py"""
from pathlib import Path

S = Path(__file__).resolve().parent
def patch(name, pairs):
    p = S / name; s = p.read_text()
    for old, new in pairs:
        n = s.count(old)
        assert n == 1, f"{name}: expected 1 match, found {n} for: {old[:90]!r}"
        s = s.replace(old, new)
    p.write_text(s); print(name, "·", len(pairs), "replacements")

# ================================================================== ERD builder
patch("build-erd-doc.mjs", [
  # Diagram 3c note: loss events
  ("; Management approves the split, one reversing transaction posts it, and a collection-side event moves the part to reversed (D32).`,",
   ". The whole loss is booked to NPL and the client made whole in one transaction (source LossEvent; MAKEGOOD / LOSS_PAYABLE when it cannot be funded at once); Management approves the split and each share is a separate ${code(\"LOSS_RECOVERY\")} posting; the collection part stays verified and is reversed only when the deal is unwound (D32, D46).`,"),
  # Diagram 4 notes
  ("`<b>Ownership flips client → company at one event only: margin recognition at conversion.</b> NPL never advances",
   "`<b>Ownership moves between client and company only at the events invariant 16 names</b> — margin recognition at conversion, the two sides of an earnings offset, the forex true-ups of invoice lines, fees NPL absorbs or covers, top-ups, make-wholes, make-goods and the client's loss share — and every transaction balances per owner as well as per currency (D46). NPL never advances"),
  ("`Transaction sources: Collection, Conversion, BalanceConversion, Settlement, SettlementReturn, Confirmation, BankFeeEvent, Reroute, MarkupShare, Rebate, LossEvent, Adjustment. Account purposes include PAYABLE, SHARE_PAYABLE, SHARE_RECEIVABLE, REBATE_RECEIVABLE, EARN_GROSS, EARN_REBATE, EXP_ROUNDING and EXP_LOSS; ADVANCE does not exist. Cost components include share, rebate, rounding, fx_timing, cutoff_timing and loss.`,",
   "`Transaction sources: Collection, Conversion, BalanceConversion, Settlement, SettlementReturn, Confirmation, BankFeeEvent, Reroute, MarkupShare, Rebate, LossEvent, LossRecovery, Invoice, EarningsOffset, Adjustment (D46). Account purposes include PAYABLE, SHARE_PAYABLE, SHARE_RECEIVABLE, REBATE_RECEIVABLE, LOSS_RECEIVABLE, MAKEGOOD / LOSS_PAYABLE, EARN_GROSS, EARN_REBATE, the four VAR_ accounts, FX_RESULT, the reseller purposes (RESELL_REVENUE, RESELL_COST, VENDOR_PAYABLE, RESALE_RECEIVABLE, REMIT_CLAIM), EXP_ROUNDING and EXP_LOSS; ADVANCE and INTRANSIT do not exist. Cost components include share, rebate, rounding, fx_timing, cutoff_timing, loss and resale.`,"),
  ("The cost of rounding up is EXP_ROUNDING, NPL's share of a loss event is EXP_LOSS; the client's and sender's shares of a loss reduce the client balance, the partner's share is a receivable from the partner (D25, D32).",
   "The cost of rounding up is EXP_ROUNDING (D25). A loss is booked to EXP_LOSS in full first and the client made whole; the partner's and the sender's agreed shares are LOSS_RECEIVABLE owed to NPL, the client's share is a partial reversal of the make-good, and what remains in EXP_LOSS is NPL's own share (D32, D46)."),
  ("Approval actions include refund_to_third_party, cross_group_payout, balance_conversion, recover_dues, enable_own_desk, approve_loss_split and override_screening_reject.",
   "Approval actions include price_quote, extend_quote_validity, refund_to_third_party, cross_group_payout, balance_conversion, recover_dues, cover_bank_fee, raise_fee_cap, enable_own_desk, approve_loss_split, override_screening_reject and earnings_offset (ROLE_RIGHT rows, D44, D46)."),
  # D24, D29, D45 name their accounts
  ("The EUR difference between what was collected and what was discharged posts to variance with component fx_timing.`,",
   "The EUR difference between what was collected and what was discharged posts to VAR_FX_TIMING with component fx_timing (the account named by D46; the amendment measures it as obligation_discharged × invoice_rate − obligation_discharged × discharge_rate).`,"),
  ("The difference between the stamped partner rate and the one used posts to variance with component cutoff_timing.`,",
   "The difference between the stamped partner rate and the one used posts to VAR_CUTOFF with component cutoff_timing (the account named by D46).`,"),
  ("the difference against the partner's actual rate posts to variance. Invariant 37 restated, invariant 39 new.`,",
   "the difference against the partner's actual rate posts to VAR_RATE_HONOUR (the account named by D46). Invariant 37 restated, invariant 39 new.`,"),
  # §6 narrative, headings and the v5.9 record
  ("<p>Draft v5.8 (${DATE}) is v5.7 with the D46 amendment of the same evening",
   "<p>Draft v5.9 (${DATE}) is v5.8 with the corrections of a cross-document review the same night: no new decision; D46 and its amendment propagated to every passage that still described the pre-D46 ledger. Draft v5.8 (${DATE}) was v5.7 with the D46 amendment of the same evening"),
  ("<h3>v5.3 to v5.8 — the fee-practice decisions", "<h3>v5.3 to v5.9 — the fee-practice decisions"),
  ("<h4>v5.8 — Amendment of 11 October, evening — D46</h4>",
   "<h4>v5.9 — Corrections of 11 October, late — D46 propagated</h4>\n<p>A cross-document review of this draft, the Ledger Posting Design and the Reading Companion found no new gap in the design but a number of passages that still described the ledger as it was before D46. All are corrected here, with no new decision. <b>Invariant 1</b> now states the per-owner balancing rule beside the per-currency one, and <b>invariant 31</b> says the collection part stays verified after a loss (NPL's funds stand in) and is reversed only when Management unwinds the deal. <b>Invariant 44</b> says the cash-rounding surplus is posted to RESELL_REVENUE in the currency received, so \"no later transaction touches RESELL_REVENUE\" holds in the invoice currency. ${code(\"SETTLEMENT_LINE.outcome\")} gains the value <b>short</b>, so \"every released line ends confirmed, short or returned\" (invariant 40) is a check on the column rather than a reading of CONFIRMATION. ${code(\"LOSS_RECOVERY\")} posts once per state change — agreed, then received — both under source LossRecovery, and the worked transaction T41 of the ledger is now one posting per share. ${code(\"LOSS_EVENT\")} gains ${code(\"pool_funded\")}, ${code(\"wallet_funded\")} and ${code(\"funding_reference\")}, the stored facts of how a make-good was funded. The notes of Diagrams 3c and 4, the ${code(\"DEAL.rate_reused_from_deal_id\")} note and the decision texts of D24, D29 and D45 now name VAR_FX_TIMING, VAR_CUTOFF and VAR_RATE_HONOUR instead of the retired VARIANCE; the Diagram 4 note lists every source, purpose and approval action; question 2 of §7 and the rebate row of Appendix A.1 are brought into line; the headings of 3c and B.4 say shares, not referrals.</p>\n<h4>v5.8 — Amendment of 11 October, evening — D46</h4>"),
  ("<h4>New tables (v5.3)</h4>", "<h4>New tables (v5.3 to v5.9)</h4>"),
  ("[code(\"LOSS_EVENT\"), \"Money lost after verification or release, on either side, partial or full, with the loss split across sender, NPL, partner and client (D32).\"],",
   "[code(\"LOSS_EVENT\"), \"Money lost after verification or release, on either side, partial or full, with the loss split across sender, NPL, partner and client (D32); booked to NPL first and recovered share by share since D46; records how the make-good was funded (v5.9).\"],"),
  ("<h4>Changed tables (v5.3)</h4>\n${table([\"Table\", \"Change\"], [\n",
   "<h4>Changed tables (v5.3 to v5.9)</h4>\n${table([\"Table\", \"Change\"], [\n  [code(\"SETTLEMENT_LINE\"), \"outcome + short — every released line ends confirmed, short or returned, checkable on the column (v5.9).\"],\n  [code(\"LOSS_RECOVERY\"), \"one LEDGER_TRANSACTION per state change, agreed and received, both under source LossRecovery (v5.9).\"],\n  [code(\"LOSS_EVENT\"), \"+ pool_funded, wallet_funded, funding_reference — how the make-good was funded (v5.9).\"],\n  [code(\"DEAL\"), \"rate_reused_from_deal_id note names VAR_RATE_HONOUR (v5.9).\"],\n"),
  ("<h4>Views and invariants (v5.3)</h4>\n${table([\"Item\", \"Change\"], [\n",
   "<h4>Views and invariants (v5.3 to v5.9)</h4>\n${table([\"Item\", \"Change\"], [\n  [\"Invariants 1, 31, 44\", \"Restated in v5.9 to match D46: per-owner balancing beside per-currency; the collection part stays verified after a loss; the cash-rounding surplus posted to RESELL_REVENUE in the currency received.\"],\n"),
  # dependent documents
  ("[\"Ledger Posting Design v5.8, Ledger Patterns Reading Companion v5.8 and Calculation Specification v5.8\", \"Regenerated with this draft: the chart of accounts and 59 worked transactions covering every pattern of D46, each with a plain-language explanation and its arithmetic in the companion. Numbered with the ERD edition.\"],",
   "[\"Ledger Posting Design v5.9 and Ledger Patterns Reading Companion v5.9\", \"Regenerated with this draft: the chart of accounts and 61 worked transactions (T41 is now one recovery posting per share) covering every pattern of D46, each with a plain-language explanation and its arithmetic in the companion. Numbered with the ERD edition.\"],\n  [\"Calculation Specification v5.8\", \"Built against v5.8; no calculation changes in v5.9, so it stands until the next edition.\"],"),
  ("[\"Lifecycle &amp; Approvals v1.1 → v1.2\", \"Rate-locked and awaiting-cutoff sub-states with the deferral; loss event path with Management approval; cash collection steps (token → hand-over → count); screening before Collecting as an Operations action; enable_own_desk.\"],",
   "[\"Lifecycle &amp; Approvals v1.1 → v1.2\", \"Rate-locked and awaiting-cutoff sub-states with the deferral; cash collection steps (token → hand-over → count); screening before Collecting as an Operations action; enable_own_desk. D46 (v5.7–v5.9): the loss booked to NPL first with LOSS_RECOVERY states agreed → received per share and the collection part staying verified; EARNINGS_OFFSET requested by Finance and approved by Management (earnings_offset); the promise discharged on release and re-raised by a return or a short confirmation; SETTLEMENT_LINE.outcome sent → confirmed / short / returned; a pool negative only until the next conversion squares it.\"],"),
  ("[\"Roles &amp; Visibility Matrix v1.0 → v1.1\", \"Screening fields in the Operations group; rebate, party share and loss split in the economics group; a party-facing statement shows the share only, never the rebate.\"],",
   "[\"Roles &amp; Visibility Matrix v1.0 → v1.1\", \"Screening fields in the Operations group; rebate, party share and loss split in the economics group; a party-facing statement shows the share only, never the rebate. D46: the earnings_offset right (Finance initiates, Management approves); Operations never sees FX_RESULT, VAR_ or LOSS_ balances.\"],"),
  ("  [\"Calculation Specification v1.0 → v1.1\", \"Tier split and blended fee; customer-facing rate; rate-direction normalisation; rounding menu; same-currency conversion at rate 1; acceptance vectors from NPL's real figures (market 0.86050 / Ali 1 ÷ 1.1738; GDC 86,594; Raeen 41,520.17; THB 17,000,000; USDT 2,598 → 2,600).\"],\n", ""),
  ("[\"Configuration Schema v1.0 → v1.1\", \"Every new column and value set; the NPL-GR own-desk project; rebate rule basis and scope; cutoff times; cash locations; single-use endpoints.\"],",
   "[\"Configuration Schema v1.0 → v1.1\", \"Every new column and value set; the NPL-GR own-desk project; rebate rule basis and scope; cutoff times; cash locations; single-use endpoints. D46 and amendment: CURRENCY_PAIR.amount_rounding exact; PARTNER_REBATE_RULE.payout_currency with basis pct_of_amount only; INVOICE.kind, sender_id, vendor_invoice_id; DEAL_GROUP.invoice_amount, invoice_rate; DEAL.amount_mode semantics (invariant 42).\"],"),
  ("[\"ERD Reading Guide v1.0 → v1.1\", \"The new boxes on 1a, 1b, 3a and 3c, the split of the deal diagram into 3a (deal, collection) and 3b (conversion, reroute) with settlement now 3c, and the decisions behind them.\"],",
   "[\"ERD Reading Guide v1.0 → v1.1\", \"The new boxes on 1a, 1b, 3a and 3c, the split of the deal diagram into 3a (deal, collection) and 3b (conversion, reroute) with settlement now 3c, and the decisions behind them. D46: EARNINGS_OFFSET on 3b, LOSS_RECOVERY on 3c, the new sources and purposes on 4.\"],"),
  ("\"The data file, the map and the knowledge base are at 5.8 with this draft.\"", "\"The data file is at 5.9 with this draft; the map and the knowledge base read it.\""),
  # status paragraph
  ("<p><b>Status:</b> Draft v${V} (${DATE}) is v5.7 with the D46 amendment of the same evening — views over postings, the two-invoice links, FX_RESULT, invariants 7, 16, 23, 42 and 44 restated — found by an independent re-derivation of every calculation. Draft v5.7 was",
   "<p><b>Status:</b> Draft v${V} (${DATE}) is v5.8 with the corrections of a cross-document review of the ERD, the Ledger Posting Design and its Companion the same night: no new decision; D46 and its amendment are propagated to every passage that still described the pre-D46 ledger (invariants 1 and 31 restated, SETTLEMENT_LINE.outcome gains short, LOSS_RECOVERY posts per state change, LOSS_EVENT records its funding, the notes and decisions D24, D29 and D45 name the VAR_ accounts). Draft v5.8 was v5.7 with the D46 amendment of the same evening — views over postings, the two-invoice links, FX_RESULT, invariants 7, 16, 23, 42 and 44 restated — found by an independent re-derivation of every calculation. Draft v5.7 was"),
  ("Fourteen tables and five views are added; invariants 3 and 9 are restated; invariants 20–39 are new. NPL’s answers",
   "v5.3 to v5.5 added fourteen tables and five views, restated invariants 3 and 9 and added invariants 20–39. NPL’s answers"),
  ("The Ledger Posting Design and its Reading Companion are regenerated with this version (numbered v5.8); the other dependent documents are listed in §6.",
   "The Ledger Posting Design and its Reading Companion are regenerated with this version (numbered v${V}); the other dependent documents are listed in §6."),
  # headings and footer
  ("<h3>3c · Settlement, return, confirmation, fees, referrals, rebates and loss events</h3>", "<h3>3c · Settlement, return, confirmation, fees, shares, rebates, loss events and recoveries</h3>"),
  ("<h3>B.4 Settlement, return, confirmation, fees, referrals, rebates</h3>", "<h3>B.4 Settlement, return, confirmation, fees, shares, rebates, losses and recoveries</h3>"),
  ("The Ledger Posting Design, its Reading Companion and the Calculation Specification are at v5.8 with this draft; the state machines",
   "The Ledger Posting Design and its Reading Companion are at v${V} with this draft and the Calculation Specification at v5.8 (no calculation changes in v${V}); the state machines"),
])

# ================================================================== Ledger Posting Design builder
patch("build-ledger-doc.mjs", [
  ('const DOC_VERSION = "5.8", ERD_VERSION = "5.8"', 'const DOC_VERSION = "5.9", ERD_VERSION = "5.9"'),
  ("Client money received at this partner and not yet converted (in the collection currency). In a reseller project the same purpose exists under CO.",
   "Client money received at this partner and not yet converted (in the collection currency). In the reseller project NPL-GR is the client, so its collections are CL as well."),
  ("(D46 amendment: replaces FX_RESULT, an asset that could never be closed", "(D46 amendment: replaces FX_CLEARING, an asset that could never be closed"),
  ("and with the purposes this draft proposes (Section 22): four variance accounts in place of one, loss receivables and the unfunded make-good pair, the reseller revenue and cost accounts, and a clearing account for company balances settled in another currency.",
   "and with the purposes this design put into the ERD as D46 (Section 24): four variance accounts in place of one, loss receivables and the unfunded make-good pair, the reseller revenue and cost accounts, and FX_RESULT for NPL's own currency exchanges."),
  ("the reseller deal with its two invoices and instalments.</div>",
   "the reseller deal with its two invoices and instalments. v5.9 corrects the wording left behind by D46 and shows T41 as one recovery posting per share.</div>"),
  ("<b>where is the money</b> (at which partner, in transit, in one of NPL's wallets)", "<b>where is the money</b> (at which partner, sent and awaiting confirmation, in one of NPL's wallets)"),
  ("each produce exactly one ${code(\"LEDGER_TRANSACTION\")} that points at its source record (${code(\"source_type\")}, ${code(\"source_id\")}).</li>",
   "each produce exactly one ${code(\"LEDGER_TRANSACTION\")} that points at its source record (${code(\"source_type\")}, ${code(\"source_id\")}). A source row with a lifecycle — a share or rebate accrual, a loss recovery — produces one transaction per state change, each naming the same row; a full confirmation and a hop release are events that post nothing (rule 12).</li>"),
  ("What is sent and unconfirmed is a line state, not a jar.</li>",
   "What is sent and unconfirmed is the line's outcome (SETTLEMENT_LINE.outcome sent), not a jar; every released line ends confirmed, short or returned.</li>"),
  ("<tr><td>earnings</td><td>POOL, EARN_GROSS, WALLET on dues recovery</td>",
   "<tr><td>earnings</td><td>POOL, EARN_GROSS, WALLET on dues recovery; the client-owned DUE, PAYABLE and COLLECTED lines of an earnings offset or a retained margin (T54, T55)</td>"),
  ("<tr><td>variance</td><td>VAR_CONVERSION, VAR_RATE_HONOUR, VAR_FX_TIMING</td>", "<tr><td>variance</td><td>VAR_CONVERSION, VAR_RATE_HONOUR</td>"),
  ("MarkupShare, Rebate, LossEvent, Adjustment, <span class=\"new\">Invoice</span> for the reseller books and <span class=\"new\">EarningsOffset</span> for the cross-partner offset. Section 22 lists what each one posts; Section 24 asks for the source record a loss recovery points at.",
   "MarkupShare, Rebate, LossEvent, <span class=\"new\">LossRecovery</span> for each recovered share, Adjustment, <span class=\"new\">Invoice</span> for the reseller books and <span class=\"new\">EarningsOffset</span> for the cross-partner offset. Section 22 lists what each one posts; Section 24 names the source record (LOSS_RECOVERY) a loss recovery points at."),
  ("The lines are now in state sent; what is sent and not yet confirmed", "The lines now have outcome sent; what is sent and not yet confirmed"),
  ("(a SETTLEMENT_LINE to the partner_transit receiver, state sent)", "(a SETTLEMENT_LINE to the partner_transit receiver, outcome sent)"),
  ("A rule with basis pct_of_partner_fee accrues in the currency the partner pays it in (see Section 24).",
   "The accrual is expressed in the rule's payout_currency, the currency the partner pays in (Section 24)."),
  ("\"NPL's money at Ali funds the make-good as far as it goes\"", "\"NPL's money at Ali funds the make-good as far as it goes (LOSS_EVENT.pool_funded)\""),
  ("\"the rest is transferred from NPL's own wallet to Ali (partner_agreement_ref)\"", "\"the rest is transferred from NPL's own wallet to Ali (LOSS_EVENT.wallet_funded, funding_reference)\""),
  # T41 → one recovery posting per share
  ("""L.tx(`T41 · Management approves the split (approve_loss_split): partner ${fmt(shares.partner)}, sender ${fmt(shares.sender)}, client ${fmt(shares.client)}, NPL ${fmt(shares.npl)} USDT`, "LossRecovery", [
  ["CO.ALI.USDT.LOSS_RECEIVABLE", "Dr", shares.partner, USDT, CO, "loss", "Ali's agreed share, now owed to NPL"],
  ["CO.SENDER_A.USDT.LOSS_RECEIVABLE", "Dr", shares.sender, USDT, CO, "loss", "the sender's agreed share"],
  ["CO.ALI.USDT.POOL", "Dr", shares.client, USDT, CO, "loss", "NPL takes back the part of its make-good the client bears"],
  ["CO.NONE.USDT.EXP_LOSS", "Cr", shares.partner + shares.sender + shares.client, USDT, CO, "loss", `NPL's expense falls to its own share, ${fmt(shares.npl)}`],
  ["CL.PROJECT.USDT.PAYABLE", "Dr", shares.client, USDT, CL, "loss", "the client's claim falls by the share it bears"],
  ["CL.ALI.USDT.COLLECTED", "Cr", shares.client, USDT, CL, "loss", "and the restored balance with it"],
], "Each share is a separate recovery posting against the loss; the shares sum to the amount (invariant 31). The client-share lines are the partial reversal of the make-good in T40, which is why invariant 16 is restated in Section 24.");
""",
   """L.tx(`T41a · Management approves the split (approve_loss_split): partner ${fmt(shares.partner)}, sender ${fmt(shares.sender)}, client ${fmt(shares.client)}, NPL ${fmt(shares.npl)} USDT — Ali's share agreed (LOSS_RECOVERY party partner, state agreed)`, "LossRecovery", [
  ["CO.ALI.USDT.LOSS_RECEIVABLE", "Dr", shares.partner, USDT, CO, "loss", "Ali's agreed share, now owed to NPL"],
  ["CO.NONE.USDT.EXP_LOSS", "Cr", shares.partner, USDT, CO, "loss", "NPL's expense falls by Ali's share"],
], "One LOSS_RECOVERY row per share and one transaction per row (D46; rule 1): the three recoveries T41a–T41c are posted at the same moment, when Management approves the split, and each names its own row. The shares sum to the loss (invariant 31).");
L.tx(`T41b · The sender's share agreed: ${fmt(shares.sender)} USDT (LOSS_RECOVERY party sender, state agreed)`, "LossRecovery", [
  ["CO.SENDER_A.USDT.LOSS_RECEIVABLE", "Dr", shares.sender, USDT, CO, "loss", "the sender's agreed share, owed to NPL"],
  ["CO.NONE.USDT.EXP_LOSS", "Cr", shares.sender, USDT, CO, "loss", "NPL's expense falls by the sender's share"],
]);
L.tx(`T41c · The client's share: ${fmt(shares.client)} USDT borne by the client, received at once by partial reversal of the make-good (LOSS_RECOVERY party client, state received)`, "LossRecovery", [
  ["CO.ALI.USDT.POOL", "Dr", shares.client, USDT, CO, "loss", "NPL takes back the part of its make-good the client bears"],
  ["CO.NONE.USDT.EXP_LOSS", "Cr", shares.client, USDT, CO, "loss", `NPL's expense falls to its own share, ${fmt(shares.npl)}`],
  ["CL.PROJECT.USDT.PAYABLE", "Dr", shares.client, USDT, CL, "loss", "the client's claim falls by the share it bears"],
  ["CL.ALI.USDT.COLLECTED", "Cr", shares.client, USDT, CL, "loss", "and the restored balance with it"],
], "The client-share lines are the partial reversal of the make-good in T40, one of the ownership movements invariant 16 names; a client share is received the moment it is agreed, since no money changes hands.");
"""),
  ("\"received (LOSS_RECOVERY, Section 24)\"", "\"received: the LOSS_RECOVERY row of T41a moves to state received\""),
  ("  [\"CO.OWN.USDT.WALLET\", \"Dr\", shares.sender, USDT, CO, \"loss\", \"a payment to NPL, never a netting against a sender credit (client money)\"],",
   "  [\"CO.OWN.USDT.WALLET\", \"Dr\", shares.sender, USDT, CO, \"loss\", \"a payment to NPL, never a netting against a sender credit (client money); the LOSS_RECOVERY row of T41b moves to state received\"],"),
  ("${L.html(\"T39\")}${L.html(\"T40\")}${L.html(\"T41\")}${L.html(\"T42\")}${L.html(\"T43\")}", "${L.html(\"T39\")}${L.html(\"T40\")}${L.html(\"T41a\")}${L.html(\"T41b\")}${L.html(\"T41c\")}${L.html(\"T42\")}${L.html(\"T43\")}"),
  ("a network fee NPL bears posts as in T16.", "a network fee NPL bears posts as in T17."),
  ("a line never stays in state sent beyond the rail's expected time without an exception.", "a line never keeps outcome sent beyond the rail's expected time without an exception."),
  ("no later transaction touches either account (a cash-rounding surplus is extra revenue in the currency received, never a forex result).",
   "no later transaction touches either account in the invoice currency (a cash-rounding surplus is extra revenue, posted to RESELL_REVENUE in the currency received, never a forex result)."),
  ("<li><b>Where the money is.</b> Client money by partner, in transit, in custody (CUSTODY view",
   "<li><b>Where the money is.</b> Client money by partner, sent and not yet confirmed (read from the payout lines, not from an account), in custody (CUSTODY view"),
  ("<tr><td>LossEvent</td><td>EXP_LOSS, POOL or WALLET (or LOSS_PAYABLE), COLLECTED / DUE (or MAKEGOOD), PAYABLE re-raised on a settlement-side loss; then LOSS_RECEIVABLE, PAYABLE for the recoveries</td><td>company and client</td><td>loss, principal</td></tr>",
   "<tr><td>LossEvent</td><td>EXP_LOSS, POOL or WALLET (or LOSS_PAYABLE), COLLECTED / DUE (or MAKEGOOD), PAYABLE re-raised on a settlement-side loss</td><td>company and client</td><td>loss, principal</td></tr>\n<tr><td><span class=\"new\">LossRecovery</span></td><td>LOSS_RECEIVABLE against EXP_LOSS when a partner or sender share is agreed; POOL or WALLET against LOSS_RECEIVABLE when it is received; POOL against EXP_LOSS with PAYABLE and COLLECTED / DUE for the client's share, a partial reversal of the make-good</td><td>company (and client)</td><td>loss</td></tr>"),
  ("approve_loss_split, balance_conversion, recover_dues, cross_group_payout, cover_bank_fee, raise_fee_cap, enable_own_desk,",
   "approve_loss_split, balance_conversion, recover_dues, earnings_offset (requested by Finance), cross_group_payout, cover_bank_fee, raise_fee_cap, enable_own_desk,"),
  ("<h2>24 · What this design put into the ERD (D46 in v5.7, amended as v5.8)</h2>", "<h2>24 · What this design put into the ERD (D46 in v5.7, amended as v5.8, propagated in v5.9)</h2>"),
  ("they were applied the same evening as an amendment of D46, cut as ERD v5.8, and are marked below.</p>",
   "they were applied the same evening as an amendment of D46, cut as ERD v5.8, and are marked below. A cross-document review the same night found no new gap in the design but a number of passages — in the ERD, in this document and in the Companion — that still described the pre-D46 ledger; v5.9 corrects them, as noted below.</p>"),
  ("Invariants 28 and 39 and decisions D24, D29, D45 then name the account they post to.</li>",
   "Invariants 28 and 39 and decisions D24, D29, D45 then name the account they post to (the three decision texts and the DEAL rate-reuse note were brought into line in v5.9).</li>"),
  ("as the source record of each recovery posting, under source LossEvent. ${code(\"COLLECTION.state\")} reversed is used only when the deal is unwound.",
   "as the source record of each recovery posting, under source LossRecovery; each state change (agreed, received) posts one transaction naming the row, and T41 is shown as one transaction per share (v5.9). ${code(\"LOSS_EVENT\")} records how the make-good was funded (pool_funded, wallet_funded, funding_reference; v5.9). ${code(\"COLLECTION.state\")} reversed is used only when the deal is unwound; invariant 31 says so since v5.9."),
  ("invariant 7 already subtracts sent lines from the entitlement, so the ledger now matches it. ${code(\"CURRENCY_PAIR.amount_rounding\")}",
   "invariant 7 already subtracts sent lines from the entitlement, so the ledger now matches it; ${code(\"SETTLEMENT_LINE.outcome\")} gains the value short, so \"every released line ends confirmed, short or returned\" (invariant 40) is a check on the column (v5.9). ${code(\"CURRENCY_PAIR.amount_rounding\")}"),
])

# ================================================================== Reading Companion builder
patch("build-ledger-companion.mjs", [
  ("Some jars hold money (at a partner, in NPL's wallet, in transit).", "Some jars hold money (at a partner, in NPL's wallet)."),
  ("<tr><td>INTRANSIT</td><td>client money sent out and not yet confirmed as received</td></tr>\n", ""),
  ("<tr><td>PAYABLE</td><td>the promise: what NPL still has to deliver for the client, per currency</td></tr>",
   "<tr><td>PAYABLE</td><td>the promise: what NPL still has to deliver for the client, per currency. Money already sent is out of NPL's hands and no longer here: \"sent, not yet confirmed\" is a mark on the payout line, not a jar</td></tr>"),
  ("A share is part of NPL's fee owed to a partner in the business;", "A share is part of NPL's fee owed to a markup-share party — a customer such as Raeen, or an outside introducer;"),
  ("Rounding down (T2) is the opposite case: the leftover cents stay the client's.`,",
   "Rounding down (a truncating option on a cash pair) is the opposite case: the dropped fraction stays the client's; T2 is a EUR bank transfer and goes out exact.`,"),
  ("  T41: `Management then decides who bears what: Ali ${u(shares.partner)}, the sender ${u(shares.sender)}, the client ${u(shares.client)}, NPL ${u(shares.npl)}. Ali's and the sender's shares become receivables (promises they owe NPL) and come off the loss jar. The client's share is handled by undoing that part of the make-good: the client's promise and its jar at Ali both drop by ${u(shares.client)}, and NPL takes that much back into its pool. The loss jar ends at NPL's own share.`,",
   "  T41a: `Management then decides who bears what: Ali ${u(shares.partner)}, the sender ${u(shares.sender)}, the client ${u(shares.client)}, NPL ${u(shares.npl)}. Each share is its own recovery record and its own posting, all three made at the moment of approval. First Ali's: its share becomes a receivable (a promise Ali owes NPL) and comes off the loss jar.`,\n  T41b: `The sender's share, the same way: a receivable from the sender, off the loss jar.`,\n  T41c: `The client's share is handled by undoing that part of the make-good: the client's promise and its jar at Ali both drop by ${u(shares.client)}, and NPL takes that much back into its pool. Nothing is owed by anyone, so this recovery counts as received at once. The loss jar ends at NPL's own share, ${u(shares.npl)}.`,"),
  ("  T41: [`split: Ali ${u(shares.partner)} + sender ${u(shares.sender)} + client ${u(shares.client)} + NPL ${u(shares.npl)} = ${u(lossAmt)}`, `loss jar: ${u(lossAmt)} − ${u(shares.partner + shares.sender + shares.client)} recovered = ${u(shares.npl)} left, NPL's own share`],",
   "  T41a: [`split: Ali ${u(shares.partner)} + sender ${u(shares.sender)} + client ${u(shares.client)} + NPL ${u(shares.npl)} = ${u(lossAmt)}`],\n  T41c: [`loss jar: ${u(lossAmt)} − ${u(shares.partner + shares.sender + shares.client)} recovered = ${u(shares.npl)} left, NPL's own share`],"),
  ("[\"T39\", \"T40\", \"T41\", \"T42\", \"T43\"]", "[\"T39\", \"T40\", \"T41a\", \"T41b\", \"T41c\", \"T42\", \"T43\"]"),
  ("the list of changes asked of the ERD (proposed D46).", "the changes put into the ERD as D46 (v5.7), amended in v5.8 and propagated in v5.9."),
])
print("done")
