#!/usr/bin/env python3
"""29 October 2026, after the 360-degree read of the per-sender change: four descriptions in the model that still read as
the per-project rule or lack the email's code-box wording. Idempotent."""
import json, sys
P = "data/erd.v5.json"; d = json.load(open(P, encoding="utf-8")); E = d["E"]
def fix(table, field, old, new):
    for f in E[table]["f"]:
        if f[0] == field:
            if new in f[3]: return
            if old not in f[3]: sys.exit(f"{table}.{field}: expected text not found")
            f[3] = f[3].replace(old, new); return
    sys.exit(f"{table}.{field} not found")
fix("PROJECT", "email_otp_enabled", "each sender then needs its own approved approver address and chat group; a sender marked not required",
    "the switch is the default for the project's senders, and each required sender then needs its own approved approver address and chat group; a sender marked not required")
fix("SENDER", "email_otp_approver_email", "required to quote the sender while the project's switch is on",
    "required to quote the sender while the project's switch is on and the sender is required (email_otp_required)")
fix("MESSAGE_TEMPLATE", "code", "(the Email OTP approval email: the quote's sender-facing figures, the code, its expiry and the partial destination)",
    "(the Email OTP approval email: the quote's sender-facing figures, the code, its expiry, the code box's fixed sentence that the code is single use, for this quote issue only and void if the order changes, the partial destination and, at or above the step-up amount, the instruction to paste the code and the order amount)")
ca = E["CUSTOMER_APPROVAL"]; old = "no collection without the approval of the current issue."
new = "no collection without the approval of the current issue for a sender for which Email OTP is required; a sender marked not required (SENDER.email_otp_required = false) collects without a row here and its quote issue records that the approval was taken in chat."
if new not in ca["desc"]:
    if old not in ca["desc"]: sys.exit("CUSTOMER_APPROVAL description text not found")
    ca["desc"] = ca["desc"].replace(old, new)
s = json.dumps(d, ensure_ascii=False, indent=1); open(P, "w", encoding="utf-8").write(s); print("model wording applied")
