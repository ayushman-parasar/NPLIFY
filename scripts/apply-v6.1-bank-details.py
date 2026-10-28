#!/usr/bin/env python3
"""Round 2, stage 2 (26 October 2026): bank account details move from the restricted file store into the database.
Two tables (BANK_ACCOUNT_DETAILS, versioned; BANK_DETAILS_TEMPLATE, one row per rail × field), and the five *_ref
columns become bank_account_details_id foreign keys. Idempotent: refuses to run twice."""
import json, sys
P = "data/erd.v5.json"
d = json.load(open(P, encoding="utf-8"))
E, R, INV = d["E"], d["R"], d["INV"]
if "BANK_ACCOUNT_DETAILS" in E: sys.exit("already applied")

def swap_field(table, old, new):
    e = E[table]
    for i, f in enumerate(e["f"]):
        if f[0] == old:
            e["f"][i] = new; return
    raise SystemExit(f"{table}.{old} not found")

E["BANK_DETAILS_TEMPLATE"] = {"d": "config", "col": 0, "v": "new", "ch": ["new in v6.1 (D58): the field list of each bank rail"],
  "desc": "Configuration: what a bank account on a given rail must carry. One row per rail × field, in display order: SWIFT (account number or IBAN, BIC, bank address, intermediary bank), SEPA (IBAN, BIC), UK Faster Payments (sort code, account number), a local rail (bank code, account number). The template drives the entry form, the validation on save (IBAN check digits, BIC length, sort-code pattern) and the card that shows the details in full; wallets are not templated (network and address stay on the account row). Versioned by effective date like every configuration table; Finance proposes, Management approves.",
  "f": [["id", "int", "PK"], ["rail", "string", "", "SWIFT / SEPA / UK_FPS / local:<country> …; one template per rail"], ["position", "int", "", "display order within the rail"],
        ["field_key", "string", "", "iban, bic, account_number, sort_code, bank_code, bank_address, intermediary_bic …"], ["label", "string", "", "as shown on the form and the card"],
        ["required", "bool"], ["format_rule", "string", "", "named check or pattern: iban_check_digits, bic_length, uk_sort_code, digits(n) …"], ["example", "string", "", "shown on the form"],
        ["effective_from", "date"], ["status", "string", "", "active / retired"]]}
E["BANK_ACCOUNT_DETAILS"] = {"d": "config", "col": 3, "v": "new", "ch": ["new in v6.1 (D58): bank details in the database, no longer a reference into the restricted file store"],
  "desc": "The bank details of one account, in the database: a receiving-entity account, a partner's collection endpoint, a settlement rail, the details a partner holds under a destination approval, or a sender's source account. Versioned: a change is a new row that names the row it supersedes (supersedes_id); the old row is kept and is what any settlement line released before the change points at through its account. Common fields here; the rail-specific values (IBAN, BIC, sort code, bank code …) are stored under rail_fields, keyed by the field_key of the rail's BANK_DETAILS_TEMPLATE rows and validated against them on save. Entered by Operations, approved by Finance or Management (controlled action bank_details_approve); read in full by Operations, Finance and Management, with every full read written to AUDIT_LOG. The evidence (bank letter, KYC, legal document) stays a file under the restricted prefix (evidence_ref).",
  "f": [["id", "int", "PK"], ["supersedes_id", "int", "FK", "nullable; the BANK_ACCOUNT_DETAILS row this version replaces"], ["holder_name", "string", "", "the account holder as the bank knows it"],
        ["bank_name", "string"], ["country", "string", "", "ISO 3166 alpha-2"], ["currency", "string"], ["rail", "string", "", "names the BANK_DETAILS_TEMPLATE rows that apply"],
        ["rail_fields", "json", "", "the rail-specific values, keyed by the template's field_key; validated by format_rule on save"], ["evidence_ref", "string", "", "bank letter or confirmation, restricted prefix of the file store"],
        ["entered_by", "int", "FK", "Operations user"], ["entered_at", "datetime"], ["status", "string", "", "draft / active / superseded / retired"]]}

swap_field("RECEIVING_ENTITY_ACCOUNT", "bank_details_ref", ["bank_account_details_id", "int", "FK", "when account_kind = bank; the current BANK_ACCOUNT_DETAILS version (v6.1, D58; was bank_details_ref)"])
swap_field("COLLECTION_RECEIVING_ENDPOINT", "bank_details_ref", ["bank_account_details_id", "int", "FK", "when kind = bank; the current BANK_ACCOUNT_DETAILS version (v6.1, D58; was bank_details_ref)"])
swap_field("DESTINATION_APPROVAL", "bank_details_ref", ["bank_account_details_id", "int", "FK", "the bank details as registered with this partner, when the account is a bank account (v6.1, D58; was bank_details_ref)"])
swap_field("SETTLEMENT_RAIL", "bank_details_ref", ["bank_account_details_id", "int", "FK", "the rail's own account (v6.1, D58; was bank_details_ref)"])
swap_field("COLLECTION_SENDING_ENTITY", "account_ref", ["bank_account_details_id", "int", "FK", "nullable; the source account when it is known (v6.1, D58; was account_ref)"])
for t, note in [("RECEIVING_ENTITY_ACCOUNT", "v6.1 (D58): bank_details_ref → bank_account_details_id (BANK_ACCOUNT_DETAILS)"),
                ("COLLECTION_RECEIVING_ENDPOINT", "v6.1 (D58): bank_details_ref → bank_account_details_id"),
                ("DESTINATION_APPROVAL", "v6.1 (D58): bank_details_ref → bank_account_details_id"),
                ("SETTLEMENT_RAIL", "v6.1 (D58): bank_details_ref → bank_account_details_id"),
                ("COLLECTION_SENDING_ENTITY", "v6.1 (D58): account_ref → bank_account_details_id")]:
    E[t].setdefault("ch", []).append(note)
E["RECEIVING_ENTITY_ACCOUNT"]["desc"] = E["RECEIVING_ENTITY_ACCOUNT"]["desc"].replace("a bank account carries bank_details_ref and a bank rail", "a bank account carries bank_account_details_id and a bank rail").replace("no table stores actual bank details.", "v6.1: the bank details themselves are in BANK_ACCOUNT_DETAILS, versioned (D58).")
E["COLLECTION_RECEIVING_ENDPOINT"]["desc"] = E["COLLECTION_RECEIVING_ENDPOINT"]["desc"].replace("bank_details_ref", "bank_account_details_id")
E["DESTINATION_APPROVAL"]["desc"] = E["DESTINATION_APPROVAL"]["desc"].replace("bank_details_ref", "bank_account_details_id")
E["SETTLEMENT_RAIL"]["desc"] += " v6.1: its account's details are a BANK_ACCOUNT_DETAILS row (D58)."
E["COLLECTION_SENDING_ENTITY"]["desc"] += " v6.1: the source account, when known, is a BANK_ACCOUNT_DETAILS row (D58)."

d["ORDER"]["0"].append("BANK_DETAILS_TEMPLATE")
d["ORDER"]["3"].insert(d["ORDER"]["3"].index("RECEIVING_ENTITY_ACCOUNT") + 1, "BANK_ACCOUNT_DETAILS")
R.extend([
    ["BANK_ACCOUNT_DETAILS", "BANK_ACCOUNT_DETAILS", "refs", "supersedes_id", "the version replaced", "1 : 0..1", "new"],
    ["BANK_ACCOUNT_DETAILS", "RECEIVING_ENTITY_ACCOUNT", "refs", "bank_account_details_id", "bank details (account_kind = bank)", "1 : n", "new"],
    ["BANK_ACCOUNT_DETAILS", "COLLECTION_RECEIVING_ENDPOINT", "refs", "bank_account_details_id", "bank details (kind = bank)", "1 : n", "new"],
    ["BANK_ACCOUNT_DETAILS", "DESTINATION_APPROVAL", "refs", "bank_account_details_id", "details as registered with the partner", "1 : n", "new"],
    ["BANK_ACCOUNT_DETAILS", "SETTLEMENT_RAIL", "refs", "bank_account_details_id", "the rail's account", "1 : n", "new"],
    ["BANK_ACCOUNT_DETAILS", "COLLECTION_SENDING_ENTITY", "refs", "bank_account_details_id", "source account, when known", "1 : n", "new"],
    ["USER", "BANK_ACCOUNT_DETAILS", "refs", "entered_by", "entered (Operations)", "1 : n", "new"],
])
INV.append([["BANK_ACCOUNT_DETAILS", "BANK_DETAILS_TEMPLATE", "RECEIVING_ENTITY_ACCOUNT", "COLLECTION_RECEIVING_ENDPOINT", "SETTLEMENT_RAIL"],
            "A bank account, bank endpoint or settlement rail is active only with a BANK_ACCOUNT_DETAILS row in status active whose rail matches and whose rail_fields pass the rail's template; a details row is never edited — a change is a new row with supersedes_id and the old row stays; every full read of a details row is in AUDIT_LOG (v6.1, D58)."])
d["DECISIONS"] += ("\nD58 Bank account details in the database (26 October 2026, round 2): BANK_ACCOUNT_DETAILS (versioned, supersedes_id; holder, bank, country, currency, rail, rail_fields, evidence_ref, entered_by, entered_at, status) "
                   "replaces the five references into the restricted file store (bank_details_ref on RECEIVING_ENTITY_ACCOUNT, COLLECTION_RECEIVING_ENDPOINT, DESTINATION_APPROVAL, SETTLEMENT_RAIL; account_ref on COLLECTION_SENDING_ENTITY), "
                   "each now a bank_account_details_id foreign key; BANK_DETAILS_TEMPLATE holds the field list, labels, required flags, format rules and examples per rail (SWIFT, SEPA, UK, local). One card component shows the details in full everywhere; "
                   "Operations enters, Finance and Management approve; all three roles read in full, no masking, every full read logged in AUDIT_LOG. The restricted prefix keeps only the evidence files (bank letters, KYC, legal documents). Settlement lines keep pointing at the account; the version used is the one current at release.")
json.dump(d, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("applied: tables", len([n for n in E if E[n]["d"] != "view"]), "relationships", len(R), "invariants", len(INV))
