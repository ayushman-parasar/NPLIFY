#!/usr/bin/env python3
"""v5.4 (9 October 2026, evening): consolidated edition of the 8–9 October work on v5.3, plus D38 — a CLIENT
parent above PROJECT with a CLIENT_POSITION roll-up view. Idempotent.   python3 scripts/apply-v5.4.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "data/erd.v5.json"
d = json.loads(P.read_text()); E, R = d["E"], d["R"]
assert d["version"] == "5.3" and "CLIENT" not in E

E["CLIENT"] = {"d": "config", "col": 0, "v": "new", "ch": ["new in v5.4 (D38)"],
    "desc": "The commercial relationship: the counterparty NPL contracts with and reports on (Betfair, Evo, 66 Group, GDC …). A client has one or more PROJECTs — BF, BF Sub and BF Withdrawal are three arrangements with one client — each with its own fee structures, partners and policies. Client-level figures (balances at partners, entitlement, custody, earnings, rebates) are roll-ups over the client’s projects (CLIENT_POSITION), never stored; an optional exposure_ceiling caps the sum of what rests at partners across the client’s projects. v5.4 (D38).",
    "f": [["id", "int", "PK"], ["name", "string", "", "Betfair, Evo, 66 Group, GDC, NPL-GR"], ["category", "string", "", "NPL’s own grouping (Project Context tab: BF, Evo, Game Reseller …)"], ["legal_entity_ref", "string", "", "contracting entity, external store"], ["kyc_ref", "string", "", "external store"],
          ["relationship_owner", "int", "FK", "USER"], ["exposure_ceiling", "decimal", "", "optional cap on Σ balance resting at partners across the client’s projects"], ["status", "string"]]}
d["ORDER"]["0"].insert(0, "CLIENT")
E["PROJECT"]["f"].insert(1, ["client_id", "int", "FK", "the client this arrangement belongs to (v5.4, D38)"])
E["PROJECT"]["desc"] = "One arrangement with a client: a product line with its own configuration — parties, groups, pairs, thresholds, partner configurations — and its own policies. Several projects may belong to one CLIENT (BF, BF Sub and BF Withdrawal). " + E["PROJECT"]["desc"].replace("The client. Owns its whole configuration: parties, groups, pairs, thresholds, partner configurations. Its policies govern every deal. ", "")
E["PROJECT"].setdefault("ch", []).append("v5.4 (D38): + client_id — a project is one arrangement with a CLIENT, no longer the client itself")
R.insert(0, ["CLIENT", "PROJECT", "owns", "client_id", "arrangements with this client (1..n)", "1 : n", "new"])
R.append(["USER", "CLIENT", "actor", "relationship_owner", "relationship_owner", "1 : n", "new"])
E["CLIENT_POSITION"] = {"d": "view", "col": 8, "v": "new", "desc": "CLIENT_POSITION(client, currency) = Σ over the client’s projects of CLIENT_BALANCE (per partner), GROUP_ENTITLEMENT, CUSTODY, and the period’s earnings (EARN_GROSS) and rebates (EARN_REBATE) from postings — the client-level report that project = client made impossible. Compared with CLIENT.exposure_ceiling when set (v5.4, D38).", "f": [["client", "", ""], ["currency", "", ""]]}
d["ORDER"]["8"].append("CLIENT_POSITION")
R += [["CLIENT", "CLIENT_POSITION", "view", "", "roll-up over the client’s projects", "Σ"],
      ["LEDGER_POSTING", "CLIENT_POSITION", "view", "", "Σ balances, earnings and rebates across projects", "Σ"],
      ["PROJECT", "CLIENT_POSITION", "view", "", "per project, summed", "Σ"]]
d["INV"].append([["CLIENT", "PROJECT", "CLIENT_BALANCE", "CLIENT_POSITION"], "Client-level figures are sums over the client’s projects, never stored (CLIENT_POSITION); when CLIENT.exposure_ceiling is set, Σ CLIENT_BALANCE across the client’s projects may not exceed it — a settlement or a held balance that would breach it needs Management approval, as a project’s own ceiling does (v5.4, D38)."])
d["CONVENTIONS"] = [c.replace("Derived figures (client balance, entitlement, offsets, custody, invoice balance, month volume) are views", "Derived figures (client balance, entitlement, offsets, custody, invoice balance, month volume, client position) are views") for c in d["CONVENTIONS"]]
d["FRS_VOCAB"] = [(["Client", "CLIENT (the commercial relationship) — its arrangements are PROJECTs (D38; until v5.3 the FRS client mapped to PROJECT)"] if v[0] == "Client" else v) for v in d["FRS_VOCAB"]]
d["FRS_VOCAB"].insert(1, ["Project (NPL’s ‘Project Context’: BF, BF Sub, Evo …)", "PROJECT under CLIENT — one arrangement with its own fees, partners and policies (D38)"])
d["NOTES"]["Configuration"].append("v5.4 (D38): CLIENT is the commercial relationship above PROJECT. BF, BF Sub and BF Withdrawal are three projects of one client; client-level balances, exposure, earnings and rebates are the CLIENT_POSITION roll-up, never stored.")
d["OPENQ"].append({"q": "Review point (v5.4): project = client made client-level reporting impossible when one client runs several arrangements (BF, BF Sub, BF Withdrawal; 66 Group in remittance and in the game reseller).", "blocks": "Client reporting; exposure across projects", "status": "answered",
    "a": "NPL (9 Oct): add a parent clients table. New XP: yes — CLIENT above PROJECT with a roll-up view; parties stay per project for now (a shared sender registry can be added later without breaking attribution).",
    "impl": "v5.4 D38: CLIENT (name, category, legal entity, KYC, relationship owner, optional exposure ceiling); PROJECT.client_id; CLIENT_POSITION view; invariant 35.", "ents": ["CLIENT", "PROJECT", "CLIENT_POSITION", "CLIENT_BALANCE"]})
d["DECISIONS"] += (
    "\nV5.4 UPDATE (9 October 2026, evening): the consolidated edition of the day’s work on v5.3 — the amendments to D27 and D29, the withdrawn D30 amendment, D34–D37 — plus D38. 64 tables + 7 views, invariants 1–35."
    "\nAGREED 9 OCTOBER 2026 (evening), IN v5.4 — D38: CLIENT above PROJECT. A client is the commercial relationship NPL contracts with and reports on; a project is one arrangement with it (BF, BF Sub and BF Withdrawal are three projects of one client; 66 Group appears in remittance and in the game reseller). PROJECT.client_id; CLIENT_POSITION rolls up balances, entitlement, custody, earnings and rebates over the client’s projects, never stored; an optional client exposure_ceiling caps the sum resting at partners. Parties (senders, receivers, accounts) stay per project — a client-wide sender registry can be added later as a reference without touching attribution. Why (NPL): with project = client there was no way to report on a client who runs several complex arrangements."
)
d["DOC_META"] = "NPLify · P0 Technical Baseline. Deliverable 1 — Entity-Relationship Diagram & Data Model, Draft v5.4. New XP Technologies Limited, 9 October 2026, Confidential — internal baseline document; client deliverables are derived from it. Supersedes v5.3 (the working draft of 8–9 October), v5.2, v5.1, v5.0, v4.0 and v3.0 in full."
d["version"] = "5.4"
names = set(E)
for r in R: assert r[0] in names and r[1] in names, r
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("tables", sum(1 for e in E.values() if e["d"] != "view"), "views", sum(1 for e in E.values() if e["d"] == "view"), "relations", len(R), "invariants", len(d["INV"]))
