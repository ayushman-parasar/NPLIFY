#!/usr/bin/env python3
"""11 October 2026 — scenario catalogue: Evolution is Evo. The group 'Evolution (dormant)' (bank-transfer and older
currency products, not run for years but kept in scope) is folded into the 'Evo' group: its two scenarios are appended,
marked dormant, and its lead becomes a sentence of Evo's. No model change. Idempotent.
    python3 scripts/apply-v5.9-evo-merge.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text()); projects = d["SCENARIO_CATALOGUE"]["projects"]
dormant = [p for p in projects if p["client"] == "Evolution (dormant)"]
assert dormant, "already applied: no 'Evolution (dormant)' group"
dormant = dormant[0]
evo = next(p for p in projects if p["client"] == "Evo")
evo["projects"] = "Evo — the USDT → EUR invoice flow, plus Evo's bank-transfer and older currency products (dormant: not run for years, kept in scope by NPL)"
evo["lead"] = evo["lead"] + " " + dormant["lead"].replace("Not run for years but kept in scope by NPL:", "Evo's bank-transfer and older currency products have not run for years but stay in scope:")
for name, what, how, model in dormant["scenarios"]:
    evo["scenarios"].append([f"{name} — dormant", what, how, model])
projects.remove(dormant)
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("client groups", len(projects), "· Evo scenarios", len(evo["scenarios"]))
