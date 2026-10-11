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
- App side: the document registry, the knowledge-base preamble, the README and the standalone map now say v5.9.

## The rest of the pack at v5.9 (11 October 2026, late)

Five documents regenerated or written against ERD v5.9, the Ledger Posting Design v5.9 and the Calculation Specification v5.9; all numbered with the ERD edition. The "Scenarios & calculation samples" deliverable was dropped at NPL's request (the worked transactions and the acceptance vectors cover it).

- `scripts/controlled-actions.mjs` — one shared list of the 35 controlled actions (initiates, approves, escalates, on rejection, ROLE_RIGHT code), used by the Lifecycle and Roles documents so the two cannot drift.
- Lifecycle & Approvals v5.9 (`build-lifecycle-doc.mjs`): seven figures (deal leg with rate lock and loss event, settlement with cutoff and line outcomes, collection, conversion, reroute, loss event and recoveries, earnings offset), the controlled-actions table, 31 state tables, the aging list.
- Roles & Visibility Matrix v5.9 (`build-roles-doc.mjs`): eight field groups; every one of the model's 82 tables and views mapped (the build refuses otherwise) — 667 fields, 148 never shown to Operations; the matrix by module; the ROLE_RIGHT rows; nine enforcement rules; 16 acceptance tests; Appendix A generated from the model.
- Configuration Schema v5.9 (`build-config-doc.mjs`): all 33 configuration tables under their current names (PARTNER_ENTITY, COLLECTION_RECEIVING_ENDPOINT, DESTINATION_APPROVAL, MARKUP_SHARE_*, CLIENT, SYSTEM_SETTING, HOLIDAY, PARTNER_CUTOFF_OVERRIDE, MESSAGE_TEMPLATE, WALLET_SCREENING, FEE_TIER), rules and value sets of v5.9, twelve cross-entity rules, the Client 1 example re-expressed and validated by code (`docs/config-example-client1.json` regenerated).
- Architecture & Stack Note v5.9 (`build-architecture-doc.mjs`, new): NPL's architecture page expanded against the model — nine background jobs, the insert-only ledger enforced by privileges, triggers and a balance check at commit, the field filter at the API, every `_ref` field and where its content lives, outside services and their failure modes, environments (local, temporary staging, production), backups, cost, and seven decisions for NPL.
- Cutover Approach v5.9 (`build-cutover-doc.mjs`, new): NPL's plan — a parallel run of three to four weeks on staging with the sheets leading, earlier deals entered through the normal screens as real postings (no opening entries, no change to the ERD or the ledger), twelve reconciliation checks, eight exit criteria, a switch on a quiet day chosen a couple of days before, rollback, roles, assumptions.
- ERD v5.9 rebuilt: the dependent-documents table and the footer now say which documents are at v5.9; the document registry, the README and the documents group blurb updated; the Lifecycle v1.1, Roles v1.0 and Configuration v1.0 files stay in docs/ for the record but are no longer served.

## Client-facing pass (12 October 2026)

Every served document was regenerated so that it reads for NPL without New XP's working papers: no status or audience paragraphs, no "what changed since" boxes, no references to the decision record (D-numbers), to earlier editions (v5.x) or to the review questions (Q-numbers), and no renames or retirements in the text. The model data file is untouched; `scripts/client-facing.mjs` strips the references at render time (`hist` for descriptions, `note` for field notes, `clientFacing` over the whole page).

- ERD: the status paragraph, the invariants section, the change history (old §6) and the open questions (old §7) are gone; the data dictionary's history notes are stripped. The ERD is now the diagrams, the notes per domain, the derived views, the FRS reconciliation and the data dictionary.
- Ledger Posting Design: status, audience, "what changed", the Since column of the chart of accounts (and the retired INTRANSIT row) and old §24 removed. Companion: same pass.
- Calculation Specification: status and "what changed" removed; the fee-parts sentence no longer quotes the compounded figure.
- Lifecycle & Approvals: status, audience, "what changed" and the "where the Understanding document says two things" box removed.
- Roles & Visibility Matrix: status, audience, "what changed" and the acceptance tests (old §6) removed.
- Configuration Schema: status, audience, "what changed" and the import/export section (old §8) removed.
- Architecture & Stack Note: status, the "views, not stored balances" box and the files and outside-services sections (old §6–7) removed; no ERD additions are proposed (manual rates are ordinary market rates with an approval).
- Cutover: retitled Cutover Approach (see above).
- The check script `scripts/check-nplify-pack.py` was adjusted for the removed passages.

## Client-facing pass, second round (12 October 2026)

- No "Draft" marker and no edition number anywhere in a served document (title page, running header, footers, cross-references): stripped at render time by `clientFacing`. File names in `docs/` keep the edition for the record.
- The ERD Reading Guide (v1.0, against ERD v5.2) is no longer served; its files stay in `docs/`.
- The JSON downloads (calc-vectors.json, config-example-client1.json) are no longer offered on the documents page; the builders still write them.
- Scenarios page: the "NPL's answers to the operational questions" section is removed; every catalogue text is passed through `src/lib/client-facing.ts`, so no decision, edition or review-question reference is shown; the staff review section no longer names ERD editions.

