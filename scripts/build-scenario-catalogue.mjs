// Build docs/NPLify-Scenario-Catalogue-v6.0.{html,pdf}: the scenarios of the web app's /scenarios page as a
// document — every scenario NPL runs today, grouped by client and project, with the shared operational flows
// F1–F10, the guided walkthroughs and the worked examples X1–X7 — rendered from data/erd.v5.json (SCENARIO_CATALOGUE, WALKS) through the
// client-facing pass. Local deliverable; not registered in the web app.   node scripts/build-scenario-catalogue.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { clientFacing } from "./client-facing.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));
const REVIEW = !!process.env.NPLIFY_REVIEW;                                   // round-2 review draft: yellow = new, red strike = goes
const outDir = process.env.NPLIFY_OUT || path.join(root, "docs");
const mk = (t) => (REVIEW ? `<mark class="rev">${t}</mark>` : t);
const dl = (t) => (REVIEW ? `<del class="rev">${t}</del> ` : "");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const V = D.version, DATE = "22 October 2026";
const CAT = D.SCENARIO_CATALOGUE, WALKS = D.WALKS;
const total = CAT.projects.reduce((n, p) => n + p.scenarios.length, 0);
const ENT = new RegExp("\\b(" + Object.keys(D.E).sort((a, b) => b.length - a.length).join("|") + ")\\b", "g");
const mono = (s) => esc(s).replace(ENT, (m) => `<span class="mono">${m}</span>`);

const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;margin:0}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
p{margin:0 0 7pt} ul,ol{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 3pt}
.mono{font:8.8pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin:4pt 0 8pt;font-size:9.2pt}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt;vertical-align:bottom;background:#f3f6fb}
td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top} td,th{overflow-wrap:anywhere}
tr{break-inside:avoid}
td.k{font-weight:700}
table.x{font-size:8.6pt} table.x td,table.x th{padding:3pt 4pt}
.title{text-align:center;margin-top:40mm}
.title .sub{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 10pt}
.title .org{margin:0 0 2pt} .title .date{margin:0 0 16pt}
.rule{border-top:2px solid #222;border-bottom:1px solid #222;height:2px;margin:10pt 0 14pt}
.pb{break-before:page}
.client{break-before:auto;margin-top:14pt}
.lead{border-left:3px solid #2f5d9e;padding:2pt 8pt;margin:6pt 0 10pt;background:#fbfbf6}
.scn{margin:0 0 12pt;break-inside:avoid}
.scn h4{font:700 10.5pt Helvetica,Arial,sans-serif;margin:10pt 0 3pt}
.scn .num{color:#2f5d9e;margin-right:6pt}
.scn p{margin:0 0 4pt}
.scn .lbl{font:700 8.6pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-transform:uppercase;letter-spacing:.04em;margin-right:4pt}
.small{font-size:9pt;color:#444}
.flow{break-inside:avoid;margin:0 0 10pt}
.flow .fid{font:700 10pt Helvetica,Arial,sans-serif;color:#fff;background:#2f5d9e;padding:1pt 6pt;border-radius:3pt;margin-right:6pt}
mark.rev{background:#ffe58a;color:inherit;padding:0 1px} del.rev{color:#b00020;text-decoration:line-through} .rev-note{background:#ffe58a;padding:3pt 6pt;font-size:9pt;margin:0 0 8pt}
`;
const isDormant = (name) => /— dormant$/.test(name);
const dormantIds = [];

const clients = CAT.projects.map((p, pi) => `<section class="client">
<h2>${pi + 1} · ${esc(p.client)}</h2>
<p><b>Projects:</b> ${mono(p.projects)}</p>
<p class="lead">${esc(p.lead)}${p.scenarios.some(([n]) => isDormant(n)) ? " " + mk("In the system they are dormant routes: configured, disabled by default, not offered on the quote screen, and reactivated only through the checklist at the end of Part 1.") : ""}</p>
${p.scenarios.map(([name, story, mech, tables], i) => `<div class="scn"><h4><span class="num">${pi + 1}.${i + 1}</span>${esc(name)}</h4>
<p>${esc(story)}</p>${isDormant(name) ? (dormantIds.push(`${pi + 1}.${i + 1}`), `<p>${mk("<span class=\"lbl\">Status</span> Dormant: kept in the configuration as a disabled route (partner pair, endpoints and rails inactive, destination approvals suspended, fee structure kept with its version). It cannot price a quote or receive a collection until it is reactivated under the checklist at the end of Part 1.")}</p>`) : ""}
${mech ? `<p><span class="lbl">Fee and flow</span> ${mono(mech)}</p>` : ""}
${tables ? `<p class="small"><span class="lbl">In the model</span> ${mono(tables)}</p>` : ""}</div>`).join("")}
</section>`).join("");

const flows = CAT.flows.map(([id, name, desc, tables]) => `<div class="flow"><h3><span class="fid">${esc(id)}</span>${esc(name)}</h3><p>${esc(desc)}</p>${tables ? `<p class="small"><span class="lbl">In the model</span> ${mono(tables)}</p>` : ""}</div>`).join("");

const walks = WALKS.map((w, i) => `<h3>W${i + 1} · ${esc(w.name)} <span class="small">(${w.steps.length} steps)</span></h3>
<table><thead><tr><th style="width:28%">Entity</th><th>What happens there</th></tr></thead><tbody>
${w.steps.map(([e, t]) => `<tr><td class="mono">${esc(e)}</td><td>${esc(t)}</td></tr>`).join("")}
</tbody></table>`).join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Scenario Catalogue</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Scenario Catalogue · Draft v${V}</p><p class="org">New XP Technologies Limited</p><p class="date">${DATE} · Confidential</p></div>
<p>Every scenario NPL runs today, grouped by client and project: ${total} scenarios across ${CAT.projects.length} client groups. Each scenario is given as NPL described it (the story), the fee and the operational flow it uses, and the parts of the model that carry it. The ten operational flows the scenarios share are defined once in Part 2 and referenced by number (F1–F10); Part 3 lists the guided walkthroughs that trace a deal through the model entity by entity, as they appear on the interactive map; Part 4 walks one deal through the model class by class (X1–X7).</p>
<div class="rule"></div>
${REVIEW ? `<p class="rev-note"><b>Round-2 review draft, 27 October 2026 (finding 04.1 of the v6.0 design review).</b> Yellow = added text; nothing is struck.</p>` : ""}
<h2>How to read this pack</h2>
<p>Four map pages are now part of the pack as documents of their own, and are the place to start: the Top-Down Map (from the business, through the data model and the deal states, to the scenarios and the reading order), the Deal Flow on one page (Quote, Collect, Convert, Settle, with the roles and the money path), the Workflow Tree (8 classes, 27 sub-classes, 92 procedures, each naming who initiates, who approves, the codes it is written under and the records it touches) and the Workflow Tree on one page. Read them in that order, then this document. Every worked transaction (T), acceptance vector (L, B), walkthrough (W, X), flow (F) and procedure (C, A, D) has one identifier, listed in the Reading Companion's identifier register; the Test Strategy &amp; Coverage document says which test proves each procedure.</p>

<h2>Contents</h2>
<ol>${CAT.projects.map((p, i) => `<li>${esc(p.client)} — ${p.scenarios.length} scenario${p.scenarios.length === 1 ? "" : "s"}</li>`).join("")}</ol>
<p>Part 2 · Shared operational flows F1–F10 · Part 3 · Guided walkthroughs W1–W${WALKS.length} · Part 4 · Worked examples X1–X7</p>

<h2 class="pb">Part 1 · Scenarios by client</h2>
<table><thead><tr><th style="width:34%">Client group</th><th>Projects</th><th style="width:12%">Scenarios</th></tr></thead><tbody>
${CAT.projects.map((p) => `<tr><td><b>${esc(p.client)}</b></td><td>${mono(p.projects)}</td><td>${p.scenarios.length}</td></tr>`).join("")}
</tbody></table>
<p>The fees, rebates and rates quoted in the scenarios below are NPL's figures of 8 to 9 October 2026 and are illustrative: each is a configured value of the project (a FEE_STRUCTURE, FEE_OVERRIDE, MARKUP_SHARE_RULE or PARTNER_REBATE_RULE row, versioned by effective date), never a constant in code. In particular the Jeton rebate of 0.4 % (scenarios 1.1, 1.6, 2.5) is set per project (NPL, 20 October), and the figures of the fee table may differ from the values in force when a project goes live.</p>
${clients}

<h2>${mk("Dormant scenarios: disabled by default, and the reactivation checklist")}</h2>
<p>${mk(`A dormant scenario (today ${dormantIds.join(" and ")}) is listed so that the configuration, the fee sheet and this catalogue agree, not so that it can be chosen. Its rows are kept and disabled: the partner pair carries status dormant, its collection endpoints and settlement rails are inactive, its destination approvals are suspended, and its fee structure and tiers keep their last version. A dormant route is not offered on the quote screen, and the server refuses a quote, a collection instruction and a settlement line on it, for every role and channel, with the reason "route dormant". A dormant route needs no deal in the parallel run (Cutover Approach, Section 6) and is not a test of the Test Strategy until it is reactivated.`)}</p>
<p>${mk("<b>Reactivation</b> is a configuration change like any other (Finance proposes, Management approves) with a checklist whose evidence is attached to the proposal; a step without evidence keeps the route dormant. The route becomes active only when every step is done, the partner configuration block passes the validation rules of the Configuration Schema (Section 6, rules 13 and 15) and Management activates it.")}</p>
<table><thead><tr><th style="width:5%">${mk("#")}</th><th style="width:33%">${mk("Step")}</th><th style="width:20%">${mk("Who")}</th><th>${mk("Evidence attached to the proposal")}</th></tr></thead><tbody>
<tr><td>${mk("1")}</td><td>${mk("Partner confirms the route today: method, currency pair, rail, its cost and pricing style, cutoff and holidays, the correspondent or account arrangement still in place")}</td><td>${mk("Operations obtains; Finance records")}</td><td>${mk("The partner's written confirmation and its reference; PARTNER_PAIR and PARTNER fields compared with it")}</td></tr>
<tr><td>${mk("2")}</td><td>${mk("Endpoints and rails re-activated, bank account details current")}</td><td>${mk("Operations proposes; Finance approves (Configuration Schema rules 7 and 14)")}</td><td>${mk("Each COLLECTION_RECEIVING_ENDPOINT and SETTLEMENT_RAIL active with an active BANK_ACCOUNT_DETAILS row of the same currency and rail; a wallet endpoint's network one the partner offers")}</td></tr>
<tr><td>${mk("3")}</td><td>${mk("Destination approvals renewed by the partner")}</td><td>${mk("Operations records; the partner approves")}</td><td>${mk("DESTINATION_APPROVAL pending_partner → approved for every receiving account the route will pay, with the partner's reference")}</td></tr>
<tr><td>${mk("4")}</td><td>${mk("Rates: the pair's rate-source chain confirmed and a fresh partner rate version confirmed")}</td><td>${mk("Operations enters; Finance confirms")}</td><td>${mk("PAIR_RATE_SOURCE rows present; one PARTNER_RATE_VERSION usable (not breached, not flagged); the breach rules of Calculation Specification 2a applied with the thin-history fallback")}</td></tr>
<tr><td>${mk("5")}</td><td>${mk("Fees validated: the fee structure, tiers, rounding and partner fee re-stated as a new version with an effective date")}</td><td>${mk("Finance proposes; Management approves")}</td><td>${mk("The acceptance vector of the product recomputed (the B row of the Calculation Specification for its fee-sheet line, or a new B row NPL supplies) and matching")}</td></tr>
<tr><td>${mk("6")}</td><td>${mk("Test deal on staging through the whole flow on the project's dummy twin: quote, collection, conversion, settlement, confirmation")}</td><td>${mk("Operations runs; Finance checks the postings")}</td><td>${mk("The deal's identifiers, the ledger identities after it, the reconciliation against the partner's statement")}</td></tr>
<tr><td>${mk("7")}</td><td>${mk("Activation and UAT sign-off")}</td><td>${mk("Management activates; NPL signs off")}</td><td>${mk("The validation report of the block with every rule passed; the APPROVAL that set PARTNER_PAIR.status to active; the sign-off recorded with the proposal")}</td></tr>
</tbody></table>
<p>${mk("The acceptance test (Test Strategy S-DORM) attempts a quote and a collection on a dormant route before, during and after the checklist: refused until the last step, then priced; a route reactivated with a step missing stays refused. Deactivation is the same change in reverse: a route not used for a period NPL sets (a THRESHOLD of the project) is reported on the quarterly review and may be set dormant again by the same proposal path, which suspends its approvals and endpoints without deleting anything.")}</p>

<h2>Workflow names (awaiting NPL)</h2>
<p>Pete asked for more intuitive names for several workflows without saying which. The renaming waits for NPL's list. When it arrives, the names change in the Workflow Tree, the common procedures (C1 to C10), the state tables of the Lifecycle &amp; Approvals document and this catalogue, and the old names are kept in the glossary (ERD Appendix A.1) with a pointer to the new ones, so that older references still resolve. Nothing else in the pack depends on a workflow's name: codes and identifiers are unchanged by a rename.</p>

<h2 class="pb">Part 2 · Shared operational flows</h2>
<p>Defined once and referenced by number from the scenarios above. The step-by-step version of each, with who does what and the evidence recorded, is in the Operating Procedures (common procedures C1–C10).</p>
${flows}

<h2 class="pb">Part 3 · Guided walkthroughs</h2>
<p>Each walkthrough lights up the path a deal takes on the interactive map, one entity at a time. They are listed here so the catalogue is complete on paper.</p>
${walks}
<h2 class="pb">Part 4 · Worked examples: one deal through the model, class by class</h2>
<p>Pete asked for each key workflow to be supported by one example that traces the transaction from beginning to end through the ERD, showing how each entity is affected, with a ledger view of how the numbers move. The seven examples below follow the seven classes of the Workflow Tree that carry figures (class 1, Configure &amp; set up, carries none). They reuse the figures of the pack: project Evo, Sender A, Receiver X (entities X1, X2) in the default group, Ali converting at 0.8910 against market 0.9000, fee 2.00 % split 1.40 % sender and 0.60 % receiver; the T numbers are the Ledger Posting Design's and the L numbers the Calculation Specification's, so every figure here can be checked there. The same examples become test fixtures in Phase 1 (M2 to M5).</p>
<h3>X1 · Rates and quote (classes 2 and 3): deal 1 is priced and sent</h3>
<p>A quote-first deal of 10,000 USDT for Receiver X.</p>
<table class="x"><colgroup><col style="width:13%"><col style="width:25%"><col style="width:22%"><col style="width:23%"><col></colgroup><thead><tr><th>Step</th><th>Record written (ERD)</th><th>Figure (Calculation Specification)</th><th>Posting (Ledger Posting Design)</th><th>Balances after</th></tr></thead><tbody>
<tr><td class="k">1. Ali's rate of the day</td><td>PARTNER_RATE_VERSION: quoted 0.8910 EUR per USDT, direction as the pair; RATE_COMPARISON for Ali × USDT→EUR today; MARKET_RATE 0.9000 from Kraken</td><td>spread = 1 − 0.8910 ÷ 0.9000 = 1.00 %; two-week average 1.00 %, threshold 20 %: no breach (§2); Finance confirms the version</td><td>none</td><td>—</td></tr>
<tr><td class="k">2. Price the inquiry</td><td>DEAL_GROUP (project Evo, Sender A, group DEFAULT, entry_mode quote_first, fee_structure_id stamped); DEAL leg 1 forward, priced_at now, partner_entity PT-tour; DEAL_FEE_TIER none (Evo has no tiers)</td><td>principal 10,000 × 0.9000 = 9,000.00; sender part 1.40 % = 126.00; receiver part 0.60 % = 54.00; sender rate 0.88740; gross out 8,874.00; client net 8,820.00 (§3, vector L1)</td><td>none: nothing posts at pricing</td><td>—</td></tr>
<tr><td class="k">3. Send the package</td><td>QUOTE_PACKAGE issue 1 with sent_at and quote_hash; validity 60 minutes from sent_at (PROJECT)</td><td>the package prints the sender-facing figures only: sender rate 0.88740, customer-facing fee 2.00 %, amount out 8,874.00, valid until</td><td>none</td><td>—</td></tr>
<tr><td class="k">4. Sender accepts; wallet screened; instructions issued</td><td>WALLET_SCREENING accept on Sender A's address; COLLECTION pending on PT-tour's TRC-20 endpoint; DEAL state Collecting</td><td>—</td><td>none</td><td>—</td></tr>
</tbody></table>
<p>Pricing fields are now write-once. If Ali's version had breached, the pair would be frozen and step 2 could not run (Figure 3); if Sender A had let the validity lapse, Section 3.2 of the tree applies (grace, then re-quote).</p>
<h3>X2 · Collect (class 4): the 10,000 USDT arrive</h3>
<p>Sender A pays and shares the hash.</p>
<table class="x"><colgroup><col style="width:13%"><col style="width:25%"><col style="width:22%"><col style="width:23%"><col></colgroup><thead><tr><th>Step</th><th>Record written (ERD)</th><th>Figure (Calculation Specification)</th><th>Posting (Ledger Posting Design)</th><th>Balances after</th></tr></thead><tbody>
<tr><td class="k">1. Hash checked</td><td>COLLECTION: tx_hash, explorer result attached (address, amount, confirmations), partner confirmation; verified_by Operations, verified_at</td><td>10,000.00 USDT received = amount_in; no over- or underpayment</td><td>T1: CL.ALI.USDT.COLLECTED Dr 10,000.00 · CL.PROJECT.USDT.PAYABLE Cr 10,000.00 (receiver_group DEFAULT)</td><td>COLLECTED at Ali 10,000.00 USDT; PAYABLE 10,000.00 USDT; GROUP_ENTITLEMENT DEFAULT 10,000.00 USDT</td></tr>
<tr><td class="k">2. Deal state</td><td>DEAL Collected; on a bank-channel pair also rate_locked_at and conversion_due_date (C9); here USDT→EUR at Ali needs_bank_lock, locked before 14:30 Hong Kong, so due today</td><td>—</td><td>none</td><td>unchanged</td></tr>
</tbody></table>
<p>Had 10,050 arrived, the extra 50 would be a SENDER_CREDIT (T28); had 9,000 arrived, the deal would wait in Collecting for Finance to decide (A.3).</p>
<h3>X3 · Convert (class 5): Ali converts</h3>
<p>Operations instructs, Finance approves, Ali books.</p>
<table class="x"><colgroup><col style="width:13%"><col style="width:25%"><col style="width:22%"><col style="width:23%"><col></colgroup><thead><tr><th>Step</th><th>Record written (ERD)</th><th>Figure (Calculation Specification)</th><th>Posting (Ledger Posting Design)</th><th>Balances after</th></tr></thead><tbody>
<tr><td class="k">1. Instruct</td><td>CONVERSION expected_out 8,910.00 (10,000 × 0.8910), calc_mode partner_calculates, state Expected; APPROVAL price/convert by Finance</td><td>expected_out = amount_in × partner rate (§12)</td><td>none</td><td>unchanged</td></tr>
<tr><td class="k">2. Ali books</td><td>CONVERSION actual_out 8,910.00, variance 0.00, state Booked → Approved; fee_receiver_part 54.00 taken here (receiver_fee_timing at_conversion)</td><td>delivered 8,910.00; client net 8,820.00; NPL earnings 90.00 = delivered − client net (§8, L1)</td><td>T2: PAYABLE USDT Dr 10,000 · COLLECTED Cr 10,000 · CL.ALI.EUR.DUE Dr 8,820.00 · CO.ALI.EUR.POOL Dr 90.00 · CL.PROJECT.EUR.PAYABLE Cr 8,820.00 · CO.NONE.EUR.EARN_GROSS Cr 90.00</td><td>DUE at Ali 8,820.00 EUR (PROJECT_BALANCE); PAYABLE 8,820.00 EUR; POOL 90.00; EARN_GROSS 90.00; USDT jars 0</td></tr>
</tbody></table>
<p>This is the only moment client money becomes NPL's. Through Jeton instead (fee on market 1.25 %) the same deal posts as T14: EXP_PARTNER 112.50, POOL 67.50, EARN_GROSS 180.00 (L2).</p>
<h3>X4 · Settle (class 6): the euros are paid out</h3>
<p>A run that also pays deal 2 and the EUR pass-through, 18,090.00 in all.</p>
<table class="x"><colgroup><col style="width:13%"><col style="width:25%"><col style="width:22%"><col style="width:23%"><col></colgroup><thead><tr><th>Step</th><th>Record written (ERD)</th><th>Figure (Calculation Specification)</th><th>Posting (Ledger Posting Design)</th><th>Balances after</th></tr></thead><tbody>
<tr><td class="k">1. Prepare</td><td>SETTLEMENT (project Evo, rail "Ali's EU bank / EMI", narrative PT Global Inc, total 18,090.00); SETTLEMENT_LINE X1 8,000.00 and X2 10,090.00, each with deal_id and an approved DESTINATION_APPROVAL</td><td>amount_rounding exact: cents go out (§9)</td><td>none</td><td>unchanged</td></tr>
<tr><td class="k">2. Approve and release</td><td>APPROVAL by Finance (below the 50,000 EUR settlement limit, first slot of the day); Ali releases; SETTLEMENT released_at; lines outcome sent, released_at, expected_confirmation_by = release + rail time</td><td>—</td><td>T7: CL.PROJECT.EUR.PAYABLE Dr 18,090.00 · CL.ALI.EUR.DUE Cr 18,090.00</td><td>DUE 0; PAYABLE 0; the two lines are "sent, not yet confirmed"</td></tr>
<tr><td class="k">3. Confirm</td><td>CONFIRMATION line 1 full; line 2 short, 10,040.00 received; SHORTFALL 50.00 open for Receiver X</td><td>bank fee 50.00; treatment carry_forward</td><td>T8 nothing; T9: CL.RECEIVER_X.EUR.SHORTFALL Dr 50.00 · PAYABLE Cr 50.00</td><td>SHORTFALL 50.00; PAYABLE 50.00</td></tr>
<tr><td class="k">4. Top up at the next run</td><td>BANK_FEE_EVENT applied; Management approves the top-up from the pool</td><td>NPL bears 50.00</td><td>T10: EXP_BANKFEE Dr 50.00 · POOL Cr 50.00 · DUE Dr 50.00 · SHORTFALL Cr 50.00</td><td>DUE 50.00 (out with the next run); POOL 225.00 after the three deals; EXP_BANKFEE 50.00</td></tr>
</tbody></table>
<p>Red bar of Figure 2: after release nothing is cancelled. Had line 2 been rejected by the bank instead, X5 applies.</p>
<h3>X5 · Exceptions (class 7): a returned payout, and a reroute with custody</h3>
<p>Two of the five sub-classes, with the figures of Patterns F and D.</p>
<table class="x"><colgroup><col style="width:13%"><col style="width:25%"><col style="width:22%"><col style="width:23%"><col></colgroup><thead><tr><th>Step</th><th>Record written (ERD)</th><th>Figure (Calculation Specification)</th><th>Posting (Ledger Posting Design)</th><th>Balances after</th></tr></thead><tbody>
<tr><td class="k">1. Bank rejects a GBP payout (deal 6, 2,000 USDT)</td><td>SETTLEMENT_RETURN returned_amount 1,513.80, fee_kept 15.00; line outcome returned</td><td>client net 1,528.80 (L5); bounce fee 15.00 absorbed</td><td>T24: DUE Dr 1,513.80 · PAYABLE Cr 1,513.80 · EXP_BANKFEE Dr 15.00 · POOL GBP Cr 15.00 · DUE Dr 15.00 · PAYABLE Cr 15.00</td><td>DUE GBP 1,528.80 again; POOL GBP −15.00 until squared (T24a: 19.43 USDT of NPL's converted)</td></tr>
<tr><td class="k">2. Return to the sender (C6a outcome 3)</td><td>DEAL return leg, funding_source returned_settlement; FEE_DECISION markup waived; CONVERSION GBP→USDT at 1.2850; settlement line to the sender_return receiver</td><td>1,528.80 × 1.2850 = 1,964.51 USDT, no fee (§16)</td><td>T25: PAYABLE GBP Dr 1,528.80 · DUE GBP Cr 1,528.80 · DUE USDT Dr 1,964.51 · PAYABLE USDT Cr 1,964.51; then a line as T23</td><td>NPL's 15.60 GBP margin from the first conversion stays in the pool</td></tr>
<tr><td class="k">3. Ali unavailable before conversion (deal 3)</td><td>REROUTE phase post_collection, outcome via_own_wallet, alternate Jeton, forward_and_recover_dues 30.00; OWN_WALLET AQN-LT-SUB; CUSTODY view shows the balance and its age</td><td>—</td><td>T12: CL.OWN.USDT.HELD Dr 10,000 · PAYABLE Cr 10,000; T13: CL.JETON.USDT.COLLECTED Dr 10,000 · HELD Cr 10,000 · CO.OWN.USDT.WALLET Dr 30.00 · CO.JETON.USDT.POOL Cr 30.00</td><td>HELD 0 after the forward; Jeton owes 30.00 less; then T14 converts at Jeton</td></tr>
<tr><td class="k">4. Ali cannot pay out after converting (2b case 3)</td><td>REROUTE phase post_conversion with return_conversion_id, second_conversion_id, rate_difference −79.77, ratified_by Management</td><td>Ali back-converts 8,820.00 EUR at 1.1150 = 9,834.30 USDT; Jeton converts at 0.9000 less 1.25 %: delivered 8,740.23</td><td>T56, T57, T58 (Pattern O): client net 8,820.00 unchanged; EXP_PARTNER 110.64; VAR_CONVERSION Cr 30.87; POOL at Jeton Cr 79.77</td><td>DUE at Jeton 8,820.00; POOL at Jeton −79.77 until squared; POOL at Ali 90.00 untouched</td></tr>
</tbody></table>
<p>Money that has moved is never rolled back: each step is a new posting, and the client's entitlement is the same figure throughout.</p>
<h3>X6 · Balances, retention and offsets (classes 5.2 and 7.4): money that moves without a new deal</h3>
<p>Patterns H and N.</p>
<table class="x"><colgroup><col style="width:13%"><col style="width:25%"><col style="width:22%"><col style="width:23%"><col></colgroup><thead><tr><th>Step</th><th>Record written (ERD)</th><th>Figure (Calculation Specification)</th><th>Posting (Ledger Posting Design)</th><th>Balances after</th></tr></thead><tbody>
<tr><td class="k">1. Balance conversion</td><td>BALANCE_CONVERSION 5,000 SGD → USDT at Ali (Finance requests, Management approves); CONVERSION owned by it; ENTITLEMENT_REATTRIBUTION for Group B</td><td>5,000 × 0.7400 = 3,700.00 USDT, no markup (§16)</td><td>T27: PAYABLE SGD Dr 5,000 · DUE SGD Cr 5,000 · DUE USDT Dr 3,700.00 · PAYABLE USDT Cr 3,700.00</td><td>Group B entitlement now in USDT</td></tr>
<tr><td class="k">2. Earnings offset</td><td>EARNINGS_OFFSET from Jeton (2,025.00 EUR) to Ali (2,272.73 USDT at 0.8910); EARNINGS_RECEIVABLE rows at Jeton recovered_by_offset_id</td><td>2,025.00 ÷ 0.8910 = 2,272.73 USDT (§13)</td><td>T54: DUE Jeton EUR Dr 2,025 · PAYABLE EUR Cr 2,025 · PAYABLE USDT Dr 2,272.73 · COLLECTED Ali Cr 2,272.73 · POOL Ali USDT Dr 2,272.73 · FX_RESULT USDT Cr 2,272.73 · FX_RESULT EUR Dr 2,025 · POOL Jeton EUR Cr 2,025</td><td>nothing of NPL's rests at Jeton; NPL's margin now in USDT at Ali</td></tr>
<tr><td class="k">3. Retention at the next conversion</td><td>CONVERSION residual_in 1,010.10 USDT on the 100,000 USDT deal at Ali</td><td>converted_in = 100,000 − 2,272.73 − 1,010.10 = 96,717.17; delivered 86,175.00 EUR = client net 88,200.00 − 2,025.00 already at Jeton (§13)</td><td>T55</td><td>POOL at Ali 3,282.83 USDT; client EUR 86,175.00 at Ali + 2,025.00 at Jeton = entitlement 88,200.00 unchanged</td></tr>
</tbody></table>
<p>The client is neutral throughout; FX_RESULT records NPL's own currency exchange and needs no later closing.</p>
<h3>X7 · Shares, rebates and the reseller (classes 5.1, 8.2 and the NPL-GR project)</h3>
<p>Patterns J and M.</p>
<table class="x"><colgroup><col style="width:13%"><col style="width:25%"><col style="width:22%"><col style="width:23%"><col></colgroup><thead><tr><th>Step</th><th>Record written (ERD)</th><th>Figure (Calculation Specification)</th><th>Posting (Ledger Posting Design)</th><th>Balances after</th></tr></thead><tbody>
<tr><td class="k">1. Markup share accrued with a conversion</td><td>MARKUP_SHARE_ACCRUAL on deal 3, direction payable, 25 %</td><td>67.50 × 25 % = 16.88 EUR (§11)</td><td>T30: EARN_GROSS Dr 16.88 · CO.PARTY_P.EUR.SHARE_PAYABLE Cr 16.88; T31 at month end from NPL's wallet</td><td>EARN_GROSS net of shares</td></tr>
<tr><td class="k">2. Raeen sub-account and Aquanow rebate</td><td>CONVERSION at Aquanow (fee on market 0.80 %); MARKUP_SHARE_ACCRUAL receivable 144.00 (party_retains); PARTNER_REBATE_ACCRUAL expected 30.00 USDT</td><td>sender 4 % = 360.00; partner cost 72.00; share base 288.00; Raeen 50 % = 144.00; rebate 0.3 % × 10,000 = 30.00 (L6, §11)</td><td>T32: DUE 8,640 · SHARE_RECEIVABLE Dr 144 · EARN_GROSS Dr 144 · EXP_PARTNER Dr 72 · PAYABLE Cr 8,640 · EARN_GROSS Cr 360; T33: REBATE_RECEIVABLE Dr 30 · EARN_REBATE Cr 30; T34/T35 at month end (statement 29.50 → true-up 0.50)</td><td>SHARE_RECEIVABLE 144.00 until Raeen pays; EARN_REBATE 29.50 after the true-up</td></tr>
<tr><td class="k">3. NPL-GR: two invoices, one remittance deal</td><td>INVOICE vendor 9,000.00 EUR and resale 9,450.00 EUR; DEAL_GROUP target_out 10,852.09 USDT collected as THB cash 360,000 (cash-rounded); vendor paid in two instalments at the day's rates</td><td>amount_in 359,746.78 → 360,000 THB; client net 10,859.73 incl. 7.63 surplus; earnings 106.42 (L7); true-ups 0 and 35.19 (§14)</td><td>T44 to T51: RESELL_COST/VENDOR_PAYABLE, RESALE_RECEIVABLE/RESELL_REVENUE, the remittance deal as any client, VAR_FX_TIMING on each instalment, the margin line 521.76 USDT to NPL-GR's wallet</td><td>reseller revenue 450.00 EUR intact; remittance margin 144.25 USDT = 106.42 + 37.83 forex; NPL_PROFIT = both, per currency</td></tr>
</tbody></table>
<p>Rebates are NPL's alone and never in a share base; the reseller revenue is fixed when the two invoices are posted and no later transaction touches it.</p>
<p><b>Closing.</b> after X1 to X4 the identities of the Ledger Posting Design hold at every step (client assets = client liabilities per currency; PAYABLE = Σ GROUP_ENTITLEMENT; the partner's one balance = client balances + NPL's pool), and the reconciliation record of a month end (Pattern Q, T59) proves them against Ali's statement. The opening entries of the cutover (Pattern R, T60, T61) are the same shapes posted once, on the opening date.</p>
<p class="small"><i>Draft v${V} — for review with NPL. Source: NPL's Fee Outlines workbook and NPL's answers of 8–9 October 2026, consolidated into the model.</i></p>
</body></html>`;

const base = REVIEW ? "NPLify-Scenario-Catalogue-review" : `NPLify-Scenario-Catalogue-v${V}`;
const h = path.join(outDir, base + ".html"), p = path.join(outDir, base + ".pdf");
fs.writeFileSync(h, clientFacing(html));
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "scenarios:", total, "flows:", CAT.flows.length, "walks:", WALKS.length);
