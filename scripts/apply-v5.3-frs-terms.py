#!/usr/bin/env python3
"""9 October 2026 (evening): the FRS terms that had no home in the ERD — holiday calendar, quote package,
message template — applied as D34–D36. Idempotent.   python3 scripts/apply-v5.3-frs-terms.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text()); E, R = d["E"], d["R"]
assert "HOLIDAY" not in E and "QUOTE_PACKAGE" not in E and "MESSAGE_TEMPLATE" not in E

def set_note(name, field, note):
    for f in E[name]["f"]:
        if f[0] == field:
            while len(f) < 4: f.append("")
            f[3] = note; return
    raise KeyError((name, field))
def ch(name, text):
    E[name].setdefault("ch", []).append(text); E[name]["v"] = E[name].get("v") or "changed"
def new_table(name, dom, col, desc, fields, order_col, tag):
    E[name] = {"d": dom, "col": col, "desc": desc, "f": fields, "v": "new", "ch": [tag]}
    d["ORDER"][str(order_col)].append(name)
def rel(a, b, kind, fk, label, card): R.append([a, b, kind, fk, label, card, "new"])

# ------------------------------------------------------------------ D34 HOLIDAY
new_table("HOLIDAY", "config", 2,
    "A non-business day of a partner’s banking channel: one row per date (Indonesian bank holidays for Ali’s PT vehicles, UK holidays for Jeton). The dates behind every ‘next business day’ in the model — a leg’s conversion_due_date and a disbursement’s execution_due_date skip weekends in the partner’s cutoff_timezone and the partner’s HOLIDAY rows. scope says what is closed: the bank channel only (crypto pairs unaffected) or the partner altogether. PARTNER.holiday_calendar stays as the name of the source calendar; this table holds its dates. v5.3 (D34).",
    [["id", "int", "PK"], ["partner_id", "int", "FK"], ["date", "date"], ["name", "string", "", "Idul Fitri, Boxing Day"], ["scope", "string", "", "bank_channel / partner"], ["source", "string", "", "partner notice / public calendar"]], 2, "new in v5.3 (D34)")
rel("PARTNER", "HOLIDAY", "owns", "partner_id", "non-business days of its banking channel", "1 : n")
set_note("PARTNER", "holiday_calendar", "name of the source calendar (e.g. ID banking holidays); the dates are HOLIDAY rows (v5.3, D34)")
ch("PARTNER", "v5.3 (D34): owns HOLIDAY — holiday_calendar is the calendar’s name, the dates are rows")
set_note("DEAL", "conversion_due_date", "the lock date when rate_locked_at precedes cutoff_at, else the next business day — weekends in the partner’s cutoff_timezone and the partner’s HOLIDAY rows skipped; Converting may not start earlier (v5.3, D29, D34)")
set_note("DISBURSEMENT", "execution_due_date", "the approval date when approved before cutoff_at, else the next business day (weekends and HOLIDAY rows skipped); a bank transfer is initiated no earlier (v5.3, D29, D34)")
set_note("REROUTE", "trigger", "partner_unavailable / limit_reached / holiday (a HOLIDAY row of scope partner on the day) / compliance_hold / other")

# ------------------------------------------------------------------ D36 MESSAGE_TEMPLATE (before D35, which references it)
new_table("MESSAGE_TEMPLATE", "config", 1,
    "A versioned template for a message the system sends or renders: the quote package to a sender, the payment instructions, a confirmation request to a receiver, a settlement advice. Global, or owned by a project that needs its own wording. A template names the fields it prints; a template of purpose quote may print only sender-facing figures (sender rate, displayed fee and source rate, amount out, validity) — never partner rates, margins or costs — which is how invariant 9’s ‘Operations never receives derived economics’ is enforced on outgoing messages. Changing a template is a configuration change approved by Management. v5.3 (D36).",
    [["id", "int", "PK"], ["project_id", "int", "FK", "null = global default; a project row overrides it"], ["code", "string", "", "quote / payment_instructions / confirmation_request / settlement_advice / cash_token"], ["version", "int"], ["channel", "string", "", "email / chat / portal / pdf"],
     ["language", "string"], ["body_ref", "string", "", "external content store"], ["printed_fields", "string", "", "the model fields the template may print; sender-facing only for quote"], ["effective_from", "datetime"], ["approved_by", "int", "FK", "Management"], ["status", "string"]], 1, "new in v5.3 (D36)")
rel("PROJECT", "MESSAGE_TEMPLATE", "refs", "project_id", "project-specific wording (optional)", "1 : 0..n")
rel("USER", "MESSAGE_TEMPLATE", "actor", "approved_by", "approved_by", "1 : n")

# ------------------------------------------------------------------ D35 QUOTE_PACKAGE
new_table("QUOTE_PACKAGE", "deal", 5,
    "What was actually sent to the sender for a deal group: the rendered quote, with the template version that produced it, the channel, the printed figures, when it was marked sent and by whom, and a hash of the content. One row per issue; a re-issue (corrected wording, resend on another channel) is a new row that supersedes the earlier one, never an edit; a changed price is a new deal group, not a new package. The leg’s quote_hash equals the hash of the package in force, the freshness clock runs from the leg’s market snapshot to sent_at, and the validity clock runs from sent_at. v5.3 (D35).",
    [["id", "int", "PK"], ["deal_group_id", "int", "FK"], ["issue_no", "int", "", "1, 2, … per deal group"], ["message_template_id", "int", "FK", "the template version that rendered it"], ["channel", "string", "", "email / chat / portal / pdf"],
     ["rendered_ref", "string", "", "external document store"], ["content_hash", "string", "", "= DEAL.quote_hash of the legs it prices"], ["printed_source_rate", "decimal", "", "= DEAL_GROUP.displayed_source_rate"], ["printed_fee_pct", "decimal", "", "= DEAL_GROUP.displayed_fee_pct"], ["printed_amount_out", "decimal"],
     ["valid_until", "datetime", "", "= the leg’s valid_until"], ["sent_at", "datetime", "", "marks the package sent; starts validity"], ["sent_by", "int", "FK", "Operations"], ["superseded_by_id", "int", "FK", "the re-issue that replaced this one, if any"]], 5, "new in v5.3 (D35)")
rel("DEAL_GROUP", "QUOTE_PACKAGE", "owns", "deal_group_id", "issues of the quote (1..n)", "1 : n")
rel("MESSAGE_TEMPLATE", "QUOTE_PACKAGE", "refs", "message_template_id", "rendered by", "1 : n")
rel("QUOTE_PACKAGE", "QUOTE_PACKAGE", "self", "superseded_by_id", "re-issue supersedes", "1 : 0..1")
rel("USER", "QUOTE_PACKAGE", "actor", "sent_by", "sent_by", "1 : n")
set_note("DEAL", "quote_hash", "hash of the quote package in force for the group (QUOTE_PACKAGE.content_hash) (v5.3, D35)")
set_note("DEAL", "sent_at", "null on conversion-priced legs; = QUOTE_PACKAGE.sent_at of the package in force (v5.3, D35)")
ch("DEAL", "v5.3 (D35): quote_hash and sent_at are the package’s; the package is a record, not a message")
E["DEAL_GROUP"]["desc"] += " v5.3 (D35): owns the QUOTE_PACKAGE rows — what was actually sent, per issue."
ch("DEAL_GROUP", "v5.3 (D35): owns QUOTE_PACKAGE")

# ------------------------------------------------------------------ invariants 33, 34
d["INV"] += [
    [["HOLIDAY", "PARTNER", "DEAL", "DISBURSEMENT"], "Business days are computed, never assumed: ‘next business day’ for a conversion due date or a settlement execution date skips weekends in the partner’s cutoff_timezone and the partner’s HOLIDAY rows of the matching scope; a reroute with trigger holiday names a day that is a HOLIDAY of scope partner (v5.3, D34)."],
    [["QUOTE_PACKAGE", "DEAL_GROUP", "DEAL", "MESSAGE_TEMPLATE", "MARKET_RATE"], "A quote-first leg leaves Quoted for Sent only when a QUOTE_PACKAGE of its group has sent_at; the package’s content_hash is the leg’s quote_hash and its printed figures equal the group’s displayed figures (derived, never typed); freshness runs from the leg’s market snapshot (MARKET_RATE.captured_at) to sent_at within PROJECT.quote_freshness_min, validity from sent_at. Packages are append-only: a re-issue supersedes, a new price is a new deal group. A quote template prints sender-facing fields only (v5.3, D35, D36)."],
]

# ------------------------------------------------------------------ walkthrough, vocabulary, notes, record
for w in d["WALKS"]:
    if w["name"].startswith("Quote-first"):
        i = next(k for k, st in enumerate(w["steps"]) if st[0] == "DEAL")
        w["steps"].insert(i + 1, ["QUOTE_PACKAGE", "The rendered quote as sent: template version, channel, printed sender-facing figures, sent_at (starts validity) and the hash that becomes the leg’s quote_hash. A re-issue is a new row; a new price is a new deal group (D35)."])
d["FRS_VOCAB"] += [
    ["Holiday calendar", "PARTNER.holiday_calendar (the calendar’s name) + HOLIDAY rows (the dates); business-day arithmetic for due dates (D34)"],
    ["Quote package", "QUOTE_PACKAGE under DEAL_GROUP — one row per issue, hash = DEAL.quote_hash, sent_at starts validity (D35)"],
    ["Message template", "MESSAGE_TEMPLATE — versioned, global or per project, sender-facing fields only for quotes (D36)"],
]
d["NOTES"]["Configuration"].append("v5.3 (D34, D36): HOLIDAY rows under PARTNER are the dates behind every ‘next business day’; MESSAGE_TEMPLATE is the versioned wording of outgoing messages, with the fields a template may print — a quote template prints sender-facing figures only.")
d["NOTES"]["Deal lifecycle"].append("v5.3 (D35): QUOTE_PACKAGE under DEAL_GROUP is the record of what was sent — template version, channel, printed figures, sent_at, hash. A quote-first leg is Sent only when a package has sent_at; re-issues are new rows; a new price is a new deal group.")
d["OPENQ"].append({"q": "Review point (v5.3): four FRS terms with no home in the ERD — wallet registry, holiday calendar, message template, quote package.", "blocks": "FRS reconciliation; quote clocks; business-day arithmetic", "status": "answered",
    "a": "Review (9 Oct, NPL + New XP): wallet registry = COLLECTION_RECEIVING_ENDPOINT of kind wallet (D15). The other three are added: the holiday calendar was a label and could not drive ‘next business day’; the quote package is the evidence behind priced-once and the quote clocks; the template is where the sender-facing-only rule on messages is enforced.",
    "impl": "v5.3 D34 HOLIDAY, D35 QUOTE_PACKAGE, D36 MESSAGE_TEMPLATE; invariants 33–34; quote-first walkthrough gains the package step.", "ents": ["HOLIDAY", "QUOTE_PACKAGE", "MESSAGE_TEMPLATE", "PARTNER", "DEAL_GROUP", "DEAL"]})
d["DECISIONS"] += (
    "\nAGREED 9 OCTOBER 2026 (evening), IN v5.3 — D34: HOLIDAY under PARTNER (date, name, scope bank_channel / partner, source); PARTNER.holiday_calendar becomes the calendar’s name. Why: since D29 the model computes ‘next business day’ for conversion and settlement due dates, and a text label cannot be counted from. Invariant 33."
    "\nAGREED 9 OCTOBER 2026 (evening), IN v5.3 — D35: QUOTE_PACKAGE under DEAL_GROUP — one row per issue with the template version, channel, rendered document reference, printed sender-facing figures, sent_at, sent_by and content_hash; DEAL.quote_hash and sent_at are the package’s; re-issues supersede, a new price is a new deal group. Why: the FRS quote package was the evidence behind priced-once and the freshness / validity clocks, and the model kept the facts behind it but not the artefact. Invariant 34."
    "\nAGREED 9 OCTOBER 2026 (evening), IN v5.3 — D36: MESSAGE_TEMPLATE — versioned wording of outgoing messages (quote, payment instructions, confirmation request, settlement advice, cash token), global or per project, with the model fields it may print; a quote template prints sender-facing figures only, which is how invariant 9 is enforced on messages; Management approves template changes. Rejected: leaving templates in the application layer with no record, so a quote package could not name what rendered it."
)
names = set(E)
for r in R: assert r[0] in names and r[1] in names, r
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("tables", sum(1 for e in E.values() if e["d"] != "view"), "views", sum(1 for e in E.values() if e["d"] == "view"), "relations", len(R), "invariants", len(d["INV"]))
