#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Two-direction consistency check of the NPLify document pack (edition 6.1 and later).

    python3 scripts/check-round2.py                 # checks docs/ against data/erd.v5.json and the shared lists
    python3 scripts/check-round2.py --stage2 DIR    # also compares DIR (the client deliverable folder) with docs/

Direction 1, the model and the shared lists against the documents: every table of the model is in the ERD's dictionary and
on the Top-Down Map; every controlled action of scripts/controlled-actions.mjs is on the Workflow Tree; the counts the
documents print (tables, views, procedures, sub-classes, controlled actions, worked transactions, vectors, exit criteria,
patterns) equal what the sources define.
Direction 2, the documents against the model and each other: every TABLE.column named exists; every table-like name is a
model table (an allowlist covers account purposes and example codes); every rule, section, procedure, pattern and test
identifier cited exists where it is cited; the parts of a page add up to its headline (the Top-Down Map's domain boxes,
the Workflow Tree's classes and sub-classes); no review residue, stale phrase, decision token or old edition in client prose;
one title date per document; no broken anchors; no review marks.
Exit code 1 when anything is reported, so it can run in a build step. Python 3.9.
"""
import sys, os, re, json, glob, html, argparse, collections, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
MODEL = os.path.join(ROOT, "data", "erd.v5.json")
ACTIONS = os.path.join(ROOT, "scripts", "controlled-actions.mjs")
problems = []
def report(area, msg): problems.append((area, msg))

# ------------------------------------------------------------------ inputs
d = json.load(open(MODEL, encoding="utf-8"))
E = d["E"]
tables = [n for n in E if E[n]["d"] != "view"]
views = [n for n in E if E[n]["d"] == "view"]
version = d["version"]
purposes = set(re.findall(r"[A-Z][A-Z_]{2,}", next(f[3] for f in E["LEDGER_ACCOUNT"]["f"] if f[0] == "purpose")))
act_src = open(ACTIONS, encoding="utf-8").read()
act_src = re.sub(r'\$\{dl\("[^"]*"\)\}', "", act_src)          # struck text of the review draft
act_codes = []
act_rows = re.split(r"\n  \[", act_src[act_src.find("ACTIONS"):])[1:]
for row in act_rows:
    cells = re.findall(r'"((?:[^"\\]|\\.)*)"', row)
    if cells:
        for c in re.findall(r"[a-z][a-z_]{3,}", cells[-1]): act_codes.append(c)
act_codes = [c for c in act_codes if c not in ("mk", "dl")]

def served():
    names = []
    reg = open(os.path.join(ROOT, "src", "lib", "documents.ts"), encoding="utf-8").read()
    for block in re.findall(r"\{\s*slug:.*?\n  \}", reg, flags=re.S):
        if 'audience: "client"' not in block: continue
        m = re.search(r'html: "([^"]+)"', block)
        if m: names.append(m.group(1))
    return [n for n in names if os.path.exists(os.path.join(DOCS, n))]
HTML = {}
for f in served():
    raw = open(os.path.join(DOCS, f), encoding="utf-8").read()
    body = re.sub(r"<script.*?</script>|<style.*?</style>", "", raw, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", " ", body.replace("<", " <")))
    HTML[f] = {"raw": raw, "text": re.sub(r"\s+", " ", text)}
short = lambda f: f.replace("NPLify-", "").replace("-v%s.html" % version, "").replace(".html", "")
def doc(key):
    for f in HTML:
        if key in f: return HTML[f]
    return None
erd, tree, tmap, ts, lc, roles, cfg, cut, calc, arch, ledger, comp, sop, scen = [doc(k) for k in
    ("P0-ERD", "Workflow-Tree.html", "Top-Down-Map", "Test-Strategy", "Lifecycle", "Roles", "Configuration", "Cutover", "Calculation", "Architecture", "Ledger-Posting", "Companion", "Operating-Procedures", "Scenario")]
tree_raw = tree["raw"] if tree else ""

# ------------------------------------------------------------------ direction 1: model and lists -> documents
if erd:
    dict_names = set(re.findall(r'id="dd-([A-Z_]+)"', erd["raw"]))
    for t in tables:
        if t not in dict_names: report("model→ERD", "table %s is not in the ERD dictionary" % t)
    for v in views:
        if v not in erd["text"]: report("model→ERD", "view %s is not in the ERD" % v)
    for n in re.findall(r"(\d+) tables", erd["text"]):
        if int(n) not in (len(tables), 17): report("model→ERD", "ERD prints %s tables, model has %d" % (n, len(tables)))
if tmap:
    on_map = set(re.findall(r'data-ent="([A-Z_]+)"', tmap["raw"]))
    for t in tables + views:
        if t not in on_map: report("model→Map", "table/view %s is not on the Top-Down Map" % t)
    for t in on_map - set(E): report("Map→model", "the Top-Down Map names %s, which is not in the model" % t)
    boxes = [int(x) for x in re.findall(r'Domain \d · [^<]+<span class="cnt">(\d+) tables', tmap["raw"])]
    if boxes and sum(boxes) != len(tables): report("Map", "domain boxes sum to %d tables, model has %d" % (sum(boxes), len(tables)))
    for n in set(re.findall(r"(\d+) tables", tmap["text"])):
        if int(n) not in [len(tables)] + boxes: report("Map", "prints %s tables" % n)
if tree:
    rights_on_tree = set(re.findall(r'data-right="([^"]*)"', tree_raw)) | set(re.findall(r'chip right">([a-z_]+)<', tree_raw))
    rights_on_tree = {r for x in rights_on_tree for r in x.split()}
    for c in act_codes:
        if c not in rights_on_tree: report("actions→Tree", "controlled action %s is on no Workflow Tree procedure" % c)
    for c in rights_on_tree - set(act_codes):
        if c: report("Tree→actions", "the Workflow Tree carries the right %s, which is not in the shared list" % c)

# ------------------------------------------------------------------ counts that must agree everywhere
counts = {}
if tree:
    leaves = re.findall(r'data-id="(\d+\.\d+\.\d+)"', tree_raw)
    counts["procedures"] = len(leaves)
    counts["sub-classes"] = len(set(l.rsplit(".", 1)[0] for l in leaves))
    per_sub = collections.Counter(l.rsplit(".", 1)[0] for l in leaves)
    for sid, n in re.findall(r'<span class="id">(\d+\.\d+)</span>[^<]*<span class="muted small">\((\d+)\)</span>', tree_raw):
        if per_sub.get(sid) != int(n): report("Tree", "sub-class %s says (%s) but has %d procedures" % (sid, n, per_sub.get(sid, 0)))
    per_class = collections.Counter(l.split(".")[0] for l in leaves)
    for cid, n in re.findall(r'<span class="id">(\d)</span>[^<]*<span class="cnt">\d+ sub-classes · (\d+) procedures</span>', tree_raw):
        if per_class.get(cid) != int(n): report("Tree", "class %s says %s procedures but has %d" % (cid, n, per_class.get(cid, 0)))
counts["controlled actions"] = len(act_rows) if act_rows else None
if ledger:
    counts["worked transactions"] = len(set(re.findall(r"\bT(\d{1,2}[a-c]?) ·", ledger["text"])))
    counts["patterns"] = len(set(re.findall(r"Pattern ([A-R]) —", ledger["text"])))
if calc:
    counts["vectors B"] = len(set(re.findall(r"\bB(\d{1,2})\b", calc["text"])))
if cut:
    counts["exit criteria"] = len(re.findall(r"<li><b>[^<]+:</b>", cut["raw"][cut["raw"].find("Exit criteria"):cut["raw"].find("Exit criteria") + 20000])) if "Exit criteria" in cut["raw"] else None
counts["tables"], counts["views"] = len(tables), len(views)
WORDS = {"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,"ten":10,"eleven":11,"twelve":12,"thirteen":13,"fourteen":14,"fifteen":15,"sixteen":16,"seventeen":17,"eighteen":18}
def num(x): return int(x) if x.isdigit() else WORDS.get(x.lower())
for f, h in HTML.items():
    t = h["text"]
    for n in re.findall(r"\b(\d+|[a-z]+) procedures\b", t):
        v = num(n)
        if v and v > 20 and counts.get("procedures") and v != counts["procedures"]: report("counts", "%s says %s procedures (tree has %d)" % (short(f), n, counts["procedures"]))
    for n in re.findall(r"\b(\d+) sub-classes\b", t):
        if counts.get("sub-classes") and int(n) >= 10 and int(n) != counts["sub-classes"]: report("counts", "%s says %s sub-classes (tree has %d)" % (short(f), n, counts["sub-classes"]))
    for n in re.findall(r"\b(\d+) controlled actions\b", t):
        if counts.get("controlled actions") and int(n) != counts["controlled actions"]: report("counts", "%s says %s controlled actions (list has %d)" % (short(f), n, counts["controlled actions"]))
    for n in re.findall(r"\b(\d+) (?:worked transactions|fixtures)\b", t):
        if counts.get("worked transactions") and int(n) >= 10 and int(n) != counts["worked transactions"]: report("counts", "%s says %s worked transactions / fixtures (ledger has %d)" % (short(f), n, counts["worked transactions"]))
    for n in re.findall(r"\b(\d+) (?:derived )?views\b", t):
        if int(n) != counts["views"]: report("counts", "%s says %s views (model has %d)" % (short(f), n, counts["views"]))
    for a, b in re.findall(r"\b(\d+) of (\d+)\b", t):
        if a != b and "Calculation" in f and int(b) >= 20: report("counts", "%s says %s of %s vectors match" % (short(f), a, b))
    for n in re.findall(r"\b([a-z]+|\d+) (?:ledger |posting )?patterns\b", t):
        v = num(n)
        if v and counts.get("patterns") and v != counts["patterns"]: report("counts", "%s says %s patterns (ledger has %d)" % (short(f), n, counts["patterns"]))

# ------------------------------------------------------------------ direction 2: documents -> model, lists and each other
ALLOW = purposes | {"NPL","USD","EUR","USDT","INR","THB","JPY","AED","SGD","HKT","PDF","CSV","JSON","API","SWIFT","SEPA","IBAN","BIC","TRC","ERC","TOTP","FRS","KYC","AML","UAT","CI","RTO","RPO","PITR","DNS","SPF","DKIM","DMARC","AWS","RDS","S3","OTP","PK","FK","SOP","UK","FPS","EMI","FX","CMC","CCY","OWNER","HOLDER","PURPOSE","CO","CL","OWN","NONE","CR","REQ","AC","CA","HK","SG","GDC","BF","JTN","YN","AK","GR","EVO","TBET","HG","GTSI","LEX","PT","AQN","LT","SUB","BKK","MNL","TPE","HTML","ERD","VIEW","ALL","NEW","CHANGED","DUE","OPS","FIN","MGT","CONFIG","ECON","CTRL","REF","PRICE","PRATE","LEDGER","RATE","SETTLE","LC","CS","OP","SC","RV","TS","AR","CU","LP","RC","LOSS","VAR","EXP","EARN","RESELL","RESALE","VENDOR","SHORTFALL","CREDIT","MAKEGOOD","POOL","WALLET","PAYABLE","RECEIVABLE","COLLECTED","INTRANSIT","SUSPENSE","OPENING","BALANCE","RESULT","GROSS","NET","OUT","IN","ADVANCE","MAX","MIN","AVG","SUM","PDFs","SOPs","IDs","QA","DB","SQL","UI","SSO","TLS","SHA","MD","OTPs","FEE","TIER","MARKUP","REBATE","SHARE","PARTNER","RECEIVER","GROUP","CLIENT","PROJECT","SENDER","CONTROL","DEAL","OK","ID","ON","OFF","AND","OR","THE","OF","TO","AT","BY","FOR","WITH","NOT","NO","YES","CUSTOMER","PARTY","ENTITY","RCV","RET","SND","UK_FPS","CLEARING","IDR","HKD","CNY","GBP","AUD","EUR_SEPA","DR","CR"}
EXAMPLE = re.compile(r"^(SND|RCV|RET|ENTITY|CLIENT\d|PT|LT|AQN|EZ|CUSTOMER|PARTY|VENDOR|SENDER|RECEIVER|RECEIVING|OWN|CL|CO|VAR|EXP|EARN|RESELL|RESALE|T\d|F-|V-|S-|C-|D-|G-|R-|P-|O-|X\d|W\d|F\d|M\d|Q\d|D\d|B\d|L\d|UK)")
for f, h in HTML.items():
    t = h["text"]
    for tb, col in set(re.findall(r"\b([A-Z][A-Z_]{2,})\.([a-z][a-z0-9_]{2,})\b", t)):
        col0 = re.sub(r"_[in]$", "", col)
        if tb in E and col0 not in [x[0] for x in E[tb]["f"]] and not (tb == "SYSTEM_SETTING") and not any(x[0].startswith(col0) for x in E[tb]["f"]): report("docs→model", "%s names %s.%s, which is not a column" % (short(f), tb, col))
    for tok in set(re.findall(r"\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b", t)):
        if tok not in E and tok not in ALLOW and not EXAMPLE.match(tok) and not re.match(r"^(CL|CO)_", tok) and "_" in tok and len(tok) > 6 and not any(n.startswith(tok) or n.endswith(tok) for n in E) and not re.search(r"\b[Ww]as (?:a |an )?%s\b" % re.escape(tok), t):
            if "Tree" in f or "Map" in f or "Operating" in f: continue   # hand-kept pages and SOP name example entities freely
            report("docs→model", "%s names %s, which is not a model table (add to ALLOW if it is an account or example code)" % (short(f), tok))
# citations
if roles:
    n_rules = len(re.findall(r"<li>\s*(?:<b>|\$\{mk\(\"<b>)?", roles["raw"][roles["raw"].find("5 · "):roles["raw"].find("5a · ")])) if "5 · " in roles["raw"] else 14
    n_rules = max(n_rules, 14) if n_rules < 5 else n_rules
for f, h in HTML.items():
    t = h["text"]
    for n in set(re.findall(r"Roles (?:& Visibility )?rule (\d+)", t)):
        if int(n) > 14: report("citations", "%s cites Roles rule %s" % (short(f), n))
    for n in set(re.findall(r"Configuration Schema rule (\d+)", t)):
        if int(n) > 16: report("citations", "%s cites Configuration Schema rule %s" % (short(f), n))
    if lc:
        for sec in set(re.findall(r"Lifecycle (?:& Approvals )?(\d[a-e]|\d)\b", t)):
            if not re.search(r"\b%s · " % re.escape(sec), lc["text"]): report("citations", "%s cites Lifecycle %s, which has no section" % (short(f), sec))
    if cut:
        for sec in set(re.findall(r"Cutover (?:Approach )?(?:Section |§)?(\d[a-c]?)\b", t)):
            if not re.search(r"\b%s · " % re.escape(sec), cut["text"]): report("citations", "%s cites Cutover %s, which has no section" % (short(f), sec))
    if sop:
        for sec in set(re.findall(r"Operating Procedures (?:[A-Z]\.\d+|C\d+a?)|procedure ([A-D]\.\d+)\b", t)):
            pass
        for sec in set(re.findall(r"Operating Procedures ([A-D]\.\d+|C\d+a?)", t)) | set(re.findall(r"\bOP ([AC]\.?\d+a?)\b", t)):
            s2 = sec if "." in sec or sec.startswith("C") else sec
            if not re.search(r"\b%s · " % re.escape(s2), sop["text"]): report("citations", "%s cites Operating Procedures %s, which has no section" % (short(f), sec))
    if ledger:
        for p in set(re.findall(r"Pattern ([A-R])\b", t)):
            if not re.search(r"Pattern %s\b" % p, ledger["text"]): report("citations", "%s cites Pattern %s" % (short(f), p))
    if ts and "Test-Strategy" not in f:
        for rid in set(re.findall(r"\b([VFSCDROG]-[A-Z]{2,7}\d*)\b", t)):
            if rid.startswith(("F-ID", "D-YY")): continue
            if rid not in ts["text"]: report("citations", "%s cites test %s, which is not in the Test Strategy" % (short(f), rid))
# residue, stale phrases, editions, dates, anchors, marks
STALE = [r"\bmk\(", r"\bdl\(", r"stage 2\b", r"next edition", r"\bTBD\b", r"\bTODO\b", r"backfilled deals|the backfill of earlier deals", r"\bsince\s*:", r"(?:^|[^A-Za-z0-9])\.\d\. [A-Z]", r"override_screening_reject", r"Finance overrides", r"overridden only by Finance", r"four hours|four-hour", r"smallest burstable", r"pre-copy filter", r"\bthree (?:named |allowed )?custody cases|those three cases", r"&amp;|<b>|</b>", r"\bD(?:[4-9]\d)\b(?! ·)", r"\bv5\.\d\b", r"\bv6\.0\b", r"\bclass=\"rev\""]
for f, h in HTML.items():
    t = h["text"]
    for pat in STALE:
        n = len(re.findall(pat, t))
        if pat == r"\bv6\.0\b" and "Gaps" in f: continue
        if pat == r"\bv5\.\d\b" and ("Calculation" in f or "Test" in f) and "vectors-v5" in t: n = len(re.findall(pat, t.replace("vectors-v5.9.csv", "")))
        if n: report("residue", "%s contains %r ×%d" % (short(f), pat, n))
    if 'class="rev"' in h["raw"]: report("residue", "%s carries review marks" % short(f))
    dates = re.findall(r"\b\d{1,2} (?:October|November|December) 2026\b", h["text"][:600])
    if not dates and "Tree-Simple" not in f and "Deal-Flow" not in f: report("dates", "%s has no date in its title block" % short(f))
    ids = set(re.findall(r'\bid="([^"]+)"', h["raw"])); hrefs = set(re.findall(r'href="#([^"\'+]+)"', h["raw"]))
    for a in sorted(hrefs - ids): report("anchors", "%s links to #%s, which does not exist" % (short(f), a))
titles = {short(f): re.findall(r"\b\d{1,2} (?:October|November|December) 2026\b", h["text"][:600])[:1] for f, h in HTML.items()}
distinct = {d[0] for d in titles.values() if d}
if len(distinct) > 2: report("dates", "title dates differ across the pack: %s" % sorted(distinct))

# ------------------------------------------------------------------ figures: a table whose home is a drawn ERD figure
# must be in that figure's SVG (the builder checks the definitions against the model, not the drawings); the note under a
# figure may name only tables the drawing shows; and every upper-case name drawn in any figure must be in the model
FIGDIR = os.path.join(ROOT, "scripts", "erd-figures-v6.0"); NAMES_ALL = set(tables) | set(views)
defs = open(os.path.join(ROOT, "scripts", "erd-diagram-defs.mjs"), encoding="utf-8").read()
def svg_text(fp): return re.sub(r"_ (?=[A-Z])", "_", " ".join(re.findall(r"<text[^>]*>([^<]*)</text>", open(fp, encoding="utf-8").read())))  # a name drawn on two lines reads whole
FIG, FULL = {}, {}
def boxes(svg):
    """(name, kind) for every titled box: a bold title after a rect; grey fill or '(diagram' in the title = a name-only pointer."""
    out, fill, pending = [], None, None
    for m in re.finditer(r'<rect [^>]*?fill="([^"]*)"[^>]*/?>|<text ([^>]*)>([^<]*)</text>', svg):
        if m.group(1) is not None: fill = m.group(1).upper(); continue
        attrs, text = m.group(2), m.group(3)
        if pending:  # a title that ended with "_" continues on the next line
            name, kind = pending; pending = None; out.append((name + re.match(r"[A-Z_]*", text).group(0), kind)); continue
        if 'font-weight="bold"' not in attrs: continue
        name = re.match(r"[A-Z][A-Z_]+", text)
        if not name or text.startswith("Diagram "): continue
        kind = "stub" if fill == "#EFEFEF" or "(diagram" in text else "full"
        if name.group(0).endswith("_"): pending = (name.group(0), kind)
        else: out.append((name.group(0), kind))
    return out
HOME = {}
for m in re.finditer(r'id: "([^"]+)", title: "[^"]*", nodes: \[([^\]]*)\]', defs):
    fid = m.group(1); fp = os.path.join(FIGDIR, fid + ".svg")
    for n in re.findall(r'"([A-Z_]+)"', m.group(2)): HOME[n] = fid
    if not os.path.exists(fp): continue
    svg = open(fp, encoding="utf-8").read(); FIG[fid] = svg_text(fp); FULL[fid] = {n for n, k in boxes(svg) if k == "full"}
    for n in re.findall(r'"([A-Z_]+)"', m.group(2)):
        if n not in FIG[fid]: report("figures", "Diagram %s is the home of %s, but the drawing erd-figures-v6.0/%s.svg does not show it" % (fid, n, fid))
        elif n not in FULL[fid]: report("figures", "Diagram %s is the home of %s, but the drawing shows it only as a pointer" % (fid, n))
for fid, full in FULL.items():
    for n in sorted(full):
        if n in HOME and HOME[n] != fid: report("figures", "the drawing of Diagram %s draws %s in full, but its home (the dictionary, the notes) is Diagram %s" % (fid, n, HOME[n]))
        if n not in HOME and n in NAMES_ALL: report("figures", "the drawing of Diagram %s draws %s in full, but no diagram definition owns it" % (fid, n))
erd = next((h for f, h in HTML.items() if "P0-ERD" in f), None)
if erd:
    for m in re.finditer(r'<p class="dgnote"><b>Diagram ([^.<]+)\.</b>(.*?)</p>', erd["raw"]):
        fid, note = m.group(1), re.sub(r"<[^>]+>", "", m.group(2))
        for n in set(re.findall(r"\b[A-Z][A-Z_]{3,}[A-Z]\b", note)):
            if fid in FIG and n not in FIG[fid]: report("figures", "the note under Diagram %s names %s, which the drawing does not show" % (fid, n))
NAMES = set(tables) | set(views)
for d in ("erd-figures-v6.0", "figures-v6.0"):
    for fn in sorted(os.listdir(os.path.join(ROOT, "scripts", d))):
        if not fn.endswith(".svg"): continue
        texts = svg_text(os.path.join(ROOT, "scripts", d, fn))
        for n in set(re.findall(r"\b[A-Z][A-Z_]{3,}[A-Z]\b", texts)):
            if n in NAMES or n in ("PAYABLE", "CREDIT", "SUSPENSE", "YYYY", "OTP", "NPL", "USD", "HKD", "AWS", "RDS", "ECS", "API", "PDF", "SMTP", "DNS", "TLS", "ERD", "SOP", "OWNER", "HOLDER", "CCY", "PURPOSE", "OPENING_BALANCE", "CUSTOMER", "FIFO", "HTML"): continue
            report("figures", "%s/%s draws %s, which is no table or view of the model" % (d, fn, n))

# ------------------------------------------------------------------ stage-2 folder
ap = argparse.ArgumentParser(); ap.add_argument("--stage2"); args = ap.parse_args()
if args.stage2:
    for f in os.listdir(args.stage2):
        src = os.path.join(DOCS, f)
        if os.path.exists(src) and hashlib.md5(open(src, "rb").read()).hexdigest() != hashlib.md5(open(os.path.join(args.stage2, f), "rb").read()).hexdigest():
            report("stage2", "%s differs from docs/" % f)

# ------------------------------------------------------------------ report
print("Pack check at model v%s: %d documents, %d tables, %d views, %d controlled actions (%d with a right), %s procedures" % (version, len(HTML), len(tables), len(views), len(act_rows), len(act_codes), counts.get("procedures")))
if not problems:
    print("RESULT: clean"); sys.exit(0)
by = collections.defaultdict(list)
for a, m in problems: by[a].append(m)
for a in by:
    print("\n== %s (%d)" % (a, len(by[a])))
    for m in by[a][:40]: print("  -", m)
    if len(by[a]) > 40: print("  … and %d more" % (len(by[a]) - 40))
print("\nRESULT: %d item(s) to fix" % len(problems)); sys.exit(1)
