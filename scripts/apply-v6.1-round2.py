#!/usr/bin/env python3
"""Round 2, stage 2 (28 October 2026): the model items agreed in the round-2 review of the v6.0 design review
(findings of 22 October 2026) and the reviewer's change request CR-01 (Email OTP). Applied together with the
edition bump 6.0 -> 6.1. Idempotent: refuses to run twice (TYPE_REGISTRY is the marker).

Items (the letters are the approval list of 28 October, evening):
 A1 holds and external instructions   A2 screening second look   A3 flagged rate, dormant pair, month-volume view
 A4 idempotency key, suspense (Ledger builder), opening-entry link, remittance-log number
 A5 clone source and per-row confirmation   A6 TYPE_REGISTRY, evidence write-once, extract audit record, retention setting
 A7 Email OTP tables, columns, thresholds, template code, actions
"""
import json, sys
P = "data/erd.v5.json"
d = json.load(open(P, encoding="utf-8"))
E, R, INV = d["E"], d["R"], d["INV"]
if "TYPE_REGISTRY" in E: sys.exit("already applied")
TAG = "v6.1 (round 2, 28 October 2026)"

def add_fields(table, fields, note):
    e = E[table]
    names = [f[0] for f in e["f"]]
    for f in fields:
        if f[0] in names: raise SystemExit(f"{table}.{f[0]} exists")
        e["f"].append(f)
    e.setdefault("ch", []).append(f"{TAG}: {note}")
    if e.get("v") not in ("new",): e["v"] = "changed"

def set_note(table, field, text):
    e = E[table]
    for f in e["f"]:
        if f[0] == field:
            while len(f) < 4: f.append("")
            f[3] = text; return
    raise SystemExit(f"{table}.{field} not found")

# ---------------------------------------------------------------- A1 holds and external instructions
add_fields("DEAL", [
    ["hold_kind", "string", "", "none / partner_hold / screening_hold; while set, the server refuses every money-moving write on the leg: conversion, balance conversion, settlement line, refund, reroute forward, return (Lifecycle 2c)"],
    ["hold_ref", "string", "", "nullable; the row that holds the leg, as type and id: an EMERGENCY_ACTION, REROUTE (compliance hold), LOSS_EVENT (account frozen) or WALLET_SCREENING row"],
    ["opening_entry_id", "int", "FK", "nullable; for a deal in flight on the opening date, the OPENING_ENTRY row that holds its money, so the engine posts nothing for the steps recorded as completed and only the next step posts (Cutover Approach 4)"],
], "+ hold_kind, hold_ref (Lifecycle 2c, finding 09.1); + opening_entry_id (Cutover 4, finding 02.2)")
add_fields("DEAL_GROUP", [
    ["opening_source_ref", "string", "", "nullable; NPL's remittance-log transaction number for a group entered at the opening date; never edited afterwards (Cutover Approach 4, step 6)"],
], "+ opening_source_ref (Cutover 4, step 6)")
INSTR = [
    ["instruction_ref", "string", "", "the instruction's own reference, sent to the partner and used as the idempotency key; one open instruction per promise (Lifecycle 2d)"],
    ["ack_status", "string", "", "instructed / acknowledged / rejected / unknown; the partner's acknowledgement is the first point of no return and the execution the second; unknown means no acknowledgement by the time-out and stays so until the partner's records say executed or not (Lifecycle 2d)"],
    ["ack_ref", "string", "", "nullable; the partner's reference for the acknowledgement, the execution or the rejection"],
    ["retry_of", "int", "FK", "nullable; the instruction this one re-issues after the first was closed as rejected on the partner's written confirmation; Finance authorises the one retry (Lifecycle 2d, rule 3)"],
]
for t in ["SETTLEMENT_LINE", "CONVERSION", "BALANCE_CONVERSION", "REROUTE"]:
    add_fields(t, [list(f) for f in INSTR], "+ instruction_ref, ack_status, ack_ref, retry_of (Lifecycle 2d, finding 09.2)")
    R.append([t, t, "refs", "retry_of", "the instruction re-issued", "1 : 0..1", "new"])
set_note("SETTLEMENT_LINE", "outcome", "sent / confirmed / short / returned — sent from the partner's acknowledgement (ack_status acknowledged) until the receiver's confirmation; short when the CONFIRMATION has result short and a SHORTFALL row re-raises the missing part; every released line ends confirmed, short or returned (invariant 40)")
R.append(["OPENING_ENTRY", "DEAL", "refs", "opening_entry_id", "the opening line holding an in-flight deal's money", "1 : n", "new"])

# ---------------------------------------------------------------- A2 screening: second look, write-once decision
add_fields("WALLET_SCREENING", [
    ["api_response", "json", "", "the provider's report as returned, in one field: the rulebook outcome, the risk score and band, the categories against their thresholds, the exposure by channel; no separate columns"],
    ["decided_by", "int", "FK", "USER: Operations on a report that is clear under the provider's strict rulebook; Management on a second look, never the person who screened"],
    ["decided_at", "datetime", ""],
    ["reason", "string", "", "the decision's reason; mandatory on a second look"],
], "+ api_response, decided_by, decided_at, reason; decision write-once, no Finance override (Roles rule 11, Configuration Schema 4, finding 06.1 / 08.1)")
set_note("WALLET_SCREENING", "decision", "accept / accept_alternate / reject; write-once for every role and channel — a reject is lifted only by a new screening row decided by Management on a second look; a partner's own hold or freeze is recorded as the event it is and never overridden at NPL (Roles rule 11)")
E["WALLET_SCREENING"]["desc"] += " NPL screens; the partners decide: a clear report under the provider's strict rulebook is Operations' decision, anything else is Management's second look, and no role has a right that lifts a partner's hold."
R.append(["USER", "WALLET_SCREENING", "refs", "decided_by", "decided (Operations or Management)", "1 : n", "new"])
set_note("ROLE_RIGHT", "action", "a controlled action: price_quote, extend_quote_validity, cross_group_payout, cover_bank_fee, enable_own_desk, approve_loss_split, screening_second_look, earnings_offset, bank_details_approve, send_email_otp, enter_email_otp_code, record_customer_rejection, set_email_otp_settings, …")
E["ROLE_RIGHT"].setdefault("ch", []).append(f"{TAG}: action override_screening_reject (Finance) replaced by screening_second_look (Management); + the four Email OTP actions")

# ---------------------------------------------------------------- A3 flagged rate, dormant pair, month-volume view
set_note("PARTNER_RATE_VERSION", "status", "active / usable / flagged / breached / approved / rejected; a flagged version (outside the absolute tolerance, either direction) prices nothing and instructs nothing until Finance confirms it with a reason or rejects it; the last usable version keeps serving meanwhile (Calculation Specification 2a)")
E["PARTNER_RATE_VERSION"].setdefault("ch", []).append(f"{TAG}: status + flagged (Calculation 2a, finding 07.2)")
set_note("PARTNER_PAIR", "status", "active / inactive / dormant; a dormant pair prices nothing and accepts no collection or settlement line; a route unused for the project's route_unused_days threshold is put on the quarterly review to be set dormant or kept (Scenario Catalogue, dormant products)")
E["PARTNER_PAIR"].setdefault("ch", []).append(f"{TAG}: status + dormant")
set_note("THRESHOLD", "kind", "max_amount / settlement_limit / daily_slots / rate_variation_rel / custom; rate_min_observations, rate_fallback_spread_abs, rate_abs_tolerance (Calculation Specification 2a); approval_time_limit (one row per approval stage, Lifecycle 8a); cutoff_warning_min; lock_idle_minutes (default 15; Lifecycle 6a); email_otp_code_window_min (default 1440), email_otp_stepup_amount (in the reporting currency), email_otp_tripwire_min (default 240) — the Email OTP windows (Lifecycle 2e); route_unused_days (dormant routes)")
E["THRESHOLD"].setdefault("ch", []).append(f"{TAG}: + kinds email_otp_code_window_min, email_otp_stepup_amount, email_otp_tripwire_min, route_unused_days")
v = E["PROJECT_MONTH_VOLUME"]
if "collected in the calendar month" in v.get("desc", ""):
    v["desc"] = v["desc"].replace("collected in the calendar month", "priced from the opening date, plus the approved opening line of the month in which the project went live")
else:
    v["desc"] += " The counter is the approved opening line (OPENING_ENTRY kind month_volume) plus the system's own legs priced from the opening date; a void of a deal whose volume sits in the opening line lowers the counter by that deal's volume and the opening line is never edited (Calculation Specification 5a)."
v.setdefault("ch", []).append(f"{TAG}: counter = opening line + legs priced from the opening date (Calculation 5a, finding 07.1)")

# ---------------------------------------------------------------- A4 idempotency key (suspense is a Ledger-builder account)
add_fields("LEDGER_TRANSACTION", [
    ["idempotency_key", "string", "", "unique; the key of the action that created the transaction, so a retried request on a new transport call is refused and returns the first result; with (source_type, source_id, event) unique on existing columns (Ledger Posting Design rule 1b)"],
], "+ idempotency_key (Ledger rule 1b, finding 11.2)")

# ---------------------------------------------------------------- A5 clone source and per-row confirmation
add_fields("PROJECT", [
    ["archetype_code", "string", "", "nullable; the archetype the project was created from (Client Operating Procedures Part C)"],
    ["cloned_from_project_id", "int", "FK", "nullable; the project it was cloned from; every copied row carries clone_confirmed_at empty until a user confirms or changes it, and activation needs them all confirmed (Configuration Schema 1a and rule 15)"],
    ["email_otp_enabled", "bool", "", "default false; Email OTP, the customer's approval of each quote by a one-time code (Lifecycle 2e); on only with the three Email OTP thresholds set; each sender then needs its own approved approver address and chat group"],
], "+ archetype_code, cloned_from_project_id (Configuration 1a, rule 15, finding 06.2); + email_otp_enabled (Email OTP, CR-01)")
R.append(["PROJECT", "PROJECT", "refs", "cloned_from_project_id", "cloned from", "1 : 0..n", "new"])
CLONED = ["THRESHOLD", "PARTNER_CONFIG", "PARTNER_PAIR", "FEE_STRUCTURE", "FEE_TIER", "FEE_OVERRIDE", "COLLECTION_RECEIVING_ENDPOINT", "SETTLEMENT_SENDING_ENTITY", "SETTLEMENT_RAIL",
          "DESTINATION_APPROVAL", "PARTNER_REBATE_RULE", "MARKUP_SHARE_RULE", "SENDER", "SENDER_RECEIVER_ALLOW", "RECEIVER_GROUP", "RECEIVER", "RECEIVING_ENTITY", "RECEIVING_ENTITY_ACCOUNT", "MESSAGE_TEMPLATE", "CURRENCY_PAIR", "PAIR_RATE_SOURCE"]
for t in CLONED:
    if t in E:
        add_fields(t, [["clone_confirmed_at", "datetime", "", "nullable; set when a user confirms or changes a row copied by a clone; a cloned project activates only when no copied row is left unconfirmed (Configuration Schema rule 15)"]],
                   "+ clone_confirmed_at (Configuration rule 15)")

# ---------------------------------------------------------------- change set 2b addendum (NPL, 28 October): a sender's wallet source keeps its network and address
add_fields("COLLECTION_SENDING_ENTITY", [
    ["wallet_network", "string", "", "nullable; the network of a source wallet (TRC-20, ERC-20, …); set together with wallet_address"],
    ["wallet_address", "string", "", "nullable; the address the funds come from; a row carries a bank-details row or a wallet network and address, exactly one of the two; never a payout destination"],
], "+ wallet_network, wallet_address (a wallet source keeps label, network and address; one kind per source; NPL, 28 October 2026)")
INV.append([["COLLECTION_SENDING_ENTITY"], "A sender's source is a bank-details row or a wallet network and address, exactly one of the two: (bank_account_details_id IS NOT NULL) <> (wallet_network IS NOT NULL AND wallet_address IS NOT NULL), and the two wallet columns are set together (Configuration Schema 4)."])

# ---------------------------------------------------------------- A4b suspense account purpose (the account itself is in the Ledger Posting Design's chart)
for f in E["LEDGER_ACCOUNT"]["f"]:
    if f[0] == "purpose" and "SUSPENSE" not in f[3]:
        f[3] = f[3].replace("COLLECTED / HELD / DUE / PAYABLE / SHORTFALL /", "COLLECTED / HELD / DUE / PAYABLE / SHORTFALL / SUSPENSE /")
E["LEDGER_ACCOUNT"].setdefault("ch", []).append(f"{TAG}: purpose + SUSPENSE (the unallocated part of a partner's opening balance, client side; Cutover 4 step 3a)")

# ---------------------------------------------------------------- A6 registry, evidence write-once, extract record, retention
E["TYPE_REGISTRY"] = {"d": "ledger", "col": 8, "v": "new", "ch": [f"new in {TAG}: the registry behind every type-plus-id reference (ERD Appendix C, finding 12.2)"],
  "desc": "The registry the generic reference trigger reads: one row per type value a type-plus-id reference may carry (LEDGER_TRANSACTION.source_type, APPROVAL.subject_type, AUDIT_LOG.record_type, WALLET_SCREENING.subject_kind, DEAL.hold_ref and the others), naming the table the id points into and the column of that table that carries the project. An unknown type value is refused; an id must exist in the table named; a ledger source must belong to the transaction's project. A new type value is a row here, approved by Management, never a code change to the trigger.",
  "f": [["id", "int", "PK"], ["reference", "string", "", "the referencing table and column, e.g. LEDGER_TRANSACTION.source_type"], ["type_value", "string", "", "the value, e.g. Settlement"],
        ["table_name", "string", "", "the table the id points into"], ["project_column", "string", "", "the column of that table that carries the project; empty for global tables"],
        ["critical", "bool", "", "true for the ledger sources: the project check applies"], ["status", "string", "", "active / retired"], ["approved_by", "int", "FK", "Management"]]}
d["ORDER"]["8"].append("TYPE_REGISTRY")
R.append(["USER", "TYPE_REGISTRY", "refs", "approved_by", "approved (Management)", "1 : n", "new"])
set_note("AUDIT_LOG", "record_type", "the record the row is about, resolved through TYPE_REGISTRY; Extract is the production extract's own record (counts per table, the test accounts left out, the check results)")
E["AUDIT_LOG"].setdefault("ch", []).append(f"{TAG}: record_type resolved through TYPE_REGISTRY; + record_type Extract")
set_note("SYSTEM_SETTING", "key", "reporting_currency / reporting_rate_max_age_min / operating_timezone / staging_snapshot_retention_days (how long the read-only staging snapshot with the test projects' audit rows is kept after the switch) / … (the reporting rate source is the platform pair’s PAIR_RATE_SOURCE, not a key)")
E["SYSTEM_SETTING"].setdefault("ch", []).append(f"{TAG}: + key staging_snapshot_retention_days")
EVIDENCE = [(t, f[0]) for t in E for f in E[t]["f"] if f[0] in ("evidence_ref", "rendered_ref", "snapshot_ref", "body_ref", "sheet_ref", "token_ref") and E[t]["d"] != "view"]
for t, f in EVIDENCE:
    set_note(t, f, (next(x for x in E[t]["f"] if x[0] == f)[3] if len(next(x for x in E[t]["f"] if x[0] == f)) > 3 and next(x for x in E[t]["f"] if x[0] == f)[3] else "") + " Write-once: the key carries the file's hash, a corrected document is a new row naming the old one (ERD Appendix C).")
    E[t].setdefault("ch", []).append(f"{TAG}: {f} write-once, content-addressed")

# ---------------------------------------------------------------- A7 Email OTP
add_fields("SENDER", [
    ["email_otp_approver_email", "string", "", "nullable; the sender's one registered approver address (each sender has its own chat group with NPL, so the approver is per sender); protected master data: Operations enters, Finance approves, verified by a code before it is active (Roles rule 13); required to quote the sender while the project's switch is on"],
    ["email_otp_chat_platform", "string", "", "nullable; the sender's registered chat group: platform"],
    ["email_otp_chat_group_name", "string", "", "nullable; the sender's registered chat group: name"],
    ["email_otp_chat_group_id", "string", "", "nullable; the group id where the platform gives one; the three chat columns change together, under the same approval; the row shows the current values, the audit log the history"],
], "+ email_otp_approver_email, email_otp_chat_platform, email_otp_chat_group_name, email_otp_chat_group_id (Email OTP, CR-01; per sender by NPL's instruction of 28 October)")
set_note("MESSAGE_TEMPLATE", "code", "quote / payment_instructions / confirmation_request / settlement_advice / cash_token / email_otp_quote (the Email OTP approval email: the quote's sender-facing figures, the code, its expiry and the partial destination)")
E["MESSAGE_TEMPLATE"].setdefault("ch", []).append(f"{TAG}: code + email_otp_quote")
E["QUOTE_PACKAGE"]["desc"] += " With Email OTP on, channel email: the issue is the approval email and carries the code; a re-issue voids the code."
E["QUOTE_PACKAGE"].setdefault("ch", []).append(f"{TAG}: the issue is the Email OTP approval email where the feature is on")
E["DEAL_GROUP"]["desc"] += " With Email OTP on, state Sent is shown as pending customer approval and Accepted as customer approved; the approval itself is the CUSTOMER_APPROVAL row of the current quote issue (Lifecycle 2e)."
E["CUSTOMER_APPROVAL"] = {"d": "deal", "col": 5, "v": "new", "ch": [f"new in {TAG}: Email OTP, the reviewer's change request CR-01"],
  "desc": "Email OTP: one row per one-time code sent for a quote issue; the customer's approval of the order as a recorded, attributable step (Lifecycle 2e). The code is stored only as a hash; the decision is write-once; one open code per issue; no collection without the approval of the current issue.",
  "f": [["id", "int", "PK"], ["deal_group_id", "int", "FK", "the group whose quote is approved"], ["quote_package_id", "int", "FK", "the quote issue the code is bound to; a re-issue voids the row"],
        ["code_ref", "string", "", "short public reference printed in the email, for support"], ["code_hash", "string", "", "the one-time code, hashed; never the code itself; in no screen, export or API"],
        ["approver_email", "string", "", "the address the email went to, as it was at issue; a change of the sender's address voids the row"],
        ["issued_at", "datetime", ""], ["issued_by", "int", "FK", "USER (Operations)"], ["expires_at", "datetime", "", "issued_at + the project's code window"],
        ["stepup_required", "bool", "", "true at or above the step-up amount; the paste must then carry the amount"], ["amount_expected", "decimal", "", "the order amount the paste must match when stepup_required"],
        ["partial_destination", "string", "", "the partial identifier exactly as printed; empty for cash"], ["snapshot_ref", "string", "", "the stored email, content-addressed (write-once)"],
        ["status", "string", "", "issued / approved / rejected / expired / voided / locked"], ["attempts", "int", "", "failed validations; five lock the code"],
        ["decided_at", "datetime", "", "nullable"], ["decided_by", "int", "FK", "USER who entered the code or recorded the rejection"],
        ["evidence_ref", "string", "", "the chat screenshot from the registered group (write-once)"], ["reject_reason", "string", "", "verbatim, when rejected"], ["reject_channel", "string", "", "email_reply / chat"]]}
E["CUSTOMER_APPROVAL_EVENT"] = {"d": "deal", "col": 5, "v": "new", "ch": [f"new in {TAG}: Email OTP, the reviewer's change request CR-01"],
  "desc": "The trail under a customer approval: every send, delivery event, bounce, reply, validation attempt, lock, void and tripwire alert, with its time and, for inbound mail, the sender address and the text; insert-only. Nothing that arrives by email ever approves.",
  "f": [["id", "int", "PK"], ["customer_approval_id", "int", "FK"], ["kind", "string", "", "sent / delivered / bounced / failed / reply / attempt / locked / voided / expired / tripwire"],
        ["at", "datetime", ""], ["actor_id", "int", "FK", "USER, nullable (system events)"], ["from_address", "string", "", "inbound mail only; matched against the registered address"],
        ["matched_approver", "bool", "", "inbound mail only"], ["body_ref", "string", "", "inbound text stored, content-addressed"], ["message_id", "string", "", "the email service's id for a send or a reply"]]}
o5 = d["ORDER"]["5"]; i = o5.index("QUOTE_PACKAGE") + 1 if "QUOTE_PACKAGE" in o5 else len(o5)
o5[i:i] = ["CUSTOMER_APPROVAL", "CUSTOMER_APPROVAL_EVENT"]
R.extend([
    ["DEAL_GROUP", "CUSTOMER_APPROVAL", "owns", "deal_group_id", "the customer's approvals of its quote issues", "1 : n", "new"],
    ["QUOTE_PACKAGE", "CUSTOMER_APPROVAL", "refs", "quote_package_id", "the code bound to this issue", "1 : 0..1", "new"],
    ["USER", "CUSTOMER_APPROVAL", "refs", "issued_by", "issued (Operations)", "1 : n", "new"],
    ["USER", "CUSTOMER_APPROVAL", "refs", "decided_by", "entered the code or recorded the rejection", "1 : n", "new"],
    ["CUSTOMER_APPROVAL", "CUSTOMER_APPROVAL_EVENT", "owns", "customer_approval_id", "its trail", "1 : n", "new"],
    ["USER", "CUSTOMER_APPROVAL_EVENT", "refs", "actor_id", "actor (nullable)", "1 : n", "new"],
])

# ---------------------------------------------------------------- invariants (the Appendix C rules that are model-level)
INV.extend([
    [["DEAL", "CONVERSION", "BALANCE_CONVERSION", "SETTLEMENT_LINE", "REROUTE"], "A leg with hold_kind set accepts no money-moving write: conversion, balance conversion, settlement line, refund, reroute forward or return are refused by the server for every role and channel; a partner hold ends only with the partner's clearance recorded, a screening hold only with Management's second look or a new clear screening (Lifecycle 2c)."],
    [["SETTLEMENT_LINE", "CONVERSION", "BALANCE_CONVERSION", "REROUTE"], "One open external instruction per promise: while an instruction is instructed, acknowledged or of unknown outcome, a second instruction for the same promise is refused (partial unique index on the promise); an alternative payout or reroute starts only from an instruction closed as rejected or acknowledged as not executed, with the partner's reference (Lifecycle 2d)."],
    [["WALLET_SCREENING"], "WALLET_SCREENING.decision is write-once for every role and channel; a reject is lifted only by a new screening row decided by Management on a second look; no role has a right over a partner's own hold or freeze (Roles rule 11)."],
    [["PARTNER_RATE_VERSION", "PARTNER_PAIR", "DEAL", "CONVERSION", "COLLECTION", "SETTLEMENT_LINE"], "A flagged or breached rate version prices nothing and instructs nothing; a dormant partner pair prices nothing and accepts no collection or settlement line (Calculation 2a; Scenario Catalogue)."],
    [["LEDGER_TRANSACTION"], "idempotency_key is unique and (source_type, source_id, event) is unique: a retried request returns the first result; the source state change, the transaction and its postings are written in one database transaction, and the instruction to a partner is committed before the partner is called or told (Ledger Posting Design rule 1b)."],
    [["TYPE_REGISTRY", "LEDGER_TRANSACTION", "APPROVAL", "AUDIT_LOG", "WALLET_SCREENING"], "Every type-plus-id reference is checked against TYPE_REGISTRY: the type value exists, the id exists in the table the registry names, and a ledger source belongs to the transaction's project (ERD Appendix C)."],
    [["CUSTOMER_APPROVAL", "QUOTE_PACKAGE", "COLLECTION", "SENDER", "PROJECT"], "Email OTP: one open code per quote issue; a code validates once and the decision is write-once; on a project with the switch on, no collection is recorded without an approved CUSTOMER_APPROVAL of the group's current issue, and no quote is sent for a sender whose approver address and chat group are not present and approved; a new issue or a change of the sender's address voids the open code (Lifecycle 2e)."],
    [["PROJECT"], "A cloned project activates only when every copied configuration row has clone_confirmed_at set, every referenced version is the one in force on the activation date and every block's route is complete (Configuration Schema rule 15)."],
])

# ---------------------------------------------------------------- edition, meta, decisions
d["version"] = "6.1"
d["DOC_META"] = d["DOC_META"].replace("Draft v6.0", "Draft v6.1").replace("22 October 2026", "28 October 2026")
d["DECISIONS"] += (
    "\nD59 Round-2 review of the v6.0 design review (28 October 2026, New XP on NPL's behalf): holds as a named condition on the leg (DEAL.hold_kind, hold_ref; partner hold recorded, screening hold decided by Management's second look; no Finance override, Roles rule 11); "
    "every external instruction with instruction_ref, ack_status, ack_ref and retry_of on SETTLEMENT_LINE, CONVERSION, BALANCE_CONVERSION and REROUTE, one open instruction per promise, Finance authorises the one retry after Management closes an unknown instruction on the partner's written confirmation (Lifecycle 2d); "
    "WALLET_SCREENING + api_response, decided_by, decided_at, reason, decision write-once; PARTNER_RATE_VERSION.status + flagged; PARTNER_PAIR.status + dormant; LEDGER_TRANSACTION.idempotency_key; the suspense account per partner and currency on the client side (Ledger, Cutover 4); DEAL.opening_entry_id and DEAL_GROUP.opening_source_ref for the opening date; "
    "PROJECT.archetype_code, cloned_from_project_id and clone_confirmed_at on every copied configuration row (Configuration rule 15); TYPE_REGISTRY behind every type-plus-id reference; evidence references write-once and content-addressed; the extract's AUDIT_LOG record; SYSTEM_SETTING staging_snapshot_retention_days. "
    "Recovery: one hour for a zone failure and for a region failure, a live standby database in a second region (Architecture 6). Jobs: persisted schedule, lease, checkpoints, sweep, three attempts, alarms by email to Finance (Architecture 4)."
    "\nD60 Email OTP, the reviewer's change request CR-01 (28 October 2026, New XP): optional per project (PROJECT.email_otp_enabled); the approver address and the registered chat group per sender (SENDER.email_otp_*), because NPL runs one chat group per sender; thresholds email_otp_code_window_min (1440), email_otp_stepup_amount (USD 50,000 equivalent), email_otp_tripwire_min (240); "
    "CUSTOMER_APPROVAL (one row per code, hash only, write-once decision) and CUSTOMER_APPROVAL_EVENT; the states Sent and Accepted reused as pending customer approval and customer approved; controlled actions send_email_otp, enter_email_otp_code, record_customer_rejection, set_email_otp_settings (Operations enters, Finance approves); template email_otp_quote; "
    "a sender without approved settings cannot be quoted while the switch is on; the email service is NPL's choice (Resend, 28 October 2026), kept generic in the documents.")

json.dump(d, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("applied: version", d["version"], "tables", len([n for n in E if E[n]["d"] != "view"]), "views", len([n for n in E if E[n]["d"] == "view"]), "relationships", len(R), "invariants", len(INV))
