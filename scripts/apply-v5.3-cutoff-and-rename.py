#!/usr/bin/env python3
"""9 October 2026 (evening), NPL's answers: D15 rename confirmed; D29 amended again — the cutoff governs two
events (rate lock / conversion, and the outgoing bank settlement), applies to pairs that rely on the banking
channel, and can be extended (30–60 min, partner agrees) or closed early (Fridays, pre-holiday) per day.
Idempotent.   python3 scripts/apply-v5.3-cutoff-and-rename.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text()); E, R = d["E"], d["R"]
assert "PARTNER_CUTOFF_OVERRIDE" not in E

def set_note(name, field, note):
    for f in E[name]["f"]:
        if f[0] == field:
            while len(f) < 4: f.append("")
            f[3] = note; return
    raise KeyError((name, field))
def ch(name, text):
    E[name].setdefault("ch", []).append(text); E[name]["v"] = E[name].get("v") or "changed"

# ------------------------------------------------------------------ D15 closed: rename confirmed by NPL
old = "the rename is pending NPL confirmation and the FRS keeps “Facilitating Entity” in Appendix A.1"
d["DECISIONS"] = d["DECISIONS"].replace("rename pending NPL confirmation; the FRS keeps “Facilitating Entity” in Appendix A.1", "rename confirmed by NPL on 9 October 2026; the FRS keeps “Facilitating Entity” in Appendix A.1")
E["PARTNER_ENTITY"]["desc"] = E["PARTNER_ENTITY"]["desc"].replace("the rename is pending NPL confirmation and the FRS keeps", "the rename was confirmed by NPL on 9 October 2026; the FRS keeps")
for q in d["OPENQ"]:
    q["a"] = q["a"].replace("The rename to PARTNER_ENTITY is pending NPL confirmation; the FRS keeps", "The rename to PARTNER_ENTITY was confirmed by NPL on 9 October 2026; the FRS keeps")
txt = json.dumps(d, ensure_ascii=False); assert "pending NPL confirmation" not in txt, txt[txt.find("pending NPL confirmation") - 200: txt.find("pending NPL confirmation") + 50]

# ------------------------------------------------------------------ D29 amended: two events, per-day overrides
set_note("PARTNER", "bank_cutoff_time", "the partner’s standing daily bank cutoff for pairs that rely on the banking channel (Ali 14:30). Governs two events: locking the rate for same-day conversion, and initiating an outgoing bank settlement. Per-day changes live in PARTNER_CUTOFF_OVERRIDE (v5.3, D29)")
E["PARTNER_CUTOFF_OVERRIDE"] = {"d": "config", "col": 2, "v": "new", "ch": ["new in v5.3 (D29, amended 9 Oct)"],
    "desc": "A change to a partner’s bank cutoff for one day or for a recurring weekday: an extension of 30–60 minutes that the partner agreed for an urgent request, or an early close on a Friday or the day before a holiday. The effective cutoff for a day is the one-day override if any, else the weekday rule, else PARTNER.bank_cutoff_time. Finance records it with the partner’s agreement. v5.3 (D29, amended 9 October).",
    "f": [["id", "int", "PK"], ["partner_id", "int", "FK"], ["applies_on", "date", "", "one day; null for a weekday rule"], ["weekday", "string", "", "recurring rule (Friday); null for a one-day override"],
          ["cutoff_time", "time", "", "the cutoff that applies instead"], ["kind", "string", "", "extension / early_close"], ["reason", "string", "", "urgent request / pre-holiday / partner notice"],
          ["partner_agreement_ref", "string", "", "the partner agreed (extensions)"], ["recorded_by", "int", "FK", "Finance"]]}
d["ORDER"]["2"].append("PARTNER_CUTOFF_OVERRIDE")
R.append(["PARTNER", "PARTNER_CUTOFF_OVERRIDE", "owns", "partner_id", "per-day or weekday cutoff changes", "1 : n", "new"])
R.append(["USER", "PARTNER_CUTOFF_OVERRIDE", "actor", "recorded_by", "recorded_by", "1 : n", "new"])
set_note("PARTNER_PAIR", "needs_bank_lock", "the pair relies on the banking channel, so the partner’s cutoff governs its rate lock and its settlement (Evo pairs into EUR; USDT → USD / SGD at Ali); crypto-only pairs do not (v5.3, D29)")
E["DEAL"]["f"].append(["cutoff_at", "datetime", "", "the effective cutoff that applied on the lock day (standing time or override), stamped with rate_locked_at (v5.3, D29 amended 9 Oct)"])
set_note("DEAL", "conversion_due_date", "the lock date when rate_locked_at precedes cutoff_at, else the next business day; Converting may not start earlier (v5.3, D29)")
ch("DEAL", "v5.3 (D29, amended 9 Oct): + cutoff_at — the effective cutoff stamped at lock")
E["DISBURSEMENT"]["f"] += [["cutoff_at", "datetime", "", "the effective cutoff of the approval day for a bank rail (standing time or override) (v5.3, D29 amended 9 Oct)"],
                          ["execution_due_date", "date", "", "the approval date when approved before cutoff_at, else the next business day; a bank transfer is initiated no earlier (v5.3, D29 amended 9 Oct)"]]
ch("DISBURSEMENT", "v5.3 (D29, amended 9 Oct): + cutoff_at, execution_due_date — an outgoing bank settlement approved after the cutoff goes out the next business day")
E["DISBURSEMENT"]["desc"] += " v5.3 (D29): on a bank rail, a disbursement approved after the partner’s effective cutoff is initiated the next business day (execution_due_date); crypto payouts are not bound by the cutoff."
d["INV"][27] = [["DEAL", "DISBURSEMENT", "PARTNER", "PARTNER_CUTOFF_OVERRIDE", "PARTNER_PAIR", "CONVERSION"],
    "The partner’s cutoff binds two events on pairs that rely on the banking channel. The effective cutoff for a day is the one-day PARTNER_CUTOFF_OVERRIDE if any, else the weekday rule, else PARTNER.bank_cutoff_time, and is stamped (cutoff_at) on the leg at rate lock and on the disbursement at approval. A leg’s conversion_due_date is the lock date when rate_locked_at precedes cutoff_at and the next business day otherwise, and Converting may not start before it; a bank-rail disbursement’s execution_due_date follows the same rule from its approval time. The sender’s figures are write-once (invariant 5); the difference between the stamped partner rate and the rate actually used posts to VARIANCE with component cutoff_timing — NPL absorbs it (v5.3, D29, amended 9 October)."]
for i, v in enumerate(d["FRS_VOCAB"]):
    if v[0].startswith("Bank cutoff"):
        d["FRS_VOCAB"][i] = [v[0], "PARTNER.bank_cutoff_time + PARTNER_CUTOFF_OVERRIDE (extensions, early closes); PARTNER_PAIR.needs_bank_lock; DEAL.rate_locked_at, cutoff_at, conversion_due_date; DISBURSEMENT.cutoff_at, execution_due_date (D29)"]
d["NOTES"]["Configuration"] = [n.replace("the partner’s bank cutoff on PARTNER (D29)", "the partner’s bank cutoff on PARTNER with per-day extensions and early closes in PARTNER_CUTOFF_OVERRIDE (D29)") for n in d["NOTES"]["Configuration"]]
d["NOTES"]["Deal lifecycle"] = [n.replace("a leg records when the rate was locked and when the conversion is due (D29)", "a leg records when the rate was locked, the cutoff that applied and when the conversion is due, and a bank-rail disbursement records the cutoff and the day it may go out (D29)") for n in d["NOTES"]["Deal lifecycle"]]
d["FEE_PRACTICE"]["answers"].append("Bank cutoff (NPL, 9 October): the cutoff is per partner and applies to the currencies that rely on bank transfer. Two events depend on it — getting / locking the rate from the partner, and initiating the outgoing settlement bank transfer. For urgent requests the partner may agree to extend it by 30–60 minutes; on Fridays or before a holiday the partner may close an hour early.")
d["DECISIONS"] += ("\nAMENDED 9 OCTOBER 2026 (evening), D29 — NPL: the cutoff is per partner and applies to currencies that rely on bank transfer; two events depend on it, locking the rate and initiating the outgoing settlement bank transfer; it can be extended 30–60 minutes for an urgent request if the partner agrees, and moved earlier on Fridays or before a holiday. "
    "Model: PARTNER_CUTOFF_OVERRIDE (one day or weekday; extension / early_close; partner agreement; recorded by Finance); the effective cutoff is stamped as cutoff_at on the leg at rate lock and on the disbursement at approval; DISBURSEMENT.execution_due_date mirrors DEAL.conversion_due_date for bank rails; invariant 28 restated. D15 — the PARTNER_ENTITY rename confirmed by NPL the same day.")
names = set(E)
for r in R: assert r[0] in names and r[1] in names, r
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("tables", sum(1 for e in E.values() if e["d"] != "view"), "views", sum(1 for e in E.values() if e["d"] == "view"), "relations", len(R))
