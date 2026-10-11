# NPLify — Change list, 10–11 October 2026 (ERD v5.6 → v5.8)

Every change made in the ledger-design work, per document. Decision D46 (ERD v5.7) and its amendment (ERD v5.8) record the model side; this list is the reference for what moved in each deliverable.

## ERD & Data Model (v5.6 → v5.7 → v5.8)

New tables
1. EARNINGS_OFFSET — NPL's converted margin at one partner swapped for the same value of the client's unconverted money at another, at the to-partner's rate of the day; names the receivables it recovers; Finance requests, Management approves. (v5.7)
2. LOSS_RECOVERY — one recovered share of a loss event (partner, sender or client): amount, state, reference, approver. (v5.7)

New views
3. RESELLER_MARGIN — resale invoice minus the vendor invoice it marks up, in the invoice currency; fixed when both are posted. (v5.7; paired through vendor_invoice_id in v5.8)
4. REMITTANCE_MARGIN — one deal's remittance earnings: fee parts less partner cost, plus or minus the forex true-up, less fees. (v5.7)
5. NPL_PROFIT — remittance earnings plus reseller earnings, each callable alone and together, per currency; one figure through REPORTING_VALUE. (v5.7)

Changed tables and columns
6. INVOICE: kind (vendor / resale) and sender_id for the customer of a resale invoice (v5.7); vendor_invoice_id linking a resale invoice to the vendor invoice it marks up (v5.8).
7. DEAL_GROUP: invoice_id now names the resale invoice the group collects (v5.7); invoice_amount (the part collected: advance, then balance) and invoice_rate (payout currency per invoice currency at pricing, the stored base of every reserved amount) (v5.8).
8. SETTLEMENT_LINE: invoice_id names the invoice a line discharges (vendor invoice for a vendor line, resale invoice for the margin line); obligation_discharged note defines reserved versus paid and the forex true-up. (v5.7, v5.8)
9. EARNINGS_RECEIVABLE: recovered_by_offset_id beside recovered_by_deal_id. (v5.7)
10. PARTNER_REBATE_RULE: payout_currency (v5.7); basis keeps pct_of_amount only, pct_of_partner_fee dropped (v5.8).
11. CURRENCY_PAIR.amount_rounding gains the value exact — bank transfers carry cents; unit rounding applies to cash hand-overs. (v5.7)
12. CONVERSION.residual_in defined as the margin kept unconverted in the collection currency, with EARN_GROSS recognised in that currency. (v5.7)
13. COLLECTION.state reversed is used only when a deal is unwound after a loss. (v5.7)
14. LEDGER_ACCOUNT.purpose: VARIANCE replaced by VAR_CONVERSION, VAR_CUTOFF, VAR_RATE_HONOUR, VAR_FX_TIMING; new LOSS_RECEIVABLE, MAKEGOOD, LOSS_PAYABLE, RESELL_REVENUE, RESELL_COST, VENDOR_PAYABLE, RESALE_RECEIVABLE, REMIT_CLAIM; INTRANSIT retired (v5.7); FX_CLEARING (v5.7) replaced by FX_RESULT, a profit-and-loss account per currency for NPL's own currency exchanges (v5.8). holder_type and kind notes updated.
15. LEDGER_TRANSACTION.source_type: + LossRecovery, Invoice, EarningsOffset. (v5.7)
16. LEDGER_POSTING: cost component resale; balanced per owner as well as per currency (v5.7); receiver_group_id on every promise line (v5.8).
17. SETTLEMENT: release discharges the promise; a return or a short confirmation re-raises it. CONFIRMATION posts only when short. (v5.7)
18. FEE_STRUCTURE: fee parts are percentages of the principal at the basis rate, never compounded; Evo fee facts (v5.7); target-out quotes apply the fee as a markup on the target (v5.8).
19. DEAL.amount_mode note: fixed_in takes the fee off the principal, target_out adds it on the target. (v5.8)
20. PROJECT.network_fee_policy: network fees are stated in USDT and are zero, with no posting, when none applies. (v5.7)
21. MARKUP_SHARE_ACCRUAL and PARTNER_REBATE_ACCRUAL are created and posted by the conversion they arise on. (v5.7)
22. ROLE_RIGHT gains the action earnings_offset; APPROVAL description updated. (v5.7)
23. PARTNER_CONFIG: the own desk holds NPL-GR's remittance balances as ordinary partner-coded client accounts (D23 stands). (v5.7)

Views restated (v5.8)
24. PROJECT_BALANCE = the balance of the DUE account per partner, over postings (was a sum of conversions' actual_out, which included NPL's margin).
25. GROUP_ENTITLEMENT = the sum of PAYABLE postings by receiver_group_id (was a sum over legs and lines).
26. INVOICE_BALANCE by kind: a vendor invoice's payable balance over released lines; a resale invoice's receivable balance over collected groups.

Invariants
27. Restated in v5.7: 16 (ownership events), 25 and 26 (accruals at conversion), 28 and 39 (named variance accounts).
28. New in v5.7: 40 (promise discharged on release; every released line accounted for), 41 (a pool negative only until the next conversion squares it), 42 (fee parts on the principal), 43 (an earnings offset neutral for the client), 44 (reseller revenue intact by construction).
29. Restated in v5.8: 7 (entitlement conservation over postings), 16 (two lists: client → company and company → client), 23 (the two-invoice case), 42 (the target-out rule added), 44 (a cash-rounding surplus is revenue, never a forex result).

Relationships, record and notes
30. New relationship rows for every table and column above; the view links of PROJECT_BALANCE, GROUP_ENTITLEMENT and INVOICE_BALANCE rewired to LEDGER_POSTING and DEAL_GROUP. (219 relationships)
31. Decision record: D46 in full; the amendment text; edition lines for v5.7 and v5.8.
32. Notes (Ledger & controls, Deal lifecycle), seven new fee-practice answers (fee parts on the principal, Evo fee types, EUR → EUR 2.8 %, where NPL's earnings sit, pools with no balance in the fee's currency, money in transit, NPL-GR's two invoices), the document list, an answered review point, DOC_META and the conventions line.

ERD document (PDF)
33. Section 6: the D46 entry; the "v5.8 — Amendment of 11 October, evening" entry; rows for the new and changed tables, the restated views and invariants; the dependent-documents table; the status paragraph.
34. Diagrams: EARNINGS_OFFSET on 3b, LOSS_RECOVERY on 3c, INVOICE / EARNINGS_OFFSET / LOSS_RECOVERY referenced on 4; titles of 3b and 3c.
35. Personal names: the knowledge-base heading that still said "Sud's comments" and the example configuration's codes (SUD, RAJ, AYUSH, NAVEEN) anonymised.

## Ledger Posting Design & Chart of Accounts (v1.1 → v1.2 → v5.6 → v5.7 → v5.8)

1. Rebuilt from scratch against the current ERD by a new generator; numbered with the ERD edition from v5.6 on (v1.2 retired).
2. Chart of accounts: every purpose with the edition it entered; FX_RESULT; INTRANSIT marked retired; MAKEGOOD / LOSS_PAYABLE; the reseller purposes.
3. Eleven posting rules, including: balanced per owner as well as per currency; accruals post with the conversion; variances by kind; a loss is NPL's first; NPL-GR is the client of its own remittance project; earnings may be kept unconverted and offset; sent is discharged; the views are sums over postings; rounding has an owner; ownership movements listed in both directions.
4. Cost-component table with resale; transaction sources with Invoice, EarningsOffset, LossRecovery.
5. An In / Out column on every posting table: debit = IN (value goes to this account), credit = OUT (value comes from it), with the kind word (money, promise, earned, cost) and a legend in Section 5.
6. Running example re-priced: Evo on the market rate with sender 1.4 % (the other type 1 %) and receiver 0.6 %, both on the principal; Ali assumed 1 % inside its rate (0.8910); Jeton 1.25 %; Aquanow 0.8 % with a 0.3 % rebate; EUR → EUR 2.8 % split 50/50.
7. Collections shown as their own transactions (T3a, T22a, T52a) instead of merged into conversions.
8. Pattern C: a settlement discharges the promise on release (T7, cents included); a full confirmation posts nothing (T8); a short one re-raises the promise (T9); the top-up note explains a negative pool (T10); the THB round-up is a cash payout (T11).
9. Pattern D: a hop posts once, when the far side credits (T16/T17); network fee 4.20 USDT, absent when none applies.
10. Pattern F: a return re-raises the promise (T24); new T24a squares a negative pool with NPL's own USDT through FX_RESULT.
11. Pattern H: USDT balance conversion exact (no dust).
12. Pattern J: markup shares and rebates accrued with the conversion; npl_pays and party_retains; monthly statements with true-ups (T30–T35); Jeton's rebate noted on T14.
13. Pattern K: the three rate variances to their own accounts (T36–T38), with a pool shortfall allowed.
14. Pattern L: loss booked to NPL first with the client made whole (T40), recoveries share by share under source LossRecovery (T41–T43), partial-loss note.
15. Pattern M (NPL-GR) rebuilt three times to NPL's description: two invoices in EUR posted once; the remittance deal as an ordinary client deal with NPL-GR as the client; THB collected as cash with the 2 % markup on the target, rounded to the thousand; instalments with the forex true-up per line; both payout routes (Ali, own desk); the margin line with the cash-rounding surplus posted as reseller revenue in USDT; FX_RESULT for the EUR claim paid in USDT; discharge rates printed as USDT per EUR (invoice_rate 1.148369, discharge 1.142504); the group's invoice_amount and invoice_rate named.
16. Pattern N new: earnings kept in the unconverted balance (T55) and offset between partners at the partner's rate of the day (T54), with a figures table and a change-in-balances table.
17. Identities rewritten: client assets = client liabilities over postings; PAYABLE = Σ GROUP_ENTITLEMENT by construction; PROJECT_BALANCE is the DUE account; every released line accounted for; a pool negative only until squared; reseller revenue intact; remittance margin per deal.
18. Reports section: remittance earnings, reseller earnings and NPL's profit, each callable alone.
19. Who sees what written against ROLE_RIGHT.
20. Section 24: the D46 list, marked where the v5.8 amendment changed it, plus the fee-arithmetic (target-out) and views-over-postings items.
21. Corrections from the independent re-derivation: T47 client-net label, EARN_GROSS wording for fee_in_rate partners, the payout rounding field on T11, the Pattern N table label, the FX_RESULT row in the reseller balances.

## Ledger Patterns — a Reading Companion (new, v5.6 → v5.8)

1. A new landscape document: the same 59 transactions, each with a plain-language "What is happening" box beside it (above it when the table is tall), written for a reader with no bookkeeping background.
2. "The arithmetic" under every explanation: rate, fee parts and amounts, line by line.
3. An opening page on the jar idea, the columns and the twelve kinds of jar that appear most; FX_RESULT added to the jars table.
4. A two-sentence introduction per pattern; Pattern E rewritten to separate a wrong posting from a cancelled deal; T32 says how the side holding the commission is tracked; T37 says NPL may defer a bad-rate conversion; T40 covers a partial loss.
5. Wording updated with every ledger change (sent is discharged, FX_RESULT, the surplus as revenue, discharge-rate direction).

## Calculation Specification (v1.0 → v5.7 → v5.8)

1. Rewritten against the current ERD and ledger, numbered with the ERD edition; it imports the ledger's pricing function, so its figures and the ledger's posting tables are one computation.
2. Twenty sections, each a formula naming the ERD fields it reads: rate basis and the D28 direction rule; fee parts on the principal (confirmed rule, with the fee sheet's receiver line marked as the one to correct); fixed and variable modes with the minimum-margin check; tiers; fixed-in and target-out amount modes (the fee as a markup on the target); customer-facing figures; what the partner delivers and EARN_GROSS for both partner pricings; the rounding menu and cash rounding; same-currency pairs; shares and rebates (pct_of_amount only); the four variance kinds; earnings retained and offset; invoice instalments through invoice_rate and discharge_rate; the reseller arithmetic and NPL_PROFIT; pools, loss splits, balance conversions, returns, fees; reporting values; acceptance.
3. Worked arithmetic under the key sections, using the ledger's figures.
4. Acceptance vectors A: the ledger's nine worked deals.
5. Acceptance vectors B: seventeen of NPL's own fee-sheet figures recomputed; sixteen match exactly; the Evo receiver line marked "sheet differs"; the GDC vector labelled as a rate of 1 USDT per USD.
6. calc-vectors.json regenerated alongside.

## Web app and map

1. Document pack: ERD, Ledger Posting Design, Reading Companion (new entry) and Calculation Specification at v5.8; the configuration example's codes anonymised.
2. Knowledge base: header text at v5.8 with the D46 and amendment summary; rules say v5.8 and D1–D46; the "Sud's comments" heading replaced by "NPL's review comments"; the Project Understanding blurb likewise.
3. Map header and assistant note at v5.8, 70 tables + 12 views; README at v5.8.
4. Standalone map refreshed and the map artifact republished (versions 39, 40, 41) at the same link.

## Scripts (reproducibility)

1. apply-v5.7-d46.py and apply-v5.7-d46-amendment.py — the model patches.
2. build-ledger-doc.mjs (importable; exports the pricing function and figures), build-ledger-companion.mjs (new), build-calc-spec.mjs (new); build-erd-doc.mjs and erd-diagram-defs.mjs updated; build-config-doc.mjs and build-finance-docs.mjs codes anonymised.
