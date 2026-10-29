#!/usr/bin/env python3
"""29 October 2026: Email OTP required per sender, with the project's switch as the default (CR-01's per-client toggle,
restored after the gap check; New XP's design decision, NPL to confirm). + SENDER.email_otp_required; the D60 entry of the
decision record amended. Idempotent: refuses to run twice."""
import json, sys
P = "data/erd.v5.json"
d = json.load(open(P, encoding="utf-8"))
E = d["E"]
S = E["SENDER"]
if any(f[0] == "email_otp_required" for f in S["f"]): sys.exit("already applied")
i = next(k for k, f in enumerate(S["f"]) if f[0] == "email_otp_chat_group_id")
S["f"].insert(i + 1, ["email_otp_required", "bool", "", "default true while the project's switch is on: this sender's orders are approved by Email OTP; false = the sender is exempt and its orders are approved in its registered chat group as before the feature, and every quote issue sent to it records 'approval taken in chat, Email OTP not required for this sender'. Setting it to false removes a control: Operations enters, Finance approves, Management approves with a recorded reason (set_email_otp_settings); the exemption is listed on the quarterly review (Configuration Schema rule 16; Roles rule 13; Lifecycle 2e)"])
S["ch"].append("v6.1 (29 October 2026): + email_otp_required (Email OTP required per sender, the project's switch as the default; CR-01's own per-client toggle)")
Pj = E["PROJECT"]
for f in Pj["f"]:
    if f[0] == "email_otp_enabled":
        f[3] = (f[3] + "; " if len(f) > 3 and f[3] else "") + "a sender marked not required (SENDER.email_otp_required = false) is quoted and approved in its chat group without it"
        break
else: sys.exit("PROJECT.email_otp_enabled not found")
Pj["ch"].append("v6.1 (29 October 2026): email_otp_enabled is the project default; the requirement is per sender (SENDER.email_otp_required)")
D = d["DECISIONS"]; k = D.find("D60 Email OTP")
if k < 0: sys.exit("D60 not found")
e = D.find("\n", k); e = len(D) if e < 0 else e
D = D[:e] + " Amended 29 October 2026 (New XP's design decision after the CR-01 gap check; NPL to confirm): the requirement is per sender, SENDER.email_otp_required, default true while the project's switch is on; a sender marked not required (a customer who will not name an approver address) is quoted and approved in its registered chat group as today, and every quote issue sent to it records 'approval taken in chat, Email OTP not required for this sender'; marking a sender not required removes a control, so Operations enters, Finance approves and Management approves with a recorded reason, and the exemption is on the quarterly review. This restores CR-01's own per-client toggle (clients with Email OTP off follow today's flow)." + D[e:]
d["DECISIONS"] = D
json.dump(d, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
open(P, "a", encoding="utf-8").write("\n")
print("applied: SENDER.email_otp_required; PROJECT.email_otp_enabled note; D60 amended")
