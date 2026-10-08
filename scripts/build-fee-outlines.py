#!/usr/bin/env python3
"""Build docs/NPLify-Fee-Outlines-v0.2.xlsx from data/remittance-fees-2026-10.xlsx and NPL's answers.

One 'All fee lines' sheet with a fill-in row per line of NPL's fee table, and one outline sheet per
transaction pattern: configuration slots, a simulation that computes what the system would quote,
convert and pay from those slots, the postings it would write, and a check against the figures NPL
quoted. Yellow cells are for NPL to fill; pink cells are a choice between two of NPL's own figures;
blue cells are inputs taken from the sheet or from NPL's answers of 8 October; black cells are
formulas. NPL's 'Project Context' and 'Payment methods' tabs are carried over unchanged from the
returned v0.1 (data/fee-outlines-v0.1-answers.xlsx).   python3 scripts/build-fee-outlines.py
"""
import re
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/remittance-fees-2026-10.xlsx"
ANSWERS = ROOT / "data/fee-outlines-v0.1-answers.xlsx"   # the workbook NPL returned on 8 October
OUT = ROOT / "docs/NPLify-Fee-Outlines-v0.2.xlsx"

FONT = "Arial"
F_IN = Font(name=FONT, size=10, color="0000FF")          # input taken from the sheet or NPL's answers
F_TXT = Font(name=FONT, size=10)
F_B = Font(name=FONT, size=10, bold=True)
F_H = Font(name=FONT, size=13, bold=True, color="2F5D9E")
F_H2 = Font(name=FONT, size=11, bold=True, color="2F5D9E")
F_NOTE = Font(name=FONT, size=9, italic=True, color="555555")
FILL_FIX = PatternFill("solid", fgColor="FFFF00")         # NPL fills this in
FILL_HEAD = PatternFill("solid", fgColor="E8EEF7")
FILL_CHK = PatternFill("solid", fgColor="F3F6FB")
FILL_ASK = PatternFill("solid", fgColor="FDE9D9")         # a choice NPL must make
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
    "P01": "Fee taken off the market rate; the partner pays NPL its share back monthly", "P02": "Agent rate; the fee shown to the customer differs from the true total",
    "P03": "Sender and receiver both pay a part of the fee", "P04": "Fee decided per deal, with a lowest value and a minimum margin",
    "P05": "Fee that drops with monthly volume", "P06": "NPL's markup shared with the customer who provides the sub-account",
    "P07": "Game reseller (NPL-GR): NPL converts in its own wallet, no partner", "P08": "THB cash in, partner converts to USDT, vendors paid in USDT",
    "P09": "Withdrawal: bank transfer in, USDT out", "P10": "Cash collection",
    "P11": "No-fee internal collection, balance held at the partner", "P12": "Same-currency bank transfer",
}
SOURCE_LABEL = {"sheet": "your sheet", "NPL": "please fill in", "NPL to confirm": "please confirm", "derived": "worked out from your sheet",
                "n/a": "not needed here", "answer": "your answer (8 Oct)", "choice": "please choose (see F)"}

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
header(ws, "A1", "NPLify — Fee outlines for simulation · v0.2 (8 October 2026)")
lines = [
    ("What changed in v0.2", "Your answers of 8 October are folded in (blue cells marked 'your answer'): how each partner pays NPL its share, the real rates behind the quotes, the Evo receiver groups, the GDC volume rule, the Raeen sub-account split, NPL-GR as the client for the game reseller, the rounding conventions, and the bank and name used on each payout. Questions you answered are gone from 'Please confirm'; the few places where two of your figures disagree are listed there as a choice (pink cells). Your 'Project Context' and 'Payment methods' tabs are carried over unchanged. Two things were renamed because the old words did not land: 'lowest / highest fee' is now 'lowest / highest markup', and the approval question now reads 'has the partner approved this account: yes / pending'."),
    ("What this is", "Every line of NPL's 'Table of Remittance Customers Fees' turned into a fill-in outline: who sends, who gets paid, which partner, which currencies, what fee, who pays it, how NPL's share reaches NPL, and how amounts are rounded. Each pattern sheet also has a worked calculation: change the amount or any value and it shows what the customer would be quoted, what the partner delivers, what NPL earns, what is paid out, and the bookkeeping entries — and compares the result with the figure in your sheet."),
    ("How to fill", "Yellow cells are still open — please fill them. Pink cells are a choice between two of your own figures. Blue cells were copied from your sheet or from your answers — correct them if they are wrong. Black cells are calculations; please do not type over them. 'Where it comes from' says how we got a value."),
    ("Sheets", "All fee lines — one row per line of your sheet (45), one column per thing to fill in. Then twelve pattern sheets, one per way a transaction works, each with one worked example from your sheet. Column D of 'All fee lines' says which pattern a line belongs to. 'Project Context' and 'Payment methods' are yours. The last sheet, 'For New XP', maps each item to the system's field names and is not for NPL to fill."),
    ("The worked calculation", "Uses the same arithmetic as your sheet: rates are written as units received per 1 unit sent (where a partner quotes the other way round, e.g. 1.1738, the sheet takes 1 ÷ that); the rate quoted to the sender is the market rate (or the agent rate) less the sender's fee; the receiver's fee, if any, comes off after that; the partner delivers at its own rate; NPL's earnings are what the partner delivers minus what the receiver gets; a partner's monthly rebate is shown on its own line and is never mixed into those earnings; payouts go out rounded as agreed. Where an item needs a change to the system before it can be handled, the note says 'needs a system change'."),
    ("What to do with it", "1. Fill the yellow cells, decide the pink ones, correct any blue value. 2. On each pattern sheet, 'Compare with your sheet' should show a difference of zero, or one that the comment explains. 3. We then load the filled-in lines as the system's configuration and use the pattern sheets as test cases: the system passes when it reproduces every figure."),
    ("Legend", "'Needs a system change' marks an item the system cannot handle yet. The full list, with what each change does to the model, is in the companion document 'Model Gaps & Proposals v1.0'."),
]
r = 3
for k, v in lines:
    cell(ws, f"A{r}", k, F_B, wrap=True); cell(ws, f"B{r}", v, F_TXT, wrap=True); ws.row_dimensions[r].height = 76; r += 1
r += 1
cell(ws, f"A{r}", "Colour", F_B); cell(ws, f"B{r}", "Meaning", F_B); r += 1
cell(ws, f"A{r}", "NPL fills in", F_TXT, FILL_FIX); cell(ws, f"B{r}", "Still open — please supply", F_TXT); r += 1
cell(ws, f"A{r}", "NPL chooses", F_TXT, FILL_ASK); cell(ws, f"B{r}", "Two of your figures disagree — please pick one (the question is under 'Please confirm')", F_TXT); r += 1
cell(ws, f"A{r}", "From your sheet or your answers", F_IN); cell(ws, f"B{r}", "Copied from your fee table or your answers of 8 October (blue text) — correct if wrong", F_TXT); r += 1
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
    ("Who sends the money", 18), ("Who gets paid", 22), ("Their account: currency · bank or wallet · route (SEPA, SWIFT, TRC-20, internal transfer …)", 24),
    ("How the money comes in (crypto / bank / cash / local deposit)", 16), ("Where it comes in: which partner company, its wallet or bank account", 28),
    ("Partner / agent", 16), ("How the partner prices (fee on top of market / fee inside its rate / NPL's own wallet)", 18), ("Exchange pair (sent → paid out)", 18),
    ("Fee taken how (off the rate the sender gets / added to what the sender pays)", 14), ("Fee applied to (market rate / agent rate)", 12), ("Fee is (fixed / set per deal)", 10),
    ("Total fee %", 11), ("Sender pays %", 11), ("Receiver pays %", 11),
    ("Lowest markup % (only when set per deal)", 9), ("Highest markup % (only when set per deal)", 9), ("Minimum NPL margin %", 10), ("Fee shown to the customer %, if different (needs a system change)", 12),
    ("Partner / agent cost % (from your sheet)", 12), ("NPL margin % (from your sheet)", 12), ("How NPL's share reaches NPL (partner keeps it for NPL / partner pays it back monthly / held by the client, paid monthly / NPL's own wallet)", 18),
    ("% of the partner's fee paid back to NPL (rebate)", 14), ("Markup shared with someone else: who · their share — several parties possible", 22), ("Rounding (drop the cents / nearest unit / round up / nearest 1,000)", 18),
    ("Bank or EMI that pays out", 16), ("Name shown on the transfer", 16), ("Has the partner approved the receiver's account? (yes / pending)", 14),
    ("Fee by monthly volume (needs a system change)", 16), ("Note from your sheet", 40), ("Please confirm", 40),
]
for i, (h, w) in enumerate(COLS, 1):
    c = cell(ws, f"{get_column_letter(i)}1", h, F_B, FILL_HEAD, wrap=True); ws.column_dimensions[get_column_letter(i)].width = w
ws.row_dimensions[1].height = 92
ws.freeze_panes = "E2"

def partner_pricing(p):
    return "fee on top of market" if p in ("Jeton", "Aquanow") else "NPL's own wallet (needs a system change)" if "LT Sub" in p else "fee inside its rate" if p == "Ali" else ""

def mechanic(row):
    if "LT Sub" in row["partner"]: return "NPL's own wallet"
    if "Sub Account" in row["client"]: return "held by the client, paid monthly"
    if row["partner"] in ("Jeton", "Aquanow"): return "paid back monthly"
    return "kept for NPL at the partner"

def rebate_pct(row):
    if row["partner"] == "Jeton": return 0.40
    if row["partner"] == "Aquanow": return 0.375
    return ""

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
    if pid == "P02": confirm.append("the real market rate at the time of the quote (your sheet shows the recomputed one)")
    if "Fee is not fixed" in str(row["note"]) or "changes" in str(row["note"]): confirm.append("who decides the fee for each deal, and between which lowest and highest markup")
    vals = [i - 1, row["row"], row["client"], SHEET_NAMES[pid], row["example"] or "", "", "", "", "", "", row["partner"], partner_pricing(row["partner"]), pair_dir(row), "", "",
            "set per deal" if fee is None or (row["note"] and ("not fixed" in row["note"] or "change" in row["note"])) else "fixed",
            fee if fee is not None else row["fee"], float(split.group(1)) / 100 if split else (fee if fee is not None and not split else ""),
            float(split.group(2)) / 100 if split else ("" if fee is None else 0), "", "", "", "", cost if cost is not None else row["cost"],
            margin if margin is not None else row["margin"], mechanic(row), rebate_pct(row), share, "", "", "", "", "", row["note"] or "", "; ".join(confirm)]
    for j, v in enumerate(vals, 1):
        ref = f"{get_column_letter(j)}{i}"
        is_fill = v == "" and j not in (34, 35)
        font = F_IN if j in (3, 5, 11, 12, 13, 16, 17, 18, 19, 24, 25, 26, 27, 28, 34) and v != "" else F_TXT
        c = cell(ws, ref, v, font, FILL_FIX if is_fill else None, PCT if j in (17, 18, 19, 20, 21, 22, 23, 24, 25, 27) and isinstance(v, (int, float)) else None, wrap=True)
    ws.row_dimensions[i].height = 60

# ------------------------------------------------------------------ pattern sheets
def pattern_sheet(pid, title, rows, erd_entities, slots, sim, sheet_figures, open_points, extra=None, choices=()):
    """slots: list of (slot, erd_field, value, source, note); value None -> yellow; source 'choice' -> pink.
    sim: list of (label, key, value, fmt, source); value may be a callable(REF) returning a formula.
    choices: keys of sim inputs to paint pink."""
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
        fill = FILL_FIX if value is None else FILL_ASK if source == "choice" else None
        cell(ws, f"B{r}", value if value is not None else "", F_IN if value not in (None, "") else F_TXT, fill, PCT if isinstance(value, float) and abs(value) < 1 and "rate" not in slot.lower() else None, wrap=True)
        cell(ws, f"C{r}", SOURCE_LABEL.get(source, source), F_TXT, wrap=True); cell(ws, f"D{r}", note, F_NOTE, wrap=True)
        ws.row_dimensions[r].height = 54 if len(str(value or "")) > 70 or len(note) > 120 else 42 if len(note) > 60 or len(str(value or "")) > 36 else 16
        r += 1
    r += 1
    header(ws, f"A{r}", "B · Worked calculation — the deal (change any value)", F_H2); r += 1
    for j, h in enumerate(["Item", "", "Value", "", "Meaning"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    REF = {}
    for label, key, value, fmt, source in sim:
        cell(ws, f"A{r}", label, F_TXT, wrap=True)
        if callable(value):
            cell(ws, f"C{r}", value(REF), F_TXT, None, fmt)
        else:
            cell(ws, f"C{r}", value if value is not None else "", F_IN if value is not None else F_TXT, FILL_ASK if key in choices else None if value is not None else FILL_FIX, fmt)
        cell(ws, f"E{r}", source, F_NOTE, wrap=True)
        ws.row_dimensions[r].height = 30 if len(source) > 60 else 16
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
    out("NPL earns on this deal", "what the partner delivers − what the receiver is owed", f'={K["What the partner delivers"]}-{K["Amount the receiver is owed"]}', NUM, "locked in when the money is converted; the partner's rebate is NOT in this figure")
    out("NPL margin %", "NPL earns ÷ (amount × market)", f'=IF({K["A"]}*{K["Rm"]}=0,0,{K["NPL earns on this deal"]}/({K["A"]}*{K["Rm"]}))', PCT, "")
    out("Below the minimum margin?", "if so, the quote needs Finance approval", f'=IF({K["NPL margin %"]}<{K["minm"]},"YES — Finance must approve","no")', None, "")
    out("Amount actually paid out", "amount owed, rounded as agreed", f'=IF({K["round"]}="round up",CEILING({K["Amount the receiver is owed"]},{K["unit"]}),IF({K["round"]}="nearest unit",MROUND({K["Amount the receiver is owed"]},{K["unit"]}),IF({K["round"]}="nearest 1,000",MROUND({K["Amount the receiver is owed"]},{K["unit"]}),FLOOR({K["Amount the receiver is owed"]},{K["unit"]}))))', NUM, "only 'drop the cents' exists today; the other options need a system change (proposal F)")
    out("Cents left in the client's balance (negative = NPL's cost)", "amount owed − amount paid out", f'={K["Amount the receiver is owed"]}-{K["Amount actually paid out"]}', NUM, "")
    out("Rate printed on the customer's quote", "rate quoted to the sender ÷ (1 − fee shown) — the 'market rate' your customer-facing calculation prints", f'=IF({K["disp"]}="",{base},{K["Rate quoted to the sender"]}/(1-{K["disp"]}))', RATE, "needs a system change when it differs from the true rate (proposal C)")
    out("Rebate owed back to NPL by the partner", "partner's fee × % paid back — NPL's alone, never shared, tracked on its own", f'={K["Partner / agent cost"]}*{K["rebate"]}', NUM, "0 where the partner pays no rebate")
    out("Share owed to someone else", "amount × market × share % (the share is of NPL's earnings, not of the rebate)", f'={K["A"]}*{K["Rm"]}*{K["refpct"]}', NUM, "paid out of NPL's earnings")
    out("NPL keeps", "NPL earns − share owed + rebate", f'={K["NPL earns on this deal"]}-{K["Share owed to someone else"]}+{K["Rebate owed back to NPL by the partner"]}', NUM, "")
    out("Check: receiver + partner cost + NPL = amount × market", "must be zero", f'=ROUND({K["Amount the receiver is owed"]}+{K["Partner / agent cost"]}+{K["NPL earns on this deal"]}-{K["A"]}*{K["Rm"]},6)', NUM, "every unit sent is accounted for")
    r += 1
    header(ws, f"A{r}", "D · Bookkeeping entries the system would write", F_H2); r += 1
    for j, h in enumerate(["Entry", "In / out", "Amount", "Whose money · what kind", "When"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    P = K["partner_code"]; IN = K["ccy_in"]; OUTC = K["ccy_out"]; M = K["mech"]
    posts = [
        (f'="Client money received at "&{P}&" ("&{IN}&")"', "in", f'={K["A"]}', "client's money · the amount itself", "when the money arrives"),
        (f'="Owed to the client\'s receivers ("&{IN}&")"', "out", f'={K["A"]}', "client's money · the amount itself", "when the money arrives"),
        (f'="Owed to the client\'s receivers ("&{IN}&")"', "in", f'={K["A"]}', "client's money · the amount itself", "conversion — currency sent"),
        (f'="Client money received at "&{P}&" ("&{IN}&")"', "out", f'={K["A"]}', "client's money · the amount itself", "conversion — currency sent"),
        (f'="Client money ready to pay out at "&{P}&" ("&{OUTC}&")"', "in", f'={K["Amount the receiver is owed"]}', "client's money · the amount itself (cents included)", "conversion — currency paid out"),
        (f'="NPL\'s earnings kept at "&{P}&" ("&{OUTC}&")"', "in", f'=IF(OR({M}="paid back monthly",{M}="held by the client, paid monthly"),0,{K["NPL earns on this deal"]})', "NPL's money · earnings", "conversion — NPL's share left with the partner (or in NPL's own wallet)"),
        (f'="Owed to NPL by the client ("&{OUTC}&")"', "in", f'=IF({M}="held by the client, paid monthly",{K["NPL earns on this deal"]},0)', "NPL's money · earnings", "conversion — the converted money went to the client's own account; NPL's share is owed by the client"),
        (f'="Rebate owed to NPL by "&{P}&" ("&{OUTC}&")"', "in", f'={K["Rebate owed back to NPL by the partner"]}', "NPL's money · rebate (kept apart from earnings)", "conversion — the partner's monthly rebate"),
        (f'="Owed to the client\'s receivers ("&{OUTC}&")"', "out", f'={K["Amount the receiver is owed"]}', "client's money · the amount itself", "conversion — currency paid out"),
        (f'="NPL\'s earnings ("&{OUTC}&")"', "out", f'={K["NPL earns on this deal"]}', "NPL's money · earnings", "margin recognised"),
        (f'="NPL\'s rebate income ("&{OUTC}&")"', "out", f'={K["Rebate owed back to NPL by the partner"]}', "NPL's money · rebate", "rebate expected — reported separately from earnings"),
        (f'="Client money in transit from "&{P}&" ("&{OUTC}&")"', "in", f'={K["Amount actually paid out"]}', "client's money · the amount itself", "payout released (rounded as agreed)"),
        (f'="Client money ready to pay out at "&{P}&" ("&{OUTC}&")"', "out", f'={K["Amount actually paid out"]}', "client's money · the amount itself", "payout released"),
        (f'="Owed to the client\'s receivers ("&{OUTC}&")"', "in", f'={K["Amount actually paid out"]}', "client's money · the amount itself", "receiver confirms in full"),
        (f'="Client money in transit from "&{P}&" ("&{OUTC}&")"', "out", f'={K["Amount actually paid out"]}', "client's money · the amount itself", "receiver confirms in full"),
        (f'="NPL\'s earnings ("&{OUTC}&")"', "in", f'={K["Share owed to someone else"]}', "NPL's money · share paid to someone else", "share accrued (if any)"),
        (f'="Owed to the other party ("&{OUTC}&")"', "out", f'={K["Share owed to someone else"]}', "NPL's money · share paid to someone else", "share accrued"),
        (f'="Owed to the other party ("&{OUTC}&")"', "in", f'=IF({M}="held by the client, paid monthly",{K["Share owed to someone else"]},0)', "NPL's money · share", "netted: the client keeps its share out of the money in its account"),
        (f'="Owed to NPL by the client ("&{OUTC}&")"', "out", f'=IF({M}="held by the client, paid monthly",{K["Share owed to someone else"]},0)', "NPL's money · earnings", "netted: what the client pays NPL monthly is the rest"),
    ]
    r0 = r
    for acct, side, amt, tag, ev in posts:
        cell(ws, f"A{r}", acct, F_TXT); cell(ws, f"B{r}", side, F_TXT); cell(ws, f"C{r}", amt, F_TXT, None, NUM); cell(ws, f"D{r}", tag, F_NOTE, wrap=True); cell(ws, f"E{r}", ev, F_NOTE, wrap=True)
        ws.row_dimensions[r].height = 30 if len(ev) > 55 else 16; r += 1
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
        cell(ws, f"D{r}", f"=ROUND(C{r}-B{r},2)", F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", comment, F_NOTE, wrap=True); ws.row_dimensions[r].height = 44 if len(comment) > 110 else 30 if len(comment) > 50 else 16; r += 1
    if extra:
        r += 1; r = extra(ws, r, K)
    r += 1
    header(ws, f"A{r}", "F · Please confirm", F_H2); r += 1
    for p in open_points:
        cell(ws, f"A{r}", "•", F_TXT, border=False); cell(ws, f"B{r}", p, F_TXT, wrap=True, border=False); ws.merge_cells(f"B{r}:E{r}"); ws.row_dimensions[r].height = 46 if len(p) > 220 else 32; r += 1
    return ws

# common slot builders
def common_slots(project, sender, receiver, account, method, endpoint, partner, pricing, pair, direction, basis, mode, fee, s, r_, floor, cap, minm, disp, mech, rebate, share, rounding, rail, narrative, reg,
                 src=None, extra_slots=()):
    """src: dict slot-key -> source override ('answer', 'choice', ...). Defaults: a value -> 'sheet'; None -> 'NPL'."""
    src = src or {}
    def S(key, value, default_if_value="sheet"):
        if key in src: return src[key]
        return default_if_value if value is not None else "NPL"
    fixed = mode == "fixed"
    rows = [
        ("Client", "PROJECT.name", project, S("project", project), "One set-up per client."),
        ("Who sends the money", "SENDER + SENDER_RECEIVER_ALLOW", sender, S("sender", sender), "The sender(s). Each must be on the list of who may pay this client's receivers."),
        ("Who gets paid", "RECEIVER → RECEIVING_ENTITY (+ RECEIVER_GROUP)", receiver, S("receiver", receiver), "The receiver, or the vendor. A refund goes back to the sender's own account."),
        ("Their account", "RECEIVING_ENTITY_ACCOUNT (currency, rail, account_kind)", account, S("account", account), "Currency, bank account or wallet, and the route: EUR by SEPA and EUR by SWIFT count as two accounts; a wallet needs its network and address; a transfer inside the partner's own platform is its own route."),
        ("How the money comes in", "DEAL.collection_method", method, S("method", method), "crypto, bank transfer, cash, or a one-time local bank deposit."),
        ("Where it comes in", "PARTNER_ENTITY → COLLECTION_RECEIVING_ENDPOINT", endpoint, S("endpoint", endpoint), "Which partner company's wallet or bank account the sender pays into. It must be live, belong to that partner company, and be a wallet for crypto or a bank account for bank transfers."),
        ("Partner / agent", "PARTNER + PARTNER_CONFIG", partner, S("partner", partner), ""),
        ("How the partner prices", "PARTNER_PAIR.partner_pricing (+ partner_markup_pct)", pricing, S("pricing", pricing), "'fee on top of market': the partner converts at market and states its fee separately. 'fee inside its rate': the partner's margin is built into the rate it gives."),
        ("Exchange pair", "CURRENCY_PAIR (from → to)", pair, S("pair", pair), "currency sent → currency paid out."),
        ("Fee taken how", "CURRENCY_PAIR.quote_direction", direction, S("direction", direction), "'off the rate the sender gets': the sender receives a lower rate. 'added to what the sender pays': the sender pays more per unit received (e.g. 7 % added to the INR-per-USD rate)."),
        ("Fee applied to", "FEE_STRUCTURE.rate_basis", basis, S("basis", basis), "the market rate, or the agent's rate."),
        ("Fee is", "FEE_STRUCTURE.mode", mode, S("mode", mode), "fixed, or decided per deal between a lowest and a highest markup."),
        ("Total fee %", "FEE_STRUCTURE.pct", fee, S("fee", fee), "sender's part + receiver's part."),
        ("Sender pays %", "FEE_STRUCTURE.sender_share_pct", s, S("s", s), ""),
        ("Receiver pays %", "FEE_STRUCTURE.receiver_share_pct", r_, S("r", r_), "Taken from the client's balance when the money is converted."),
        ("Lowest markup %", "FEE_STRUCTURE.floor_pct", "" if fixed and floor is None else floor, "n/a" if fixed and floor is None else S("floor", floor), "only when the fee is decided per deal — the least NPL adds"),
        ("Highest markup %", "FEE_STRUCTURE.cap_pct", "" if fixed and cap is None else cap, "n/a" if fixed and cap is None else S("cap", cap), "only when the fee is decided per deal — the most NPL adds (your 'max markup')"),
        ("Minimum NPL margin %", "FEE_STRUCTURE.min_margin_pct", minm, S("minm", minm), "A quote that earns less needs Finance's approval."),
        ("Fee shown to the customer %", "FEE_STRUCTURE.displayed_fee_pct (proposal C)", disp, S("disp", disp) if disp is not None else "n/a", "Only when the customer-facing calculation shows a different fee from the true total. Needs a system change."),
        ("How NPL's share reaches NPL", "pool at partner / PARTNER_REBATE_RULE / REFERRAL_RULE settled by the client (proposal G) / own desk (proposal D)", mech, S("mech", mech), "'kept for NPL at the partner': the partner holds NPL's share for NPL to draw on. 'paid back monthly': the partner takes the whole fee and pays NPL's share back on its statement. 'held by the client, paid monthly': the converted money went to the client's own account and the client pays NPL its share. 'NPL's own wallet': no partner."),
        ("% of the partner's fee paid back to NPL (rebate)", "PARTNER_REBATE_RULE.pct_of_partner_fee", rebate, S("rebate", rebate, "derived") if rebate is not None else "n/a", "NPL's alone: never shared with anyone and counted apart from NPL's earnings on the deal (proposal H)."),
        ("Markup shared with someone else", "INTRODUCER + REFERRAL_RULE (basis share of net markup, proposal G)", share, S("share", share) if share else "n/a", "Who, their share of the markup after the partner's fee, and whether NPL pays it out or they keep it and pay NPL. Several parties with different shares are possible — list each."),
        ("Rounding", "CURRENCY_PAIR.amount_rounding (+ rounding_unit, proposal F)", rounding, S("rounding", rounding), "'drop the cents' is the rule the system has; your answer: round up to the nearest 1,000 for Asian currencies, nearest unit for USD, SGD, HKD — needs a system change."),
        ("Bank or EMI that pays out", "SETTLEMENT_RAIL", rail, S("rail", rail), "and the bank fee you expect on it"),
        ("Name shown on the transfer", "SETTLEMENT_SENDING_ENTITY.narrative_name", narrative, S("narrative", narrative), "what the receiver's bank statement shows — often the customer's own entity or NPL's own entity"),
        ("Has the partner approved the receiver's account? (yes / pending)", "SETTLEMENT_REGISTRATION.approval_status (+ details, D16)", reg, S("reg", reg), "A quote cannot be sent until the partner has approved at least one account of the receivers it will pay."),
    ]
    return rows + list(extra_slots)

def sim_inputs(A, ccy_in, ccy_out, Rm, Rp, m, f, s, r_, basis, pricing, direction, rounding, unit, minm, disp, mech, rebate, refpct, partner_code, notes=None):
    notes = notes or {}
    return [
        ("Amount sent", "A", A, NUM, notes.get("A", "what the sender pays in, in the currency sent")),
        ("Currency sent", "ccy_in", ccy_in, None, ""), ("Currency paid out", "ccy_out", ccy_out, None, ""),
        ("Partner (short name)", "partner_code", partner_code, None, "used in the bookkeeping entries below"),
        ("Market rate", "Rm", Rm, RATE, notes.get("Rm", "units received per 1 unit sent, at the time of the quote")),
        ("Agent rate (partners whose fee is inside the rate)", "Rp", Rp, RATE, notes.get("Rp", "units received per 1 unit sent, as the partner offers it; leave blank for partners that state their fee separately. If the partner quotes the other way round (e.g. 1.1738), enter 1 ÷ that")),
        ("Partner's fee on top of market", "m", m, PCT, "only for partners that state their fee separately; 0 otherwise"),
        ("Total fee", "f", f, PCT, notes.get("f", "")), ("Sender pays", "s", s, PCT, notes.get("s", "")), ("Receiver pays", "r", r_, PCT, ""),
        ("Fee applied to", "basis", basis, None, "market rate / agent rate"), ("How the partner prices", "pricing", pricing, None, "fee on top of market / fee inside its rate / NPL's own wallet"),
        ("Fee taken how", "dir", direction, None, "off the rate the sender gets / added to what the sender pays"),
        ("Rounding", "round", rounding, None, "drop the cents / nearest unit / round up / nearest 1,000"), ("Rounding unit", "unit", unit, NUM, "1 for whole units; 1000 for the nearest thousand"),
        ("Minimum NPL margin", "minm", minm, PCT, notes.get("minm", "")), ("Fee shown to the customer (blank = the true fee)", "disp", disp, PCT, "needs a system change when it differs"),
        ("How NPL's share reaches NPL", "mech", mech, None, "kept for NPL at the partner / paid back monthly / held by the client, paid monthly / NPL's own wallet"),
        ("% of the partner's fee paid back (rebate)", "rebate", rebate, PCT, notes.get("rebate", "NPL's alone; 0 where there is none")),
        ("Share paid to someone else %", "refpct", refpct, PCT, notes.get("refpct", "of the amount × market; an introducer, or the customer who provides the sub-account")),
    ]

CASH_CITY = ("Where the cash is handed over (city)", "DEAL.cash_location + PARTNER_RATE_VERSION.location (proposal K)", None, "NPL", "Your Payment methods tab: Delhi and Mumbai, or Bangkok and Singapore, carry different agents and different rates. Needs a system change.")

# --- P01 market-minus (BF-Seven via Jeton, row 3)
pattern_sheet("P01", PATTERN_NAMES["P01"], [3, 6, 8, 9, 10, 13, 17, 4, 11, 18, 20],
    "PROJECT, SENDER, RECEIVER, PARTNER_PAIR (market_plus_pct), FEE_STRUCTURE (basis market), PARTNER_REBATE_RULE + PARTNER_REBATE_ACCRUAL, CONVERSION, DISBURSEMENT",
    common_slots("BF-Seven", "Seven", "BF (its 'Sporting Exchange' receiving account)", "EUR via SWIFT", "crypto", "Jeton vehicle · wallet · TRC-20 or ERC-20 (both exist)", "Jeton", "fee on top of market", "USDT → EUR", "off the rate the sender gets", "market rate", "fixed", 0.01, 0.01, 0.0, None, None, 0.004, None, "paid back monthly", 0.40, "", "drop the cents", "Jeton (SWIFT)", "Seven Investments N.V.", "yes",
                 src={"sender": "answer", "receiver": "answer", "account": "answer", "endpoint": "answer", "mech": "answer", "rail": "answer", "narrative": "answer", "reg": "answer", "minm": "answer"}),
    sim_inputs(661060, "USDT", "EUR", 0.857097, None, 0.01, 0.01, 0.01, 0.0, "market rate", "fee on top of market", "off the rate the sender gets", "drop the cents", 1, 0.004, None, "paid back monthly", 0.40, 0.0, "JETON",
               notes={"minm": "your answer: on BF deals via Jeton the 0.4 % rebate is the only margin", "rebate": "your answer: Jeton deducts the full 1 % and pays 0.4 % back, accumulated monthly"}),
    [("EUR amount to the receiver", 560927, "Amount the sender is promised", "sheet row 3: 661,060 × 0.857097 × 0.99")],
    ["Which Jeton company's name is on the collection wallet (the vehicle)? Jeton is currently inactive — we keep this set-up ready for when it resumes.",
     "Novi pays 0.9 % via Jeton (row 17): does Jeton still pay NPL 0.4 % back on those deals, or 0.3 %?"])

# --- P02 agent rate with displayed fee (BF-Seven via Ali, row 5)
pattern_sheet("P02", PATTERN_NAMES["P02"], [5, 7, 12, 15, 19],
    "PARTNER_PAIR (disclosed_rate), FEE_STRUCTURE (basis partner), DEAL_GROUP.displayed_* (proposal C), PARTNER_RATE_VERSION.quoted_direction (proposal I), CO.<PARTNER>.POOL",
    common_slots("BF-Seven", "Seven", "BF (its 'Sporting Exchange' receiving account)", "EUR via SWIFT", "crypto", "PT-tour or PT Global Inc · wallet · TRC-20", "Ali", "fee inside its rate", "USDT → EUR", "off the rate the sender gets", "agent rate", "fixed", 0.004, 0.004, 0.0, None, None, 0.003, 0.01, "kept for NPL at the partner", None, "", "drop the cents", "PT Sukses", "Seven Investments N.V.", "yes",
                 src={"sender": "answer", "receiver": "answer", "account": "answer", "rail": "answer", "narrative": "answer", "reg": "answer", "disp": "answer", "minm": "derived"}),
    sim_inputs(661060, "USDT", "EUR", 0.86050, 0.851934, 0.0, 0.004, 0.004, 0.0, "agent rate", "fee inside its rate", "off the rate the sender gets", "drop the cents", 1, 0.003, 0.01, "kept for NPL at the partner", 0.0, 0.0, "ALI",
               notes={"Rm": "your answer: the market rate that day was 0.86050", "Rp": "your answer: Ali quoted 1.1748, then 1.1738 — Ali quotes EUR-per-USDT the other way round, so the system must store 1 ÷ 1.1738 = 0.851934 (proposal I)", "minm": "your Project Context: Ali deals are set to leave 0.3–0.4 %"}),
    [("Rate shown on the customer's quote", 0.857097, "Rate printed on the customer's quote", "sheet row 5 shows 0.857097 with 'Fee: 1 %' — the recomputed rate; the system would print the same figure from the true rates"),
     ("EUR amount to the receiver", 560927, "Amount the sender is promised", "sheet row 5")],
    ["You said the '1 % shown' rule is for this project only and may later become 'partner rate + markup'. When that happens the 'fee shown to the customer' slot is simply left blank — nothing else changes. Tell us when.",
     "With the true market at 0.86050, Ali's cost on this deal was 1.0 % and NPL's 0.4 % — total 1.4 % as your sheet says. Please confirm 0.3 % as the minimum margin on Ali deals, or give another figure."])

# --- P03 sender + receiver split (Evo via Ali, row 21)
pattern_sheet("P03", PATTERN_NAMES["P03"], [21, 22, 23, 24],
    "RECEIVER_GROUP (Bplay, TBet), FEE_STRUCTURE.sender_share_pct / receiver_share_pct, FEE_OVERRIDE with its own split (proposal A), PARTNER_CONFIG cutoff (proposal J), CONVERSION.fee_receiver_part",
    common_slots("Evo USDT Collection", "BCI (a sender in the Bplay group)", "Bplay — one of two receiver groups: Bplay (entities Babylon, Bplay, Lex) and TBet (entity TBet). Each sender belongs to one group.", "EUR via SWIFT", "crypto", "PT vehicle · wallet · TRC-20", "Ali (can pay Babylon and TBet; Jeton can pay Bplay, Lex, TBet)", "fee inside its rate", "USDT → EUR", "off the rate the sender gets", "market rate", "fixed", 0.02, 0.014, 0.006, None, None, 0.005, None, "kept for NPL at the partner", None, "", "drop the cents", "PT Sukses", "Bplay", "yes",
                 src={"sender": "answer", "receiver": "answer", "account": "answer", "partner": "answer", "rail": "answer", "narrative": "answer", "reg": "answer"},
                 extra_slots=[("Selected senders (GTSI, HG, Komodo)", "FEE_OVERRIDE.sender_share_pct = 1.0 %, receiver_share_pct = 0.6 % (proposal A)", "sender 1.0 %, Evo still 0.6 % — the receiver part is fixed for all senders", "answer", "Needs a system change: today a per-sender override keeps the 70/30 proportion."),
                              ("Bank cutoff for same-day conversion", "PARTNER_CONFIG.bank_cutoff_time (proposal J)", "14:30 GMT+8 — rate taken from Ali in the morning; locked before the cutoff converts the same day, after it the next business day", "answer", "Needs a system change: the system has quote validity but no cutoff / next-day rule."),
                              ("Via Jeton instead", "PARTNER_PAIR (market_plus_pct 1.25 %) + PARTNER_REBATE_RULE 0.4 %", "Jeton charges 1.25 % overall and pays 0.4 % back monthly; Jeton can only collect USDT", "answer", "")]),
    sim_inputs(29325, "USDT", "EUR", 0.888977323, 0.881421, 0.0, 0.02, 0.014, 0.006, "market rate", "fee inside its rate", "off the rate the sender gets", "drop the cents", 1, 0.005, None, "kept for NPL at the partner", 0.0, 0.0, "ALI",
               notes={"Rp": "assumed 0.85 % below market — you confirmed the example is a simulated Ali deal (the real one went via Jeton); replace with an actual Ali rate when convenient"}),
    [("Rate quoted to the sender (final rate)", 0.876531640478, "Rate quoted to the sender", "sheet row 21: 0.888977 × 0.986 — matches the 0.87653 on your customer-facing message"),
     ("EUR to the Evo balance (gross)", 25704, "Amount the sender is promised", "sheet row 21"),
     ("EUR after Evo's 0.6 % fee", 25550, "Amount the receiver is owed", "sheet row 21: 25,704 − 0.6 %")],
    ["After the 2.30 pm cutoff the sender's calculation keeps the morning's figures but Ali converts the next business day at that day's rate. Who bears the difference between the two rates — NPL (as a variance), or is the sender re-quoted?",
     "Some Evo senders pay what they can (collect first), others pay the exact invoice (quote first): both exist in the system. Please list which senders are which when you fill 'All fee lines'."])

# --- P04 variable fee with floor (66 Group INR, row 29)
rows_66 = [x["row"] for x in ROWS if x["client"].startswith("66 Group Remittance") and "Game" not in x["client"]]
pattern_sheet("P04", PATTERN_NAMES["P04"], rows_66,
    "FEE_STRUCTURE (mode variable: floor_pct, cap_pct, min_margin_pct), PARTNER_RATE_VERSION per day (+ location for cash, proposal K), RATE_COMPARISON, APPROVAL (below-margin quote)",
    common_slots("66 Group Remittance INR", "66 Group", "Autotroph Ltd", "USD via SWIFT", "cash (almost always); a local INR bank account is arranged on demand for one transaction", "cash token via Ali's local agent — the rate differs by city", "Ali", "fee inside its rate", "INR → USD", "added to what the sender pays", "market rate", "set per deal", 0.07, 0.07, 0.0, None, None, 0.005, None, "kept for NPL at the partner", None, "", "nearest 1,000 (on the INR collected)", "PT Global", "NPL", "yes",
                 src={"sender": "answer", "receiver": "answer", "account": "answer", "method": "answer", "endpoint": "answer", "rail": "answer", "narrative": "answer", "reg": "answer"},
                 extra_slots=[CASH_CITY]),
    sim_inputs(2329000, "INR", "USD", 1 / 90.83911443, 1 / (90.83911443 * 1.0525), 0.0, 0.07, 0.07, 0.0, "market rate", "fee inside its rate", "added to what the sender pays", "drop the cents", 1, 0.005, None, "kept for NPL at the partner", 0.0, 0.0, "ALI",
               notes={"Rm": "your answer: XE market rate 90.83911443 INR per USD → 1 ÷ that", "Rp": "assumed 5.25 % below market (your sheet: partner cost 5–7.5 %) — replace with Ali's rate for the deal"}),
    [("USD delivered to the receiver", 23960.18, "Amount the sender is promised", "your calculation: USD 23,960.18 × 97.198 = INR 2,328,878, rounded to 2,329,000 — the workbook starts from the rounded INR, hence ≈ 1.25 USD more")],
    ["Lowest and highest markup for this product, and who may set it per transaction (your sheet says 'average 6 %', your answer says 'unclear' — please give the range you would accept without a Finance approval).",
     "The INR amount is rounded on the collection side (2,328,878 → 2,329,000). You answered 'round up to the nearest 1,000 for Asian currencies': confirm that is the rule for INR cash as well, or whether INR rounds to the nearest 1,000 either way."])

# --- P05 volume tiers (GDC, rows 32-33)
def tier_extra(ws, r, K):
    header(ws, f"A{r}", "Fee by monthly volume (needs a system change — proposal B)", F_H2); r += 1
    for j, h in enumerate(["Minimum volume in the calendar month (USD)", "Fee %", "", "", "Rule"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    t0 = r
    cell(ws, f"A{r}", 0, F_IN, None, NUM); cell(ws, f"B{r}", 0.025, F_IN, None, PCT); cell(ws, f"E{r}", "sheet row 32", F_NOTE); r += 1
    cell(ws, f"A{r}", 500000, F_IN, None, NUM); cell(ws, f"B{r}", 0.0225, F_IN, None, PCT); cell(ws, f"E{r}", "sheet row 33", F_NOTE); r += 1
    cell(ws, f"A{r}", "Sent by this customer so far this calendar month (USD)", F_TXT, wrap=True); cell(ws, f"B{r}", 163124, F_IN, None, NUM); cell(ws, f"E{r}", "your answer: 163,124 last month; the count is per calendar month, not the last 30 days", F_NOTE, wrap=True); vol = f"$B${r}"; ws.row_dimensions[r].height = 30; r += 1
    cell(ws, f"A{r}", "Fee the system would apply", F_B); cell(ws, f"B{r}", f'=IF({vol}="",B{t0},INDEX(B{t0}:B{t0+1},MATCH({vol},A{t0}:A{t0+1},1)))', F_TXT, FILL_CHK, PCT)
    cell(ws, f"E{r}", "highest minimum ≤ volume; copy this into 'Total fee' and 'Sender pays' above to re-run the calculation at the tiered fee", F_NOTE, wrap=True); ws.row_dimensions[r].height = 30; r += 1
    return r
pattern_sheet("P05", PATTERN_NAMES["P05"], [32, 33],
    "FEE_STRUCTURE + FEE_TIER (proposal B), DEAL.fee_tier_id, sender volume per calendar month",
    common_slots("GDC", "Adfusion (GDC chooses which of its receiving entities gets how much: Adu Ads, Ad Fusion, TDC, Pixel Labs …)", "ADFUSION MARKETING FZ LLC", "USD via SWIFT", "crypto", "Ali vehicle · wallet · TRC-20", "Ali", "fee inside its rate", "USDT → USD", "added to what the sender pays", "market rate", "fixed", 0.025, 0.025, 0.0, None, None, 0.018, None, "kept for NPL at the partner", None, "", "drop the cents", "PT Global", "New Pinnacle Ltd (NPL's own entity is used for this client's contracts)", "yes",
                 src={"sender": "answer", "receiver": "answer", "account": "answer", "rail": "answer", "narrative": "answer", "reg": "answer", "minm": "answer"}),
    sim_inputs(86594, "USDT", "USD", 1.0, 0.996, 0.0, 0.025, 0.025, 0.0, "market rate", "fee inside its rate", "added to what the sender pays", "drop the cents", 1, 0.018, None, "kept for NPL at the partner", 0.0, 0.0, "ALI",
               notes={"Rm": "your Project Context: USD–USDT is taken as 1:1", "minm": "your answer: 2.5 % (or 2.25 %) − Ali's 0.4 % = 1.8 % minimum"}),
    [("USD delivered", 84482, "Amount the sender is promised", "your calculation: USD 84,482 + 2.5 % = USDT 86,594")],
    ["Does the lower tier apply to the transaction that takes the month's total past USD 500,000, or only from the next one?",
     "Is the USD 500,000 counted for GDC as a whole (all its receiving entities together)? We have assumed yes."], extra=tier_extra)

# --- P06 markup shared with the client (Raeen sub-account, row 16)
def share_extra(ws, r, K):
    header(ws, f"A{r}", "How the 4 % is split (your rule of 8 October) — needs a system change (proposal G)", F_H2); r += 1
    for j, h in enumerate(["Figure", "How it is worked out", "Value", "", "Note"], 1):
        if h: cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    cell(ws, f"A{r}", "Markup to share %", F_TXT); cell(ws, f"B{r}", "total fee − partner's fee", F_NOTE); cell(ws, f"C{r}", f'={K["f"]}-{K["m"]}', F_TXT, None, PCT); cell(ws, f"E{r}", "4 % − 0.8 % = 3.2 % via Aquanow; 4 % − 1 % = 3 % via Ali", F_NOTE, wrap=True); pool = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "Markup to share (EUR)", F_TXT); cell(ws, f"B{r}", "amount × market × markup to share", F_NOTE); cell(ws, f"C{r}", f'={K["A"]}*{K["Rm"]}*{pool}', F_TXT, None, NUM); cell(ws, f"E{r}", "equals 'NPL earns on this deal' above", F_NOTE); poolamt = f"$C${r}"; r += 1
    r += 1
    for j, h in enumerate(["Party", "", "Share of the markup", "EUR", "Who holds the money"], 1):
        if h: cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    p1 = r
    cell(ws, f"A{r}", "Raeen (provides the sub-account)", F_IN); cell(ws, f"C{r}", 0.5, F_IN, None, PCT); cell(ws, f"D{r}", f"={poolamt}*C{r}", F_TXT, None, NUM); cell(ws, f"E{r}", "Raeen — the EUR lands in Raeen's Aquanow account; Raeen keeps this", F_NOTE, wrap=True); r += 1
    cell(ws, f"A{r}", "Another party (if any)", F_TXT, FILL_FIX); cell(ws, f"C{r}", 0, F_TXT, FILL_FIX, PCT); cell(ws, f"D{r}", f"={poolamt}*C{r}", F_TXT, None, NUM); cell(ws, f"E{r}", "future deals may have more than one party, each with its own share", F_NOTE, wrap=True); r += 1
    cell(ws, f"A{r}", "NPL", F_B); cell(ws, f"C{r}", f"=1-SUM(C{p1}:C{r-1})", F_TXT, FILL_CHK, PCT); cell(ws, f"D{r}", f"={poolamt}*C{r}", F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", "Raeen pays this to NPL monthly — a receivable from the client", F_NOTE, wrap=True); npl = f"$D${r}"; r += 1
    cell(ws, f"A{r}", "Aquanow's rebate to NPL (0.3 % of the amount × market)", F_TXT, wrap=True); cell(ws, f"B{r}", "partner's fee × 37.5 %", F_NOTE); cell(ws, f"D{r}", f'={K["Rebate owed back to NPL by the partner"]}', F_TXT, None, NUM); cell(ws, f"E{r}", "NPL's alone — not shared, not visible to Raeen, reported apart from the markup", F_NOTE, wrap=True); reb = f"$D${r}"; ws.row_dimensions[r].height = 30; r += 1
    cell(ws, f"A{r}", "NPL's total on this deal (EUR)", F_B); cell(ws, f"D{r}", f"={npl}+{reb}", F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", "1.6 % + 0.3 % = 1.9 % of amount × market via Aquanow", F_NOTE, wrap=True); r += 1
    cell(ws, f"A{r}", "Check: parties + NPL = markup to share", F_B, FILL_CHK); cell(ws, f"D{r}", f"=ROUND(SUM(D{p1}:D{p1+2})-{poolamt},2)", F_TXT, FILL_CHK, NUM); r += 1
    return r
pattern_sheet("P06", PATTERN_NAMES["P06"], [16, 14],
    "INTRODUCER (= the customer providing the sub-account), REFERRAL_RULE (basis share of net markup, settled by the party — proposal G), REFERRAL_ACCRUAL, PARTNER_REBATE_RULE (NPL's alone — proposal H), FEE_STRUCTURE, PARTNER_PAIR (market_plus_pct)",
    common_slots("BF-Raeen — Sub Account", "BSNV-Sub (a Raeen downline)", "BF — the EUR goes into Raeen's own Aquanow account and Raeen allocates it to the sub-account (via Ali it would go to BF's bank under Raeen's name)", "EUR · transfer inside the Aquanow platform (instant)", "crypto", "Aquanow vehicle · wallet · TRC-20 (ERC-20 also available)", "Aquanow (or Ali)", "fee on top of market", "USDT → EUR", "off the rate the sender gets", "market rate", "fixed", 0.04, 0.04, 0.0, None, None, None, 0.04, "held by the client, paid monthly", 0.375, "Raeen · half of (4 % − partner's fee) = 1.6 % via Aquanow, 1.5 % via Ali · Raeen keeps it from the EUR in its account and pays NPL's half monthly", "drop the cents", "Aquanow (internal transfer)", "Raeen", "yes",
                 src={"sender": "answer", "receiver": "answer", "account": "answer", "endpoint": "answer", "partner": "answer", "mech": "answer", "rebate": "answer", "share": "answer", "rail": "answer", "narrative": "answer", "reg": "answer", "disp": "answer"}),
    sim_inputs(50000, "USDT", "EUR", 0.8650036, None, 0.008, 0.04, 0.04, 0.0, "market rate", "fee on top of market", "off the rate the sender gets", "drop the cents", 1, 0.0, 0.04, "held by the client, paid monthly", 0.375, lambda K: f'=({K["f"]}-{K["m"]})/2', "AQUANOW",
               notes={"Rm": "the rate printed on the customer's calculation — like Ali's, it is recomputed so that '4 %' shows; the true market rate is needed to reproduce Aquanow's 0.856086 (please add it)", "rebate": "your answer: Aquanow charges 0.8 % and pays 0.3 % back monthly — NPL's alone", "refpct": "half of (fee − partner's fee): 1.6 % via Aquanow", "minm": "your answer: unclear — left at 0 so the check passes; give a figure if there is one"}),
    [("EUR to the receiver", 41520.17, "Amount the sender is promised", "sheet row 16 and your Project Context: 50,000 × 0.8650036 × 0.96 — your computation deducts 3 % first and converts the rest at 0.856086: same EUR")],
    ["Your rule: the markup to share is the 4 % less the partner's fee — 3 % via Ali (1.5 / 1.5), 3.2 % via Aquanow (1.6 / 1.6) — and Aquanow's 0.3 % rebate is NPL's alone, not visible to Raeen. The workbook now does exactly that. Your Project Context example still deducts 3 % on Aquanow; with the rule it should deduct 3.2 %. Please confirm 3.2 %.",
     "Row 14 (Raeen direct from downlines): 1 % to the sender, Aquanow 0.8 %, the 0.2 % left shared 75/25 — same rule, a different split. Confirm 0.15 % to Raeen and 0.05 % to NPL (plus the 0.3 % rebate to NPL)."], extra=share_extra)

# --- P07 own-desk reseller (Bala, row 38)
def invoice_extra(ws, r, K):
    header(ws, f"A{r}", "Paying the vendor's EUR invoice in USDT (needs a system change — proposal E, you said 'good to have')", F_H2); r += 1
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
    "PROJECT NPL-GR (NPL as its own client — your suggestion), OWN_WALLET (LT Sub) as collection endpoint, own-desk PARTNER_CONFIG (proposal D), INVOICE + per-line discharge (proposal E), round up (proposal F), invariant 3",
    common_slots("Game Reseller — NPL-GR (NPL as its own client; the vendors are paid later from NPL's wallet)", "Bala (the reseller's customer)", "NPL-GR — the allow list is Bala → NPL-GR; vendors (EZ-EVO and others) are paid in USDT from NPL's wallet on later days", "USDT wallet (NPL's own, then the vendors')", "crypto", "NPL's own wallet · LT Sub (Aquanow) · TRC-20 — occasionally Ali's wallet holds the USDT as NPL's own balance", "none — NPL converts itself (NPL-GR as 'own desk')", "NPL's own wallet (needs a system change)", "USDT → EUR (the customer owes EUR, pays USDT)", "added to what the sender pays", "market rate", "fixed", 0.02, 0.02, 0.0, None, None, 0.005, None, "NPL's own wallet", None, "", "round up (on the USDT collected)", "USDT from NPL's wallet", "not applicable (USDT)", "yes",
                 src={"project": "answer", "sender": "answer", "receiver": "answer", "account": "answer", "endpoint": "answer", "partner": "answer", "minm": "answer", "rounding": "answer", "rail": "answer", "narrative": "answer", "reg": "answer"}),
    sim_inputs(2600, "USDT", "EUR", 0.8716, None, 0.0, 0.02, 0.02, 0.0, "market rate", "NPL's own wallet", "added to what the sender pays", "drop the cents", 1, 0.005, None, "NPL's own wallet", 0.0, 0.0, "NPL",
               notes={"Rm": "your calculation: EUR→USDT 1.14731528 = 1 ÷ 0.8716", "minm": "your answer: 0.5 %"}),
    [("EUR invoice value the collection covers", 2220, "Amount the sender is promised", "your calculation: EUR 2,220 × 1.17026 = USDT 2,597.98 → rounded up to 2,600, which covers ≈ EUR 2,221.8")],
    ["You suggested treating NPL (or a business unit 'NPL-GR') as the client for the game reseller. We have written it up that way: NPL-GR is a project, Bala is its sender, NPL's own wallet is where the money lands, and the custody report shows every such balance. Management still has to confirm it (proposal D).",
     "When the USDT is kept in Ali's wallet for a while, it is NPL's own money held at Ali (NPL as Ali's client), not client money — please confirm."], extra=invoice_extra)

# --- P08 THB cash → partner converts to USDT → vendors (27 Group, row 37)
def thb_extra(ws, r, K):
    header(ws, f"A{r}", "At the partner: THB → USDT (what Ali delivers), and the EUR value of that USDT", F_H2); r += 1
    for j, h in enumerate(["Figure", "", "Value", "", "Source"], 1):
        cell(ws, f"{get_column_letter(j)}{r}", h, F_B, FILL_HEAD)
    r += 1
    cell(ws, f"A{r}", "Market THB per USDT", F_TXT); cell(ws, f"C{r}", 33.613, F_IN, None, RATE); cell(ws, f"E{r}", "sheet row 37 (1 ÷ 0.02975)", F_NOTE); mk = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "Ali's rate THB per USDT", F_TXT); cell(ws, f"C{r}", 33.83, F_IN, None, RATE); cell(ws, f"E{r}", "your answer: THB 17,000,000 ÷ 33.83 = USDT 502,513", F_NOTE); ar = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "USDT delivered", F_TXT); cell(ws, f"C{r}", f'=ROUND({K["A"]}/{ar},2)', F_TXT, None, NUM); cell(ws, f"E{r}", "sheet says 502,513", F_NOTE); usdt = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "Partner cost %", F_TXT); cell(ws, f"C{r}", f"=1-{mk}/{ar}", F_TXT, None, PCT); cell(ws, f"E{r}", "worked out from the partner's rate against market; your rule: Ali's rate must stay within 1.5 % of market so NPL keeps at least 0.5 %", F_NOTE, wrap=True); ws.row_dimensions[r].height = 30; r += 1
    cell(ws, f"A{r}", "EUR per USDT at collection", F_TXT); cell(ws, f"C{r}", 0.8708, F_IN, None, RATE); cell(ws, f"E{r}", "your answer", F_NOTE); e1 = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "EUR per USDT at the final vendor payment", F_TXT); cell(ws, f"C{r}", 0.87527, F_IN, None, RATE); cell(ws, f"E{r}", "your answer — vendors are paid on different days, so the rate moves", F_NOTE, wrap=True); e2 = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "EUR value of the USDT at collection", F_TXT); cell(ws, f"C{r}", f"=ROUND({usdt}*{e1},2)", F_TXT, None, NUM); ev = f"$C${r}"; r += 1
    cell(ws, f"A{r}", "NPL margin in EUR at collection", F_B); cell(ws, f"C{r}", f'=ROUND({ev}-{K["Amount the sender is promised"]},2)', F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", "≈ 2 % − 0.64 % of the collection; must be at least 0.5 %", F_NOTE, wrap=True); r += 1
    cell(ws, f"A{r}", "Forex gain (+) / loss (−) by the final payment", F_B); cell(ws, f"C{r}", f"=ROUND({usdt}*({e2}-{e1}),2)", F_TXT, FILL_CHK, NUM); cell(ws, f"E{r}", "your answer: accepted; the 2 % markup is the buffer for it", F_NOTE, wrap=True); r += 1
    return r
pattern_sheet("P08", PATTERN_NAMES["P08"], [37],
    "DEAL_GROUP with one forward leg (THB → USDT at Ali, cash collection with token and city — proposal K), INVOICE obligation in EUR (proposal E), payout lines in USDT to several vendors with deal_id and discharge fields, rounding (proposal F)",
    common_slots("27 Group Remittance Collection for Game Reseller (NPL-GR)", "27 Group customer", "SACCO SIA, Mitratech, EZ-EVO, BraversPlay — vendors paid in USDT from NPL's wallet", "USDT wallets (vendors)", "cash (THB) — by token, through Ali's local agent", "none (cash) — token and city on the deal", "Ali (THB cash only); the USDT then moves to NPL's wallet or stays at Ali as NPL's own balance", "fee inside its rate", "THB → USDT (customer promised EUR)", "added to what the sender pays", "market rate", "fixed", 0.02, 0.02, 0.0, None, None, 0.005, None, "NPL's own wallet", None, "", "round up to the nearest 1,000 THB (Asian currencies); nearest unit for USD, SGD, HKD", "USDT from NPL's wallet", "not applicable (USDT)", "yes",
                 src={"method": "answer", "endpoint": "answer", "partner": "answer", "mech": "answer", "rounding": "answer", "rail": "answer", "narrative": "answer", "reg": "answer"},
                 extra_slots=[CASH_CITY]),
    sim_inputs(17000000, "THB", "EUR", 0.0259463782412186, None, 0.0, 0.02, 0.02, 0.0, "market rate", "NPL's own wallet", "off the rate the sender gets", "drop the cents", 1, 0.005, None, "NPL's own wallet", 0.0, 0.0, "NPL",
               notes={"Rm": "your calculation: 0.0259463782 EUR per THB"}),
    [("EUR credited to the customer (advance payment)", 432267, "Amount the sender is promised", "your calculation: THB 17,000,000 × 0.02542745 — the 2 % comes off the EUR-per-THB rate")],
    ["Your rule: if Ali's THB → USDT rate is more than 1.5 % below market, no collection is arranged. Should the system refuse the quote by itself in that case, or only warn Finance?",
     "Vendors are paid on different days and the forex gain or loss is accepted with the 2 % as buffer: confirm there is no separate limit beyond which Finance must approve."], extra=thb_extra)

# --- P09 withdrawal (BF-Withdrawal, row 20)
pattern_sheet("P09", PATTERN_NAMES["P09"], [20],
    "CURRENCY_PAIR GBP → USDT, COLLECTION_RECEIVING_ENDPOINT (kind bank, rail SWIFT), RECEIVING_ENTITY_ACCOUNT (kind wallet, D14), SETTLEMENT_REGISTRATION with network + address (D16), PARTNER_REBATE_RULE",
    common_slots("BF-Withdrawal", "BF (Sporting Exchange) sends the customer's withdrawal by bank transfer", "the BF customer's own USDT wallet (counterparty receiver, wallet account) — customers have both TRC-20 and ERC-20 wallets", "USDT · TRC-20 or ERC-20 · wallet", "bank", "Jeton (the entity) · bank account · SWIFT", "Jeton (Aquanow does not allow BF withdrawals)", "fee on top of market", "GBP → USDT (also EUR → USDT)", "off the rate the sender gets", "market rate", "fixed", 0.01, 0.01, 0.0, None, None, 0.004, None, "paid back monthly", 0.40, "", "drop the cents", "USDT (Jeton's wallet)", "not applicable (USDT)", "yes",
                 src={"sender": "answer", "receiver": "answer", "account": "answer", "endpoint": "answer", "partner": "answer", "mode": "answer", "fee": "answer", "mech": "answer", "rail": "answer", "narrative": "answer", "reg": "answer", "minm": "derived"}),
    sim_inputs(51000, "GBP", "USDT", 1 / 0.72739556, None, 0.01, 0.01, 0.01, 0.0, "market rate", "fee on top of market", "off the rate the sender gets", "drop the cents", 1, 0.004, None, "paid back monthly", 0.40, 0.0, "JETON",
               notes={"Rp": "your answer 1.3610202 is Jeton's rate: market 1.37477 less 1 % — consistent with 'fee on top of market', so it is not needed here"}),
    [("USDT to the client's wallet", 69412, "Amount the sender is promised", "sheet row 20: GBP 51,000 ÷ 0.72739556 × 0.99")],
    ["Fixed at 1 % via Jeton (your answer). Can Ali receive BF withdrawals, and at what fee, or is Jeton the only route?"])

# --- P10 cash exotic (Ad Hoc INR cash, row 45)
pattern_sheet("P10", PATTERN_NAMES["P10"], [45, 28],
    "DEAL.collection_method = cash, cash token + city (proposal K), CURRENCY_PAIR.cash_rounding_unit, PARTNER_PAIR (disclosed_rate), FEE_STRUCTURE (basis partner)",
    common_slots("Ad Hoc INR Cash", "Jonas", "the sender's own USDT wallet", "USDT wallet", "cash (INR) — by token, through Ali's local agent", "none (cash) — token and city on the deal", "Ali", "fee inside its rate", "INR → USD (also SGD, USDT)", "added to what the sender pays", "agent rate", "fixed", 0.07, 0.07, 0.0, None, None, None, None, "kept for NPL at the partner", None, "", "cash rounded to the nearest 1,000", "USDT", "not applicable (USDT)", "yes",
                 src={"sender": "answer", "receiver": "answer", "account": "answer", "method": "answer", "endpoint": "answer", "fee": "choice", "s": "choice", "rail": "answer", "narrative": "answer", "reg": "answer"},
                 extra_slots=[CASH_CITY]),
    sim_inputs(8500000, "INR", "USD", None, 1 / 79.52918721, 0.0, 0.07, 0.07, 0.0, "agent rate", "fee inside its rate", "added to what the sender pays", "drop the cents", 1, 0.0, None, "kept for NPL at the partner", 0.0, 0.0, "ALI",
               notes={"f": "you entered 7 % — your sheet's row 45 says 0.5 %; see 'Please confirm'", "s": "same choice as the total fee"}),
    [("USD delivered", 106879.36, "Amount the sender is promised", "sheet row 45: INR 8,500,000 ÷ 79.529 carries no NPL fee at all; at 7 % the USD falls to ≈ 99,887, at 0.5 % to ≈ 106,348 — the difference shown depends on the fee you choose")],
    ["You entered a 7 % fee on this sheet; your fee table says 0.5 % for Ad Hoc INR Cash (row 45), and 7 % is 66 Group's figure (pattern 4). Which is right here — and is it NPL's fee on top of the agent's rate, or the agent's own?",
     "Cash rounding unit for INR, and for AED / USD cash in Dubai (row 28, dormant)."], choices=("f", "s"))

# --- P11 zero-fee internal (AK USDT, row 47)
pattern_sheet("P11", PATTERN_NAMES["P11"], [47, 46],
    "a 0 % fee with a 0 % minimum margin, PARTNER_PAIR (disclosed_rate), PROJECT.disburse_policy = hold_allowed + exposure_ceiling, BALANCE_CONVERSION, bank cutoff (proposal J)",
    common_slots("AK collections (USDT)", "AK (an NPL stakeholder)", "AK — withdrawals on request: local bank payment, SWIFT, USDT or cash", "USD, SGD and USDT balances held at Ali; paid out as requested", "crypto", "Ali vehicle · wallet · TRC-20", "Ali", "fee inside its rate", "USDT → USD (also SGD)", "off the rate the sender gets", "agent rate", "fixed", 0.0, 0.0, 0.0, None, None, 0.0, None, "kept for NPL at the partner", None, "", "drop the cents", "Ali (as requested each time)", "as requested", "yes",
                 src={"sender": "answer", "receiver": "answer", "account": "answer", "rail": "answer", "narrative": "answer", "reg": "answer"},
                 extra_slots=[("Balance NPL may leave at the partner", "PROJECT.exposure_ceiling + disburse_policy = hold_allowed", "about USD 400,000 equivalent, revised from time to time; the balance simply sits at Ali", "answer", "The system already allows a held balance with a ceiling; the daily report shows what sits where."),
                              ("Bank cutoff", "PARTNER_CONFIG.bank_cutoff_time (proposal J)", "USD and SGD are banking-ready balances: 10,000 USDT collected at night converts to SGD the next business morning", "answer", "Needs a system change.")]),
    sim_inputs(10000, "USDT", "USD", 1.0, 0.996, 0.0, 0.0, 0.0, 0.0, "agent rate", "fee inside its rate", "off the rate the sender gets", "drop the cents", 1, 0.0, None, "kept for NPL at the partner", 0.0, 0.0, "ALI"),
    [("USD delivered", 9960, "Amount the sender is promised", "sheet row 47: USDT 10,000 × 0.996")],
    ["A 0 % fee with a 0 % minimum margin means every quote passes the margin check; confirm that is intended for this stakeholder account rather than a per-deal Finance approval.",
     "When a conversion waits for the next business morning, the rate used is that morning's partner rate — please confirm.",
     "INR variant (row 46): INR 8,735,000 ÷ 100.80 — which pair and partner rate version?"])

# --- P12 same-currency pass-through (Evolution bank, row 27)
pattern_sheet("P12", PATTERN_NAMES["P12"], [27],
    "CURRENCY_PAIR with from = to (rate 1), FEE_STRUCTURE 1.4 % + 1.4 %, bank-in endpoint, SETTLEMENT_RAIL; dormant product",
    common_slots("Evolution USD, EUR, GBP (bank transfers)", None, "Evolution (receiver side pays 1.4 %)", None, "bank", "Ali vehicle · bank · route?", "Ali", "fee inside its rate", "EUR → EUR (also USD → EUR, GBP → EUR)", "off the rate the sender gets", "market rate", "fixed", 0.028, 0.014, 0.014, None, None, None, None, "kept for NPL at the partner", None, "", "drop the cents", None, None, None),
    sim_inputs(100000, "EUR", "EUR", 1.0, 1.0, 0.0, 0.028, 0.014, 0.014, "market rate", "fee inside its rate", "off the rate the sender gets", "drop the cents", 1, 0.0, None, "kept for NPL at the partner", 0.0, 0.0, "ALI"),
    [("EUR delivered after both shares (no sheet example)", 97219.6, "Amount the receiver is owed", "100,000 × 0.986 × 0.986 — illustrative; the sheet has no worked example and the pair has not run for years")],
    ["Not answered in v0.1 — please confirm whether same-currency pass-through should remain in scope; if yes, the system must allow a pair with the same currency on both sides.",
     "Partner cost and route for EUR bank-in at Ali (no recent data in the sheet)."])

# ------------------------------------------------------------------ NPL's own tabs, carried over unchanged
ans = openpyxl.load_workbook(ANSWERS, data_only=True)
for name in ("Project Context", "Payment methods"):
    s = ans[name]
    ws = wb.create_sheet(name)
    widths(ws, {"A": 30, "B": 22, "C": 120} if name == "Project Context" else {"A": 34, "B": 140})
    hdr_rows = 4 if name == "Project Context" else 2
    for row in s.iter_rows():
        for c in row:
            if c.value is None: continue
            t = ws.cell(c.row, c.column, c.value); t.font = F_B if c.row <= hdr_rows else F_IN; t.alignment = WRAP
    for rr in range(1, s.max_row + 1):
        text = str(ws.cell(rr, 3).value or ws.cell(rr, 2).value or "")
        ws.row_dimensions[rr].height = min(409, max(16, 13 * (len(text) // 115 + text.count("\n") + 1)))
    ws.cell(1, 1).value = f"{s.cell(1, 1).value}  — your tab from 8 October, carried over unchanged"

# ------------------------------------------------------------------ For New XP: where each item lands in the model
ws = wb.create_sheet("For New XP")
widths(ws, {"A": 26, "B": 44, "C": 70})
header(ws, "A1", "For New XP — where each item lands in the data model (ERD v5.2; proposals A–M per 'Model Gaps & Proposals v1.0'). Not for NPL to fill.")
for j, h in enumerate(["Pattern sheet", "Item", "Model field / entity"], 1):
    cell(ws, f"{get_column_letter(j)}3", h, F_B, FILL_HEAD)
r = 4
for sheet, item, field in MAPPING:
    cell(ws, f"A{r}", sheet, F_TXT); cell(ws, f"B{r}", item, F_TXT, wrap=True); cell(ws, f"C{r}", field, F_TXT, wrap=True); r += 1
r += 1
cell(ws, f"A{r}", "Register column", F_B, FILL_HEAD); cell(ws, f"B{r}", "", F_B, FILL_HEAD); cell(ws, f"C{r}", "Model field / entity", F_B, FILL_HEAD); r += 1
for col, field in [("Client / product", "PROJECT"), ("Who sends the money", "SENDER, SENDER_RECEIVER_ALLOW"), ("Who gets paid", "RECEIVER (kind), RECEIVER_GROUP, RECEIVING_ENTITY"), ("Their account", "RECEIVING_ENTITY_ACCOUNT.currency / rail (incl. 'internal' for a transfer inside the partner's platform) / account_kind"),
                   ("How the money comes in", "DEAL.collection_method (+ cash_location, token — proposal K; single-use local accounts — proposal M)"), ("Where it comes in", "PARTNER_ENTITY, COLLECTION_RECEIVING_ENDPOINT.kind / network / rail (+ risk_band — proposal L)"), ("Partner / agent", "PARTNER, PARTNER_CONFIG (+ bank_cutoff_time — proposal J)"),
                   ("How the partner prices", "PARTNER_PAIR.partner_pricing, partner_markup_pct; PARTNER_RATE_VERSION.quoted_direction (proposal I)"), ("Exchange pair", "CURRENCY_PAIR.from_currency / to_currency"), ("Fee taken how", "CURRENCY_PAIR.quote_direction"),
                   ("Fee applied to", "FEE_STRUCTURE.rate_basis"), ("Fee is", "FEE_STRUCTURE.mode"), ("Total / sender / receiver %", "FEE_STRUCTURE.pct, sender_share_pct, receiver_share_pct (FEE_OVERRIDE with its own split — proposal A)"),
                   ("Lowest / highest markup / minimum margin %", "FEE_STRUCTURE.floor_pct, cap_pct, min_margin_pct"), ("Fee shown to the customer", "proposal C (displayed_fee_pct)"),
                   ("How NPL's share reaches NPL", "CO.<PARTNER>.POOL vs PARTNER_REBATE_RULE vs REFERRAL_RULE settled by the party (proposal G) vs own desk (proposal D)"), ("% of the partner's fee paid back", "PARTNER_REBATE_RULE.pct_of_partner_fee; EARN_REBATE kept apart from EARN_GROSS (proposal H)"),
                   ("Markup shared with someone else", "INTRODUCER, REFERRAL_RULE (share of net markup, several parties), REFERRAL_ACCRUAL (proposal G)"), ("Rounding", "CURRENCY_PAIR.amount_rounding, rounding_unit, cash_rounding_unit (proposal F)"),
                   ("Bank or EMI that pays out", "SETTLEMENT_RAIL"), ("Name shown on the transfer", "SETTLEMENT_SENDING_ENTITY"), ("Has the partner approved the receiver's account?", "SETTLEMENT_REGISTRATION (D16 details)"),
                   ("Fee by monthly volume", "proposal B (FEE_TIER, calendar month)")]:
    cell(ws, f"A{r}", col, F_TXT, wrap=True); cell(ws, f"C{r}", field, F_TXT, wrap=True); r += 1

# ------------------------------------------------------------------ save
wb.calculation.fullCalcOnLoad = True
OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print("wrote", OUT, "sheets:", wb.sheetnames)
