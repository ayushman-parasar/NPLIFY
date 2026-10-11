# NPLify — Change list, 11 October 2026 (late), ERD v5.8 → v5.9

The corrections of a cross-document review of the ERD, the Ledger Posting Design and the Reading Companion, applied with `scripts/apply-v5.9.py` (model) and `scripts/apply-v5.9-docs.py` (document builders). No new decision: D46 and its amendment propagated to every passage that still described the pre-D46 ledger. Verified with `scripts/check-nplify-pack.py` (clean on v5.9; 38 items on v5.8).

## What changed (no new decision; D46 propagated)

ERD
- Invariant 1 restated: balanced per currency and, separately, per ownership tag.
- Invariant 31 restated: after a collection-side loss the part stays verified (NPL's funds stand in); reversed only when Management unwinds the deal.
- Invariant 44: "no later transaction touches RESELL_REVENUE or RESELL_COST" now says "in the invoice currency"; the cash-rounding surplus is posted to RESELL_REVENUE in the currency received.
- `SETTLEMENT_LINE.outcome` gains `short`, so invariant 40 ("every released line ends confirmed, short or returned") is a check on the column.
- `LOSS_RECOVERY`: one transaction per state change (agreed, received), both under source LossRecovery.
- `LOSS_EVENT` gains `pool_funded`, `wallet_funded`, `funding_reference`.
- `DEAL.rate_reused_from_deal_id` note names VAR_RATE_HONOUR (was VARIANCE).
- Diagram 3c note (loss events) and the Diagram 4 notes rewritten for D46: ownership events, the full source list, the sender's share as a receivable, the resale component, the full approval-action list including earnings_offset.
- Decision texts D24, D29, D45 name VAR_FX_TIMING, VAR_CUTOFF, VAR_RATE_HONOUR.
- §6: a "v5.9 — Corrections" entry; the New / Changed / Views headings now read "(v5.3 to v5.9)"; the dependent-documents table lists the D46 impacts on Lifecycle & Approvals, Roles & Visibility, Configuration Schema and the Reading Guide, drops the stale Calculation Specification v1.0 → v1.1 row, and says 61 transactions.
- Status paragraph: v5.9 sentence first; the stale v5.5 sentence rephrased; the regenerated edition number follows the draft.
- §3c and B.4 headings say shares (not referrals) and recoveries; §7 question 2 and the Appendix A.1 rebate row brought into line; the LEDGER_TRANSACTION → LEDGER_POSTING label says "balanced per currency and per owner".

Ledger Posting Design
- T41 split into T41a (partner share agreed), T41b (sender share agreed), T41c (client share, received at once): one LOSS_RECOVERY row and one transaction per share, as D46 (2) and rule 7 require. Balances after the recoveries are unchanged.
- §24 item 2: recoveries under source LossRecovery (was LossEvent); items 1, 2 and 8 note the v5.9 corrections.
- §22 gains a LossRecovery row; §23 lists earnings_offset; §4 names LossRecovery among the sources and "names" (not "asks for") the source record; the "What changed" box points at Section 24 and no longer says "proposes".
- Chart of accounts: the COLLECTED remark about CO in a reseller project replaced; the FX_RESULT row says it replaces FX_CLEARING (not FX_RESULT).
- Rule 1 states the one-transaction-per-state-change convention; rule 12, T7, T16 and the identities say "outcome sent" (the ERD field), not "state sent".
- §4 component table: earnings also on the client-owned lines of an offset or retained margin; VAR_FX_TIMING removed from the variance row.
- T33 note uses payout_currency (basis pct_of_partner_fee is dropped); T40 cites the new LOSS_EVENT funding fields; T49 points at T17; §1 and §21 no longer say "in transit".
- Identity "Reseller revenue is intact" worded per currency.

Companion
- INTRANSIT removed from the jars table; the PAYABLE row explains that sent money is a mark on the payout line, not a jar.
- Closing note: D46 applied in v5.7, amended in v5.8, propagated in v5.9 (was "proposed D46").
- Pattern J: a share is owed to a markup-share party, not "a partner in the business"; T11 no longer cites T2 as a rounding-down case.
- T41a–T41c explanations and arithmetic.

## Not done, deliberately

- No new worked transactions for the unfunded make-good (MAKEGOOD / LOSS_PAYABLE), a settlement-side loss or a VAR_FX_TIMING loss; they stay prose-only (the check reports the two purposes without a worked line as information). Adding them is design work, not a correction.
- The Calculation Specification was regenerated as v5.9 later the same night: no formula change; the status note and the loss-split line (one LOSS_RECOVERY per share) are the only text differences, and the acceptance vectors are unchanged (16 of 17 of NPL's figures match; the one that differs is the sheet's receiver line, as before).
- App side: the document registry, the knowledge-base preamble, the README and the standalone map now say v5.9; the Calculation Specification entry stays v5.8.
