#!/usr/bin/env python3
"""Round 2, stage 2 (28 October 2026): the document list the map assistant reads (FEE_PRACTICE.documents) brought to
edition 6.1 after apply-v6.1-round2.py. Idempotent: refuses to run twice."""
import json, sys
P = "data/erd.v5.json"
d = json.load(open(P, encoding="utf-8"))
docs = d["FEE_PRACTICE"]["documents"]
if docs[0][1].startswith("v6.1"): sys.exit("already applied")
NEW = {
 "ERD & Data Model": "v6.1, 28 October 2026 — this model (78 tables, 12 views; round 2 of the design review: TYPE_REGISTRY, CUSTOMER_APPROVAL and CUSTOMER_APPROVAL_EVENT added, holds and external instructions, screening second look, flagged rates, dormant pairs, idempotency key, clone confirmation, write-once evidence; bank details in the database), Appendix C constraints and the fact-and-dimension classification; client-facing edition served without status, change history, open questions or decision references",
 "Ledger Posting Design & Chart of Accounts": "v6.1, 28 October 2026 — the chart of accounts (with OPENING_BALANCE and the client-side SUSPENSE account) and 61 worked transactions, 67 fixtures with the variants, Patterns O, P, Q and R, rules 1a, 1b (atomicity: idempotency key, one database transaction, the instruction committed before the partner is called or told), 11a and 13a, the three sums of an opening entry (19d); client-facing edition",
 "Ledger Patterns — Reading Companion": "v6.1, 28 October 2026 — the same worked transactions in plain language, the 61/67 count convention, plus the identifier register (T, L, B, W, X, F, C, A, D); client-facing edition",
 "Calculation Specification": "v6.1, 28 October 2026 — every formula with its rounding rule; breach rules 2a (a flagged version is a guard: it prices nothing until Finance confirms it), the below-margin warning 4a, the month-volume counter 5a with the opening volume; vectors L1–L14 and B1–B24, 24 of 24 of NPL's own figures reproduced; the regression gate 19a; client-facing edition",
 "Transaction Lifecycle & Approval State Machines": "v6.1, 28 October 2026 — holds 2c (scope, allowed actions, who lifts, disposition, audit), external instructions 2d (prepared, acknowledged, executed; outcome unknown; one open instruction per promise), Email OTP 2e, the flagged rate state, 40 controlled actions, the outcome-unknown time limit in 8a; client-facing edition",
 "Roles & Visibility Matrix": "v6.1, 28 October 2026 — Operations ⊂ Finance ⊂ Management; rule 10 bank details read in full and logged, rule 11 screening outcomes with three owners and no override right, rule 12 the field groups outside the application (two workbooks, no figures in alarms), rule 13 Email OTP settings protected per sender; absence cover 14; client-facing edition",
 "Configuration Schema": "v6.1, 28 October 2026 — what a clone does not carry and the activation gate (rule 15), wallet screening decided from the provider's report (NPL screens, the partners decide), bank account details and the sender wallet source, Email OTP settings (the switch and thresholds per project, the approver address and chat group per sender; rule 16), the dormant pair rule; client-facing edition",
 "Architecture & Stack Note": "v6.1, 28 October 2026 — Multi-AZ database and two application tasks, a live standby database in a second region with log and bucket replication (one hour to recover from a zone or a region failure, at most 15 minutes of data lost), background jobs with persisted schedule, lease, checkpoints and sweep, alarms by email to Finance, the fallback workbook every five minutes as two workbooks, the email service for Email OTP (NPL's choice: Resend), running cost about USD 205–320 a month; client-facing edition",
 "Cutover Approach": "v6.1, 28 October 2026 — production built by a clean-target extract from staging (nothing deleted; staging stays as the read-only record), the per-state opening mapping (no step posts twice), suspense lines for unverified differences and the materiality no-go, exit criteria 1–13, the recovery objectives for a zone and a region failure 8a; client-facing edition",
 "Scenario Catalogue": "v6.1, 28 October 2026 — every client and project with its scenarios, flows F1–F10, walkthroughs W1–W8, the dormant products, the Email OTP story, Part 4 worked examples class by class; the figures are NPL's of 8–9 October and illustrative where marked",
 "Test Strategy & Coverage": "v6.1, 28 October 2026 — every test family with its purpose, result class and phase; the per-procedure traceability 6a; the fixture manifest of 67 fixtures (Appendix A); the coverage map over the 27 sub-classes of the Workflow Tree; the regression gate; for every role",
 "Map pages": "v6.1 — the Top-Down Map (78 tables, 12 views), the Deal Flow on one page, the Workflow Tree (8 classes, 27 sub-classes, 93 procedures) and the Workflow Tree on one page; for every role",
}
for row in docs:
    if row[0] in NEW: row[1] = NEW[row[0]]
for row in docs:
    if row[0] == "Operating Procedures": break
else:
    docs.insert(11, ["Operating Procedures", "v6.1, 28 October 2026 — one SOP per project, the common procedures C1–C11 (C11: Email OTP, the customer's approval of the order) and the standing procedures of the day; for every role"])
json.dump(d, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("applied: documents list at 6.1,", len(docs), "entries")
