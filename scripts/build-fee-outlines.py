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

SHEET_NAMES = {"P01": "1 Market minus fee", "P02": "2 Agent rate", "P03": "3 Sender+receiver pay", "P04": "4 Fee per deal", "P05": "5 Fee by volume", "P06": "6 Shared with client",
               "P07": "7 NPL own wallet", "P08": "8 THB cash to vendors", "P09": "9 Withdrawal", "P10": "10 Cash collection", "P11": "11 No-fee internal", "P12": "12 Same currency"}
MAPPING = []
PATTERN_NAMES = {
    "P01": "Fee taken off the market rate; the partner passes NPL its share", "P02": "Agent rate; the fee shown to the customer differs from the true total",
    "P03": "Sender and receiver both pay a part of the fee", "P04": "Fee decided per deal, with a lowest value and a minimum margin",
    "P05": "Fee that drops with monthly volume", "P06": "NPL's earnings shared with the client",
    "P07": "Game reseller: NPL converts in its own wallet, no partner", "P08": "THB cash in, partner converts to USDT, vendors paid in USDT",
    "P09": "Withdrawal: bank transfer in, USDT out", "P10": "Cash collection",
    "P11": "No-fee internal collection", "P12": "Same-currency bank transfer",
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
    ("What this is", "Every line of NPL's 'Table of Remittance Customers Fees' turned into a fill-in outline: who sends, who gets paid, which partner, which currencies, what fee, who pays it, how NPL's share reaches NPL, and how amounts are rounded. Values are pre-filled where your sheet says them and left blank where it does not. Each pattern sheet also has a worked calculation: change the amount or any value and it shows what the customer would be quoted, what the partner delivers, what NPL earns, what is paid out, and the bookkeeping entries — and compares the result with the figure in your sheet."),
    ("How to fill", "Yellow cells are for NPL to fill. Blue cells were copied or worked out from your sheet — correct them if they are wrong. Black cells are calculations; please do not type over them. 'Where it comes from' says how we got a value; 'Please confirm' lists what we could not read from the sheet."),
    ("Sheets", "All fee lines — one row per line of your sheet (45), one column per thing to fill in. Then twelve pattern sheets, one per way a transaction works, each with one worked example from your sheet. Column D of 'All fee lines' says which pattern a line belongs to. The last sheet, 'For New XP', maps each item to the system's field names and is not for NPL to fill."),
    ("The worked calculation", "Uses the same arithmetic as your sheet: rates are written as units received per 1 unit sent; the rate quoted to the sender is the market rate (or the agent rate) less the sender's fee; the receiver's fee, if any, comes off after that; the partner delivers at its own rate; NPL's earnings are what the partner delivers minus what the receiver gets; payouts go out in whole units and the cents stay in the client's balance. Where an item needs a change to the system before it can be handled, the note says 'needs a system change'."),
    ("What to do with it", "1. Fill the yellow cells and correct any blue value. 2. On each pattern sheet, 'Compare with your sheet' should show a difference of zero, or one that the comment explains. 3. We then load the filled-in lines as the system's configuration and use the pattern sheets as test cases: the system passes when it reproduces every figure."),
    ("Legend", "'Needs a system change' marks an item the system cannot handle yet (fees by monthly volume, a fee shown to the customer that differs from the true total, NPL converting in its own wallet, tracking an invoice paid in parts, rounding other than dropping the cents). Please fill it anyway — the answer tells us how to build it."),
]
r = 3
for k, v in lines:
    cell(ws, f"A{r}", k, F_B, wrap=True); cell(ws, f"B{r}", v, F_TXT, wrap=True); ws.row_dimensions[r].height = 62; r += 1
r += 1
cell(ws, f"A{r}", "Colour", F_B); cell(ws, f"B{r}", "Meaning", F_B); r += 1
cell(ws, f"A{r}", "NPL fills in", F_TXT, FILL_FIX); cell(ws, f"B{r}", "Not in your sheet — please supply", F_TXT); r += 1
cell(ws, f"A{r}", "From your sheet", F_IN); cell(ws, f"B{r}", "Copied or worked out from your fee table (blue text) — correct if wrong", F_TXT); r += 1
cell(ws, f"A{r}", "Calculation", F_TXT); cell(ws, f"B{r}", "Worked out by the workbook (black) — please do not overwrite", F_TXT); r += 1
r += 1
cell(ws, f"A{r}", "Pattern", F_B); cell(ws, f"B{r}", "Name · sheet lines", F_B); r += 1
for pid in sorted(PATTERN_NAMES):
    rows = [str(x["row"]) for x in ROWS if pattern_of(x) == pid]
    cell(ws, f"A{r}", SHEET_NAMES[pid], F_TXT); cell(ws, f"B{r}", f"{PATTERN_NAMES[pid]} · rows {', '.join(rows) or '—'} of your sheet", F_TXT); r += 1

# ------------------------------------------------------------------ Register
ws = wb.create_sheet("All fee lines")
COLS = [
    ("Line", 5), ("Row in your sheet", 7), ("Client / product", 30), ("Pattern", 8), ("How it works today (from your sheet)", 44),
    ("Who sends the money", 18), ("Who gets paid", 22), ("Their account: currency · bank or wallet · route (SEPA, SWIFT, TRC-20 …)", 24),
    ("How the money comes in (crypto / bank / cash)", 16), ("Where it comes in: which partner company, its wallet or bank account", 28),
    ("Partner / agent", 16), ("How the partner prices (fee on top of market / fee inside its rate / NPL's own wallet)", 18), ("Exchange pair (sent → paid out)", 18),
    ("Fee taken how (off the rate the sender gets / added to what the sender pays)", 14), ("Fee applied to (market rate / agent rate)", 12), ("Fee is (fixed / set per deal)", 10),
    ("Total fee %", 11), ("Sender pays %", 11), ("Receiver pays %", 11),
    ("Lowest fee %", 9), ("Highest fee %", 9), ("Minimum NPL margin %", 10), ("Fee shown to the customer %, if different (needs a system change)", 12),
    ("Partner / agent cost % (from your sheet)", 12), ("NPL margin % (from your sheet)", 12), ("How NPL's share reaches NPL (partner keeps it for NPL / partner pays it back monthly / NPL's own wallet)", 18),
    ("% of the partner's fee paid back to NPL", 14), ("Earnings shared with someone else: who · %", 22), ("Rounding (drop the cents / nearest unit / round up / nearest 1,000)", 18),
    ("Bank or EMI that pays out", 16), ("Name shown on the transfer", 16), ("Has the partner approved the receiver's account? (yes / pending)", 14),
    ("Fee by monthly volume (needs a system change)", 16), ("Note from your sheet", 40), ("Please confirm", 40),
]
for i, (h, w) in enumerate(COLS, 1):
    c = cell(ws, f"{get_column_letter(i)}1", h, F_B, FILL_HEAD, wrap=True); ws.column_dimensions[get_column_letter(i)].width = w
ws.row_dimensions[1].height = 78
ws.freeze_panes = "E2"

def partner_pricing(p):
    return "fee on top of market" if p in ("Jeton", "Aquanow") else "NPL's own wallet (needs a system change)" if "LT Sub" in p else "fee inside its rate" if p == "Ali" else ""

def mechanic(row):
    if "LT Sub" in row["partner"]: return "NPL's own wallet"
    if "referral commission" in str(row["margin"]).lower(): return "paid back by the partner? (your sheet says 'referral commission') — please confirm"
    if row["partner"] in ("Jeton", "Aquanow"): return "kept for NPL at the partner? — please confirm"
    return "kept for NPL at the partner"

def pair_dir(row):
    p = str(row["pair"] or "")
    return p.replace("\n", "; ").replace(" > ", " → ")

for i, row in enumerate(ROWS, 2):
    pid = pattern_of(row)
    fee = pct(row["fee"]); cost = pct(row["cost"]); margin = pct(row["margin"])
    split = re.search(r"sender pays ([\d.]+)%.*receiver pays ([\d.]+)%", str(row["fee"]))
    share = row["share"] if row["share"] not in (None, "none") else ""
    confirm = []
    if fee is None: confirm.append("the total fee is a range or text — please give the lowest, the highest and the usual value")
    if cost is None: confirm.append("the partner cost is a range or text — please give the usual value, or say it is read from the partner's rate each day")
    if margin is None and not isinstance(row["margin"], (int, float)): confirm.append("NPL margin is not a number")
    if row["partner"] in ("Jeton", "Aquanow"): confirm.append("does the partner keep NPL's share at its end for NPL to draw on, or pay it back monthly?")
    if pid == "P02": confirm.append("the real market rate at the time of the quote (your sheet shows the recomputed one)")
    if "Fee is not fixed" in str(row["note"]) or "changes" in str(row["note"]): confirm.append("who decides the fee for each deal, and between which lowest and highest values")
    vals = [i - 1, row["row"], row["client"], SHEET_NAMES[pid], row["example"] or "", "", "", "", "", "", row["partner"], partner_pricing(row["partner"]), pair_dir(row), "", "",
            "set per deal" if fee is None or (row["note"] and ("not fixed" in row["note"] or "change" in row["note"])) else "fixed",
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
    ws = wb.create_sheet(SHEET_NAMES[pid])
    widths(ws, {"A": 40, "B": 40, "C": 22, "D": 18, "E": 48})
    header(ws, "A1", f"{SHEET_NAMES[pid]} — {title}")
    cell(ws, "A2", "Example taken from your sheet, rows", F_B, border=False); cell(ws, "B2", ", ".join(str(r) for r in rows), F_TXT, border=False)
    MAPPING.append((SHEET_NAMES[pid], "(entities)", erd_entities))
    r = 4
    header(ws, f"A{r}", "A · The set-up for this kind of deal", F_H2); r += 1
    for j, h in enumerate(["Item", "Value", "Where it comes from", "Note", ""], 1):
        if h: cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    for slot, field, value, source, note in slots:
        MAPPING.append((SHEET_NAMES[pid], slot, field))
        cell(ws, f"A{r}", slot, F_TXT, wrap=True)
        cell(ws, f"B{r}", value if value is not None else "", F_IN if value is not None else F_TXT, None if value is not None else FILL_FIX, PCT if isinstance(value, float) and abs(value) < 1 and "rate" not in slot.lower() else None, wrap=True)
        cell(ws, f"C{r}", {"sheet": "your sheet", "NPL": "please fill in", "NPL to confirm": "please confirm", "derived": "worked out from your sheet", "n/a": "not needed here"}.get(source, source), F_TXT, wrap=True); cell(ws, f"D{r}", note, F_NOTE, wrap=True)
        ws.row_dimensions[r].height = 42 if len(note) > 60 else 16
        r += 1
    r += 1
    header(ws, f"A{r}", "B · Worked calculation — the deal (change any value)", F_H2); r += 1
    for j, h in enumerate(["Item", "", "Value", "", "Meaning"], 1):
        if h: cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    REF = {}
    for label, key, value, fmt, source in sim:
        cell(ws, f"A{r}", label, F_TXT, wrap=True)
        cell(ws, f"C{r}", value if value is not None else "", F_IN if value is not None else F_TXT, None if value is not None else FILL_FIX, fmt)
        cell(ws, f"E{r}", source, F_NOTE, wrap=True)
        REF[key] = f"$C${r}"; r += 1
    r += 1
    header(ws, f"A{r}", "C · Worked calculation — what the system works out", F_H2); r += 1
    for j, h in enumerate(["Figure", "How it is worked out", "Value", "", "Note"], 1):
        if h: cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    def out(label, words, formula, fmt=NUM, step=""):
        nonlocal r
        cell(ws, f"A{r}", label, F_TXT, wrap=True); cell(ws, f"B{r}", words, F_NOTE, wrap=True)
        cell(ws, f"C{r}", formula, F_TXT, None, fmt); cell(ws, f"E{r}", step, F_NOTE, wrap=True)
        REF[label] = f"$C${r}"; r += 1
        return REF[label]
    K = REF
    base = out("Rate the fee is applied to", "the market rate, or the agent rate", f'=IF({K["basis"]}="market rate",{K["Rm"]},{K["Rp"]})', RATE, "")
    out("Rate quoted to the sender", "that rate less the sender's fee — or, when the fee is added to what the sender pays, that rate ÷ (1 + fee)",
        f'=IF({K["dir"]}="added to what the sender pays",{base}/(1+{K["s"]}),{base}*(1-{K["s"]}))', RATE, "")
    out("Amount the sender is promised", "amount sent × rate quoted to the sender", f'={K["A"]}*{K["Rate quoted to the sender"]}', NUM, "before any receiver-side fee")
    out("Receiver-side fee", "amount promised × receiver's fee", f'={K["Amount the sender is promised"]}*{K["r"]}', NUM, "taken from the client's balance when the money is converted")
    out("Amount the receiver is owed", "amount promised − receiver-side fee", f'={K["Amount the sender is promised"]}-{K["Receiver-side fee"]}', NUM, "what the client's balance must deliver")
    out("What the partner delivers", "amount × agent rate · or amount × market less the partner's fee · or amount × market when NPL converts itself",
        f'=IF({K["pricing"]}="NPL\'s own wallet",{K["A"]}*{K["Rm"]},IF({K["pricing"]}="fee on top of market",{K["A"]}*{K["Rm"]}*(1-{K["m"]}),{K["A"]}*{K["Rp"]}))', NUM, "")
    out("Partner / agent cost", "amount × market − what the partner delivers (nil when NPL converts itself)", f'={K["A"]}*{K["Rm"]}-{K["What the partner delivers"]}', NUM, "")
    out("NPL earns on this deal", "what the partner delivers − what the receiver is owed", f'={K["What the partner delivers"]}-{K["Amount the receiver is owed"]}', NUM, "locked in when the money is converted")
    out("NPL margin %", "NPL earns ÷ (amount × market)", f'=IF({K["A"]}*{K["Rm"]}=0,0,{K["NPL earns on this deal"]}/({K["A"]}*{K["Rm"]}))', PCT, "")
    out("Below the minimum margin?", "if so, the quote needs Finance approval", f'=IF({K["NPL margin %"]}<{K["minm"]},"YES — Finance must approve","no")', None, "")
    out("Amount actually paid out", "amount owed, rounded as agreed", f'=IF({K["round"]}="round up",CEILING({K["Amount the receiver is owed"]},{K["unit"]}),IF({K["round"]}="nearest unit",MROUND({K["Amount the receiver is owed"]},{K["unit"]}),IF({K["round"]}="nearest 1,000",MROUND({K["Amount the receiver is owed"]},{K["unit"]}),FLOOR({K["Amount the receiver is owed"]},{K["unit"]}))))', NUM, "only 'drop the cents' exists today; the other options need a system change")
    out("Cents left in the client's balance (negative = NPL's cost)", "amount owed − amount paid out", f'={K["Amount the receiver is owed"]}-{K["Amount actually paid out"]}', NUM, "")
    out("Rate printed on the customer's quote", "rate quoted to the sender ÷ (1 − fee shown) — the 'market rate' your customer-facing calculation prints", f'=IF({K["disp"]}="",{base},{K["Rate quoted to the sender"]}/(1-{K["disp"]}))', RATE, "needs a system change when it differs from the true rate")
    out("Owed back to NPL by the partner", "partner's fee × % paid back (only when the partner pays NPL's share back monthly)", f'=IF({K["mech"]}="paid back monthly",{K["Partner / agent cost"]}*{K["rebate"]},0)', NUM, "")
    out("Share owed to someone else", "amount × market × share %", f'={K["A"]}*{K["Rm"]}*{K["refpct"]}', NUM, "paid out of NPL's earnings")
    out("Check: receiver + partner cost + NPL = amount × market", "must be zero", f'=ROUND({K["Amount the receiver is owed"]}+{K["Partner / agent cost"]}+{K["NPL earns on this deal"]}-{K["A"]}*{K["Rm"]},6)', NUM, "every unit sent is accounted for")
    r += 1
    header(ws, f"A{r}", "D · Bookkeeping entries the system would write", F_H2); r += 1
    for j, h in enumerate(["Entry", "In / out", "Amount", "Whose money · what kind", "When"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    P = K["partner_code"]; IN = K["ccy_in"]; OUTC = K["ccy_out"]
    posts = [
        (f'="Client money received at "&{P}&" ("&{IN}&")"', "in", f'={K["A"]}', "client's money · the amount itself", "when the money arrives"),
        (f'="Owed to the client\'s receivers ("&{IN}&")"', "out", f'={K["A"]}', "client's money · the amount itself", "when the money arrives"),
        (f'="Owed to the client\'s receivers ("&{IN}&")"', "in", f'={K["A"]}', "client's money · the amount itself", "conversion — currency sent"),
        (f'="Client money received at "&{P}&" ("&{IN}&")"', "out", f'={K["A"]}', "client's money · the amount itself", "conversion — currency sent"),
        (f'="Client money ready to pay out at "&{P}&" ("&{OUTC}&")"', "in", f'={K["Amount the receiver is owed"]}', "client's money · the amount itself (cents included)", "conversion — currency paid out"),
        (f'="NPL\'s earnings kept at "&{P}&" ("&{OUTC}&")"', "in", f'=IF({K["mech"]}="paid back monthly",0,{K["NPL earns on this deal"]})', "NPL's money · earnings", "conversion — NPL's share left with the partner"),
        (f'="Owed back to NPL by "&{P}&" ("&{OUTC}&")"', "in", f'={K["Owed back to NPL by the partner"]}', "NPL's money · earnings", "conversion — NPL's share the partner pays back monthly"),
        (f'="Owed to the client\'s receivers ("&{OUTC}&")"', "out", f'={K["Amount the receiver is owed"]}', "client's money · the amount itself", "conversion — currency paid out"),
        (f'="NPL\'s earnings ("&{OUTC}&")"', "out", f'={K["NPL earns on this deal"]}+{K["Owed back to NPL by the partner"]}', "NPL's money · earnings", "margin recognised"),
        (f'="Client money in transit from "&{P}&" ("&{OUTC}&")"', "in", f'={K["Amount actually paid out"]}', "client's money · the amount itself", "payout released (whole units)"),
        (f'="Client money ready to pay out at "&{P}&" ("&{OUTC}&")"', "out", f'={K["Amount actually paid out"]}', "client's money · the amount itself", "payout released"),
        (f'="Owed to the client\'s receivers ("&{OUTC}&")"', "in", f'={K["Amount actually paid out"]}', "client's money · the amount itself", "receiver confirms in full"),
        (f'="Client money in transit from "&{P}&" ("&{OUTC}&")"', "out", f'={K["Amount actually paid out"]}', "client's money · the amount itself", "receiver confirms in full"),
        (f'="NPL\'s earnings ("&{OUTC}&")"', "in", f'={K["Share owed to someone else"]}', "NPL's money · share paid to someone else", "share accrued (if any)"),
        (f'="Owed to the other party ("&{OUTC}&")"', "out", f'={K["Share owed to someone else"]}', "NPL's money · share paid to someone else", "share accrued"),
    ]
    r0 = r
    for acct, side, amt, tag, ev in posts:
        cell(ws, f"A{r}", acct, F_TXT); cell(ws, f"B{r}", side, F_TXT); cell(ws, f"C{r}", amt, F_TXT, None, NUM); cell(ws, f"D{r}", tag, F_NOTE); cell(ws, f"E{r}", ev, F_NOTE); r += 1
    cell(ws, f"A{r}", "Check: in = out in the currency paid out", F_B, FILL_CHK, wrap=True)
    cell(ws, f"C{r}", f'=ROUND(SUMIF($B${r0+4}:$B${r-1},"in",$C${r0+4}:$C${r-1})-SUMIF($B${r0+4}:$B${r-1},"out",$C${r0+4}:$C${r-1}),6)', F_TXT, FILL_CHK, NUM)
    cell(ws, f"E{r}", "money never appears or disappears: every entry moves it from one place to another", F_NOTE, wrap=True); ws.row_dimensions[r].height = 30; r += 2
    header(ws, f"A{r}", "E · Compare with your sheet", F_H2); r += 1
    for j, h in enumerate(["Figure in your sheet", "Your value", "Worked out here", "Difference", "Comment"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    for label, sheet_val, sim_key, comment in sheet_figures:
        cell(ws, f"A{r}", label, F_TXT, wrap=True); cell(ws, f"B{r}", sheet_val, F_IN, None, NUM if isinstance(sheet_val, (int, float)) and sheet_val > 10 else RATE)
        cell(ws, f"C{r}", f"={K[sim_key]}", F_TXT, None, NUM if isinstance(sheet_val, (int, float)) and sheet_val > 10 else RATE)
        cell(ws, f"D{r}", f"=ROUND(C{r}-B{r},2)", F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", comment, F_NOTE, wrap=True); ws.row_dimensions[r].height = 30 if len(comment) > 50 else 16; r += 1
    if extra:
        r += 1; r = extra(ws, r, K)
    r += 1
    header(ws, f"A{r}", "F · Please confirm", F_H2); r += 1
    for p in open_points:
        cell(ws, f"A{r}", "•", F_TXT, border=False); cell(ws, f"B{r}", p, F_TXT, wrap=True, border=False); ws.merge_cells(f"B{r}:E{r}"); ws.row_dimensions[r].height = 32; r += 1
    return ws

# common slot builders
def common_slots(project, sender, receiver, account, method, endpoint, partner, pricing, pair, direction, basis, mode, fee, s, r_, floor, cap, minm, disp, mech, rebate, share, rounding, rail, narrative, reg):
    return [
        ("Client", "PROJECT.name", project, "sheet", "One set-up per client."),
        ("Who sends the money", "SENDER + SENDER_RECEIVER_ALLOW", sender, "sheet" if sender else "NPL", "The sender(s). Each must be on the list of who may pay this client's receivers."),
        ("Who gets paid", "RECEIVER → RECEIVING_ENTITY", receiver, "sheet" if receiver else "NPL", "The receiver, or the vendor. A refund goes back to the sender's own account."),
        ("Their account", "RECEIVING_ENTITY_ACCOUNT (currency, rail, account_kind)", account, "sheet" if account else "NPL", "Currency, bank account or wallet, and the route: EUR by SEPA and EUR by SWIFT count as two accounts; a wallet needs its network and address."),
        ("How the money comes in", "DEAL.collection_method", method, "sheet", "crypto, bank transfer or cash."),
        ("Where it comes in", "PARTNER_ENTITY → COLLECTION_RECEIVING_ENDPOINT", endpoint, "sheet" if endpoint else "NPL", "Which partner company's wallet or bank account the sender pays into. It must be live, belong to that partner company, and be a wallet for crypto or a bank account for bank transfers."),
        ("Partner / agent", "PARTNER + PARTNER_CONFIG", partner, "sheet", ""),
        ("How the partner prices", "PARTNER_PAIR.partner_pricing (+ partner_markup_pct)", pricing, "sheet", "'fee on top of market': the partner converts at market and states its fee separately. 'fee inside its rate': the partner's margin is built into the rate it gives."),
        ("Exchange pair", "CURRENCY_PAIR (from → to)", pair, "sheet", "currency sent → currency paid out."),
        ("Fee taken how", "CURRENCY_PAIR.quote_direction", direction, "sheet", "'off the rate the sender gets': the sender receives a lower rate. 'added to what the sender pays': the sender pays more per unit received (e.g. 7 % added to the INR-per-USD rate)."),
        ("Fee applied to", "FEE_STRUCTURE.rate_basis", basis, "sheet", "the market rate, or the agent's rate."),
        ("Fee is", "FEE_STRUCTURE.mode", mode, "sheet", "fixed, or decided per deal within a lowest and highest value."),
        ("Total fee %", "FEE_STRUCTURE.pct", fee, "sheet" if fee is not None else "NPL", "sender's part + receiver's part."),
        ("Sender pays %", "FEE_STRUCTURE.sender_share_pct", s, "sheet" if s is not None else "NPL", ""),
        ("Receiver pays %", "FEE_STRUCTURE.receiver_share_pct", r_, "sheet" if r_ is not None else "NPL", "Taken from the client's balance when the money is converted."),
        ("Lowest fee %", "FEE_STRUCTURE.floor_pct", floor, "NPL" if floor is None else "sheet", "only when the fee is decided per deal"),
        ("Highest fee %", "FEE_STRUCTURE.cap_pct", cap, "NPL" if cap is None else "sheet", "only when the fee is decided per deal"),
        ("Minimum NPL margin %", "FEE_STRUCTURE.min_margin_pct", minm, "sheet" if minm is not None else "NPL", "A quote that earns less needs Finance's approval."),
        ("Fee shown to the customer %", "FEE_STRUCTURE.displayed_fee_pct (proposal C)", disp, "sheet" if disp is not None else "n/a", "Only when the customer-facing calculation shows a different fee from the true total. Needs a system change."),
        ("How NPL's share reaches NPL", "pool at partner / PARTNER_REBATE_RULE / own desk (needs a system change and a management decision)", mech, "NPL to confirm" if "confirm" in str(mech) else "sheet", "'kept for NPL at the partner': the partner holds NPL's share for NPL to draw on. 'paid back monthly': the partner takes the whole fee and pays NPL's share back on its statement. 'NPL's own wallet': no partner."),
        ("% of the partner's fee paid back to NPL", "PARTNER_REBATE_RULE.pct_of_partner_fee", rebate, "derived" if rebate is not None else "n/a", "Only when the partner pays NPL's share back monthly."),
        ("Earnings shared with someone else", "INTRODUCER + REFERRAL_RULE (basis fixed_pct)", share, "sheet" if share else "n/a", "Who, and what % of the amount. Paid out of NPL's earnings."),
        ("Rounding", "CURRENCY_PAIR.amount_rounding (+ rounding_unit, proposal F)", rounding, "sheet" if rounding else "NPL", "'drop the cents' is the agreed rule; your sheet also rounds to the nearest 1,000 and rounds up in places — those need a system change."),
        ("Bank or EMI that pays out", "SETTLEMENT_RAIL", rail, "NPL" if rail is None else "sheet", "and the bank fee you expect on it"),
        ("Name shown on the transfer", "SETTLEMENT_SENDING_ENTITY.narrative_name", narrative, "NPL" if narrative is None else "sheet", "what the receiver's bank statement shows"),
        ("Has the partner approved the receiver's account?", "SETTLEMENT_REGISTRATION.approval_status (+ details, D16)", reg, "NPL" if reg is None else "sheet", "A quote cannot be sent until the partner has approved at least one account of the receivers it will pay."),
    ]

def sim_inputs(A, ccy_in, ccy_out, Rm, Rp, m, f, s, r_, basis, pricing, direction, rounding, unit, minm, disp, mech, rebate, refpct, partner_code):
    return [
        ("Amount sent", "A", A, NUM, "what the sender pays in, in the currency sent"),
        ("Currency sent", "ccy_in", ccy_in, None, ""), ("Currency paid out", "ccy_out", ccy_out, None, ""),
        ("Partner (short name)", "partner_code", partner_code, None, "used in the bookkeeping entries below"),
        ("Market rate", "Rm", Rm, RATE, "units received per 1 unit sent, at the time of the quote"),
        ("Agent rate (partners whose fee is inside the rate)", "Rp", Rp, RATE, "units received per 1 unit sent, as the partner offers it; leave blank for partners that state their fee separately"),
        ("Partner's fee on top of market", "m", m, PCT, "only for partners that state their fee separately; 0 otherwise"),
        ("Total fee", "f", f, PCT, ""), ("Sender pays", "s", s, PCT, ""), ("Receiver pays", "r", r_, PCT, ""),
        ("Fee applied to", "basis", basis, None, "market rate / agent rate"), ("How the partner prices", "pricing", pricing, None, "fee on top of market / fee inside its rate / NPL's own wallet"),
        ("Fee taken how", "dir", direction, None, "off the rate the sender gets / added to what the sender pays"),
        ("Rounding", "round", rounding, None, "drop the cents / nearest unit / round up / nearest 1,000"), ("Rounding unit", "unit", unit, NUM, "1 for whole units; 1000 for the nearest thousand"),
        ("Minimum NPL margin", "minm", minm, PCT, ""), ("Fee shown to the customer (blank = the true fee)", "disp", disp, PCT, "needs a system change when it differs"),
        ("How NPL's share reaches NPL", "mech", mech, None, "kept for NPL at the partner / paid back monthly / NPL's own wallet"), ("% of the partner's fee paid back", "rebate", rebate, PCT, ""),
        ("Share paid to someone else %", "refpct", refpct, PCT, "introducer, or the client's own party"),
    ]

# --- P01 market-minus (BF-Seven via Jeton, row 3)
pattern_sheet("P01", PATTERN_NAMES["P01"], [3, 6, 8, 9, 10, 13, 17, 4, 11, 18, 20],
    "PROJECT, SENDER, RECEIVER, PARTNER_PAIR (market_plus_pct), FEE_STRUCTURE (basis market), PARTNER_REBATE_RULE or CO.<PARTNER>.POOL, CONVERSION, DISBURSEMENT",
    common_slots("BF-Seven", None, None, None, "crypto", "Jeton vehicle · wallet · TRC-20?", "Jeton", "fee on top of market", "USDT → EUR", "off the rate the sender gets", "market rate", "fixed", 0.01, 0.01, 0.0, None, None, None, None, "paid back monthly? (your sheet says 'NPL gets this as referral commission') — please confirm", 0.40, "", "drop the cents", None, None, None),
    sim_inputs(661060, "USDT", "EUR", 0.857097, None, 0.01, 0.01, 0.01, 0.0, "market rate", "fee on top of market", "off the rate the sender gets", "drop the cents", 1, 0.003, None, "paid back monthly", 0.40, 0.0, "JETON"),
    [("EUR amount to the receiver", 560927, "Amount the sender is promised", "sheet row 3: 661,060 × 0.857097 × 0.99")],
    ["Does Jeton deduct the full 1 % and pay NPL 0.4 % back (rebate, monthly), or deduct 0.6 % and leave 0.4 % at its end (pool)? The calculation assumes rebate with m = 1.0 %, rebate 40 %; set 'How NPL's share reaches NPL' to 'kept for NPL at the partner' and m to 0.6 % for the other reading.",
     "Jeton's collection wallet (which Jeton company, which network) and the bank and name used for EUR payouts.",
     "Is the 0.4 % 'referral commission' NPL's margin on every deal, or a separate commission arrangement with Jeton? It changes how the system records and reconciles it."])

# --- P02 agent rate with displayed fee (BF-Seven via Ali, row 5)
pattern_sheet("P02", PATTERN_NAMES["P02"], [5, 7, 12, 15, 19],
    "PARTNER_PAIR (disclosed_rate), FEE_STRUCTURE (basis partner), DEAL_GROUP.displayed_* (v5.3 proposal C), CONVERSION, CO.<PARTNER>.POOL",
    common_slots("BF-Seven", None, None, None, "crypto", "PT-tour or PT Global Inc · wallet · TRC-20", "Ali", "fee inside its rate", "USDT → EUR", "off the rate the sender gets", "agent rate", "fixed", 0.004, 0.004, 0.0, None, None, None, 0.01, "kept for NPL at the partner", None, "", "drop the cents", None, None, None),
    sim_inputs(661060, "USDT", "EUR", None, 0.851934, 0.0, 0.004, 0.004, 0.0, "agent rate", "fee inside its rate", "off the rate the sender gets", "drop the cents", 1, 0.003, 0.01, "kept for NPL at the partner", 0.0, 0.0, "ALI"),
    [("Rate shown on the customer's quote", 0.857097, "Rate printed on the customer's quote", "sheet row 5 shows 0.857097 with 'Fee: 1 %' — the recomputed rate"),
     ("EUR amount to the receiver", 560927, "Amount the sender is promised", "sheet row 5")],
    ["The true market rate at quote time (the sheet shows the recomputed one). Without it the partner cost and the 1.4 % total cannot be checked — the calculation leaves Rm yellow.",
     "Ali's actual rate: 0.851934 is worked back from your sheet (0.857097 × 0.99 ÷ 0.996). Please confirm or replace.",
     "Is the '1 %' shown to the customer a fixed rule for every Ali deal of this client, or chosen per quote?"])

# --- P03 sender + receiver split (Evo via Ali, row 21)
pattern_sheet("P03", PATTERN_NAMES["P03"], [21, 22, 23, 24],
    "FEE_STRUCTURE.sender_share_pct / receiver_share_pct, FEE_OVERRIDE (v5.3 proposal A for the selected senders), CONVERSION.fee_receiver_part",
    common_slots("Evo USDT Collection", None, "Evo (receiver side pays 0.6 %)", None, "crypto", "PT vehicle · wallet · TRC-20", "Ali", "fee inside its rate", "USDT → EUR", "off the rate the sender gets", "market rate", "fixed", 0.02, 0.014, 0.006, None, None, None, None, "kept for NPL at the partner", None, "", "drop the cents", None, None, None),
    sim_inputs(29325, "USDT", "EUR", 0.888977323, 0.881421, 0.0, 0.02, 0.014, 0.006, "market rate", "fee inside its rate", "off the rate the sender gets", "drop the cents", 1, 0.005, None, "kept for NPL at the partner", 0.0, 0.0, "ALI"),
    [("Rate quoted to the sender (final rate)", 0.876531640478, "Rate quoted to the sender", "sheet row 21: 0.888977 × 0.986"),
     ("EUR to the Evo balance (gross)", 25704, "Amount the sender is promised", "sheet row 21"),
     ("EUR after Evo's 0.6 % fee", 25550, "Amount the receiver is owed", "sheet row 21: 25,704 − 0.6 %")],
    ["Ali's offered rate for this deal (the calculation assumes a 0.85 % partner cost: 0.881421). Please replace with the actual rate.",
     "For GTSI, HG and Komodo the sender share is 1.0 % while Evo still pays 0.6 %: please confirm that Evo's part stays 0.6 % rather than shrinking in proportion (needs a small system change).",
     "Rows 22 and 24 route the same deal through Jeton at 'market − 1.25 %': confirm Jeton's markup (0.85 % in the sheet) and whether the 1.25 % is Jeton's deduction or NPL's quote."])

# --- P04 variable fee with floor (66 Group INR, row 29)
pattern_sheet("P04", PATTERN_NAMES["P04"], [29, 25, 26, 34, 36, 43],
    "FEE_STRUCTURE (mode variable: floor_pct, cap_pct, min_margin_pct), PARTNER_RATE_VERSION per day, RATE_COMPARISON, APPROVAL (below-margin quote)",
    common_slots("66 Group Remittance INR", None, None, None, "bank", "Ali vehicle · bank · rail?", "Ali", "fee inside its rate", "INR → USD", "added to what the sender pays", "market rate", "set per deal", 0.07, 0.07, 0.0, None, None, 0.005, None, "kept for NPL at the partner", None, "", "nearest 1,000 (on the INR collected)", None, None, None),
    sim_inputs(2329000, "INR", "USD", 1 / 90.83911443, 1 / (90.83911443 * 1.0525), 0.0, 0.07, 0.07, 0.0, "market rate", "fee inside its rate", "added to what the sender pays", "drop the cents", 1, 0.005, None, "kept for NPL at the partner", 0.0, 0.0, "ALI"),
    [("USD delivered to the receiver", 23960.18, "Amount the sender is promised", "sheet row 29: USD 23,960.18 × 97.198 = INR 2,328,878, rounded to 2,329,000 — the calculation starts from the rounded INR, hence ≈ 1.25 USD more")],
    ["Floor and cap for the fee, and who may set it per transaction (the sheet says 'average 6 %, min margin 0.5 %').",
     "The sheet adds 7 % to the INR-per-USD rate (97.198 = 90.839 × 1.07). In out-per-in terms that is a 6.54 % deduction, not 7 % — for this pair the fee is added to what the sender pays, and the system must record it that way.",
     "The INR amount is rounded to the nearest 1,000 on the collection side; the system rounds payouts, so this is a convention on the collected amount to confirm (needs a system change)."])

# --- P05 volume tiers (GDC, rows 32-33)
def tier_extra(ws, r, K):
    header(ws, f"A{r}", "Fee by monthly volume (needs a system change)", F_H2); r += 1
    for j, h in enumerate(["Minimum monthly volume (USD)", "Fee %", "", "", "Rule"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    t0 = r
    cell(ws, f"A{r}", 0, F_IN, None, NUM); cell(ws, f"B{r}", 0.025, F_IN, None, PCT); cell(ws, f"E{r}", "sheet row 32", F_NOTE); r += 1
    cell(ws, f"A{r}", 500000, F_IN, None, NUM); cell(ws, f"B{r}", 0.0225, F_IN, None, PCT); cell(ws, f"E{r}", "sheet row 33", F_NOTE); r += 1
    cell(ws, f"A{r}", "Sent by this customer in the last 30 days (USD)", F_TXT, wrap=True); cell(ws, f"B{r}", None, F_TXT, FILL_FIX, NUM); cell(ws, f"E{r}", "total sent in the last 30 days — the system knows it; please fill it in for the test", F_NOTE, wrap=True); vol = f"$B${r}"; r += 1
    cell(ws, f"A{r}", "Fee the system would apply", F_B); cell(ws, f"B{r}", f'=IF({vol}="",B{t0},INDEX(B{t0}:B{t0+1},MATCH({vol},A{t0}:A{t0+1},1)))', F_TXT, FILL_CHK, PCT)
    cell(ws, f"E{r}", "highest minimum ≤ volume; copy this into 'Fee total f' and 'Sender share s' above to re-run the calculation at the tiered fee", F_NOTE, wrap=True); ws.row_dimensions[r].height = 30; r += 1
    return r
pattern_sheet("P05", PATTERN_NAMES["P05"], [32, 33],
    "FEE_STRUCTURE + FEE_TIER (v5.3 proposal B), DEAL.fee_tier_id, sender monthly volume",
    common_slots("GDC", None, None, None, "crypto", "Ali vehicle · wallet · TRC-20", "Ali", "fee inside its rate", "USDT → USD", "added to what the sender pays", "market rate", "fixed", 0.025, 0.025, 0.0, None, None, None, None, "kept for NPL at the partner", None, "", "drop the cents", None, None, None),
    sim_inputs(86594, "USDT", "USD", 1.0, 0.996, 0.0, 0.025, 0.025, 0.0, "market rate", "fee inside its rate", "added to what the sender pays", "drop the cents", 1, 0.005, None, "kept for NPL at the partner", 0.0, 0.0, "ALI"),
    [("USD delivered", 84482, "Amount the sender is promised", "sheet row 32: USD 84,482 + 2.5 % = USDT 86,594 (the sheet used a market rate of exactly 1.0)")],
    ["Is the $500K threshold measured per calendar month or trailing 30 days, on collected or quoted amounts, per sender or for GDC as a whole?",
     "Does the lower tier apply to the transaction that crosses the threshold, or from the next one?",
     "Market rate used for USDT → USD (the sheet's arithmetic implies 1.0; the partner delivers at 0.996)."], extra=tier_extra)

# --- P06 earnings shared with the client (Raeen sub-account, row 16)
pattern_sheet("P06", PATTERN_NAMES["P06"], [16, 14],
    "INTRODUCER (= the client's party), REFERRAL_RULE (basis fixed_pct), REFERRAL_ACCRUAL, FEE_STRUCTURE, PARTNER_PAIR (market_plus_pct)",
    common_slots("BF-Raeen — Sub Account", None, None, None, "crypto", "Aquanow vehicle · wallet · TRC-20?", "Aquanow", "fee on top of market", "USDT → EUR", "off the rate the sender gets", "market rate", "fixed", 0.04, 0.04, 0.0, None, None, None, None, "paid back monthly? — please confirm", None, "Raeen · 1.5 % of amount (half of the 3 % above the partner's 0.8 %… see note)", "drop the cents", None, None, None),
    sim_inputs(50000, "USDT", "EUR", 0.8650036, None, 0.008, 0.04, 0.04, 0.0, "market rate", "fee on top of market", "off the rate the sender gets", "drop the cents", 1, 0.005, None, "kept for NPL at the partner", 0.0, 0.015, "AQUANOW"),
    [("EUR to the receiver", 41520.17, "Amount the sender is promised", "sheet row 16: 50,000 × 0.8650036 × 0.96")],
    ["The sheet says the partner charges 0.8 % but lists partner cost 0.5 % with NPL margin 2 % and '3 % shared with Raeen equally'. The calculation uses m = 0.8 % and a 1.5 % share to Raeen; please confirm the exact split of the 4 %.",
     "Is Raeen's share paid per deal, monthly, or netted against Raeen's own fees? (the system records the share per deal and pays it out of NPL's earnings.)",
     "Row 14 (direct from downlines): 0.2 % shared 75/25 → 0.15 % to Raeen. Same rule type, different percentage."])

# --- P07 own-desk reseller (Bala, row 38)
def invoice_extra(ws, r, K):
    header(ws, f"A{r}", "Paying the vendor's EUR invoice in USDT (needs a system change: tracking an invoice paid in parts)", F_H2); r += 1
    for j, h in enumerate(["Figure", "", "Value", "", "Source"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    cell(ws, f"A{r}", "Vendor invoice amount (EUR)", F_TXT); cell(ws, f"C{r}", 1358.98, F_IN, None, NUM); cell(ws, f"E{r}", "sheet row 38, EZ-EVO (Samino)", F_NOTE); inv = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "Market rate at payment (USDT per EUR)", F_TXT); cell(ws, f"C{r}", 1.140965082766247, F_IN, None, RATE); cell(ws, f"E{r}", "sheet row 38", F_NOTE); mr = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "USDT paid to the vendor", F_TXT); cell(ws, f"C{r}", f"=ROUND({inv}*{mr},2)", F_TXT, None, NUM); cell(ws, f"E{r}", "sheet says 1,550.55", F_NOTE); r += 1
    cell(ws, f"A{r}", "EUR of the invoice cleared by this payment", F_TXT); cell(ws, f"C{r}", f"={inv}", F_TXT, None, NUM); cell(ws, f"E{r}", "needs a system change", F_NOTE); r += 1
    cell(ws, f"A{r}", "NPL's result on this flow (EUR)", F_B); cell(ws, f"C{r}", f'=ROUND({K["Amount the receiver is owed"]}-{inv},2)', F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", "what the customer paid in EUR terms minus what the vendor was owed; the fee ± forex variance between collection and payment", F_NOTE, wrap=True); ws.row_dimensions[r].height = 30; r += 1
    return r
pattern_sheet("P07", PATTERN_NAMES["P07"], [38, 39, 40, 41, 42],
    "OWN_WALLET (LT Sub) as collection endpoint, own-desk PARTNER_CONFIG (v5.3 proposal D), INVOICE + per-line discharge (needs a system change), rounding up (needs a system change), invariant 3",
    common_slots("Bala Remittance Collection for Game Reseller", "Bala", "EZ-EVO (Samino) — vendor, paid in USDT", "USDT wallet (vendor)", "crypto", "NPL own desk · wallet LT Sub (Aquanow) · TRC-20?", "NPL own desk (LT Sub)", "NPL's own wallet (needs a system change)", "USDT → EUR (obligation in EUR, paid in USDT)", "added to what the sender pays", "market rate", "fixed", 0.02, 0.02, 0.0, None, None, None, None, "NPL's own wallet", None, "", "round up (on the USDT collected)", None, None, None),
    sim_inputs(2600, "USDT", "EUR", 0.8716, None, 0.0, 0.02, 0.02, 0.0, "market rate", "NPL's own wallet", "added to what the sender pays", "drop the cents", 1, 0.0, None, "NPL's own wallet", 0.0, 0.0, "NPL"),
    [("EUR invoice value the collection covers", 2220, "Amount the sender is promised", "sheet row 38: EUR 2,220 ÷ 0.8716 × 1.02 = USDT 2,598 → rounded up to 2,600, which covers ≈ EUR 2,221.8")],
    ["This flow holds client money in NPL's own wallet as a matter of course, which the agreed rules allow only in an emergency re-route. Please confirm whether these flows should run inside the system (a management decision) or stay outside it.",
     "Rounding up the USDT the customer pays (2,598 → 2,600) favours NPL by ≈ EUR 1.8: is that a deliberate convention (needs a system change) or a convenience?",
     "The vendors are paid at the market rate of the payment day, in parts, over days: please confirm the system should track the invoice balance (needs a system change).",
     "Who counts as the sender: the reseller's customer, or Bala?"], extra=invoice_extra)

# --- P08 THB cash → partner converts to USDT → vendors (27 Group, row 37)
def thb_extra(ws, r, K):
    header(ws, f"A{r}", "At the partner: THB → USDT (what Ali delivers)", F_H2); r += 1
    for j, h in enumerate(["Figure", "", "Value", "", "Source"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    cell(ws, f"A{r}", "Market THB per USDT", F_TXT); cell(ws, f"C{r}", 33.613, F_IN, None, RATE); cell(ws, f"E{r}", "sheet row 37 (1 ÷ 0.02975)", F_NOTE); mk = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "Ali's rate THB per USDT", F_TXT); cell(ws, f"C{r}", 33.83, F_IN, None, RATE); cell(ws, f"E{r}", "sheet row 37 (agent fee 0.64 %)", F_NOTE); ar = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "USDT delivered", F_TXT); cell(ws, f"C{r}", f'=ROUND({K["A"]}/{ar},2)', F_TXT, None, NUM); cell(ws, f"E{r}", "sheet says 502,513", F_NOTE); usdt = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "Partner cost %", F_TXT); cell(ws, f"C{r}", f"=1-{mk}/{ar}", F_TXT, None, PCT); cell(ws, f"E{r}", "worked out from the partner's rate against market", F_NOTE); r += 1
    cell(ws, f"A{r}", "EUR value of the USDT at the EUR/USDT market", F_TXT); cell(ws, f"C{r}", None, F_TXT, FILL_FIX, NUM); cell(ws, f"E{r}", "NPL: EUR/USDT market rate on the day × USDT delivered — needed to show NPL's margin against the EUR 432,267 promised", F_NOTE, wrap=True); ev = f"$C${r}"; ws.row_dimensions[r].height = 30; r += 1
    cell(ws, f"A{r}", "NPL margin in EUR (if filled)", F_B); cell(ws, f"C{r}", f'=IF({ev}="","",ROUND({ev}-{K["Amount the sender is promised"]},2))', F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", "should be ≈ 2 % − 0.64 % of the collection; the sheet expects a minimum of 0.5 %", F_NOTE, wrap=True); r += 1
    return r
pattern_sheet("P08", PATTERN_NAMES["P08"], [37],
    "DEAL_GROUP with one forward leg (THB → USDT at Ali, cash collection), INVOICE obligation in EUR (needs a system change), payout lines in USDT to several vendors with deal_id  and discharge fields (needs a system change)",
    common_slots("27 Group Remittance Collection for Game Reseller", "27 Group customer", "SACCO SIA, Mitratech, EZ-EVO, BraversPlay — vendors paid in USDT", "USDT wallets (vendors)", "cash", "none (cash) — instructions on the deal", "Ali", "fee inside its rate", "THB → USDT (customer promised EUR)", "added to what the sender pays", "market rate", "fixed", 0.02, 0.02, 0.0, None, None, 0.005, None, "kept for NPL at the partner", None, "", "nearest 1,000? (THB 12,813,449 → 12,813,000)", None, None, None),
    sim_inputs(17000000, "THB", "EUR", 0.0259463782412186, None, 0.0, 0.02, 0.02, 0.0, "market rate", "fee inside its rate", "off the rate the sender gets", "drop the cents", 1, 0.005, None, "kept for NPL at the partner", 0.0, 0.0, "ALI"),
    [("EUR credited to the customer (advance payment)", 432267, "Amount the sender is promised", "sheet row 37: THB 17,000,000 × 0.02542745 — your sheet takes 2 % off the EUR-per-THB rate; adding the fee to what the sender pays instead would give 432,439")],
    ["The customer is promised EUR but pays THB and the partner delivers USDT: the EUR figure is an obligation, not a currency that ever moves. Please confirm the system should track the invoice and how much of it each payment clears (needs a system change).",
     "Cash THB: which rounding unit applies to the collected amount (the balance clearance rounds THB 12,813,449 to 12,813,000)?",
     "Which vendor is paid from which collection, and at which day's EUR/USDT market rate — this is what the system would record for each payment (needs a system change)."], extra=thb_extra)

# --- P09 withdrawal (BF-Withdrawal, row 20)
pattern_sheet("P09", PATTERN_NAMES["P09"], [20],
    "CURRENCY_PAIR GBP → USDT, COLLECTION_RECEIVING_ENDPOINT (kind bank, rail), RECEIVING_ENTITY_ACCOUNT (kind wallet, D14), SETTLEMENT_REGISTRATION with network + address ",
    common_slots("BF-Withdrawal", None, "the client's own USDT wallet (counterparty receiver, wallet account)", "USDT · TRC-20 · wallet", "bank", "Jeton vehicle · bank · rail?", "Jeton", "fee on top of market", "GBP → USDT (also EUR → USDT)", "off the rate the sender gets", "market rate", "fixed", 0.01, 0.01, 0.0, None, None, None, None, "paid back monthly? — please confirm", 0.40, "", "drop the cents", None, None, None),
    sim_inputs(51000, "GBP", "USDT", 1 / 0.72739556, None, 0.01, 0.01, 0.01, 0.0, "market rate", "fee on top of market", "off the rate the sender gets", "drop the cents", 1, 0.003, None, "paid back monthly", 0.40, 0.0, "JETON"),
    [("USDT to the client's wallet", 69412, "Amount the sender is promised", "sheet row 20: GBP 51,000 ÷ 0.72739556 × 0.99")],
    ["The sheet says the fee 'is not fixed … but we have charged 1 % in most recent transactions': fixed at 1 %, or variable with a floor?",
     "Jeton's bank account for GBP and EUR (which Jeton company, which route — a bank account cannot be used until we know which route it is reached by).",
     "The payout goes to a wallet: Jeton's approval of it needs the wallet's network and address."])

# --- P10 cash exotic (Ad Hoc INR cash, row 45)
pattern_sheet("P10", PATTERN_NAMES["P10"], [45, 28],
    "DEAL.collection_method = cash, CURRENCY_PAIR.cash_rounding_unit, PARTNER_PAIR (disclosed_rate), FEE_STRUCTURE (basis partner)",
    common_slots("Ad Hoc INR Cash", None, None, None, "cash", "none (cash) — instructions on the deal", "Ali", "fee inside its rate", "INR → USD (also SGD, USDT)", "added to what the sender pays", "agent rate", "fixed", 0.005, 0.005, 0.0, None, None, None, None, "kept for NPL at the partner", None, "", "cash rounded to the nearest 1,000?", None, None, None),
    sim_inputs(8500000, "INR", "USD", None, 1 / 79.52918721, 0.0, 0.0, 0.0, 0.0, "agent rate", "fee inside its rate", "added to what the sender pays", "drop the cents", 1, 0.0, None, "kept for NPL at the partner", 0.0, 0.0, "ALI"),
    [("USD delivered", 106879.36, "Amount the sender is promised", "sheet row 45: INR 8,500,000 ÷ 79.529 — the sheet's arithmetic carries no NPL fee, so the calculation runs with s = 0; if the 0.5 % is NPL's fee on top, set s = 0.5 % and the USD falls by ≈ 534")],
    ["The sheet lists total fee 0.5 %, partner cost 5.5–7.5 % and NPL margin 0 %: is the 0.5 % NPL's fee on top of the agent rate, or the agent's? The calculation needs the real market rate (yellow) to show the partner's cost.",
     "Cash rounding unit for INR and for AED/USD cash in Dubai (row 28, dormant)."])

# --- P11 zero-fee internal (AK USDT, row 47)
pattern_sheet("P11", PATTERN_NAMES["P11"], [47, 46],
    "a 0 % fee with a 0 % minimum margin, PARTNER_PAIR (disclosed_rate)",
    common_slots("AK collections (USDT)", "AK (internal stakeholder)", None, None, "crypto", "Ali vehicle · wallet · TRC-20", "Ali", "fee inside its rate", "USDT → USD (also SGD)", "off the rate the sender gets", "agent rate", "fixed", 0.0, 0.0, 0.0, None, None, 0.0, None, "kept for NPL at the partner", None, "", "drop the cents", None, None, None),
    sim_inputs(10000, "USDT", "USD", 1.0, 0.996, 0.0, 0.0, 0.0, 0.0, "agent rate", "fee inside its rate", "off the rate the sender gets", "drop the cents", 1, 0.0, None, "kept for NPL at the partner", 0.0, 0.0, "ALI"),
    [("USD delivered", 9960, "Amount the sender is promised", "sheet row 47: USDT 10,000 × 0.996")],
    ["A 0 % fee with a 0 % minimum margin means every quote passes the margin check; confirm that is intended for internal stakeholder flows rather than a per-deal Finance approval.",
     "INR variant (row 46): INR 8,735,000 ÷ 100.80 — which pair and partner rate version?"])

# --- P12 same-currency pass-through (Evolution bank, row 27)
pattern_sheet("P12", PATTERN_NAMES["P12"], [27],
    "CURRENCY_PAIR with from = to (rate 1), FEE_STRUCTURE 1.4 % + 1.4 %, bank-in endpoint, SETTLEMENT_RAIL; dormant product",
    common_slots("Evolution USD, EUR, GBP (bank transfers)", None, "Evolution (receiver side pays 1.4 %)", None, "bank", "Ali vehicle · bank · rail?", "Ali", "fee inside its rate", "EUR → EUR (also USD → EUR, GBP → EUR)", "off the rate the sender gets", "market rate", "fixed", 0.028, 0.014, 0.014, None, None, None, None, "kept for NPL at the partner", None, "", "drop the cents", None, None, None),
    sim_inputs(100000, "EUR", "EUR", 1.0, 1.0, 0.0, 0.028, 0.014, 0.014, "market rate", "fee inside its rate", "off the rate the sender gets", "drop the cents", 1, 0.0, None, "kept for NPL at the partner", 0.0, 0.0, "ALI"),
    [("EUR delivered after both shares (no sheet example)", 97219.6, "Amount the receiver is owed", "100,000 × 0.986 × 0.986 — illustrative; the sheet has no worked example and the pair has not run for years")],
    ["Please confirm whether same-currency pass-through should remain in scope; if yes, the system must allow a pair with the same currency on both sides.",
     "Partner cost and rail for EUR bank-in at Ali (no recent data in the sheet)."])

# ------------------------------------------------------------------ For New XP: where each item lands in the model
ws = wb.create_sheet("For New XP")
widths(ws, {"A": 26, "B": 44, "C": 70})
header(ws, "A1", "For New XP — where each item lands in the data model (ERD v5.2). Not for NPL to fill.")
for j, h in enumerate(["Pattern sheet", "Item", "Model field / entity"], 1):
    cell(ws, f"{get_column_letter(j)}3", h, F_B, FILL_HEAD)
r = 4
for sheet, item, field in MAPPING:
    cell(ws, f"A{r}", sheet, F_TXT); cell(ws, f"B{r}", item, F_TXT, wrap=True); cell(ws, f"C{r}", field, F_TXT, wrap=True); r += 1
r += 1
cell(ws, f"A{r}", "Register column", F_B, FILL_HEAD); cell(ws, f"B{r}", "", F_B, FILL_HEAD); cell(ws, f"C{r}", "Model field / entity", F_B, FILL_HEAD); r += 1
for col, field in [("Client / product", "PROJECT"), ("Who sends the money", "SENDER, SENDER_RECEIVER_ALLOW"), ("Who gets paid", "RECEIVER (kind), RECEIVING_ENTITY"), ("Their account", "RECEIVING_ENTITY_ACCOUNT.currency / rail / account_kind"),
                   ("How the money comes in", "DEAL.collection_method"), ("Where it comes in", "PARTNER_ENTITY, COLLECTION_RECEIVING_ENDPOINT.kind / network / rail"), ("Partner / agent", "PARTNER, PARTNER_CONFIG"),
                   ("How the partner prices", "PARTNER_PAIR.partner_pricing, partner_markup_pct"), ("Exchange pair", "CURRENCY_PAIR.from_currency / to_currency"), ("Fee taken how", "CURRENCY_PAIR.quote_direction"),
                   ("Fee applied to", "FEE_STRUCTURE.rate_basis"), ("Fee is", "FEE_STRUCTURE.mode"), ("Total / sender / receiver %", "FEE_STRUCTURE.pct, sender_share_pct, receiver_share_pct (FEE_OVERRIDE per sender)"),
                   ("Lowest / highest / minimum margin %", "FEE_STRUCTURE.floor_pct, cap_pct, min_margin_pct"), ("Fee shown to the customer", "proposal C (displayed_fee_pct)"),
                   ("How NPL's share reaches NPL", "CO.<PARTNER>.POOL vs PARTNER_REBATE_RULE vs own desk (proposal D)"), ("% of the partner's fee paid back", "PARTNER_REBATE_RULE.pct_of_partner_fee"),
                   ("Earnings shared with someone else", "INTRODUCER, REFERRAL_RULE, REFERRAL_ACCRUAL"), ("Rounding", "CURRENCY_PAIR.amount_rounding, cash_rounding_unit (proposal F)"),
                   ("Bank or EMI that pays out", "SETTLEMENT_RAIL"), ("Name shown on the transfer", "SETTLEMENT_SENDING_ENTITY"), ("Has the partner approved the receiver's account?", "SETTLEMENT_REGISTRATION (D16 details)"),
                   ("Fee by monthly volume", "proposal B (FEE_TIER)")]:
    cell(ws, f"A{r}", col, F_TXT, wrap=True); cell(ws, f"C{r}", field, F_TXT, wrap=True); r += 1

# ------------------------------------------------------------------ save
wb.calculation.fullCalcOnLoad = True
OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print("wrote", OUT, "sheets:", wb.sheetnames)
