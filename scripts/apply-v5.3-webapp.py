#!/usr/bin/env python3
"""Bring the web app to ERD v5.3: adds NPL's fee-practice material (fee table, Sud's answers of 8 October,
the Project Context and Payment methods tabs, proposals A–M) to data/erd.v5.json as FEE_PRACTICE, and
updates the knowledge-base builder, the map header and the README. Idempotent.
   python3 scripts/apply-v5.3-webapp.py"""
import json, re
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
P = ROOT / "data/erd.v5.json"
d = json.loads(P.read_text())
assert d["version"] == "5.3"

# ------------------------------------------------------------------ FEE_PRACTICE
ans = openpyxl.load_workbook(ROOT / "data/fee-outlines-v0.1-answers.xlsx", data_only=True)
pc, pm = ans["Project Context"], ans["Payment methods"]
projects = [{"project": pc.cell(r, 1).value, "category": pc.cell(r, 2).value, "context": str(pc.cell(r, 3).value).strip()} for r in range(5, pc.max_row + 1) if pc.cell(r, 1).value]
methods = [{"partner": "Ali", "method": pm.cell(r, 1).value, "process": str(pm.cell(r, 2).value).strip()} for r in range(4, 8)]
methods += [{"partner": "Jeton", "method": "USDT", "process": "Same as Ali."}, {"partner": "Jeton", "method": "Bank transfer (international — SWIFT / SEPA)", "process": "Same as Ali."}]

src = openpyxl.load_workbook(ROOT / "data/remittance-fees-2026-10.xlsx", data_only=True).active
def cellv(v):
    if v is None: return ""
    if isinstance(v, float) and v < 1: return f"{v * 100:g} %"
    return str(v).replace("\n", " / ").strip()
fee_table = []
for r in range(3, src.max_row + 1):
    v = [src.cell(r, c).value for c in range(1, 11)]
    if v[0] is None: continue
    fee_table.append({"client": cellv(v[0]), "partner": cellv(v[4]), "total_fee": cellv(v[3]), "partner_cost": cellv(v[5]), "npl_margin": cellv(v[6]), "pair": cellv(v[7]), "earnings_share": cellv(v[8]), "customer_facing_calculation": cellv(v[1]), "internal_calculation": cellv(v[2]), "note": cellv(v[9])})
assert len(fee_table) == 45

answers = [
    "Jeton deducts its full fee (1 % on most BF senders, 1.25 % on Evo, 0.9 % on Novi) and pays NPL a rebate back, accumulated monthly: 0.4 % of the amount on the 1 % and 1.25 % fees, 0.3 % on Novi’s 0.9 %. On BF deals via Jeton that rebate is NPL’s only margin. Jeton is currently inactive.",
    "Aquanow charges a flat 0.8 % and pays NPL 0.3 % back monthly. Aquanow is the preferred partner for BF because the EUR payout is an internal transfer inside the Aquanow platform, recognised by BF instantly; Ali’s SWIFT route takes 1–2 days. Aquanow does not allow BF withdrawals.",
    "Ali’s margin sits inside the rate it gives. For BF via Ali NPL recomputes a ‘market rate’ so the customer’s calculation shows ‘fee 1 %’ while the true parts are Ali ≈ 1 % + NPL 0.4 % (a BF-only rule; it may later become partner rate + markup, at which point the displayed-fee setting is cleared). Ali sometimes quotes USDT → EUR the other way round (1.1738 for 0.851934); the market that day was 0.86050.",
    "Evo: two receiver groups — Bplay (entities Babylon, Bplay, Lex) and TBet (entity TBet); senders are designated per group; Ali can pay Babylon and TBet, Jeton can pay Bplay, Lex and TBet; all conversions are into EUR. Standard fee 2 % = sender 1.4 % + receiver 0.6 % at conversion; selected senders (GTSI, HG, Komodo) pay 1.0 % while Evo still pays 0.6 % — the receiver part is fixed for all senders. Some senders pay what they can (collect-first), others the exact invoice (quote-first).",
    "Bank cutoff: for pairs that depend on the banking channel Ali’s rate is compared in the morning and a deal locked before 14:30 GMT+8 converts the same day; after the cutoff the collection goes ahead on the morning’s figures and the conversion happens the next business day at that day’s partner rate. NPL absorbs the difference; if Ali’s next-day rate breaches the minimum margin, NPL asks for a better rate or waits another day. Today’s balances should show the locked leg’s converted value as pending; a cancellation voids it.",
    "GDC: USDT → USD at 1 : 1 plus 2.5 %, lowered to 2.25 % when the calendar-month volume passes USD 500,000 (not a rolling 30 days; last month 163,124). A transaction that crosses the threshold attributes the part above USD 500,000 to the lower tier, and later transactions in the month follow the lower tier. Minimum margin: 2.5 % (or 2.25 %) − Ali’s 0.4 % = 1.8 %. GDC chooses which of its receiving entities (Adu Ads, Ad Fusion, TDC, Pixel Labs …) gets how much; NPL’s own entity New Pinnacle Ltd is used for this client’s contracts.",
    "Raeen sub-accounts: downlines fund a Betfair sub-account Raeen provides at 4 %. The markup to share is the 4 % less the partner’s fee — 3 % via Ali (1.5 % each), 3.2 % via Aquanow (1.6 % each) — split equally with Raeen; the Aquanow 0.3 % rebate is NPL’s alone and not visible to Raeen. The converted EUR lands in Raeen’s own Aquanow account; Raeen allocates it to the sub-account, keeps its share and pays NPL’s share monthly. Raeen direct from downlines: 1 % to the sender, Aquanow 0.8 %, the 0.2 % left split 75 / 25 (0.15 % Raeen, 0.05 % NPL). Future deals may have more than one party with different shares.",
    "Rebates are tracked separately from NPL’s earnings on deals and never mixed into them. NPLify sees only the deals it serviced; customers working with Jeton or Aquanow directly are out of scope, so the rebate NPLify reconciles is the subset of the partner’s rebate statement that belongs to NPLify deals.",
    "Game reseller: NPL resells games (wholesale from vendors, retail to customers) and collects its invoice receivables to pay vendors. Customers pay in USDT straight into NPL’s own wallet (LT Sub at Aquanow; occasionally held in Ali’s wallet as NPL’s own balance) or, for 27 Group, in THB cash through Ali at market + 2 %, with Ali’s THB → USDT rate required within 1.5 % of market so NPL keeps at least 0.5 % (otherwise Finance is warned). USDT is paid to vendors on different days; the forex gain or loss between collection and payment is accepted within the 2 % markup. NPL (a business unit ‘NPL-GR’) is the client; Bala is a sender and NPL-GR the receiver; the USDT the customer pays is rounded up when possible; invoice-balance tracking is wanted. Management confirmed running NPL-GR inside NPLify as an own-desk project.",
    "Rounding: round up to the nearest 1,000 for Asian currencies (THB, INR, JPY …), to the nearest unit for USD, SGD, HKD; the 66 Group INR example rounds 2,328,878 to 2,329,000. The rounding option is a per-pair setting; what is dropped stays client money, what is added by rounding up is NPL’s cost.",
    "Cash: a collection or settlement is arranged by token — a local-currency bill whose serial number identifies the receiving agent; the sender meets the agent, hands over the cash, keeps the token and shares a photo; the partner counts and confirms; then NPL arranges the settlement. The location must be known first and rates differ by city (INR in Delhi vs Mumbai, USD cash in Bangkok vs Singapore). 66 Group INR is almost always cash at 7 % total; Ad Hoc INR Cash is 7 % total fee.",
    "USDT collections: the sender declares its sending wallet; NPL screens it; acceptable wallets get the partner’s receiving wallet, higher-risk-but-acceptable wallets an alternate receiving wallet, unacceptable ones are refused; the sender shares the transaction hash, NPL verifies it on chain (Tronscan / Etherscan), the partner confirms. Receivers’ wallets are screened before settlement. Screening is an Operations activity (transaction coordination). Not all Evo senders accept up-front screening.",
    "Bank transfers (SWIFT, maybe SEPA later): the partner approves the sender or receiver from company profile and KYC and provides or confirms the account; proofs of transfer are exchanged through NPL; a returned transfer is resent, reused for another transfer, or reconverted and returned. Local bank deposits use ad hoc accounts the partner provides for one transaction and one amount; small local payouts are possible in SG, HK, Indonesia, Thailand. A frozen receiving account that loses funds because of the sender’s side is a reversal of the collection; losses can be partial, can be shared between NPL and the partner as well as the sender, and can happen on the settlement side and by other methods. Cash found short at hand-over is adjusted in a subsequent transaction or by a separate payout.",
    "BF withdrawals: BF sends the customer’s bank transfer to Jeton’s SWIFT account (Jeton is the only partner that can receive them; Ali cannot); Jeton converts to USDT at 1 % over market and pays the customer’s wallet (customers have both TRC-20 and ERC-20 wallets); 0.4 % comes back to NPL monthly.",
    "AK Personal: a stakeholder account operated with Ali; collections and conversions happen normally but the balance (USD, SGD, USDT; about USD 400,000 equivalent, revised from time to time) sits at the partner and is paid out on request by local bank payment, SWIFT, USDT or cash; no markup. USD and SGD are banking-ready balances: 10,000 USDT collected at night converts to SGD the next business morning.",
    "Narratives on payouts are often the customer’s own entity (Seven Investments N.V., Bplay) or NPL’s own entity (New Pinnacle Ltd for GDC, NPL for 66 Group, occasionally as declared sender for YN Remit). For Ali the executing vehicle is PT Sukses or PT Global; Jeton and Aquanow both offer TRC-20 and ERC-20 collection wallets.",
    "JTN-JPY cash: JTN sends USDT to Ali, converted to JPY cash and handed to the same party; Ali’s rate is compared and quoted with a variable markup of 0.2–0.5 % (maximum 0.5 %), total fee 1–1.8 %. YN Remit: third-party invoice payments on a quote-first basis at partner rate + 0.5 %; USDT → USD, EUR, GBP. 66 Group: like YN Remit, sometimes INR cash. Peru: bank transfer to Ali’s receiving entity (PT Silver Lining Production), USD → USDT, Ali 3 % + NPL 1 %.",
    "Same-currency pass-through (Evolution bank transfers) stays in scope: the fee is still applied because the currency is collected and then settled separately.",
]

proposals = [
    ["A", "A per-sender override carries its own sender / receiver split", "D20"],
    ["B", "Fees by monthly volume: FEE_TIER per calendar month; a crossing deal is split across tiers", "D21"],
    ["C", "The fee the customer sees may differ from the fee charged: displayed fee and derived source rate", "D22"],
    ["D", "NPL as its own exchange desk: NPL-GR as an own-desk project, invariant 3 restated", "D23"],
    ["E", "Invoices paid in parts: INVOICE, per-line discharge, INVOICE_BALANCE", "D24"],
    ["F", "A rounding menu per currency pair; round-up cost is NPL’s (EXP_ROUNDING)", "D25"],
    ["G", "Markup shared with a client party: share of net markup, several parties, party holds the funds", "D26"],
    ["H", "Rebates as their own earnings stream (EARN_REBATE); rebate rule with a basis and a scope", "D27"],
    ["I", "Partner rates stored as quoted, with direction; normalised rate derived", "D28"],
    ["J", "Bank cutoff, rate lock, next-day conversion; pending converted value in the client balance", "D29"],
    ["K", "Cash by token, with rates per city", "D30"],
    ["L", "Wallet screening (an Operations action) and risk-routed receiving wallets", "D31"],
    ["M", "Single-use accounts on both sides; loss events, partial and shared", "D32"],
    ["—", "Same-currency pass-through stays in scope, converted at rate 1", "D33"],
]

documents = [
    ["ERD & Data Model", "Draft v5.3, 9 October 2026 — this model (59 tables, 6 views, invariants 1–32, decisions D1–D33)"],
    ["Model Gaps & Proposals", "v1.0, 8 October 2026 — gaps A–M with their ERD footprint; all applied in v5.3 (the corrections of 9 October — H simplified, J pending balance, L Operations, M generalised, B split — are in v5.3 and not yet in the document)"],
    ["Fee Outlines (simulation workbook)", "v0.2, 8 October 2026 — every line of NPL’s fee table as a fill-in outline with a worked calculation per pattern; NPL’s answers of 8 October folded in"],
    ["Ledger Posting Design & Chart of Accounts", "v1.1, 8 October 2026 — against ERD v5.2; v1.2 pending for v5.3"],
    ["Transaction Lifecycle & Approval State Machines", "v1.1, 8 October 2026 — against ERD v5.2; v1.2 pending"],
    ["Roles & Visibility Matrix", "v1.0, 8 October 2026 — against ERD v5.2; v1.1 pending"],
    ["ERD Reading Guide", "v1.0, 8 October 2026 — plain-language companion to the diagrams of v5.2; v1.1 pending"],
    ["Calculation Specification", "v1.0 — v1.1 pending"],
    ["Configuration Schema", "v1.0 — v1.1 pending"],
    ["Project Understanding", "v1.1 (with Sud’s comments)"],
]

d["FEE_PRACTICE"] = {
    "intro": "NPL’s fee practice as given to New XP: the ‘Table of Remittance Customers Fees’ (October 2026), Sud’s answers in the Fee Outlines workbook (8 October 2026) and his two tabs ‘Project Context’ and ‘Payment methods’, and Ayush’s clarifications of 8–9 October. This is business fact, in NPL’s own words where quoted; the ERD v5.3 decisions D20–D33 were made from it.",
    "projects": projects, "payment_methods": methods, "fee_table": fee_table, "answers": answers, "proposals": proposals, "documents": documents,
}
P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("FEE_PRACTICE written:", len(projects), "projects,", len(methods), "methods,", len(fee_table), "fee lines,", len(answers), "facts")

# ------------------------------------------------------------------ kb.ts
k = ROOT / "src/lib/kb.ts"; s = k.read_text()
def sub(old, new, text, count=1):
    assert old in text, old[:70]
    return text.replace(old, new, count)
s = sub("  SCENARIO_V4: Record<string, string>;\n};", "  SCENARIO_V4: Record<string, string>;\n  FEE_PRACTICE: FeePractice;\n};", s)
s = sub("type Walk = { name: string; steps: [string, string][] };", "type Walk = { name: string; steps: [string, string][] };\ntype FeePractice = { intro: string; projects: { project: string; category: string; context: string }[]; payment_methods: { partner: string; method: string; process: string }[]; fee_table: Record<string, string>[]; answers: string[]; proposals: [string, string, string][]; documents: [string, string][] };", s)
s = re.sub(r"`THIS IS ERD DRAFT v\$\{d\.version\} \(8 October 2026\).*?with invariant 19\.`",
           "`THIS IS ERD DRAFT v${d.version} (9 October 2026), which supersedes v5.2, v5.1, v5.0, v4.0 and v3.0. It carries the review decisions of 6–8 October 2026 — D13 (no return group; return and hop legs inherit the parent leg’s attribution), D14 (explicit wallet fields on receiving-entity accounts), D15 (FACILITATING_ENTITY renamed PARTNER_ENTITY, pending NPL confirmation; the partner’s collection endpoints merged into COLLECTION_RECEIVING_ENDPOINT), D16 (registration payout details follow the account’s kind), D17 (DISBURSEMENT_LINE.deal_id), D18 (nullable rail on collection endpoints), D19 (endpoint kind matches the leg’s collection method) — and applies the fee-practice decisions of 8–9 October 2026, D20–D33: FEE_OVERRIDE with its own split (D20), FEE_TIER volume tiers per calendar month with DEAL_FEE_TIER portions (D21), the displayed fee on FEE_STRUCTURE and DEAL_GROUP (D22), NPL-GR as an own-desk project with invariant 3 restated (D23), INVOICE and per-line discharge with the INVOICE_BALANCE view (D24), a rounding menu per pair with a signed residual (D25), REFERRAL_RULE as a share of the net markup settled by the party (D26), rebates as their own stream EARN_REBATE with a rule basis and scope (D27), partner rates stored as quoted with direction (D28), bank cutoff, rate lock and conversion due date with a pending converted value in CLIENT_BALANCE (D29), cash by token with rates per city (D30), WALLET_SCREENING as an Operations action with endpoint risk bands (D31), single-use endpoints and accounts and LOSS_EVENT with a shared, possibly partial loss (D32), and same-currency pass-through converted at rate 1 (D33). 59 tables, 6 views, invariants 1–32.`", s, flags=re.S)
s = sub('L.push("", "=== SECOND SOURCE: ERD REVIEW DECISION RECORD (6–7 October 2026) ===", d.DECISIONS);',
        'L.push("", "=== SECOND SOURCE: ERD REVIEW DECISION RECORD (6–9 October 2026, D1–D33) ===", d.DECISIONS);', s)
s = sub('  L.push("", "=== THIRD SOURCE: NPLify — Project Understanding v1.0 (Sud’s comments) ===", d.UNDERSTANDING);\n  return L.join("\\n");',
        '''  L.push("", "=== THIRD SOURCE: NPLify — Project Understanding v1.0 (Sud’s comments) ===", d.UNDERSTANDING);
  const fp = d.FEE_PRACTICE;
  L.push("", "=== FOURTH SOURCE: NPL’S FEE PRACTICE (fee table of October 2026; Sud’s answers and tabs of 8 October 2026; clarifications of 8–9 October) ===", fp.intro, "");
  L.push("PROJECTS AS NPL RUNS THEM TODAY (NPL’s own words, ‘Project Context’ tab):", ...fp.projects.map((p) => `* ${p.project} [${p.category}]: ${p.context}`), "");
  L.push("PAYMENT METHODS AND THEIR PROCESS (NPL’s own words, ‘Payment methods’ tab):", ...fp.payment_methods.map((m) => `* ${m.partner} — ${m.method}: ${m.process}`), "");
  L.push("FEE TABLE (one line per client / product; fee, partner cost and margin are NPL’s figures; derived economics — Finance and Management only):", ...fp.fee_table.map((r, i) => `${i + 1}. ${r.client} — partner ${r.partner}; total fee ${r.total_fee}; partner cost ${r.partner_cost}; NPL margin ${r.npl_margin}; pair ${r.pair}; earnings share ${r.earnings_share || "none"}${r.note ? "; note: " + r.note : ""}; customer-facing calculation: ${r.customer_facing_calculation}; internal: ${r.internal_calculation}`), "");
  L.push("FACTS CONFIRMED BY NPL (8–9 October 2026):", ...fp.answers.map((a) => "- " + a), "");
  L.push("THE THIRTEEN GAPS (proposals A–M of ‘Model Gaps & Proposals v1.0’) AND THE v5.3 DECISION THAT APPLIED EACH:", ...fp.proposals.map((p) => `- ${p[0]}: ${p[1]} → ${p[2]}`), "");
  L.push("DOCUMENTS OF THE P0 PACK AND THEIR CURRENT VERSION:", ...fp.documents.map((x) => `- ${x[0]}: ${x[1]}`), "");
  return L.join("\\n");''', s)
s = sub("Your knowledge base is exactly three sources reproduced below: (1) the ERD & Data Model Draft v5.2 as shown on the map; (2) the ERD review decision record of 6–8 October 2026 (decisions D1–D19), which records the scenarios reviewed, the decisions taken and their reasons; and (3) the Project Understanding v1.0 with Sud’s comments, the business understanding the ERD was built from.",
        "Your knowledge base is exactly four sources reproduced below: (1) the ERD & Data Model Draft v5.3 as shown on the map; (2) the ERD review decision record of 6–9 October 2026 (decisions D1–D33), which records the scenarios reviewed, the decisions taken and their reasons; (3) the Project Understanding v1.0 with Sud’s comments, the business understanding the ERD was built from; and (4) NPL’s fee practice — the fee table, Sud’s answers and his Project Context and Payment methods notes of 8 October 2026 — which is business fact in NPL’s own words and the basis of decisions D20–D33.", s)
s = sub("If sources disagree, say which says what; the decision record is the newest.", "If sources disagree, say which says what; the decision record and the fee-practice source are the newest. Figures in the fee table (partner costs, NPL margins, rebates, shares) are derived economics: give them when asked, but say they are Finance-level figures.", s)
k.write_text(s)

# ------------------------------------------------------------------ engine.js, README
e = ROOT / "src/lib/map/engine.js"; s = e.read_text()
s = sub("P0 data model · draft v5.2 · 54 tables + 4 views", "P0 data model · draft v5.3 · 59 tables + 6 views", s)
s = sub("Answers come only from the ERD v5.2, the review decision record and the Understanding document.", "Answers come only from the ERD v5.3, the review decision record (D1–D33), the Understanding document and NPL’s fee-practice notes.", s)
if "const SUGGEST=[" in s:
    s = sub("const SUGGEST=[", "const SUGGEST=['What changed in v5.3, and which NPL fee practice does each decision come from?','How is the Raeen sub-account markup shared, and where does the Aquanow rebate go?','How does a GDC transaction that crosses USD 500,000 in a month get priced?',", s)
e.write_text(s)

r = ROOT / "README.md"; s = r.read_text()
s = sub("Interactive map of the NPLify P0 data model (draft v5.2) with an assistant that answers only from the model, the ERD review decision record and the Project Understanding document.",
        "Interactive map of the NPLify P0 data model (draft v5.3) with an assistant that answers only from the model, the ERD review decision record (D1–D33), the Project Understanding document and NPL’s fee-practice notes.", s)
s = sub("| `data/erd.v5.json` | The model: entities, relationships, invariants, walkthroughs, open questions, scenarios, decision record, Understanding text. The only file to edit for a new ERD revision. |",
        "| `data/erd.v5.json` | The model: entities, relationships, invariants, walkthroughs, open questions, scenarios, decision record, Understanding text, and NPL’s fee practice (`FEE_PRACTICE`). The only file to edit for a new ERD revision; `scripts/apply-v5.3.py` and `scripts/apply-v5.3-webapp.py` show how v5.3 was applied. |\n| `docs/` | The P0 document pack: ERD baseline (v5.3), Model Gaps & Proposals, Fee Outlines workbook, Ledger Posting Design, Lifecycle & Approvals, Roles & Visibility, Reading Guide, Calculation Specification, Configuration Schema — each built by the matching `scripts/build-*.mjs` or `.py`. |", s)
r.write_text(s)
print("kb.ts, engine.js, README updated")
