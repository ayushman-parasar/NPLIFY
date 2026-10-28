#!/usr/bin/env python3
"""Fixture manifest of the ledger worked transactions (round 2, finding 03.1).
Reads the built Ledger Posting Design HTML and writes one row per worked transaction: fixture id, pattern, source type,
number of posting lines, accounts touched, the page of the Ledger Posting Design PDF it is on. 61 numbered transactions
T1–T61; 67 fixtures counting the variants (T3a, T22a, T24a, T41a/b/c in place of T41, T52a).
    python3 scripts/build-fixtures-manifest.py            -> docs/fixtures-manifest-v6.1.csv (+ a copy for the Test Strategy builder)"""
import re, html, csv, subprocess, shutil, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = open(os.path.join(root, "docs/NPLify-Ledger-Posting-Design-v6.1.html"), encoding="utf-8").read()
P = os.path.join(root, "docs/NPLify-Ledger-Posting-Design-v6.1.pdf")
secs = [(m.start(), m.group(1), html.unescape(m.group(2)).strip()) for m in re.finditer(r'<h2[^>]*>\d+[a-d]? · Pattern ([A-R]) — ([^<]*)</h2>', H)]
pages = {}
n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", P], capture_output=True, text=True).stdout).group(1))
for p in range(1, n + 1):
    t = subprocess.run(["pdftotext", "-f", str(p), "-l", str(p), P, "-"], capture_output=True, text=True).stdout
    for m in re.finditer(r"\bT(\d{1,2}[a-c]?)\s*·", t): pages.setdefault("T" + m.group(1), p)
rows = []
chunks = H.split('<div class="tx">')
pos = 0
for ch in chunks[1:]:
    pos = H.find('<div class="tx">', pos) + 1
    m = re.match(r'<div class="txh"><b>(T\d{1,2}[a-c]?) · ([^<]*)</b> <span class="src">source: ([^<]*)</span></div>', ch)
    if not m: continue
    tid, title, src = m.group(1), html.unescape(m.group(2)), m.group(3)
    body = ch[m.end():].split("</table>")[0]
    pat = [x for x in secs if x[0] < pos]
    pat = pat[-1][1] if pat else "?"
    noposting = ch[m.end():m.end() + 80].find("No posting.") >= 0
    accts = [a.replace("<wbr>", "") for a in re.findall(r'<td class="mono">([^<]*(?:<wbr>[^<]*)*)</td>', body)] if not noposting else []
    rows.append({"fixture": "F-" + tid, "transaction": tid, "pattern": pat, "source_type": src, "posting_lines": len(accts),
                 "accounts": " ".join(dict.fromkeys(accts)) if accts else "(no posting)", "title": title,
                 "identities_after": "F-ID1…F-ID12", "page": pages.get(tid, ""), "build_status": "planned (M2)"})
ids = [r["transaction"] for r in rows]
assert len(rows) == 67, (len(rows), ids)
assert len(set(ids)) == 67
numbered = sorted(set(int(re.match(r"T(\d+)", i).group(1)) for i in ids))
assert numbered == list(range(1, 62)), numbered
out = os.path.join(root, "docs/fixtures-manifest-v6.1.csv")
with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
copy = "/Users/sp/Desktop/NPLify client pack/.claude/skills/nplify-section-drafts/scripts/fixtures-manifest-v6.1.csv"
if os.path.isdir(os.path.dirname(copy)): shutil.copy(out, copy)
print("wrote", out, len(rows), "fixtures;", "patterns:", "".join(sorted(set(r["pattern"] for r in rows))))
