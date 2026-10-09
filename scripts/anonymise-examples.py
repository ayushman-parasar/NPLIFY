#!/usr/bin/env python3
"""Remove personal names from the model, generators, app and examples (9 October 2026): the example
senders Ayush / Naveen become Sender A / Sender B, the example receivers Sud / Raj become Receiver X /
Receiver Y, the example entities NewXP Entity / ReferScout Entity become Entity X1 / Entity X2, and the
NPL reviewer is referred to as NPL. Idempotent.   python3 scripts/anonymise-examples.py"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [p for p in [*ROOT.glob("scripts/*.mjs"), *ROOT.glob("scripts/*.py"), ROOT / "data/erd.v5.json", ROOT / "src/lib/kb.ts", ROOT / "src/lib/map/engine.js",
         ROOT / "standalone/nplify-erd-map.html", ROOT / "README.md", ROOT / "docs/config-example-client1.json", ROOT / "docs/calc-vectors.json"] if p.exists() and p.name != "anonymise-examples.py"]

RULES = [
    # New XP's own author, named in the sources
    (r"\bAyush[’']s clarifications", "New XP’s clarifications"),
    # example receivers (before the reviewer rules, which would otherwise catch the possessive)
    (r"\bSud, Raj\b", "Receiver X, Receiver Y"), (r"\bSud and Raj\b", "Receiver X and Receiver Y"),
    (r"\bSud[’']s two accounts", "Receiver X’s two accounts"), (r"\bSud with two legal", "Receiver X with two legal"),
    (r"\breceivers? Sud\b", lambda m: m.group(0).replace("Sud", "Receiver X")), (r"name: \"Sud\"", 'name: "Receiver X"'), (r"receiver: \"Sud\"", 'receiver: "Receiver X"'),
    (r"\(Sud\)", "(Receiver X)"),
    # the NPL reviewer
    (r"\bSud[’']s comments\b", "NPL’s review comments"), (r"\bSud \(NPL\)", "NPL"), (r"\[Sud\]", "[NPL]"), (r"\bSud from NPL\b", "NPL"),
    (r"\bSud[’']s\b", "NPL’s"), (r"\bSud:", "NPL:"), (r"\b(by|from|with|to) Sud\b", r"\1 NPL"),
    (r"\bSud (added|answered|confirmed|says|said|wrote|updated|edited|worked|filled|returned|left|set|entered|gave|asked|uses|titled)\b", r"NPL \1"),
    (r"\bSud\b", "NPL"),
    # example receiver Raj, senders Ayush and Naveen
    (r"\bRaj[’']s\b", "Receiver Y’s"), (r"\bRaj\b", "Receiver Y"),
    (r"\bAyush and Naveen\b", "Sender A and Sender B"), (r"\bAyush, Naveen\b", "Sender A, Sender B"),
    (r"\bAyush[’']s\b", "Sender A’s"), (r"\bAyush\b", "Sender A"), (r"\bNaveen[’']s\b", "Sender B’s"), (r"\bNaveen\b", "Sender B"),
    # example entities
    (r"NewXP Entity", "Entity X1"), (r"ReferScout Entity", "Entity X2"), (r"\"NEWXP\"", '"ENTITY_X1"'), (r"\"REFERSCOUT\"", '"ENTITY_X2"'),
    # readability after the swaps
    (r"\breceiver Receiver ", "receiver "), (r"\breceivers Receiver ", "receivers "), (r"\bsender Sender ", "sender "), (r"\bsenders Sender ", "senders "),
]

total = 0
for f in FILES:
    t = f.read_text(); u = t
    for pat, rep in RULES:
        u = re.sub(pat, rep, u)
    if u != t:
        n = sum(1 for _ in re.finditer(r"\b(Sud|Raj|Ayush|Naveen)\b|NewXP Entity|ReferScout Entity", t))
        f.write_text(u); total += n; print(f"{f.relative_to(ROOT)}: {n} replaced")
print("total", total)
left = []
for f in FILES:
    for m in re.finditer(r".{40}(\b(Sud|Raj|Ayush|Naveen)\b|NewXP Entity|ReferScout Entity).{30}", f.read_text()):
        left.append(f"{f.name}: …{m.group(0)}…")
print("leftovers:", len(left)); print("\n".join(left[:20]))
