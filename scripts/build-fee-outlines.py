#!/usr/bin/env python3
"""Build docs/NPLify-Fee-Outlines-v0.1.xlsx from data/remittance-fees-2026-10.xlsx.

One 'Register' sheet with a fill-in row per line of NPL's fee table, and one outline sheet per
transaction pattern: configuration slots (ERD fields), a simulation that computes what the system
would quote, convert and pay from those slots, the postings it would write, and a check against the
figures NPL quoted in the sheet. Yellow cells are for NPL to fill; blue cells are inputs taken from
the sheet; black cells are formulas.   python3 scripts/build-fee-outlines.py
"""
import re
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/remittance-fees-2026-10.xlsx"
OUT = ROOT / "docs/NPLify-Fee-Outlines-v0.1.xlsx"

FONT = "Arial"
F_IN = Font(name=FONT, size=10, color="0000FF")          # input taken from the sheet
F_TXT = Font(name=FONT, size=10)
F_B = Font(name=FONT, size=10, bold=True)
F_H = Font(name=FONT, size=13, bold=True, color="2F5D9E")
F_H2 = Font(name=FONT, size=11, bold=True, color="2F5D9E")
F_NOTE = Font(name=FONT, size=9, italic=True, color="555555")
FILL_FIX = PatternFill("solid", fgColor="FFFF00")         # NPL fills this in
FILL_HEAD = PatternFill("solid", fgColor="E8EEF7")
FILL_CHK = PatternFill("solid", fgColor="F3F6FB")
THIN = Side(style="thin", color="BBBBBB")
BOX = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")
PCT = "0.00%"
NUM = "#,##0.00"
RATE = "0.000000"

# ------------------------------------------------------------------ read the source sheet
src = openpyxl.load_workbook(SRC, data_only=True).active
ROWS = []
for r in range(3, src.max_row + 1):
    v = [src.cell(r, c).value for c in range(1, 11)]
    if v[0] is None:
        continue
    ROWS.append({"row": r, "client": v[0], "example": v[1], "calc": v[2], "fee": v[3], "partner": (v[4] or "").strip(),
                 "cost": v[5], "margin": v[6], "pair": v[7], "share": v[8], "note": v[9]})
assert len(ROWS) == 45, len(ROWS)

def pct(v):
    if isinstance(v, (int, float)):
        return v
    m = re.match(r"\s*([\d.]+)%", str(v or ""))
    return float(m.group(1)) / 100 if m else None

def pattern_of(row):
    c = (row["calc"] or "").lower(); client = row["client"]; p = row["partner"]
    if "LT Sub" in p: return "P07"
    if client.startswith("27 Group"): return "P08"
    if client.startswith("BF-Withdrawal"): return "P09"
    if client.startswith("GDC"): return "P05"
    if "Raeen" in client and row["share"] not in (None, "none"): return "P06"
    if client.startswith("AK ") or client.startswith("Ad Hoc"): return "P11" if client.startswith("AK ") else "P10"
    if "cash" in str(row["pair"]).lower(): return "P10"
    if client.startswith("Evolution USD, EUR"): return "P12"
    if "sender pays" in str(row["fee"]): return "P03"
    if row["note"] and ("not fixed" in row["note"] or "changes" in row["note"] or "change every" in row["note"] or "Fees change" in row["note"]) or isinstance(row["fee"], str) and "-" in str(row["fee"]) or isinstance(row["cost"], str) and "-" in str(row["cost"]):
        return "P04"
    if "market rate" in c: return "P01"
    if "agent rate" in c: return "P02"
    return "P04"

PATTERN_NAMES = {
    "P01": "Market-minus; partner pays NPL its share", "P02": "Agent rate; displayed fee differs from true total",
    "P03": "Sender + receiver split", "P04": "Variable fee quoted per transaction, with a floor",
    "P05": "Volume-tiered fee", "P06": "Earnings shared with the client's own party",
    "P07": "Own-desk reseller (NPL converts, no partner)", "P08": "Cash in, partner converts to USDT, vendors paid in USDT",
    "P09": "Withdrawal (bank in, crypto out)", "P10": "Cash collection in an exotic currency",
    "P11": "Zero-fee internal collection", "P12": "Same-currency bank pass-through",
}

# ------------------------------------------------------------------ workbook helpers
wb = openpyxl.Workbook()
wb.remove(wb.active)

def cell(ws, ref, value, font=F_TXT, fill=None, fmt=None, wrap=False, border=True):
    c = ws[ref]
    c.value = value
    c.font = font
    if fill: c.fill = fill
    if fmt: c.number_format = fmt
    if wrap: c.alignment = WRAP
    if border: c.border = BOX
    return c

def header(ws, ref, text, font=F_H):
    c = ws[ref]; c.value = text; c.font = font

def widths(ws, spec):
    for col, w in spec.items():
        ws.column_dimensions[col].width = w

# ------------------------------------------------------------------ Read me
ws = wb.create_sheet("Read me")
widths(ws, {"A": 30, "B": 110})
header(ws, "A1", "NPLify — Fee outlines for simulation · v0.1 (8 October 2026)")
lines = [
    ("What this is", "Every line of NPL's 'Table of Remittance Customers Fees' turned into an outline the system can execute: the configuration slots the ERD needs (project, sender, receiver, partner block, fee structure, rounding), pre-filled where the sheet says, left for NPL to fill where it does not. Each pattern sheet also carries a simulation: enter the slots and an amount, and it shows what the system would quote, convert, pay and post — and compares that to the figure NPL quoted in the sheet."),
    ("How to fill", "Yellow cells are for NPL to fill. Blue cells are inputs copied or derived from the sheet (change them if the sheet is wrong). Black cells are formulas — do not type over them. 'Source' says where a value came from; 'NPL to confirm' lists what we could not read from the sheet."),
    ("Sheets", "Register — one row per sheet line (45), with every slot in columns; the pattern sheets P01–P12 — one representative worked example per transaction pattern, with the full simulation. A row's pattern is in the Register's column D."),
    ("The simulation", "Follows the Calculation Specification v1.0: all rates are OUT units per 1 IN unit; sender rate = base rate × (1 − sender share); gross out = amount × sender rate; receiver fee = gross out × receiver share; client net = gross − receiver fee; the partner delivers amount × partner rate (disclosed) or amount × market × (1 − partner markup) (market-plus); NPL earnings = delivered − client net; payouts go out in whole units with the dust carried. Where a pattern depends on a v5.3 proposal (tiers, displayed fee, own desk, invoice discharge, rounding options) the slot says so."),
    ("What to do with it", "1. NPL fills the yellow slots and corrects any blue input. 2. For each pattern, the 'Check against the sheet' block must show a difference of zero (or an explained one). 3. The filled Register becomes the input for the Configuration Schema (one FEE_STRUCTURE / override / rebate / referral rule per row) and the pattern sheets become acceptance vectors for the engine."),
    ("Legend", "ERD field names are in UPPER_SNAKE_CASE.column. '(v5.3 proposal X)' marks a slot that needs one of the proposals A–F from the gap review of 8 October; it can still be filled now."),
]
r = 3
for k, v in lines:
    cell(ws, f"A{r}", k, F_B, wrap=True); cell(ws, f"B{r}", v, F_TXT, wrap=True); ws.row_dimensions[r].height = 62; r += 1
r += 1
cell(ws, f"A{r}", "Colour", F_B); cell(ws, f"B{r}", "Meaning", F_B); r += 1
cell(ws, f"A{r}", "NPL fills in", F_TXT, FILL_FIX); cell(ws, f"B{r}", "Value not in the sheet — please supply", F_TXT); r += 1
cell(ws, f"A{r}", "From the sheet", F_IN); cell(ws, f"B{r}", "Input copied or derived from the fee table (blue text)", F_TXT); r += 1
cell(ws, f"A{r}", "Formula", F_TXT); cell(ws, f"B{r}", "Computed by the workbook (black)", F_TXT); r += 1
r += 1
cell(ws, f"A{r}", "Pattern", F_B); cell(ws, f"B{r}", "Name · sheet lines", F_B); r += 1
for pid in sorted(PATTERN_NAMES):
    rows = [str(x["row"]) for x in ROWS if pattern_of(x) == pid]
    cell(ws, f"A{r}", pid, F_TXT); cell(ws, f"B{r}", f"{PATTERN_NAMES[pid]} · sheet rows {', '.join(rows) or '—'}", F_TXT); r += 1

# ------------------------------------------------------------------ Register
ws = wb.create_sheet("Register")
COLS = [
    ("#", 5), ("Sheet row", 7), ("Client / product (PROJECT)", 30), ("Pattern", 8), ("Flow in words (from the sheet)", 44),
    ("Senders (SENDER)", 18), ("Receiver / vendor (RECEIVER, kind)", 22), ("Receiving account: currency · rail · kind (RECEIVING_ENTITY_ACCOUNT)", 24),
    ("Collection method (DEAL.collection_method)", 16), ("Collection endpoint: partner entity · kind · network/rail (COLLECTION_RECEIVING_ENDPOINT)", 28),
    ("Partner (PARTNER / PARTNER_CONFIG)", 16), ("Partner pricing (PARTNER_PAIR.partner_pricing)", 18), ("Pair from → to (CURRENCY_PAIR)", 18),
    ("Quote direction (CURRENCY_PAIR.quote_direction)", 14), ("Rate basis (FEE_STRUCTURE.rate_basis)", 12), ("Fee mode (FEE_STRUCTURE.mode)", 10),
    ("Fee total % (FEE_STRUCTURE.pct)", 11), ("Sender share % (sender_share_pct)", 11), ("Receiver share % (receiver_share_pct)", 11),
    ("Floor % (floor_pct)", 9), ("Cap % (cap_pct)", 9), ("Min margin % (min_margin_pct)", 10), ("Displayed fee % (v5.3 proposal C)", 12),
    ("Partner cost % (from sheet)", 12), ("NPL margin % (from sheet)", 12), ("NPL share mechanic: pool at partner / rebate / own desk", 18),
    ("Rebate % of partner fee (PARTNER_REBATE_RULE)", 14), ("Earnings share: to whom · % (REFERRAL_RULE)", 22), ("Rounding option · unit (CURRENCY_PAIR.amount_rounding; v5.3 proposal F)", 18),
    ("Settlement rail (SETTLEMENT_RAIL)", 16), ("Narrative (SETTLEMENT_SENDING_ENTITY)", 16), ("Registration status (SETTLEMENT_REGISTRATION)", 14),
    ("Volume tier (v5.3 proposal B)", 16), ("Note from the sheet", 40), ("NPL to confirm", 40),
]
for i, (h, w) in enumerate(COLS, 1):
    c = cell(ws, f"{get_column_letter(i)}1", h, F_B, FILL_HEAD, wrap=True); ws.column_dimensions[get_column_letter(i)].width = w
ws.row_dimensions[1].height = 78
ws.freeze_panes = "E2"

def partner_pricing(p):
    return "market_plus_pct" if p in ("Jeton", "Aquanow") else "own_desk (v5.3 proposal D)" if "LT Sub" in p else "disclosed_rate" if p == "Ali" else ""

def mechanic(row):
    if "LT Sub" in row["partner"]: return "own desk (proposal D)"
    if "referral commission" in str(row["margin"]).lower(): return "rebate? (sheet says 'referral commission') — confirm"
    if row["partner"] in ("Jeton", "Aquanow"): return "pool at partner? — confirm"
    return "pool at partner"

def pair_dir(row):
    p = str(row["pair"] or "")
    return p.replace("\n", "; ").replace(" > ", " → ")

for i, row in enumerate(ROWS, 2):
    pid = pattern_of(row)
    fee = pct(row["fee"]); cost = pct(row["cost"]); margin = pct(row["margin"])
    split = re.search(r"sender pays ([\d.]+)%.*receiver pays ([\d.]+)%", str(row["fee"]))
    share = row["share"] if row["share"] not in (None, "none") else ""
    confirm = []
    if fee is None: confirm.append("total fee is a range or text — give floor, cap and the usual value")
    if cost is None: confirm.append("partner cost is a range/text — give the usual value or 'inferred from rate comparison'")
    if margin is None and not isinstance(row["margin"], (int, float)): confirm.append("NPL margin not numeric")
    if row["partner"] in ("Jeton", "Aquanow"): confirm.append("does the partner keep NPL's share at its end (pool) or pay it back monthly (rebate)?")
    if pid == "P02": confirm.append("true market rate at quote time (the sheet shows the recomputed one)")
    if "Fee is not fixed" in str(row["note"]) or "changes" in str(row["note"]): confirm.append("who sets the fee per transaction and within what bounds")
    vals = [i - 1, row["row"], row["client"], pid, row["example"] or "", "", "", "", "", "", row["partner"], partner_pricing(row["partner"]), pair_dir(row), "", "",
            "variable" if fee is None or (row["note"] and ("not fixed" in row["note"] or "change" in row["note"])) else "fixed",
            fee if fee is not None else row["fee"], float(split.group(1)) / 100 if split else (fee if fee is not None and not split else ""),
            float(split.group(2)) / 100 if split else ("" if fee is None else 0), "", "", "", "", cost if cost is not None else row["cost"],
            margin if margin is not None else row["margin"], mechanic(row), "", share, "", "", "", "", "", row["note"] or "", "; ".join(confirm)]
    for j, v in enumerate(vals, 1):
        ref = f"{get_column_letter(j)}{i}"
        is_fill = v == "" and j not in (34, 35)
        font = F_IN if j in (3, 5, 11, 12, 13, 16, 17, 18, 19, 24, 25, 28, 34) and v != "" else F_TXT
        c = cell(ws, ref, v, font, FILL_FIX if is_fill else None, PCT if j in (17, 18, 19, 20, 21, 22, 23, 24, 25, 27) and isinstance(v, (int, float)) else None, wrap=True)
    ws.row_dimensions[i].height = 60

# ------------------------------------------------------------------ pattern sheets
def pattern_sheet(pid, title, rows, erd_entities, slots, sim, sheet_figures, open_points, extra=None):
    """slots: list of (slot, erd_field, value, source, note); value None -> yellow.
    sim: dict of inputs (label, key, value, fmt, source); formulas are written by write_sim."""
    ws = wb.create_sheet(pid)
    widths(ws, {"A": 34, "B": 34, "C": 22, "D": 18, "E": 48})
    header(ws, "A1", f"{pid} — {title}")
    cell(ws, "A2", "Representative sheet rows", F_B, border=False); cell(ws, "B2", ", ".join(str(r) for r in rows), F_TXT, border=False)
    cell(ws, "A3", "ERD entities involved", F_B, border=False); cell(ws, "B3", erd_entities, F_TXT, wrap=True, border=False); ws.row_dimensions[3].height = 30
    r = 5
    header(ws, f"A{r}", "A · Configuration slots", F_H2); r += 1
    for j, h in enumerate(["Slot", "ERD field", "Value", "Source", "Note"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    for slot, field, value, source, note in slots:
        cell(ws, f"A{r}", slot, F_TXT, wrap=True); cell(ws, f"B{r}", field, F_TXT, wrap=True)
        cell(ws, f"C{r}", value if value is not None else "", F_IN if value is not None else F_TXT, None if value is not None else FILL_FIX, PCT if isinstance(value, float) and abs(value) < 1 and "rate" not in slot.lower() else None, wrap=True)
        cell(ws, f"D{r}", source, F_TXT, wrap=True); cell(ws, f"E{r}", note, F_NOTE, wrap=True)
        ws.row_dimensions[r].height = 30 if len(note) > 60 or len(slot) > 34 else 16
        r += 1
    r += 1
    header(ws, f"A{r}", "B · Simulation — inputs (change freely)", F_H2); r += 1
    for j, h in enumerate(["Input", "Key", "Value", "Format", "Source / meaning"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    REF = {}
    for label, key, value, fmt, source in sim:
        cell(ws, f"A{r}", label, F_TXT, wrap=True); cell(ws, f"B{r}", key, F_NOTE)
        cell(ws, f"C{r}", value if value is not None else "", F_IN if value is not None else F_TXT, None if value is not None else FILL_FIX, fmt)
        cell(ws, f"D{r}", {PCT: "percent", RATE: "rate, OUT per 1 IN", NUM: "amount"}.get(fmt, "text"), F_NOTE); cell(ws, f"E{r}", source, F_NOTE, wrap=True)
        REF[key] = f"$C${r}"; r += 1
    r += 1
    header(ws, f"A{r}", "C · Simulation — what the system computes", F_H2); r += 1
    for j, h in enumerate(["Figure", "Formula in words", "Value", "", "Calculation Specification step"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    def out(label, words, formula, fmt=NUM, step=""):
        nonlocal r
        cell(ws, f"A{r}", label, F_TXT, wrap=True); cell(ws, f"B{r}", words, F_NOTE, wrap=True)
        cell(ws, f"C{r}", formula, F_TXT, None, fmt); cell(ws, f"E{r}", step, F_NOTE, wrap=True)
        REF[label] = f"$C${r}"; r += 1
        return REF[label]
    K = REF
    base = out("Base rate", "market rate if basis = market, else partner rate", f'=IF({K["basis"]}="market",{K["Rm"]},{K["Rp"]})', RATE, "§2 fee basis")
    out("Sender rate (what the sender is quoted)", "base × (1 − sender share) for out-per-in quoting; base ÷ (1 + sender share) when the fee is added to an in-per-out rate",
        f'=IF({K["dir"]}="in_per_out",{base}/(1+{K["s"]}),{base}*(1-{K["s"]}))', RATE, "§3 sender split; CURRENCY_PAIR.quote_direction")
    out("Gross out (promised before receiver share)", "amount in × sender rate", f'={K["A"]}*{K["Sender rate (what the sender is quoted)"]}', NUM, "§3")
    out("Receiver fee", "gross out × receiver share", f'={K["Gross out (promised before receiver share)"]}*{K["r"]}', NUM, "§3")
    out("Client net (group entitlement)", "gross out − receiver fee", f'={K["Gross out (promised before receiver share)"]}-{K["Receiver fee"]}', NUM, "§5")
    out("Delivered by the partner (actual out)", "amount × partner rate (disclosed) · amount × market × (1 − partner markup) (market-plus) · amount × market (own desk)",
        f'=IF({K["pricing"]}="own_desk",{K["A"]}*{K["Rm"]},IF({K["pricing"]}="market_plus_pct",{K["A"]}*{K["Rm"]}*(1-{K["m"]}),{K["A"]}*{K["Rp"]}))', NUM, "§5 what the partner delivers")
    out("Partner cost", "amount × market − delivered (0 for own desk)", f'={K["A"]}*{K["Rm"]}-{K["Delivered by the partner (actual out)"]}', NUM, "§5")
    out("NPL earnings at conversion", "delivered − client net", f'={K["Delivered by the partner (actual out)"]}-{K["Client net (group entitlement)"]}', NUM, "§5; ERD invariant 16 (margin captured at conversion)")
    out("NPL margin %", "earnings ÷ (amount × market)", f'=IF({K["A"]}*{K["Rm"]}=0,0,{K["NPL earnings at conversion"]}/({K["A"]}*{K["Rm"]}))', PCT, "§5")
    out("Below minimum margin?", "margin % < min margin → quote needs Finance approval", f'=IF({K["NPL margin %"]}<{K["minm"]},"YES — Finance approval","no")', None, "Lifecycle v1.1 §4; FEE_STRUCTURE.min_margin_pct")
    out("Payout in whole units", "client net rounded per the pair's rounding option and unit", f'=IF({K["round"]}="round_up_unit",CEILING({K["Client net (group entitlement)"]},{K["unit"]}),IF({K["round"]}="nearest_unit",MROUND({K["Client net (group entitlement)"]},{K["unit"]}),IF({K["round"]}="nearest_n",MROUND({K["Client net (group entitlement)"]},{K["unit"]}),FLOOR({K["Client net (group entitlement)"]},{K["unit"]}))))', NUM, "§9 rounding; v5.3 proposal F for options other than truncate")
    out("Rounding residual (dust; negative = NPL cost)", "client net − payout", f'={K["Client net (group entitlement)"]}-{K["Payout in whole units"]}', NUM, "CONVERSION.rounding_residual")
    out("Displayed source rate (quote package)", "sender rate ÷ (1 − displayed fee) — what the customer-facing calculation prints", f'=IF({K["disp"]}="",{base},{K["Sender rate (what the sender is quoted)"]}/(1-{K["disp"]}))', RATE, "v5.3 proposal C")
    out("Rebate receivable (if mechanic = rebate)", "partner's fee × rebate %", f'=IF({K["mech"]}="rebate",{K["Partner cost"]}*{K["rebate"]},0)', NUM, "PARTNER_REBATE_RULE / ACCRUAL")
    out("Referral or client share accrued", "amount × market × share %", f'={K["A"]}*{K["Rm"]}*{K["refpct"]}', NUM, "REFERRAL_RULE basis fixed_pct → REFERRAL_ACCRUAL")
    out("Identity: client net + partner cost + earnings = amount × market", "must be zero", f'=ROUND({K["Client net (group entitlement)"]}+{K["Partner cost"]}+{K["NPL earnings at conversion"]}-{K["A"]}*{K["Rm"]},6)', NUM, "Calc spec §11 acceptance")
    r += 1
    header(ws, f"A{r}", "D · Expected postings (Ledger Posting Design v1.1)", F_H2); r += 1
    for j, h in enumerate(["Account (OWNER.HOLDER.CCY.PURPOSE)", "Side", "Amount", "Owner · cost component", "Event"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    P = K["partner_code"]; IN = K["ccy_in"]; OUTC = K["ccy_out"]
    posts = [
        (f'="CL."&{P}&"."&{IN}&".COLLECTED"', "Dr", f'={K["A"]}', "client · principal", "Collection"),
        (f'="CL.PROJECT."&{IN}&".PAYABLE"', "Cr", f'={K["A"]}', "client · principal", "Collection"),
        (f'="CL.PROJECT."&{IN}&".PAYABLE"', "Dr", f'={K["A"]}', "client · principal", "Conversion, in-currency leg"),
        (f'="CL."&{P}&"."&{IN}&".COLLECTED"', "Cr", f'={K["A"]}', "client · principal", "Conversion, in-currency leg"),
        (f'="CL."&{P}&"."&{OUTC}&".DUE"', "Dr", f'={K["Client net (group entitlement)"]}', "client · principal (incl. rounding dust)", "Conversion, out-currency leg"),
        (f'="CO."&{P}&"."&{OUTC}&".POOL"', "Dr", f'=IF({K["mech"]}="rebate",0,{K["NPL earnings at conversion"]})', "company · earnings", "Conversion — margin left at the partner"),
        (f'="CO."&{P}&"."&{OUTC}&".REBATE_RECEIVABLE"', "Dr", f'={K["Rebate receivable (if mechanic = rebate)"]}', "company · earnings", "Conversion — margin owed back by the partner (rebate mechanic)"),
        (f'="CL.PROJECT."&{OUTC}&".PAYABLE"', "Cr", f'={K["Client net (group entitlement)"]}', "client · principal", "Conversion, out-currency leg"),
        (f'="CO.NONE."&{OUTC}&".EARN_GROSS"', "Cr", f'={K["NPL earnings at conversion"]}+{K["Rebate receivable (if mechanic = rebate)"]}', "company · earnings", "Margin recognised (invariant 16)"),
        (f'="CL."&{P}&"."&{OUTC}&".INTRANSIT"', "Dr", f'={K["Payout in whole units"]}', "client · principal", "Disbursement (whole units)"),
        (f'="CL."&{P}&"."&{OUTC}&".DUE"', "Cr", f'={K["Payout in whole units"]}', "client · principal", "Disbursement"),
        (f'="CL.PROJECT."&{OUTC}&".PAYABLE"', "Dr", f'={K["Payout in whole units"]}', "client · principal", "Confirmation, full"),
        (f'="CL."&{P}&"."&{OUTC}&".INTRANSIT"', "Cr", f'={K["Payout in whole units"]}', "client · principal", "Confirmation, full"),
        (f'="CO.NONE."&{OUTC}&".EARN_GROSS"', "Dr", f'={K["Referral or client share accrued"]}', "company · referral", "Referral accrual (if a share rule applies)"),
        (f'="CO.INTRODUCER."&{OUTC}&".REFERRAL_PAYABLE"', "Cr", f'={K["Referral or client share accrued"]}', "company · referral", "Referral accrual"),
    ]
    r0 = r
    for acct, side, amt, tag, ev in posts:
        cell(ws, f"A{r}", acct, F_TXT); cell(ws, f"B{r}", side, F_TXT); cell(ws, f"C{r}", amt, F_TXT, None, NUM); cell(ws, f"D{r}", tag, F_NOTE); cell(ws, f"E{r}", ev, F_NOTE); r += 1
    cell(ws, f"A{r}", "Check: debits = credits in the OUT currency (conversion out-leg + settlement + referral)", F_B, FILL_CHK, wrap=True)
    cell(ws, f"C{r}", f'=ROUND(SUMIF($B${r0+4}:$B${r-1},"Dr",$C${r0+4}:$C${r-1})-SUMIF($B${r0+4}:$B${r-1},"Cr",$C${r0+4}:$C${r-1}),6)', F_TXT, FILL_CHK, NUM)
    cell(ws, f"E{r}", "ERD invariant 1: postings in one transaction sum to zero per currency (the in-currency rows balance by construction)", F_NOTE, wrap=True); ws.row_dimensions[r].height = 30; r += 2
    header(ws, f"A{r}", "E · Check against the sheet", F_H2); r += 1
    for j, h in enumerate(["Figure NPL quoted", "Sheet value", "Simulated", "Difference", "Comment"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    for label, sheet_val, sim_key, comment in sheet_figures:
        cell(ws, f"A{r}", label, F_TXT, wrap=True); cell(ws, f"B{r}", sheet_val, F_IN, None, NUM if isinstance(sheet_val, (int, float)) and sheet_val > 10 else RATE)
        cell(ws, f"C{r}", f"={K[sim_key]}", F_TXT, None, NUM if isinstance(sheet_val, (int, float)) and sheet_val > 10 else RATE)
        cell(ws, f"D{r}", f"=ROUND(C{r}-B{r},2)", F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", comment, F_NOTE, wrap=True); ws.row_dimensions[r].height = 30 if len(comment) > 50 else 16; r += 1
    if extra:
        r += 1; r = extra(ws, r, K)
    r += 1
    header(ws, f"A{r}", "F · Open points for NPL", F_H2); r += 1
    for p in open_points:
        cell(ws, f"A{r}", "•", F_TXT, border=False); cell(ws, f"B{r}", p, F_TXT, wrap=True, border=False); ws.merge_cells(f"B{r}:E{r}"); ws.row_dimensions[r].height = 32; r += 1
    return ws

# common slot builders
def common_slots(project, sender, receiver, account, method, endpoint, partner, pricing, pair, direction, basis, mode, fee, s, r_, floor, cap, minm, disp, mech, rebate, share, rounding, rail, narrative, reg):
    return [
        ("Client / project", "PROJECT.name", project, "sheet", "One project per client; the default receiver group is created with it."),
        ("Sender(s)", "SENDER.name; SENDER_RECEIVER_ALLOW → default group", sender, "sheet" if sender else "NPL", "Who pays in. A sender must be allowed to pay the entitled group."),
        ("Receiver / vendor", "RECEIVER (kind counterparty) → RECEIVING_ENTITY", receiver, "sheet" if receiver else "NPL", "Who is paid. A refund destination would be a sender_return receiver."),
        ("Receiving account", "RECEIVING_ENTITY_ACCOUNT.currency · rail · account_kind", account, "sheet" if account else "NPL", "EUR via SEPA and EUR via SWIFT are two accounts; a wallet has network + address."),
        ("Collection method", "DEAL.collection_method", method, "sheet", "crypto / bank / cash. Cash has no endpoint record."),
        ("Collection endpoint", "PARTNER_ENTITY → COLLECTION_RECEIVING_ENDPOINT (kind, network or rail)", endpoint, "sheet" if endpoint else "NPL", "Must be active, belong to the leg's partner vehicle and match the collection method (D18, D19)."),
        ("Partner", "PARTNER + PARTNER_CONFIG", partner, "sheet", ""),
        ("Partner pricing", "PARTNER_PAIR.partner_pricing (+ partner_markup_pct)", pricing, "sheet", "market_plus_pct: the partner states its fee on top of market; disclosed_rate: its margin is inside its rate."),
        ("Currency pair", "CURRENCY_PAIR.from_currency → to_currency", pair, "sheet", "from = collection currency, to = payout currency."),
        ("Quote direction", "CURRENCY_PAIR.quote_direction", direction, "sheet", "out_per_in: fee deducted from the rate the sender gets; in_per_out: fee added to what the sender pays per unit received."),
        ("Rate basis", "FEE_STRUCTURE.rate_basis", basis, "sheet", "market: fee applied on the market rate; partner: on the partner's rate."),
        ("Fee mode", "FEE_STRUCTURE.mode", mode, "sheet", "fixed, or variable within floor/cap with a minimum margin."),
        ("Fee total %", "FEE_STRUCTURE.pct", fee, "sheet" if fee is not None else "NPL", "sender share + receiver share."),
        ("Sender share %", "FEE_STRUCTURE.sender_share_pct", s, "sheet" if s is not None else "NPL", ""),
        ("Receiver share %", "FEE_STRUCTURE.receiver_share_pct", r_, "sheet" if r_ is not None else "NPL", "Taken at conversion from the client's balance (receiver_fee_timing = at_conversion)."),
        ("Floor %", "FEE_STRUCTURE.floor_pct", floor, "NPL" if floor is None else "sheet", "variable mode only"),
        ("Cap %", "FEE_STRUCTURE.cap_pct", cap, "NPL" if cap is None else "sheet", "variable mode only"),
        ("Minimum margin %", "FEE_STRUCTURE.min_margin_pct", minm, "sheet" if minm is not None else "NPL", "A quote below it needs Finance approval."),
        ("Displayed fee %", "FEE_STRUCTURE.displayed_fee_pct (v5.3 proposal C)", disp, "sheet" if disp is not None else "n/a", "What the customer-facing calculation prints, when it differs from the true total."),
        ("NPL share mechanic", "pool at partner (CO.<PARTNER>.POOL) / rebate (PARTNER_REBATE_RULE) / own desk (v5.3 proposal D)", mech, "NPL to confirm" if "confirm" in str(mech) else "sheet", "Decides the postings and the monthly reconciliation."),
        ("Rebate % of partner fee", "PARTNER_REBATE_RULE.pct_of_partner_fee", rebate, "derived" if rebate is not None else "n/a", "Only when the mechanic is rebate."),
        ("Earnings share with another party", "INTRODUCER + REFERRAL_RULE (basis fixed_pct) → REFERRAL_ACCRUAL", share, "sheet" if share else "n/a", "Paid out of NPL's earnings."),
        ("Rounding option · unit", "CURRENCY_PAIR.amount_rounding (+ rounding_unit, v5.3 proposal F)", rounding, "sheet" if rounding else "NPL", "truncate_unit is the agreed default; the sheet shows nearest-1,000 and round-up in use."),
        ("Settlement rail", "SETTLEMENT_RAIL (bank / EMI that executes the payout, expected bank fee)", rail, "NPL" if rail is None else "sheet", ""),
        ("Narrative", "SETTLEMENT_SENDING_ENTITY.narrative_name", narrative, "NPL" if narrative is None else "sheet", "Name the receiver sees on the transfer."),
        ("Registration", "SETTLEMENT_REGISTRATION.approval_status (+ details in the account's kind, D16)", reg, "NPL" if reg is None else "sheet", "A quote cannot leave Inquiry without an approved registration for the entitled group."),
    ]

def sim_inputs(A, ccy_in, ccy_out, Rm, Rp, m, f, s, r_, basis, pricing, direction, rounding, unit, minm, disp, mech, rebate, refpct, partner_code):
    return [
        ("Amount in", "A", A, NUM, "the sender's amount, in the collection currency"),
        ("Collection currency", "ccy_in", ccy_in, None, ""), ("Payout currency", "ccy_out", ccy_out, None, ""),
        ("Partner code (ledger holder)", "partner_code", partner_code, None, "PARTNER_CONFIG code used in account names"),
        ("Market rate Rm", "Rm", Rm, RATE, "OUT per 1 IN at quote time (MARKET_RATE snapshot)"),
        ("Partner rate Rp (disclosed-rate partners)", "Rp", Rp, RATE, "OUT per 1 IN as offered (PARTNER_RATE_VERSION); blank for market-plus partners"),
        ("Partner markup m (market-plus partners)", "m", m, PCT, "PARTNER_PAIR.partner_markup_pct; 0 for disclosed-rate or own desk"),
        ("Fee total f", "f", f, PCT, "FEE_STRUCTURE.pct"), ("Sender share s", "s", s, PCT, "FEE_STRUCTURE.sender_share_pct"), ("Receiver share r", "r", r_, PCT, "FEE_STRUCTURE.receiver_share_pct"),
        ("Rate basis", "basis", basis, None, "market / partner"), ("Partner pricing", "pricing", pricing, None, "market_plus_pct / disclosed_rate / own_desk"),
        ("Quote direction", "dir", direction, None, "out_per_in / in_per_out"),
        ("Rounding option", "round", rounding, None, "truncate_unit / nearest_unit / round_up_unit / nearest_n"), ("Rounding unit", "unit", unit, NUM, "1 for whole units; 1000 for nearest-thousand"),
        ("Minimum margin", "minm", minm, PCT, "FEE_STRUCTURE.min_margin_pct"), ("Displayed fee (blank = show the truth)", "disp", disp, PCT, "v5.3 proposal C"),
        ("NPL share mechanic", "mech", mech, None, "pool / rebate / own_desk"), ("Rebate % of partner fee", "rebate", rebate, PCT, "PARTNER_REBATE_RULE"),
        ("Share paid to another party %", "refpct", refpct, PCT, "REFERRAL_RULE fixed_pct (introducer or client party)"),
    ]

# --- P01 market-minus (BF-Seven via Jeton, row 3)
pattern_sheet("P01", PATTERN_NAMES["P01"], [3, 6, 8, 9, 10, 13, 17, 4, 11, 18, 20],
    "PROJECT, SENDER, RECEIVER, PARTNER_PAIR (market_plus_pct), FEE_STRUCTURE (basis market), PARTNER_REBATE_RULE or CO.<PARTNER>.POOL, CONVERSION, DISBURSEMENT",
    common_slots("BF-Seven", None, None, None, "crypto", "Jeton vehicle · wallet · TRC-20?", "Jeton", "market_plus_pct", "USDT → EUR", "out_per_in", "market", "fixed", 0.01, 0.01, 0.0, None, None, None, None, "rebate? (sheet: 'NPL gets this as referral commission') — confirm", 0.40, "", "truncate_unit · 1", None, None, None),
    sim_inputs(661060, "USDT", "EUR", 0.857097, None, 0.01, 0.01, 0.01, 0.0, "market", "market_plus_pct", "out_per_in", "truncate_unit", 1, 0.003, None, "rebate", 0.40, 0.0, "JETON"),
    [("EUR amount to the receiver", 560927, "Gross out (promised before receiver share)", "sheet row 3: 661,060 × 0.857097 × 0.99")],
    ["Does Jeton deduct the full 1 % and pay NPL 0.4 % back (rebate, monthly), or deduct 0.6 % and leave 0.4 % at its end (pool)? The simulation assumes rebate with m = 1.0 %, rebate 40 %; switch 'mech' to pool and m to 0.6 % for the other reading.",
     "Jeton's collection endpoint (vehicle, wallet network) and the settlement rail / narrative for EUR payouts.",
     "Is the 0.4 % 'referral commission' NPL's margin on every deal, or a separate commission arrangement with Jeton? It matters for whether REFERRAL_RULE or PARTNER_REBATE_RULE models it."])

# --- P02 agent rate with displayed fee (BF-Seven via Ali, row 5)
pattern_sheet("P02", PATTERN_NAMES["P02"], [5, 7, 12, 15, 19],
    "PARTNER_PAIR (disclosed_rate), FEE_STRUCTURE (basis partner), DEAL_GROUP.displayed_* (v5.3 proposal C), CONVERSION, CO.<PARTNER>.POOL",
    common_slots("BF-Seven", None, None, None, "crypto", "PT-tour or PT Global Inc · wallet · TRC-20", "Ali", "disclosed_rate", "USDT → EUR", "out_per_in", "partner", "fixed", 0.004, 0.004, 0.0, None, None, None, 0.01, "pool at partner", None, "", "truncate_unit · 1", None, None, None),
    sim_inputs(661060, "USDT", "EUR", None, 0.851934, 0.0, 0.004, 0.004, 0.0, "partner", "disclosed_rate", "out_per_in", "truncate_unit", 1, 0.003, 0.01, "pool", 0.0, 0.0, "ALI"),
    [("Displayed source rate", 0.857097, "Displayed source rate (quote package)", "sheet row 5 shows 0.857097 with 'Fee: 1 %' — the recomputed rate"),
     ("EUR amount to the receiver", 560927, "Gross out (promised before receiver share)", "sheet row 5")],
    ["The true market rate at quote time (the sheet shows the recomputed one). Without it the partner cost and the 1.4 % total cannot be checked — the simulation leaves Rm yellow.",
     "Ali's actual offered rate: the simulation derives 0.851934 from the sheet (0.857097 × 0.99 ÷ 0.996). Confirm or replace.",
     "Is the displayed '1 %' a fixed presentation rule for every Ali deal of this client, or chosen per quote?"])

# --- P03 sender + receiver split (Evo via Ali, row 21)
pattern_sheet("P03", PATTERN_NAMES["P03"], [21, 22, 23, 24],
    "FEE_STRUCTURE.sender_share_pct / receiver_share_pct, FEE_OVERRIDE (v5.3 proposal A for the selected senders), CONVERSION.fee_receiver_part",
    common_slots("Evo USDT Collection", None, "Evo (receiver side pays 0.6 %)", None, "crypto", "PT vehicle · wallet · TRC-20", "Ali", "disclosed_rate", "USDT → EUR", "out_per_in", "market", "fixed", 0.02, 0.014, 0.006, None, None, None, None, "pool at partner", None, "", "truncate_unit · 1", None, None, None),
    sim_inputs(29325, "USDT", "EUR", 0.888977323, 0.881421, 0.0, 0.02, 0.014, 0.006, "market", "disclosed_rate", "out_per_in", "truncate_unit", 1, 0.005, None, "pool", 0.0, 0.0, "ALI"),
    [("Sender rate (final rate)", 0.876531640478, "Sender rate (what the sender is quoted)", "sheet row 21: 0.888977 × 0.986"),
     ("EUR to the Evo balance (gross)", 25704, "Gross out (promised before receiver share)", "sheet row 21"),
     ("EUR after the receiver fee (client net)", 25550, "Client net (group entitlement)", "sheet row 21: 25,704 − 0.6 %")],
    ["Ali's offered rate for this deal (the simulation assumes a 0.85 % partner cost: 0.881421). Replace with the actual version.",
     "For GTSI, HG and Komodo the sender share is 1.0 % while Evo still pays 0.6 %: confirm that the receiver part is fixed, not proportional (this is proposal A).",
     "Rows 22 and 24 route the same deal through Jeton at 'market − 1.25 %': confirm Jeton's markup (0.85 % in the sheet) and whether the 1.25 % is Jeton's deduction or NPL's quote."])

# --- P04 variable fee with floor (66 Group INR, row 29)
pattern_sheet("P04", PATTERN_NAMES["P04"], [29, 25, 26, 34, 36, 43],
    "FEE_STRUCTURE (mode variable: floor_pct, cap_pct, min_margin_pct), PARTNER_RATE_VERSION per day, RATE_COMPARISON, APPROVAL (below-margin quote)",
    common_slots("66 Group Remittance INR", None, None, None, "bank", "Ali vehicle · bank · rail?", "Ali", "disclosed_rate", "INR → USD", "in_per_out", "market", "variable", 0.07, 0.07, 0.0, None, None, 0.005, None, "pool at partner", None, "", "nearest_n · 1000 (on the INR collected)", None, None, None),
    sim_inputs(2329000, "INR", "USD", 1 / 90.83911443, 1 / (90.83911443 * 1.0525), 0.0, 0.07, 0.07, 0.0, "market", "disclosed_rate", "in_per_out", "truncate_unit", 1, 0.005, None, "pool", 0.0, 0.0, "ALI"),
    [("USD delivered to the receiver", 23960.18, "Gross out (promised before receiver share)", "sheet row 29: USD 23,960.18 × 97.198 = INR 2,328,878, rounded to 2,329,000 — the simulation starts from the rounded INR, hence ≈ 1.25 USD more")],
    ["Floor and cap for the fee, and who may set it per transaction (the sheet says 'average 6 %, min margin 0.5 %').",
     "The sheet adds 7 % to the INR-per-USD rate (97.198 = 90.839 × 1.07). In out-per-in terms that is a 6.54 % deduction, not 7 % — the quote direction must be recorded as in_per_out for this pair.",
     "The INR amount is rounded to the nearest 1,000 on the collection side; the model rounds payouts, so this is a collection-amount convention to confirm (proposal F)."])

# --- P05 volume tiers (GDC, rows 32-33)
def tier_extra(ws, r, K):
    header(ws, f"A{r}", "Tier table (v5.3 proposal B — FEE_TIER)", F_H2); r += 1
    for j, h in enumerate(["Minimum monthly volume (USD)", "Fee %", "", "", "Rule"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    t0 = r
    cell(ws, f"A{r}", 0, F_IN, None, NUM); cell(ws, f"B{r}", 0.025, F_IN, None, PCT); cell(ws, f"E{r}", "sheet row 32", F_NOTE); r += 1
    cell(ws, f"A{r}", 500000, F_IN, None, NUM); cell(ws, f"B{r}", 0.0225, F_IN, None, PCT); cell(ws, f"E{r}", "sheet row 33", F_NOTE); r += 1
    cell(ws, f"A{r}", "Trailing-month volume of this sender (USD)", F_TXT, wrap=True); cell(ws, f"B{r}", None, F_TXT, FILL_FIX, NUM); cell(ws, f"E{r}", "Σ amount_in over the last 30 days — the engine has it; NPL to fill for the test", F_NOTE, wrap=True); vol = f"$B${r}"; r += 1
    cell(ws, f"A{r}", "Tier the engine would apply", F_B); cell(ws, f"B{r}", f'=IF({vol}="",B{t0},INDEX(B{t0}:B{t0+1},MATCH({vol},A{t0}:A{t0+1},1)))', F_TXT, FILL_CHK, PCT)
    cell(ws, f"E{r}", "highest minimum ≤ volume; copy this into 'Fee total f' and 'Sender share s' above to re-run the simulation at the tiered fee", F_NOTE, wrap=True); ws.row_dimensions[r].height = 30; r += 1
    return r
pattern_sheet("P05", PATTERN_NAMES["P05"], [32, 33],
    "FEE_STRUCTURE + FEE_TIER (v5.3 proposal B), DEAL.fee_tier_id, sender monthly volume",
    common_slots("GDC", None, None, None, "crypto", "Ali vehicle · wallet · TRC-20", "Ali", "disclosed_rate", "USDT → USD", "in_per_out", "market", "fixed", 0.025, 0.025, 0.0, None, None, None, None, "pool at partner", None, "", "truncate_unit · 1", None, None, None),
    sim_inputs(86594, "USDT", "USD", 1.0, 0.996, 0.0, 0.025, 0.025, 0.0, "market", "disclosed_rate", "in_per_out", "truncate_unit", 1, 0.005, None, "pool", 0.0, 0.0, "ALI"),
    [("USD delivered", 84482, "Gross out (promised before receiver share)", "sheet row 32: USD 84,482 + 2.5 % = USDT 86,594 (the sheet used a market rate of exactly 1.0)")],
    ["Is the $500K threshold measured per calendar month or trailing 30 days, on collected or quoted amounts, per sender or for GDC as a whole?",
     "Does the lower tier apply to the transaction that crosses the threshold, or from the next one?",
     "Market rate used for USDT → USD (the sheet's arithmetic implies 1.0; the partner delivers at 0.996)."], extra=tier_extra)

# --- P06 earnings shared with the client (Raeen sub-account, row 16)
pattern_sheet("P06", PATTERN_NAMES["P06"], [16, 14],
    "INTRODUCER (= the client's party), REFERRAL_RULE (basis fixed_pct), REFERRAL_ACCRUAL, FEE_STRUCTURE, PARTNER_PAIR (market_plus_pct)",
    common_slots("BF-Raeen — Sub Account", None, None, None, "crypto", "Aquanow vehicle · wallet · TRC-20?", "Aquanow", "market_plus_pct", "USDT → EUR", "out_per_in", "market", "fixed", 0.04, 0.04, 0.0, None, None, None, None, "rebate? — confirm", None, "Raeen · 1.5 % of amount (half of the 3 % above the partner's 0.8 %… see note)", "truncate_unit · 1", None, None, None),
    sim_inputs(50000, "USDT", "EUR", 0.8650036, None, 0.008, 0.04, 0.04, 0.0, "market", "market_plus_pct", "out_per_in", "truncate_unit", 1, 0.005, None, "pool", 0.0, 0.015, "AQUANOW"),
    [("EUR to the receiver", 41520.17, "Gross out (promised before receiver share)", "sheet row 16: 50,000 × 0.8650036 × 0.96")],
    ["The sheet says the partner charges 0.8 % but lists partner cost 0.5 % with NPL margin 2 % and '3 % shared with Raeen equally'. The simulation uses m = 0.8 % and a 1.5 % share to Raeen; confirm the exact split of the 4 %.",
     "Is Raeen's share paid per deal, monthly, or netted against Raeen's own fees? (REFERRAL_ACCRUAL is per deal, paid from NPL's earnings.)",
     "Row 14 (direct from downlines): 0.2 % shared 75/25 → 0.15 % to Raeen. Same rule type, different percentage."])

# --- P07 own-desk reseller (Bala, row 38)
def invoice_extra(ws, r, K):
    header(ws, f"A{r}", "Vendor payment against the EUR invoice (v5.3 proposal E — INVOICE, DISBURSEMENT_LINE.obligation_discharged)", F_H2); r += 1
    for j, h in enumerate(["Figure", "", "Value", "", "Source"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    cell(ws, f"A{r}", "Vendor invoice amount (EUR)", F_TXT); cell(ws, f"C{r}", 1358.98, F_IN, None, NUM); cell(ws, f"E{r}", "sheet row 38, EZ-EVO (Samino)", F_NOTE); inv = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "Market rate at payment (USDT per EUR)", F_TXT); cell(ws, f"C{r}", 1.140965082766247, F_IN, None, RATE); cell(ws, f"E{r}", "sheet row 38", F_NOTE); mr = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "USDT paid to the vendor", F_TXT); cell(ws, f"C{r}", f"=ROUND({inv}*{mr},2)", F_TXT, None, NUM); cell(ws, f"E{r}", "sheet says 1,550.55", F_NOTE); r += 1
    cell(ws, f"A{r}", "EUR discharged on the invoice", F_TXT); cell(ws, f"C{r}", f"={inv}", F_TXT, None, NUM); cell(ws, f"E{r}", "DISBURSEMENT_LINE.obligation_discharged (proposal E)", F_NOTE); r += 1
    cell(ws, f"A{r}", "NPL's result on this flow (EUR)", F_B); cell(ws, f"C{r}", f'=ROUND({K["Client net (group entitlement)"]}-{inv},2)', F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", "what the customer paid in EUR terms minus what the vendor was owed; the fee ± forex variance between collection and payment", F_NOTE, wrap=True); ws.row_dimensions[r].height = 30; r += 1
    return r
pattern_sheet("P07", PATTERN_NAMES["P07"], [38, 39, 40, 41, 42],
    "OWN_WALLET (LT Sub) as collection endpoint, own-desk PARTNER_CONFIG (v5.3 proposal D), INVOICE + per-line discharge (proposal E), rounding up (proposal F), invariant 3",
    common_slots("Bala Remittance Collection for Game Reseller", "Bala", "EZ-EVO (Samino) — vendor, paid in USDT", "USDT wallet (vendor)", "crypto", "NPL own desk · wallet LT Sub (Aquanow) · TRC-20?", "NPL own desk (LT Sub)", "own_desk (v5.3 proposal D)", "USDT → EUR (obligation in EUR, paid in USDT)", "in_per_out", "market", "fixed", 0.02, 0.02, 0.0, None, None, None, None, "own desk (proposal D)", None, "", "round_up_unit · 1 (on the USDT collected)", None, None, None),
    sim_inputs(2600, "USDT", "EUR", 0.8716, None, 0.0, 0.02, 0.02, 0.0, "market", "own_desk", "in_per_out", "truncate_unit", 1, 0.0, None, "own_desk", 0.0, 0.0, "OWNDESK"),
    [("EUR invoice value covered by the collection", 2220, "Gross out (promised before receiver share)", "sheet row 38: EUR 2,220 ÷ 0.8716 × 1.02 = USDT 2,598 → rounded up to 2,600, which covers ≈ EUR 2,221.8")],
    ["This flow holds client money in NPL's own wallet as a matter of course, which invariant 3 forbids outside a reroute. Confirm the business wants it modelled inside NPLify (proposal D, option i) or kept outside.",
     "Rounding up the USDT the customer pays (2,598 → 2,600) favours NPL by ≈ EUR 1.8: is that a deliberate convention (proposal F) or a convenience?",
     "The vendors are paid at the market rate of the payment day, in parts, over days: confirm the invoice-balance tracking is wanted (proposal E).",
     "Who is the sender for allow-list and attribution purposes: the reseller customer, or Bala?"], extra=invoice_extra)

# --- P08 THB cash → partner converts to USDT → vendors (27 Group, row 37)
def thb_extra(ws, r, K):
    header(ws, f"A{r}", "Leg 1 at the partner: THB → USDT (what Ali delivers)", F_H2); r += 1
    for j, h in enumerate(["Figure", "", "Value", "", "Source"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    cell(ws, f"A{r}", "Market THB per USDT", F_TXT); cell(ws, f"C{r}", 33.613, F_IN, None, RATE); cell(ws, f"E{r}", "sheet row 37 (1 ÷ 0.02975)", F_NOTE); mk = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "Ali's rate THB per USDT", F_TXT); cell(ws, f"C{r}", 33.83, F_IN, None, RATE); cell(ws, f"E{r}", "sheet row 37 (agent fee 0.64 %)", F_NOTE); ar = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "USDT delivered", F_TXT); cell(ws, f"C{r}", f'=ROUND({K["A"]}/{ar},2)', F_TXT, None, NUM); cell(ws, f"E{r}", "sheet says 502,513", F_NOTE); usdt = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "Partner cost %", F_TXT); cell(ws, f"C{r}", f"=1-{mk}/{ar}", F_TXT, None, PCT); cell(ws, f"E{r}", "inferred from the rate comparison", F_NOTE); r += 1
    cell(ws, f"A{r}", "EUR value of the USDT at the EUR/USDT market", F_TXT); cell(ws, f"C{r}", None, F_TXT, FILL_FIX, NUM); cell(ws, f"E{r}", "NPL: EUR/USDT market rate on the day × USDT delivered — needed to show NPL's margin against the EUR 432,267 promised", F_NOTE, wrap=True); ev = f"$C${r}"; ws.row_dimensions[r].height = 30; r += 1
    cell(ws, f"A{r}", "NPL margin in EUR (if filled)", F_B); cell(ws, f"C{r}", f'=IF({ev}="","",ROUND({ev}-{K["Gross out (promised before receiver share)"]},2))', F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", "should be ≈ 2 % − 0.64 % of the collection; the sheet expects a minimum of 0.5 %", F_NOTE, wrap=True); r += 1
    return r
pattern_sheet("P08", PATTERN_NAMES["P08"], [37],
    "DEAL_GROUP with one forward leg (THB → USDT at Ali, cash collection), INVOICE obligation in EUR (proposal E), payout lines in USDT to several vendors with deal_id (D17) and discharge fields (proposal E)",
    common_slots("27 Group Remittance Collection for Game Reseller", "27 Group customer", "SACCO SIA, Mitratech, EZ-EVO, BraversPlay — vendors paid in USDT", "USDT wallets (vendors)", "cash", "none (cash) — instructions on the deal", "Ali", "disclosed_rate", "THB → USDT (customer promised EUR)", "in_per_out", "market", "fixed", 0.02, 0.02, 0.0, None, None, 0.005, None, "pool at partner", None, "", "nearest_n · 1000? (THB 12,813,449 → 12,813,000)", None, None, None),
    sim_inputs(17000000, "THB", "EUR", 0.0259463782412186, None, 0.0, 0.02, 0.02, 0.0, "market", "disclosed_rate", "out_per_in", "truncate_unit", 1, 0.005, None, "pool", 0.0, 0.0, "ALI"),
    [("EUR credited to the customer (advance payment)", 432267, "Gross out (promised before receiver share)", "sheet row 37: THB 17,000,000 × 0.02542745 — the sheet deducts 2 % from the EUR-per-THB rate (out_per_in); quoting in_per_out instead would give 432,439")],
    ["The customer is promised EUR but pays THB and the partner delivers USDT: the EUR figure is an obligation, not a currency that ever moves. Confirm proposal E (invoice obligation + per-line discharge) is the intended model.",
     "Cash THB: which rounding unit applies to the collected amount (the balance clearance rounds THB 12,813,449 to 12,813,000)?",
     "Which vendor is paid from which collection, and at which day's EUR/USDT market rate — this is the per-line discharge record."], extra=thb_extra)

# --- P09 withdrawal (BF-Withdrawal, row 20)
pattern_sheet("P09", PATTERN_NAMES["P09"], [20],
    "CURRENCY_PAIR GBP → USDT, COLLECTION_RECEIVING_ENDPOINT (kind bank, rail), RECEIVING_ENTITY_ACCOUNT (kind wallet, D14), SETTLEMENT_REGISTRATION with network + address (D16)",
    common_slots("BF-Withdrawal", None, "the client's own USDT wallet (counterparty receiver, wallet account)", "USDT · TRC-20 · wallet", "bank", "Jeton vehicle · bank · rail?", "Jeton", "market_plus_pct", "GBP → USDT (also EUR → USDT)", "out_per_in", "market", "fixed", 0.01, 0.01, 0.0, None, None, None, None, "rebate? — confirm", 0.40, "", "truncate_unit · 1", None, None, None),
    sim_inputs(51000, "GBP", "USDT", 1 / 0.72739556, None, 0.01, 0.01, 0.01, 0.0, "market", "market_plus_pct", "out_per_in", "truncate_unit", 1, 0.003, None, "rebate", 0.40, 0.0, "JETON"),
    [("USDT to the client's wallet", 69412, "Gross out (promised before receiver share)", "sheet row 20: GBP 51,000 ÷ 0.72739556 × 0.99")],
    ["The sheet says the fee 'is not fixed … but we have charged 1 % in most recent transactions': fixed at 1 %, or variable with a floor?",
     "Jeton's bank-in endpoint for GBP and EUR (vehicle, rail — a bank endpoint cannot be activated without its rail, D18).",
     "The payout destination is a wallet: its registration with Jeton carries network + address (D16)."])

# --- P10 cash exotic (Ad Hoc INR cash, row 45)
pattern_sheet("P10", PATTERN_NAMES["P10"], [45, 28],
    "DEAL.collection_method = cash, CURRENCY_PAIR.cash_rounding_unit, PARTNER_PAIR (disclosed_rate), FEE_STRUCTURE (basis partner)",
    common_slots("Ad Hoc INR Cash", None, None, None, "cash", "none (cash) — instructions on the deal", "Ali", "disclosed_rate", "INR → USD (also SGD, USDT)", "in_per_out", "partner", "fixed", 0.005, 0.005, 0.0, None, None, None, None, "pool at partner", None, "", "cash_rounding_unit · 1000?", None, None, None),
    sim_inputs(8500000, "INR", "USD", None, 1 / 79.52918721, 0.0, 0.0, 0.0, 0.0, "partner", "disclosed_rate", "in_per_out", "truncate_unit", 1, 0.0, None, "pool", 0.0, 0.0, "ALI"),
    [("USD delivered", 106879.36, "Gross out (promised before receiver share)", "sheet row 45: INR 8,500,000 ÷ 79.529 — the sheet's arithmetic carries no NPL fee, so the simulation runs with s = 0; if the 0.5 % is NPL's fee on top, set s = 0.5 % and the USD falls by ≈ 534")],
    ["The sheet lists total fee 0.5 %, partner cost 5.5–7.5 % and NPL margin 0 %: is the 0.5 % NPL's fee on top of the agent rate, or the agent's? The simulation needs the true market rate (yellow) to show the partner's cost.",
     "Cash rounding unit for INR and for AED/USD cash in Dubai (row 28, dormant)."])

# --- P11 zero-fee internal (AK USDT, row 47)
pattern_sheet("P11", PATTERN_NAMES["P11"], [47, 46],
    "FEE_STRUCTURE with pct 0 and min_margin_pct 0 (or a FEE_OVERRIDE at 0 %), PARTNER_PAIR (disclosed_rate)",
    common_slots("AK collections (USDT)", "AK (internal stakeholder)", None, None, "crypto", "Ali vehicle · wallet · TRC-20", "Ali", "disclosed_rate", "USDT → USD (also SGD)", "out_per_in", "partner", "fixed", 0.0, 0.0, 0.0, None, None, 0.0, None, "pool at partner", None, "", "truncate_unit · 1", None, None, None),
    sim_inputs(10000, "USDT", "USD", 1.0, 0.996, 0.0, 0.0, 0.0, 0.0, "partner", "disclosed_rate", "out_per_in", "truncate_unit", 1, 0.0, None, "pool", 0.0, 0.0, "ALI"),
    [("USD delivered", 9960, "Gross out (promised before receiver share)", "sheet row 47: USDT 10,000 × 0.996")],
    ["A 0 % structure with a 0 % minimum margin means every quote passes the margin check; confirm that is intended for internal stakeholder flows rather than a per-deal Finance approval.",
     "INR variant (row 46): INR 8,735,000 ÷ 100.80 — which pair and partner rate version?"])

# --- P12 same-currency pass-through (Evolution bank, row 27)
pattern_sheet("P12", PATTERN_NAMES["P12"], [27],
    "CURRENCY_PAIR with from = to (rate 1), FEE_STRUCTURE 1.4 % + 1.4 %, bank-in endpoint, SETTLEMENT_RAIL; dormant product",
    common_slots("Evolution USD, EUR, GBP (bank transfers)", None, "Evolution (receiver side pays 1.4 %)", None, "bank", "Ali vehicle · bank · rail?", "Ali", "disclosed_rate", "EUR → EUR (also USD → EUR, GBP → EUR)", "out_per_in", "market", "fixed", 0.028, 0.014, 0.014, None, None, None, None, "pool at partner", None, "", "truncate_unit · 1", None, None, None),
    sim_inputs(100000, "EUR", "EUR", 1.0, 1.0, 0.0, 0.028, 0.014, 0.014, "market", "disclosed_rate", "out_per_in", "truncate_unit", 1, 0.0, None, "pool", 0.0, 0.0, "ALI"),
    [("EUR delivered after both shares (no sheet example)", 97219.6, "Client net (group entitlement)", "100,000 × 0.986 × 0.986 — illustrative; the sheet has no worked example and the pair has not run for years")],
    ["Confirm whether same-currency pass-through should remain in scope; if yes, the pair validation must allow from = to.",
     "Partner cost and rail for EUR bank-in at Ali (no recent data in the sheet)."])

# ------------------------------------------------------------------ save
wb.calculation.fullCalcOnLoad = True
OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print("wrote", OUT, "sheets:", wb.sheetnames)
