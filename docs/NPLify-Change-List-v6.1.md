# NPLify — Change list, 28 and 29 October 2026, ERD v6.0 → v6.1

Round 2: the independent "NPLify v6.0 Critical & High-Priority Design Review" (22 findings, 22 October 2026) and the reviewer's
change request CR-01 (Email OTP), answered document by document between 26 and 28 October 2026 as review drafts
(`NPLify client pack/feedback-npl-working/round2/`, one folder per document with its change note) and applied as edition 6.1
on 28 October 2026 (`NPLify client pack/feedback-npl-working/stage2-v6.1/`, the deliverable). NPL's and New XP's decisions
are D58 (bank details, 26 October), D59 (round 2) and D60 (Email OTP) in the decision record (`data/erd.v5.json`, DECISIONS).

In the web app: the model file `data/erd.v5.json` is at v6.1 (`scripts/apply-v6.1-bank-details.py`, then
`scripts/apply-v6.1-round2.py`); each document's HTML and PDF are the builder's output; the four map pages are hand-edited
HTML with their PDFs rendered from it; `src/lib/documents.ts` serves the 6.1 files only.

## By finding (section of the review → where it is answered)

- 02 Cutover, critical (test-project deletion against the immutable ledger) — production is built by a clean-target extract from staging, nothing deleted; staging stays as the read-only record (Cutover §1, §3, §7, §10; ERD Appendix C "The extract closure"; Test Strategy G-FILTER).
- 02 Cutover, high (opening entries and in-flight deals) — the per-state opening mapping, "no step posts twice" (Cutover §4, step 6; DEAL.opening_entry_id; DEAL_GROUP.opening_source_ref; Test Strategy G-OPEN).
- 02 Cutover, high (a line that cannot be verified) — the partner's figure opened in full, the difference as a suspense line, Management's materiality no-go (Cutover §4 steps 3 and 3a; the SUSPENSE account; exit criterion 6).
- 03 Test Strategy, critical (fixture count) — 61 numbered, 67 with variants; Appendix A fixture manifest generated from the Ledger (`fixtures-manifest-v6.1.csv`).
- 03 Test Strategy, high (sub-class counts) — §6a per-procedure traceability, one test per case for the 48 money-moving procedures.
- 03 Test Strategy, high (external truth) — G-EXT, the partner's answer never arrives (Lifecycle 2d; Finance authorises the one retry).
- 05 Architecture, high (region failure) — one hour for a zone and for a region failure, live standby database in a second region, log and bucket replication, workbook every five minutes as two workbooks (Architecture §1, §6, §7; Cutover 8a; Test Strategy G-REST).
- 05 Architecture, high (jobs on two tasks) — persisted schedule, lease, checkpoints, sweep, three attempts, alarms by email to Finance (Architecture §4, §5; Test Strategy C-JOBS).
- 06 Configuration, high (risk override too broad) — NPL screens, the partners decide; Operations on a clear report, Management's second look otherwise; no Finance override (Configuration §4, rule 10; WALLET_SCREENING fields; ROLE_RIGHT screening_second_look).
- 06 Configuration, high (archetype regression) — what a clone does not carry; rule 15 activation gate; PROJECT.archetype_code, cloned_from_project_id; clone_confirmed_at.
- 07 Calculation, high (tier counter after opening) — opening_volume + legs priced from the opening date; vector L14, NPL's figures as B24 (24 of 24 match).
- 07 Calculation, high (rate anomaly flag) — a flagged version is a guard: prices nothing until Finance confirms (Calculation 2a; PARTNER_RATE_VERSION.status flagged; Lifecycle Figure 3).
- 08 Roles, high (compliance authority) — rule 11: three owners, no override right; the decision write-once.
- 08 Roles, high (sensitive economics outside the app) — rule 12: two workbooks, named accounts, no figures in alarms or incidents.
- 09 Lifecycle, high (compliance hold) — §2c holds: scope, allowed actions, who lifts, disposition, audit; DEAL.hold_kind, hold_ref; Test Strategy S-HOLD.
- 09 Lifecycle, high (point of no return) — §2d external instructions: prepared, acknowledged, executed; one open instruction per promise; instruction_ref, ack_status, ack_ref, retry_of; Test Strategy S-ACK.
- 10 Companion, high (example count) — the 61/67 convention on the cover; the F-T register row.
- 11 Ledger, high (opening-entry allocation) — "Granularity, and the three sums that must agree"; identity "Opening entries allocate, never aggregate".
- 11 Ledger, high (atomicity) — rule 1b: idempotency key, one database transaction, the instruction committed before the partner is called or told; LEDGER_TRANSACTION.idempotency_key; Test Strategy C-ATOM.
- 12 ERD, high (extract integrity) — the dependency closure published; the clean-production checks; audit retention explicit.
- 12 ERD, high (polymorphic sources, immutable evidence) — TYPE_REGISTRY; three checks for critical sources; evidence columns write-once and content-addressed.
- 14 Map pages, high (stale backfill text) — the map pages re-read against the documents; 93 procedures; 78 tables.
- CR-01 Email OTP — Lifecycle 2e and Figure 1b; CUSTOMER_APPROVAL and CUSTOMER_APPROVAL_EVENT; the switch on the project, the approver address and chat group on each sender (one chat group per sender); three thresholds; template email_otp_quote; four controlled actions; Roles rule 13; Configuration rule 16; Scenario story; Test Strategy S-OTP0 to S-OTP8 and R-OTP; Workflow Tree 3.1.5; Operating Procedures C11; the email service generic, NPL's answer (Resend) recorded in Architecture §7.

## Operating Procedures brought to the baseline (29 October 2026)

The reviewer could not see this document. At 6.1 it is reconciled: C2 and C3 screening decided from the provider's report with Management's second look and no Finance override; A.1 the flagged rate version; A.3 the Email OTP gate; A.8 the hold, the outcome-unknown instruction, bank account details, the dormant route; A.10 people joining and leaving, A.11 the health checks, A.12 the fallback workbook (the procedures the other documents cite); C11 Email OTP; Part C the clone reconfirm list.

## Figures corrected (29 October 2026, after the fix pass)

CUSTOMER_APPROVAL_EVENT drawn in Diagram 3a and TYPE_REGISTRY in Diagram 4 (both had been placed there by the definitions and the dictionary but not drawn); PARTNER, HOLIDAY and PARTNER_CUTOFF_OVERRIDE homed in Diagram 1a, where they are drawn; text that ran past the right edge of Diagrams 1b, 3a, 3c and 4 and of the Lifecycle's Figure 1 now fits; captions that the client edition's filter had left as "Changed since:" / "New since:" reworded (Diagrams 1a, 3b, 3c, 4, Cutover Figure 1) and a residue ".9." removed from the Lifecycle's Figure 1; the Configuration Schema's Figure 1 names PARTNER_CUTOFF_OVERRIDE in full; the Cutover's figure caption no longer speaks of the backfill. The note under each diagram is derived from the drawing, the ERD build refuses an undrawn table, and `scripts/check-round2.py` checks the drawings (figures section) and figure text.

## Email OTP template wording (29 October 2026, after the CR-01 gap check)

Two details of CR-01 that the documents had not stated: the approval email's code box says that the code is for this quote issue only, is used once and is void if any detail of the order changes (REQ-CA-03), and at or above the project's step-up amount the printed instruction is to paste the code and the order amount, the clause being omitted below that amount (REQ-CA-05). Written into Lifecycle & Approvals 2e "What the email carries" (page 10) and into the Configuration Schema's "The Email OTP card" paragraph and the email_otp_quote template, whose printed fields gain code_terms and stepup_clause (page 13). Nothing else changed in either document; both rebuilt, the pack and figure checks clean.

## Email OTP required per sender (29 October 2026, New XP's design decision; NPL to confirm)

A customer who will not name an approver address had no way through: with the project's switch on, the sender could not be quoted at all. The requirement is now per sender, which is what CR-01 itself specified (its toggle is per client, and clients with it off follow today's flow): SENDER gains email_otp_required, true by default while the project's switch is on; a sender marked not required is quoted and approved in its registered chat group as today, and every quote issue sent to it records "approval taken in chat, Email OTP not required for this sender" on the quote, the deal and the audit log; marking a sender not required removes a control, so Operations enters, Finance approves and Management approves with a recorded reason, and the exemption is listed on the quarterly review. Written into Configuration Schema (PROJECT, SENDER, the Email OTP card, rule 16, the worked example), Lifecycle & Approvals 2e "The settings, protected", Roles & Visibility rule 13 and the field groups, the ERD (SENDER, the Email OTP paragraph, Appendix C, Diagram 1b caption), Operating Procedures C11, A.3 and the quarterly review, the Scenario Catalogue's Email OTP section, the Test Strategy (S-OTP0, S-OTP1 to 8 criterion 4, R-OTP), the Workflow Tree procedure 1.3.4, the controlled-actions table (set_email_otp_settings) and the decision record (D60 amended). No new state, no new channel, no new table.

## The assistant's sixth source (29 October 2026)

The web app's assistant now answers from six sources: the sixth is the controlled-actions table of the Lifecycle & Approvals document (section 5) and the Roles & Visibility Matrix (section 4), 41 rows with the action, who initiates, who approves, when Management is added, what happens on rejection and the ROLE_RIGHT code, written to `data/controlled-actions.v6.1.json` by `scripts/build-controlled-actions-data.mjs` before every build. Any question of who may do or approve an action is answered from it first. The knowledge-base version logged on every question is now `erd-v6.1-kb3` (kb2 added the table, kb3 the per-sender Email OTP rule).

## Also in this edition

- Bank account details in the database (D58, 26 October): BANK_ACCOUNT_DETAILS and BANK_DETAILS_TEMPLATE; Roles rule 10.
- A sender's wallet source keeps its label, network and address (COLLECTION_SENDING_ENTITY, 28 October).
- The dormant partner pair (Scenario Catalogue; PARTNER_PAIR.status dormant; THRESHOLD route_unused_days).
- Running cost: about USD 260 to 410 a month (was 165 to 245 at 6.0): the second-region standby and the email service are new lines, and the primary database is db.t4g.medium rather than the micro class; AWS list prices of 29 October 2026 for Hong Kong and Singapore.
