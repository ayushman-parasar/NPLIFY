#!/usr/bin/env python3
"""22 October 2026 — ERD v5.9 → v6.0 in data/erd.v5.json: the design-review decisions of 19–21 October 2026 (Andrew's
recommendations sections 1–10 and Pete's section 11, as applied to the client pack in feedback-npl-working/client-copy-v6.0-draft-r2).
Three tables (EMERGENCY_ACTION, PARTNER_STATEMENT_RECONCILIATION, OPENING_ENTRY), fields on REROUTE, OWN_WALLET, USER,
RECORD_LOCK, SETTLEMENT_LINE, LEDGER_TRANSACTION and PROJECT, invariants 45–50, decisions D47–D57, the corrected fee sheet
of 21 October, the scenario-catalogue notes, and the edition metadata. Refuses to run twice (checks the version).
    python3 scripts/apply-v6.0-model.py"""
import json, re
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data" / "erd.v5.json"
d = json.loads(P.read_text())
assert d["version"] == "5.9", f"expected v5.9, found {d['version']}"
E, R, INV = d["E"], d["R"], d["INV"]

def add_fields(name, rows, change):
    e = E[name]
    names = {f[0] for f in e["f"]}
    for r in rows:
        assert r[0] not in names, f"{name}.{r[0]} exists"
        e["f"].append(r)
    e.setdefault("ch", []).append(change); e["v"] = "changed"

def set_note(name, field, note):
    e = E[name]
    f = next(f for f in e["f"] if f[0] == field)
    while len(f) < 4: f.append("")
    f[3] = note

# ------------------------------------------------------------------ fields on existing tables (section 1, 3, 4, 5, 9)
set_note("REROUTE", "phase", "pre_collection / post_collection / post_conversion (v6.0, D47 scope: a post_conversion reroute starts from a leg in Converted — the converting partner converts the balance back to the collection currency, pays it to NPL's own wallet, NPL forwards it to the alternate partner, which converts at its own rate of the day)")
set_note("REROUTE", "outcome", "via_own_wallet / refund_sender; for phase post_conversion only via_own_wallet")
add_fields("REROUTE", [
    ["return_conversion_id", "int", "FK", "nullable; BALANCE_CONVERSION — the conversion back to the collection currency at the first partner, owned by this reroute, no markup; set only when phase = post_conversion"],
    ["second_conversion_id", "int", "FK", "nullable; CONVERSION — the conversion at the alternate partner that completes the reroute; the leg's client net is unchanged and the difference between what the alternate partner delivers, less its stated cost, and the client net posts to VAR_CONVERSION (Ledger Posting Design, Pattern O)"],
    ["rate_difference", "decimal", "", "nullable; the signed difference in the payout currency, NPL's gain or cost; equals the VAR_CONVERSION line of the second conversion"],
    ["ratified_by", "int", "FK", "USER, Management — a post_conversion reroute needs Management approval in addition to Finance's, because NPL's wallet holds client money in the meantime"],
], "v6.0 (NPL decision of 20 October 2026, option 2): phase post_conversion; + return_conversion_id, second_conversion_id, rate_difference, ratified_by")
E["REROUTE"]["desc"] += " v6.0: a reroute after conversion (phase post_conversion) is the fourth custody case; the leg's pricing stamp and client net stay untouched and only where the balance rests moves."

E["OWN_WALLET"]["desc"] += " v6.0: client money may rest in NPL's own wallet in four cases, not three — an approved reroute before conversion, a reroute after conversion (REROUTE.phase post_conversion), a collection bridge within custody_max_hours, and an own-desk leg; role reroute_contingency serves both reroute phases and the CUSTODY view names the reroute and its phase for every resting balance."
E["OWN_WALLET"].setdefault("ch", []).append("v6.0: four custody cases (reroute after conversion added)")

add_fields("USER", [["person_ref", "string", "", "the natural person behind the account, the same value on every account that person holds (a Finance user's Finance account and the Operations-role account they use for cover); APPROVAL.approved_by is refused when its person_ref equals requested_by's; shown on the users-and-access report"]],
           "v6.0 (section 3, absence cover): + person_ref")
add_fields("RECORD_LOCK", [
    ["lock_expires_at", "datetime", "", "locked_at plus the project's lock_idle_minutes (THRESHOLD, default 15), moved forward on every save; a lock past this time is treated as released"],
    ["released_at", "datetime", "", "nullable; set on save, cancel, expiry or clearance; the row is kept, never deleted"],
    ["cleared_by", "int", "FK", "nullable; USER, Management, when the lock was cleared rather than released by its holder"],
    ["release_reason", "string", "", "saved / cancelled / expired / cleared; every value is also written to AUDIT_LOG"],
], "v6.0 (NPL decision of 20 October 2026): a lock is released on save or cancel, expires after a fixed idle time, can be cleared by Management, and is recorded in AUDIT_LOG")
E["RECORD_LOCK"]["desc"] = "An edit lock on any record. v6.0: released on save or cancel, expired after the project's idle time (THRESHOLD lock_idle_minutes, default 15 minutes), clearable by Management; every release is written to AUDIT_LOG; at most one open lock per record (Appendix C)."

add_fields("SETTLEMENT_LINE", [
    ["released_at", "datetime", "", "when the partner released the money (outcome becomes sent); the promise is discharged at this moment"],
    ["expected_confirmation_by", "datetime", "", "released_at plus the rail's expected time (SETTLEMENT_RAIL); a line still sent after this time is on the exception list"],
    ["confirmed_at", "datetime", "", "nullable; set when the line ends confirmed, short or returned, from the CONFIRMATION or SETTLEMENT_RETURN row"],
], "v6.0 (NPL decision of 20 October 2026): the “sent, not yet confirmed” state is shown by name and aged; + released_at, expected_confirmation_by, confirmed_at")
add_fields("LEDGER_TRANSACTION", [["corrects_period", "string", "", "nullable; YYYY-MM, the month a correction belongs to when it is posted in a later month (Ledger Posting Design, rule 11a); reports by deal date use it, reports by posting date ignore it"]],
           "v6.0 (section 5): + corrects_period — corrections never move a reported month")
add_fields("PROJECT", [["is_test", "bool", "", "default false; a flagged dummy twin project for scripted test deals (Cutover Approach, Section 3); the pre-copy filter removes the project and every row that references it, through its deals, settlements, approvals, evidence and postings"]],
           "v6.0 (NPL decision of 20 October 2026): + is_test — the test flag is at project level, one dummy twin per real project")

# ------------------------------------------------------------------ three new tables
E["EMERGENCY_ACTION"] = {"d": "ledger", "col": 8, "v": "new", "ch": ["new in v6.0 (D47)"],
  "desc": "An immediate control applied by Finance and ratified by Management after the fact: a partner suspended, a destination frozen, or a partner's cutoff overridden for a day. It takes effect the moment it is applied, on every deal and settlement it touches, and is lifted if Management does not ratify it within one business day. It is the record behind the controlled action emergency_suspend (Lifecycle & Approvals, section 5). While state = applied or ratified, a partner_suspend blocks new pricing, conversion instructions and settlement releases on every partner pair of the partner configuration; a destination_freeze blocks settlement lines to the account; a cutoff_override replaces the effective cutoff for that day. Every state change is written to AUDIT_LOG; deals in flight follow the three mid-deal cases of the Lifecycle & Approvals document.",
  "f": [["id", "int", "PK"],
        ["kind", "string", "", "partner_suspend / destination_freeze / cutoff_override"],
        ["subject_type", "string", "", "PartnerConfig (partner_suspend) / DestinationApproval (destination_freeze) / Partner (cutoff_override)"],
        ["subject_id", "int", "", "the row of subject_type; checked by the same generic trigger as the other type-plus-id references (Appendix C)"],
        ["cutoff_time", "time", "", "nullable; the cutoff that applies instead, for kind cutoff_override; mirrors a PARTNER_CUTOFF_OVERRIDE of kind extension or early_close recorded at the same time"],
        ["reason", "string", "", "mandatory"],
        ["applied_by", "int", "FK", "USER, Finance"],
        ["applied_at", "datetime", "", "takes effect at once"],
        ["ratified_by", "int", "FK", "nullable; USER, Management, never equal to applied_by"],
        ["ratified_at", "datetime", "", "nullable; must be within one business day of applied_at"],
        ["lifted_at", "datetime", "", "nullable; set when Management lifts it, declines to ratify it, or the ratification window passes"],
        ["state", "string", "", "applied / ratified / lifted"]]}
E["PARTNER_STATEMENT_RECONCILIATION"] = {"d": "ledger", "col": 8, "v": "new", "ch": ["new in v6.0 (section 5, Pattern Q)"],
  "desc": "One row per reconciliation of a partner's statement with the ledger, for one partner configuration, currency and statement date (Ledger Posting Design, Section 20, “The reconciliation record”; Pattern Q). Filled in by Finance at every evening reconciliation of the parallel run and at every month end after go-live; the screen is built in Phase 2 (M7). For every active partner configuration and currency there is a row for every business day of the parallel run and for every month end afterwards; a row with state difference_open stays on the exception list until it is resolved.",
  "f": [["id", "int", "PK"],
        ["partner_config_id", "int", "FK", "the partner as used in the project"],
        ["currency", "string"],
        ["statement_date", "date", "", "the date the partner's balance is stated for"],
        ["statement_ref", "string", "", "the partner's statement or screenshot, in the file store"],
        ["partner_balance", "decimal", "", "what the partner reports it holds for NPL in this currency"],
        ["ledger_client_balance", "decimal", "", "Σ CL.<PARTNER>.<CCY>.COLLECTED + DUE at the statement moment"],
        ["ledger_pool_balance", "decimal", "", "CO.<PARTNER>.<CCY>.POOL at the statement moment"],
        ["sent_unconfirmed", "decimal", "", "Σ released lines not yet confirmed at that moment (the partner may or may not have deducted them)"],
        ["difference", "decimal", "", "partner_balance − (ledger_client_balance + ledger_pool_balance), stated after allowing for sent_unconfirmed"],
        ["cause", "string", "", "nullable; none / fee_not_booked / timing / in_transit / partner_error / ledger_error"],
        ["true_up_transaction_id", "int", "FK", "nullable; the LEDGER_TRANSACTION that cleared a difference (a true-up, never an edit)"],
        ["state", "string", "", "agreed / difference_open / resolved"],
        ["reconciled_by", "int", "FK", "USER, Finance"],
        ["reconciled_at", "datetime"],
        ["resolved_by", "int", "FK", "nullable; USER, Finance (Management when a true-up is posted)"],
        ["resolved_at", "datetime", "", "nullable"]]}
E["OPENING_ENTRY"] = {"d": "ledger", "col": 7, "v": "new", "ch": ["new in v6.0 (D55, opening entries replace the backfill)"],
  "desc": "One row per opening balance entered on the opening date (Cutover Approach, Section 4; Ledger Posting Design, Pattern R): what it is, where it was verified, who approved it and the posting it produced. The opening date is the first day of the parallel run; every balance the sheets show is entered as a verified opening entry, posted once against CO.NONE.<CCY>.OPENING_BALANCE on the company side or between the client's jar and the project's promise on the client side, and never again.",
  "f": [["id", "int", "PK"],
        ["project_id", "int", "FK"],
        ["partner_config_id", "int", "FK", "nullable; the partner the balance rests at, when it does"],
        ["currency", "string"],
        ["kind", "string", "", "client_collected / client_due / sender_credit / shortfall / pool / rebate_receivable / share_receivable / share_payable / loss_receivable / earnings_receivable / vendor_payable / resale_receivable / month_volume"],
        ["receiver_group_id", "int", "FK", "nullable; required for client_due (the entitlement it opens)"],
        ["sender_id", "int", "FK", "nullable; the sender a client_due or sender_credit line belongs to, so the split by sender is kept"],
        ["party_id", "int", "FK", "nullable; markup-share party, for share lines"],
        ["amount", "decimal", "", "in currency; for month_volume the month-to-date Σ amount_in in the tier's volume currency"],
        ["as_of", "date", "", "the opening date"],
        ["sheet_ref", "string", "", "the sheet and row it reproduces"],
        ["evidence_ref", "string", "", "the partner statement, wallet balance or invoice it was verified against"],
        ["verified_by", "int", "FK", "USER, Finance"],
        ["approved_by", "int", "FK", "USER, Management, never equal to verified_by"],
        ["ledger_transaction_id", "int", "FK", "nullable; the Opening transaction posted for it (none for month_volume, which seeds PROJECT_MONTH_VOLUME)"],
        ["state", "string", "", "listed / verified / approved / posted"]]}
set_note("LEDGER_ACCOUNT", "purpose", next(f for f in E["LEDGER_ACCOUNT"]["f"] if f[0] == "purpose")[3] + "; v6.0: + OPENING_BALANCE (CO.NONE.<CCY>.OPENING_BALANCE, equity: the other side of every opening entry that is NPL's own or owed to or by NPL on the opening date, Pattern R)" if len(next(f for f in E["LEDGER_ACCOUNT"]["f"] if f[0] == "purpose")) > 3 else "v6.0: + OPENING_BALANCE (CO.NONE.<CCY>.OPENING_BALANCE, equity: the other side of every opening entry that is NPL's own or owed to or by NPL on the opening date, Pattern R)")
E["LEDGER_ACCOUNT"].setdefault("ch", []).append("v6.0 (D55): + purpose OPENING_BALANCE (equity)")
set_note("LEDGER_TRANSACTION", "source_type", (next(f for f in E["LEDGER_TRANSACTION"]["f"] if f[0] == "source_type")[3] if len(next(f for f in E["LEDGER_TRANSACTION"]["f"] if f[0] == "source_type")) > 3 else "") + "; v6.0: + Opening (one transaction per OPENING_ENTRY row, on the opening date only, Pattern R); Reroute with phase post_conversion posts Pattern O")
E["LEDGER_TRANSACTION"]["ch"].append("v6.0 (D55): source + Opening")

d["ORDER"]["8"].insert(d["ORDER"]["8"].index("RECORD_LOCK") + 1, "EMERGENCY_ACTION")
d["ORDER"]["8"].insert(d["ORDER"]["8"].index("EMERGENCY_ACTION") + 1, "PARTNER_STATEMENT_RECONCILIATION")
d["ORDER"]["7"].append("OPENING_ENTRY")

# ------------------------------------------------------------------ relationships
R.extend([
    ["USER", "EMERGENCY_ACTION", "refs", "applied_by", "applied by (Finance) / ratified by (Management)", "1 : n", "new"],
    ["PARTNER_CONFIG", "PARTNER_STATEMENT_RECONCILIATION", "refs", "partner_config_id", "statement reconciled", "1 : n", "new"],
    ["USER", "PARTNER_STATEMENT_RECONCILIATION", "refs", "reconciled_by", "reconciled / resolved by", "1 : n", "new"],
    ["LEDGER_TRANSACTION", "PARTNER_STATEMENT_RECONCILIATION", "refs", "true_up_transaction_id", "true-up posted", "1 : 0..1", "new"],
    ["PROJECT", "OPENING_ENTRY", "owns", "project_id", "opening balances", "1 : n", "new"],
    ["PARTNER_CONFIG", "OPENING_ENTRY", "refs", "partner_config_id", "balance rests at", "1 : n", "new"],
    ["RECEIVER_GROUP", "OPENING_ENTRY", "refs", "receiver_group_id", "entitlement opened", "1 : n", "new"],
    ["SENDER", "OPENING_ENTRY", "refs", "sender_id", "split by sender kept", "1 : n", "new"],
    ["MARKUP_SHARE_PARTY", "OPENING_ENTRY", "refs", "party_id", "share lines", "1 : n", "new"],
    ["USER", "OPENING_ENTRY", "refs", "verified_by", "verified (Finance) / approved (Management)", "1 : n", "new"],
    ["LEDGER_TRANSACTION", "OPENING_ENTRY", "refs", "ledger_transaction_id", "Opening transaction", "1 : 0..1", "new"],
    ["BALANCE_CONVERSION", "REROUTE", "refs", "return_conversion_id", "conversion back (post_conversion)", "1 : 0..1", "new"],
    ["CONVERSION", "REROUTE", "refs", "second_conversion_id", "conversion at the alternate partner", "1 : 0..1", "new"],
    ["USER", "RECORD_LOCK", "refs", "cleared_by", "cleared by (Management)", "1 : n", "new"],
])

# ------------------------------------------------------------------ invariants 45–50
INV.extend([
    [["APPROVAL", "USER"], "The approver is never the initiator, on the person: APPROVAL.approved_by is refused when its USER.person_ref equals requested_by's, so a user holding two accounts cannot approve their own request (v6.0, Roles & Visibility rule 5a; enforced by a trigger, Appendix C)."],
    [["APPROVAL"], "An approval is valid only for the record version the approver saw: APPROVAL.record_version must equal the record's current version when the approval is applied, so two approvers at once leave exactly one winner and a changed record is re-approved (v6.0, Lifecycle & Approvals 6a)."],
    [["RECORD_LOCK", "AUDIT_LOG"], "At most one open lock per record (partial unique index on record_type, record_id where released_at is null); a lock is released on save or cancel, expires after the project's lock_idle_minutes, or is cleared by Management, and every release is written to AUDIT_LOG (v6.0, D49)."],
    [["EMERGENCY_ACTION", "AUDIT_LOG"], "An emergency action takes effect when applied by Finance and is lifted unless Management ratifies it within one business day; ratified_by is never applied_by; every state change is in AUDIT_LOG (v6.0, D47)."],
    [["OPENING_ENTRY", "LEDGER_TRANSACTION", "LEDGER_ACCOUNT"], "Opening entries post once, on the opening date, one transaction per OPENING_ENTRY row (source Opening): company-side balances against CO.NONE.<CCY>.OPENING_BALANCE, client-side balances between the client's jar and the project's promise; OPENING_BALANCE is never posted to again (v6.0, D55, Pattern R)."],
    [["PARTNER_STATEMENT_RECONCILIATION", "LEDGER_POSTING"], "For every active partner configuration and currency there is one reconciliation row per business day of the parallel run and per month end afterwards; a difference is cleared only by a true-up transaction, never by an edit; a row in state difference_open is on the exception list (v6.0, Pattern Q)."],
])

# ------------------------------------------------------------------ decisions D47–D57
d["DECISIONS"] += """

DESIGN REVIEW OF 19–21 OCTOBER 2026 (Andrew's recommendations, sections 1–10; Pete's design-document review, section 11; NPL's decisions recorded in "NPLify v5.9 Recommendations with Pete and Planned Actions"). Edition v6.0 of 22 October 2026.
D47 Emergency controls (19 October; option 2, "could"): Finance applies a partner suspension, a destination freeze or a cutoff override at once with a mandatory reason; Management ratifies within one business day or the action is lifted; the record is EMERGENCY_ACTION; the controlled action emergency_suspend; deals in flight follow the three mid-deal cases of Lifecycle & Approvals 2b. In the same decision NPL chose, for a partner that cannot pay out after conversion, the reroute after conversion (REROUTE.phase post_conversion, Pattern O): the converting partner converts back, NPL's own wallet holds the money briefly, the alternate partner converts at its own rate; Finance approves, Management ratifies; a fourth own-wallet custody case.
D48 Indirect data exposure (20 October): Operations keeps entering the partner's rate; that an Operations user could infer NPL's margin from the partner rate and the customer rate is accepted as a known inference, not a visibility breach; no P0 change and no accepted-risk note in the pack.
D49 Record locks and concurrency (20 October): a RECORD_LOCK is released on save or cancel, expires after a fixed idle time (THRESHOLD lock_idle_minutes, default 15 minutes), can be cleared by Management and is recorded in AUDIT_LOG (lock_expires_at, released_at, cleared_by, release_reason); approvals are valid only for the record version seen (APPROVAL.record_version, Lifecycle & Approvals 6a); every money-moving action carries an idempotency key (Ledger Posting Design rule 1a).
D50 Sent, not yet confirmed (20 October): NPL Finance confirmed and accepted the state as a named state on the settlement screens and the Finance log report of released, unconfirmed lines (Phase 2, M7); SETTLEMENT_LINE gains released_at, expected_confirmation_by, confirmed_at; a line past its expected confirmation is on the exception list; the promise was discharged on release (rule 13, confirmed as 13a) and nothing posts until the line ends confirmed, short or returned.
D51 Identifiers frozen (20 October; stays in P0): every worked transaction (T1–T61), acceptance vector (L1–L13, B1–B23), walkthrough (W, X), flow (F1–F10), common procedure (C1–C10, C6a), daily procedure (A.1–A.11) and exception playbook (D.1–D.5) has one identifier that is never renumbered or reused; a new item takes the next free number; the register is the Reading Companion's appendix. B rows are numbered in the order printed (19b); B18 (the receiver side of the Evo selected-senders deal) and B19–B23 (NPL's figures of 21 October for the four cases of 18a and the same-currency deal) were added under that rule.
D52 Ali's cutoff (20 October): 14:30 at GMT+8, cutoff_timezone Asia/Hong_Kong (the Configuration Schema example read Asia/Jakarta, GMT+7); no other change.
D53 Test data (20 October): the test flag is at project level, as before (PROJECT.is_test), not on the deal; every real project has a dummy twin project on staging in which the scripted test deals live; the pre-copy filter removes every flagged project with its deals, approvals, evidence and postings before production is loaded, and their figures are excluded from every count and balance shown to NPL.
D54 Recovery objectives and resilience (20 October): recovery inside one hour; a Multi-AZ managed PostgreSQL with automatic failover and two application tasks in two availability zones; a daily cross-region copy of the database snapshot; an auto-generated fallback workbook export refreshed every fifteen minutes to bridge the hours until restore; the recovery runbook (Cutover Approach 8a) with technical restore and resumption as two recorded sign-offs, rehearsed yearly; running cost about USD 165 to 245 a month, which NPL accepted with the decision.
D55 Opening entries in place of the backfill (20 October): the opening date is the first day of the parallel run; every balance the sheets show is entered as a verified opening entry (OPENING_ENTRY: listed → verified by Finance → approved by Management → posted), posted once against CO.NONE.<CCY>.OPENING_BALANCE (equity) on the company side and between the client's jar and the project's promise on the client side (Pattern R, T60, T61); open deals are entered through the normal screens in their current state; closed deals are not entered and the sheets remain their record; exit criterion 6 and assumptions 2 and 3 of the Cutover Approach restated.
D56 Scope and database-level rules (19 October): the whole model is in scope for Phase 1, nothing deferred, the proposal's milestone estimates stand; the seven type-plus-id references stay as they are and one generic database trigger checks on insert and update that the id exists in the table the type column names (option b); Appendix C of the ERD lists every constraint and invariant with the mechanism that enforces it and whether it must be at database level.
D57 Design-review additions without a separate NPL decision, applied in v6.0: breach rules when the two-week average cannot be trusted (Calculation Specification 2a; THRESHOLD kinds rate_min_observations, rate_fallback_spread_abs, rate_abs_tolerance), the below-margin warning (4a), the month-volume counter and what a void does to it (5a), the added vectors L10–L13 (18a) and 19a–19c, effective-date rules (Lifecycle 2a; Configuration Schema 1a and project states draft / validated / active), the time limits per approval stage (8a; THRESHOLD approval_time_limit, cutoff_warning_min), absence cover and scoped rights (Roles 5a), Patterns O, P, Q and R with T56–T61 and the reconciliation record (PARTNER_STATEMENT_RECONCILIATION), rules 1a, 11a and 13a, the schema change policy, the jobs' reliability rules and security operations (Architecture 6a), the handover list (Cutover 7a), the switch-day additions and exit criteria 9–13, the evidence checklist (Operating Procedures A.11), the quarterly access review (A.10), C6a and Part D exception playbooks, the fact-and-dimension classification of the tables, the four map pages, Part 4 of the Scenario Catalogue and the Test Strategy & Coverage document. 73 tables + 12 views, invariants 1–50, decisions D1–D57."""

# ------------------------------------------------------------------ open questions
d["OPENQ"].extend([
    {"q": "Review point (v6.0): workflow names — Pete found several procedure names in the Workflow Tree unclear; NPL to say which names to change",
     "blocks": "Nothing in the build; the Scenario Catalogue carries a placeholder (Part 2, 'Workflow names (awaiting NPL)')", "status": "open", "a": "", "impl": "", "ents": []},
    {"q": "Review point (v6.0): NPL's own figures for the four calculation cases its fee sheet had no line for (part collection, eight-decimal asset, tier reached exactly, tier crossed) and the same-currency deal",
     "blocks": "Vector set B", "status": "answered",
     "a": "NPL (21 October 2026): sender side 4,437 / receiver side 4,410; 7,304 / 7,259; 51,250; 10,250 + 10,225 = 20,475 (two portions confirmed); 4,860 — all five agree with the formula to the unit.",
     "impl": "v6.0: vectors B19–B23 in the Calculation Specification (§19, 19b, 19c) and vectors-v5.9.csv; B18 (the receiver side of the Evo selected-senders deal) taken from the corrected sheet of 21 October; B2 matches the corrected sheet (25,548).", "ents": ["FEE_STRUCTURE", "DEAL_FEE_TIER", "COLLECTION"]},
])

# ------------------------------------------------------------------ fee practice: the corrected sheet of 21 October
fp = d["FEE_PRACTICE"]
n = 0
for row in fp["fee_table"]:
    if row["client"] == "Evo USDT Collection" and "EUR 25,704 - 0.6% = 25,550" in row["customer_facing_calculation"]:
        row["customer_facing_calculation"] = row["customer_facing_calculation"].replace("EUR 25,704 - 0.6% = 25,550", "(29,325-(29,325*2%)) * 0.888977323 = 25,548"); n += 1
assert n == 2, n
fp["answers"].append("Corrected fee sheet (21 October 2026): the Evo receiver line now reads (29,325 − 29,325 × 2 %) × 0.888977323 = 25,548, the receiver's part on the principal (the 8 October sheet read EUR 25,704 − 0.6 % = 25,550, the receiver's part on the gross out); NPL confirmed on 19 October that the sheet, not the rule, was wrong. On 21 October NPL also supplied its own figures for the five cases the sheet had no line for (vectors B19–B23); all 23 B rows now match.")
fp["documents"] = [
    ["ERD & Data Model", "v6.0, 22 October 2026 — this model (73 tables, 12 views; EMERGENCY_ACTION, PARTNER_STATEMENT_RECONCILIATION and OPENING_ENTRY added), Appendix C constraints and the fact-and-dimension classification; client-facing edition served without status, change history, open questions or decision references"],
    ["Ledger Posting Design & Chart of Accounts", "v6.0, 22 October 2026 — the chart of accounts (with OPENING_BALANCE) and 61 worked transactions, Patterns O, P, Q and R (T56–T61), rules 1a, 11a and 13a, the reconciliation record; client-facing edition"],
    ["Ledger Patterns — Reading Companion", "v6.0, 22 October 2026 — the same worked transactions in plain language, plus the identifier register (T, L, B, W, X, F, C, A, D); client-facing edition"],
    ["Calculation Specification", "v6.0, 22 October 2026 — every formula with its rounding rule; breach rules 2a, the below-margin warning 4a, the month-volume counter 5a; vectors L1–L13 and B1–B23, 23 of 23 of NPL's own figures reproduced (B2 against the corrected sheet of 21 October); the regression gate 19a; client-facing edition"],
    ["Transaction Lifecycle & Approval State Machines", "v6.0, 22 October 2026 — the figures redrawn (reroute after conversion, the sent-not-yet-confirmed state), effective-date rules 2a, the three mid-deal emergency cases 2b, 36 controlled actions, concurrency rules 6a, the point of no return 7a, next action and time limits 8a; client-facing edition"],
    ["Roles & Visibility Matrix", "v6.0, 22 October 2026 — Operations ⊂ Finance ⊂ Management; absence cover, scoped rights and delegation 5a (USER.person_ref); client-facing edition"],
    ["Configuration Schema", "v6.0, 22 October 2026 — project states draft / validated / active and effective-date rules 1a, PROJECT.state and is_test, the six added THRESHOLD kinds, cross-entity rule 13, Ali's cutoff at Asia/Hong_Kong; client-facing edition"],
    ["Architecture & Stack Note", "v6.0, 22 October 2026 — Multi-AZ database, two application tasks, daily cross-region copy, fallback workbook, recovery inside one hour, running cost about USD 165–245 a month, schema change policy, job reliability, security operations 6a; client-facing edition"],
    ["Cutover Approach", "v6.0, 22 October 2026 — opening entries in place of the backfill (Section 4, Pattern R), dummy twin test projects, exit criteria 1–13, the switch-day additions, the handover list 7a, the recovery runbook 8a; client-facing edition"],
    ["Scenario Catalogue", "v6.0, 22 October 2026 — every client and project with its scenarios, flows F1–F10, walkthroughs W1–W8, Part 4 worked examples class by class; the figures are NPL's of 8–9 October and illustrative where marked"],
    ["Test Strategy & Coverage", "v6.0, 22 October 2026 — new: every test family with its purpose, result class and phase; the coverage map over the 27 sub-classes of the Workflow Tree; the regression gate; for every role"],
    ["Map pages", "v6.0 — the Top-Down Map, the Deal Flow on one page, the Workflow Tree (8 classes, 27 sub-classes, 92 procedures) and the Workflow Tree on one page; for every role"],
    ["ERD Reading Guide", "v1.0, 8 October 2026 — plain-language companion to the diagrams of v5.2; no longer in the served pack"],
    ["Model Gaps & Proposals", "v1.0, 8 October 2026 — staff working paper: gaps A–M with their ERD footprint; all applied in v5.3"],
    ["Fee Outlines (simulation workbook)", "v0.2, 8 October 2026 — staff working paper: every line of NPL's fee table as a fill-in outline with a worked calculation per pattern; NPL's answers of 8 October folded in"],
    ["Project Understanding", "v1.1 (with NPL's review comments) — staff working paper"],
]

# ------------------------------------------------------------------ scenario catalogue notes
sc = d["SCENARIO_CATALOGUE"]
sc["intro"] += " The fees, rebates and rates quoted in the scenarios are NPL's figures of 8 to 9 October 2026 (the fee sheet, corrected on 21 October for the Evo receiver line); where a figure is illustrative rather than NPL's, the scenario says so. Part 4 of the catalogue document walks one deal through the model class by class (X1–X4)."
sc["open_questions"].append({"q": "Workflow names: Pete found several procedure names in the Workflow Tree unclear; which should change?", "status": "awaiting NPL", "a": ""})

# ------------------------------------------------------------------ edition metadata
d["version"] = "6.0"
d["generatedAt"] = "2026-10-22"
d["DOC_META"] = "NPLify · P0 Technical Baseline. Entity-Relationship Diagram & Data Model, Draft v6.0. New XP Technologies Limited, 22 October 2026, Confidential — internal baseline document; the client-facing documents of the P0 pack are derived from it and served without status, change-history, decision references, draft markers or edition numbers. Supersedes v5.9 (11 October), v5.8, v5.7, v5.6, v5.5, v5.4, v5.3, v5.2, v5.1, v5.0, v4.0 and v3.0 in full."

tables = [n for n, e in E.items() if e["d"] != "view"]; views = [n for n, e in E.items() if e["d"] == "view"]
assert len(tables) == 73 and len(views) == 12, (len(tables), len(views))
assert len(INV) == 50
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("v6.0 model written:", len(tables), "tables,", len(views), "views,", len(INV), "invariants,", len(R), "relationships")
