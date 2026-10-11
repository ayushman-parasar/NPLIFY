// Build docs/NPLify-Cutover-and-Opening-Entries-v5.9.{html,pdf}: how NPL moves from the spreadsheets it runs on
// today to NPLify — a parallel run on a staging instance where the team mirrors every spreadsheet change in the
// app for some days, the backfill of earlier deals, the opening entries that give the ledger its starting
// balances, the copy of the staging database to production and a Sunday go-live — with the reconciliation
// checks, exit criteria and rollback. The opening-entries example is balanced by code before it is rendered.
//                                                                      node scripts/build-cutover-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));
const outDir = path.join(root, "docs");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const c = (s) => `<code>${esc(s)}</code>`;
const V = D.version, DATE = "11 October 2026";
const fmt = (n) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FLOWS = D.SCENARIO_CATALOGUE.flows; // [code, name, description, tables]

// ------------------------------------------------------------------ the opening entries example (Client 1, the FRS project, as at the cut date)
// One LEDGER_TRANSACTION per project × currency, source Opening (proposed). Client lines balance among themselves
// (client assets at partners = PAYABLE to the project's receivers, per currency); company lines balance against
// CO.NONE.<CCY>.OPENING, the proposed opening-equity purpose. Checked below: Σ per currency = 0 and Σ per owner = 0.
const OPENING = [
  { ccy: "EUR", rows: [
    ["CL.ALI.EUR.DUE", "Dr", 12400.00, "client", "DEFAULT", "converted at Ali, waiting to be settled (PROJECT_BALANCE)"],
    ["CL.ALI.EUR.DUE", "Dr", 1850.00, "client", "DEFAULT", "a second deal, converted, awaiting the partner's release"],
    ["CL.PROJECT.EUR.PAYABLE", "Cr", 14250.00, "client", "DEFAULT", "owed to the default group's receivers (GROUP_ENTITLEMENT)"],
    ["CO.ALI.EUR.POOL", "Dr", 310.55, "company", "", "NPL's margin captured at conversion and still at Ali (EARNINGS_RECEIVABLE)"],
    ["CO.NONE.EUR.OPENING", "Cr", 310.55, "company", "", "opening equity, EUR (proposed purpose)"],
  ] },
  { ccy: "USDT", rows: [
    ["CL.ALI.USDT.COLLECTED", "Dr", 3000.00, "client", "DEFAULT", "verified, not yet converted (deal D-261010-003 in Collected)"],
    ["CL.PROJECT.USDT.PAYABLE", "Cr", 3000.00, "client", "DEFAULT", "the same deal's obligation, in the collected currency until conversion"],
    ["CL.SND_A.USDT.CREDIT", "Cr", 25.00, "client", "DEFAULT", "an overpayment owed back to Sender A (SENDER_CREDIT)"],
    ["CL.ALI.USDT.COLLECTED", "Dr", 25.00, "client", "DEFAULT", "the overpaid part, still at Ali"],
    ["CO.JETON.USDT.REBATE_RECEIVABLE", "Dr", 48.00, "company", "", "September rebate accrued, not yet received from Jeton"],
    ["CO.OWN.USDT.WALLET", "Dr", 1250.00, "company", "", "NPL's own money in the Aquanow wallet"],
    ["CO.NONE.USDT.OPENING", "Cr", 1298.00, "company", "", "opening equity, USDT (proposed purpose)"],
  ] },
];
for (const t of OPENING) {
  const byOwner = {};
  for (const [acct, side, amt, owner] of t.rows) byOwner[owner] = (byOwner[owner] || 0) + (side === "Dr" ? amt : -amt);
  for (const [o, v] of Object.entries(byOwner)) if (Math.abs(v) > 1e-9) throw new Error(`opening ${t.ccy} not balanced for ${o}: ${v}`);
  const total = Object.values(byOwner).reduce((a, b) => a + b, 0);
  if (Math.abs(total) > 1e-9) throw new Error(`opening ${t.ccy} not balanced: ${total}`);
}

// ------------------------------------------------------------------ reconciliation checks run every day of the parallel run and once more at go-live
const CHECKS = [
  ["Balance at each partner, per currency", "PROJECT_BALANCE per project × partner × currency", "The sheet's partner balance for the same project and currency", "Exact", "Finance"],
  ["Money collected and not yet converted", "Σ CL.<PARTNER>.<CCY>.COLLECTED", "Open collections on the sheet", "Exact", "Finance"],
  ["Owed to receivers, per group", "GROUP_ENTITLEMENT", "The sheet's outstanding payouts by receiver", "Exact", "Finance"],
  ["Open deals and their states", "DEAL_GROUP / DEAL lists by state", "The sheet's deal register", "Same set of references; states agree", "Operations"],
  ["Today's deals", "Every deal group created today", "Every row added to the sheet today", "One-to-one, same amounts, same partner", "Operations"],
  ["Sender credits and shortfalls", "CL.<SENDER>.CREDIT, CL.<RECEIVER>.SHORTFALL", "The sheet's notes column", "Exact", "Finance"],
  ["NPL's money at partners and in own wallets", "CO.<PARTNER>.POOL, CO.OWN.WALLET, CUSTODY", "The sheet's pool and wallet lines; the wallet's on-chain balance", "Exact; on-chain within pending transfers", "Finance"],
  ["Margin of the day", "EARN_GROSS postings of the day, per deal", "The sheet's margin column (or the Calculation Specification's vectors where the sheet has none)", "Within the pair's rounding", "Finance"],
  ["Rebates and shares accrued", "PARTNER_REBATE_ACCRUAL, MARKUP_SHARE_ACCRUAL", "The sheet's monthly rebate and share working", "Exact at month end", "Finance"],
  ["Invoices (NPL-GR)", "INVOICE_BALANCE", "The reseller workbook's open invoices and instalments", "Exact", "Finance"],
  ["Invariants", "The 44 invariants of ERD v" + V + " as database checks", "—", "Zero violations", "Engineering"],
  ["Visibility", "A sample of screens and exports per role", "Roles & Visibility v" + V + " §6 tests", "All pass", "Engineering with Management"],
];

// ------------------------------------------------------------------ timeline figure
const timeline = `<figure class="chart"><svg viewBox="0 0 760 250" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline: prepare, parallel run on staging with backfill alongside, go/no-go on Friday, copy to production on Sunday, first live day Monday, sheets read-only for four weeks">
<style>.t{font:700 9.6px Helvetica,Arial,sans-serif;fill:#111}.s{font:8.4px Helvetica,Arial,sans-serif;fill:#333}.h{font:700 10px Helvetica,Arial,sans-serif;fill:#2f5d9e}</style>
<line x1="20" y1="120" x2="740" y2="120" stroke="#333" stroke-width="1.5"/>
<rect x="20" y="60" width="120" height="48" rx="6" fill="#f3f6fb" stroke="#2f5d9e"/><text x="30" y="78" class="t">0 · Prepare</text><text x="30" y="91" class="s">configuration, users,</text><text x="30" y="102" class="s">opening entries as at D−14</text>
<rect x="160" y="60" width="270" height="48" rx="6" fill="#f3f6fb" stroke="#2f5d9e"/><text x="170" y="78" class="t">1 · Parallel run on staging (about two weeks)</text><text x="170" y="91" class="s">every spreadsheet change mirrored in the app the same day;</text><text x="170" y="102" class="s">daily reconciliation; discrepancy log; exit criteria</text>
<rect x="160" y="140" width="270" height="40" rx="6" fill="#fff" stroke="#2f5d9e" stroke-dasharray="4 2"/><text x="170" y="157" class="t">2 · Backfill, alongside</text><text x="170" y="170" class="s">earlier deals loaded as closed, imported records (no postings)</text>
<rect x="450" y="60" width="90" height="48" rx="6" fill="#fff8e6" stroke="#b8860b"/><text x="460" y="78" class="t">3 · Friday</text><text x="460" y="91" class="s">freeze, final</text><text x="460" y="102" class="s">reconciliation, go / no-go</text>
<rect x="560" y="60" width="90" height="48" rx="6" fill="#eaf3ea" stroke="#2f7d3c"/><text x="570" y="78" class="t">4 · Sunday</text><text x="570" y="91" class="s">reset production,</text><text x="570" y="102" class="s">copy, verify, switch</text>
<rect x="670" y="60" width="70" height="48" rx="6" fill="#eaf3ea" stroke="#2f7d3c"/><text x="680" y="78" class="t">5 · Monday</text><text x="680" y="91" class="s">first live day</text><text x="680" y="102" class="s">in production</text>
<rect x="560" y="140" width="180" height="40" rx="6" fill="#fff" stroke="#2f7d3c" stroke-dasharray="4 2"/><text x="570" y="157" class="t">6 · After</text><text x="570" y="170" class="s">sheets read-only for four weeks; staging removed</text>
<text x="20" y="135" class="s">D−14</text><text x="160" y="135" class="s">D−13</text><text x="455" y="135" class="s">D−2</text><text x="565" y="135" class="s">D (Sunday)</text><text x="675" y="135" class="s">D+1</text>
<text x="20" y="215" class="h">D is the Sunday NPL picks. The opening date is the close of the last business day before the parallel run starts; nothing before it is posted.</text>
</svg><figcaption>Figure 1 — The cutover in six steps. Only steps 3 and 4 touch production; everything before them is on the staging instance and reversible.</figcaption></figure>`;

const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;margin:0}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
p{margin:0 0 7pt} ul,ol{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 3pt}
code,.mono{font:8.8pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;margin:4pt 0 8pt;font-size:9.2pt}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt;vertical-align:bottom;background:#f3f6fb}
td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr{break-inside:avoid}
.title{text-align:center;margin-top:40mm}
.title .sub{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 10pt}
.title .org{margin:0 0 2pt} .title .date{margin:0 0 16pt}
.rule{border-top:2px solid #222;border-bottom:1px solid #222;height:2px;margin:10pt 0 14pt}
.pb{break-before:page}
.box{border:1px solid #2f5d9e;background:#f3f6fb;padding:6pt 9pt;margin:8pt 0;font-size:9.8pt}
.warn{border:1px solid #b8860b;background:#fff8e6;padding:6pt 9pt;margin:8pt 0;font-size:9.8pt}
.small{font-size:9pt;color:#444}
figure.chart{margin:8pt 0 12pt;break-inside:avoid} figcaption{font:italic 9.5pt Georgia,serif;margin-top:3pt}
td.k{font-weight:700;white-space:nowrap}
`;

const openingTables = OPENING.map((t) => `<h3>Opening ${esc(t.ccy)} — one transaction, source Opening, posted on the opening date</h3>
<table><thead><tr><th style="width:30%">Account</th><th style="width:6%">Side</th><th style="width:12%;text-align:right">Amount</th><th style="width:9%">Owner</th><th style="width:9%">Group</th><th>Why</th></tr></thead><tbody>
${t.rows.map((r) => `<tr><td class="mono">${esc(r[0])}</td><td>${r[1]}</td><td class="n">${fmt(r[2])}</td><td>${r[3]}</td><td>${esc(r[4])}</td><td>${esc(r[5])}</td></tr>`).join("")}
</tbody></table>`).join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Cutover &amp; Opening Entries v${V}</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Deliverable 9 — Cutover &amp; Opening-Entries Approach · Draft v${V}</p><p class="small">Numbered with the ERD edition it is built against.</p><p class="org">New XP Technologies Limited</p><p class="date">${DATE} · Confidential</p></div>
<p><b>Status:</b> NPL's plan of 11 October 2026, written out against ERD &amp; Data Model Draft v${V}, the Ledger Posting Design v${V}, the Configuration Schema v${V} and the Architecture &amp; Stack Note v${V}. NPL runs on spreadsheets today. The plan is to start using NPLify on a staging instance: after every change to a spreadsheet the team makes the same change in the app, for some days, to see that things go in the right direction; earlier deals are added so the history is in one place; when everything is right the database is copied to production and the production app is used from a quiet Sunday. This document gives that plan its steps, its checks and its arithmetic — above all the opening entries, which are what makes the first live posting land on a correct balance.<br>
<b>Audience:</b> NPL Management and Finance, who run the parallel days and sign the go/no-go, and the New XP engineering team.</p>
<div class="rule"></div>

<h2>1 · The approach in one page</h2>
<p>Three things have to be true on the Sunday evening: the configuration in the app describes NPL's business as it is (Configuration Schema v${V}), the ledger's balances equal the spreadsheets' balances to the cent, and the team has already run real days in the app and trusts it. The plan gets there without touching production until the last day:</p>
<ol>
<li><b>Prepare.</b> Load the configuration (clients, projects, partners, pairs, fee structures, parties, accounts, templates, users and roles) into the staging instance from the import format; validate it against the schema rules; fix the spreadsheets' inconsistencies that the validation surfaces before going further.</li>
<li><b>Open the books.</b> Choose the opening date: the close of the last business day before the parallel run. Take every balance the spreadsheets show at that close and post it as opening entries (Section 4). Reconcile: the app's balances now equal the sheets'.</li>
<li><b>Run in parallel on staging.</b> For about two weeks the spreadsheets stay the system of record and the app is run beside them: every change made to a sheet is made in the app the same day, by the same person, through the normal screens and approvals. Finance reconciles every evening (Section 6); every difference goes in the discrepancy log and is explained before the next day starts.</li>
<li><b>Backfill alongside.</b> Earlier deals — closed before the opening date — are loaded as imported records so they can be found and reported, without postings (Section 5).</li>
<li><b>Go / no-go on the Friday.</b> The exit criteria of Section 7 are met or the run is extended; Management signs.</li>
<li><b>Sunday.</b> Freeze the sheets after Friday's close; final reconciliation on Saturday; on Sunday reset production once, copy the staging database and the file bucket to it, verify, point the users at production. Monday is the first live day; the sheets stay read-only for four weeks as the fallback; the staging instance is removed.</li>
</ol>
${timeline}
<div class="box"><b>What the parallel run proves, and what it does not.</b> It proves that the configuration prices and routes NPL's real deals the way NPL does, that the postings of each day reproduce the sheets' balances, and that the team can run its day in the app. It does not prove the ledger's arithmetic — that is the Calculation Specification's acceptance vectors and the Ledger Posting Design's worked transactions, which the build already passes — and it does not test every pattern of the Scenario Catalogue: the days will bring whichever deals they bring. Patterns that do not occur in the run are exercised once each on staging as scripted test deals before the go/no-go (Section 7).</div>

<h2 class="pb">2 · Starting point: the spreadsheets</h2>
<p>NPL's workbooks are the source of every figure the cutover loads, and the yardstick of every check. Three kinds of content are taken from them:</p>
<table><thead><tr><th style="width:24%">In the sheets</th><th style="width:38%">Becomes in NPLify</th><th>Notes</th></tr></thead><tbody>
<tr><td class="k">Master data</td><td>CLIENT, PROJECT, PARTNER (with cutoffs and holidays), CURRENCY_PAIR and rate chains, FEE_STRUCTURE and FEE_TIER per partner × pair, FEE_OVERRIDE, SENDER with allow-lists, RECEIVER_GROUP, RECEIVER, RECEIVING_ENTITY and accounts, PARTNER_ENTITY and endpoints, DESTINATION_APPROVAL, MARKUP_SHARE and PARTNER_REBATE rules, MESSAGE_TEMPLATE, SYSTEM_SETTING, USER / ROLE / ROLE_RIGHT</td><td>The Project Context and Payment methods tabs, the fee table and NPL's answers of 8 October are the sources; the Configuration Schema's import format is the vehicle; its Section 6 rules are the validation.</td></tr>
<tr><td class="k">Balances at the opening date</td><td>Opening entries (Section 4): client money at each partner (converted and not yet converted), owed to receivers by group, sender credits, shortfalls, NPL's pool at each partner, own-wallet balances, rebates and shares receivable or payable, open loss receivables, and for NPL-GR the open vendor and resale invoices</td><td>Taken from each sheet's balance lines at the close of the opening date; one transaction per project × currency.</td></tr>
<tr><td class="k">Deals</td><td>Open deals at the opening date: created in the app in their current state with their stamped figures (Section 4.3). Closed deals before the opening date: imported records (Section 5). Deals from the opening date on: entered day by day during the parallel run.</td><td>The sheet's deal reference becomes DEAL_GROUP.client_ref, so a row in the sheet and a deal in the app are the same thing by name.</td></tr>
</tbody></table>
<p>The validation will surface things the sheets never had to state: a receiver with no approved destination at a partner, a sender with no allow-list, a fee structure whose parts do not add up, a partner with a bank cutoff but no time zone, a pair with no rate source. Each is resolved with NPL before the run — the run must start from a configuration that passes.</p>

<h2>3 · The staging instance and the rules of the parallel run</h2>
<p>Staging is a second copy of the production stack in NPL's AWS account (Architecture &amp; Stack Note §8): the same image, its own database and bucket, its own sign-in. It exists for the weeks of the run and is removed after go-live. Four rules make the run meaningful:</p>
<ol>
<li><b>The sheets lead, the app follows — the same day.</b> Whoever changes a sheet makes the same change in the app before the end of their shift, as the person they are (Operations enters, Finance approves, Management escalates), through the normal screens. No bulk entry, no "Finance types everything": the point is that the roles and approvals are exercised.</li>
<li><b>Real values, real timestamps.</b> The partner's rate as quoted, the market rate at the time (the app captures its own; the sheet's rate is a check), the real cutoff, the real evidence attached. Where the app's clock would have expired a quote the sheet kept alive, the discrepancy log says so: that is a finding about policy, not an error.</li>
<li><b>Outside services point at copies.</b> Rates, hash checks and the authenticator app work as in production. The client journal writes to a <i>copy</i> of each client's sheet, never to the client's real sheet, until go-live. No message rendered on staging is sent to a sender or receiver; quote packages are rendered and filed only.</li>
<li><b>Finance reconciles every evening</b> with the checks of Section 6, before the next day's first deal. A difference is either fixed in the app (an entry missed or mis-entered), fixed in the sheet (the sheet was wrong — these are findings NPL wants), or explained as a known difference of method (rounding at the pair's unit, a fee part the sheet computes differently) and recorded. A difference that cannot be explained stops the run until it is.</li>
</ol>
<div class="warn"><b>Two things the staging days are not.</b> They are not training on test data — that happens on the local environment before the run starts, with the Ledger Posting Design's worked transactions as the exercises. And they are not optional for Finance: the opening entries and the daily reconciliation are Finance's work, and the go/no-go is signed on Finance's log.</div>

<h2 class="pb">4 · Opening entries</h2>
<p>The ledger is append-only and every balance is a sum over postings (invariants 2 and 10), so the balances the sheets show at the opening date must themselves be postings. They are posted as <b>opening entries</b>: one ${c("LEDGER_TRANSACTION")} per project × currency, on the opening date, with ${c("source_type")} Opening and the Finance user who prepared it as ${c("posted_by")}, approved by Management before posting like any adjustment. Opening entries obey the same rules as every other transaction — balanced per currency and per ownership tag (invariant 1), a ${c("receiver_group_id")} on every PAYABLE line (invariant 7) — which is what makes the first live posting land on a correct balance.</p>
<h3>4.1 What is opened, account by account</h3>
<table><thead><tr><th style="width:34%">Account (OWNER.HOLDER.CCY.PURPOSE)</th><th>Opening balance taken from the sheet</th></tr></thead><tbody>
<tr><td class="mono">CL.&lt;PARTNER&gt;.&lt;CCY&gt;.DUE</td><td>Converted client money resting at the partner, waiting to be settled — the sheet's partner balance per currency. One debit per partner × currency.</td></tr>
<tr><td class="mono">CL.&lt;PARTNER&gt;.&lt;CCY&gt;.COLLECTED</td><td>Verified collections not yet converted, in the collection currency, per open deal.</td></tr>
<tr><td class="mono">CL.OWN.&lt;CCY&gt;.HELD</td><td>Client money in NPL's own wallet at the opening date (an approved reroute or a bridge hop in flight). Expected zero (invariant 3); if not zero, the reroute is created as an open record too.</td></tr>
<tr><td class="mono">CL.&lt;RECEIVER&gt;.&lt;CCY&gt;.SHORTFALL</td><td>Delivered short and still to be made good.</td></tr>
<tr><td class="mono">CL.PROJECT.&lt;CCY&gt;.PAYABLE</td><td>What is owed to the project's receivers, per currency, one credit line per receiver group (the sheet's outstanding payouts by receiver, summed by group). Σ PAYABLE + CREDIT = Σ DUE + COLLECTED + HELD + SHORTFALL + MAKEGOOD per currency, by construction of the model; where the sheet does not balance, the difference is found before posting (4.4).</td></tr>
<tr><td class="mono">CL.&lt;SENDER&gt;.&lt;CCY&gt;.CREDIT</td><td>Overpayments owed back to senders (SENDER_CREDIT rows are created with them).</td></tr>
<tr><td class="mono">CL.PROJECT.&lt;CCY&gt;.MAKEGOOD · CO.NONE.&lt;CCY&gt;.LOSS_PAYABLE</td><td>An unfunded make-good from a loss before the opening date, if any (LOSS_EVENT created as approved with its funding fields).</td></tr>
<tr><td class="mono">CO.&lt;PARTNER&gt;.&lt;CCY&gt;.POOL</td><td>NPL's own money at the partner: margin captured and not yet settled, plus anything NPL placed there. EARNINGS_RECEIVABLE rows are created for the margin part so an offset or a settlement can name them later.</td></tr>
<tr><td class="mono">CO.OWN.&lt;CCY&gt;.WALLET</td><td>NPL's own money in its wallets, agreed to the on-chain balance.</td></tr>
<tr><td class="mono">CO.&lt;PARTNER&gt;.&lt;CCY&gt;.REBATE_RECEIVABLE · CO.&lt;PARTY&gt;.&lt;CCY&gt;.SHARE_PAYABLE / SHARE_RECEIVABLE</td><td>Accrued and not yet settled at the opening date, from the month's working. The accrual rows are created in state accrued so the month-end statement includes them.</td></tr>
<tr><td class="mono">CO.&lt;PARTNER|SENDER&gt;.&lt;CCY&gt;.LOSS_RECEIVABLE</td><td>Agreed loss shares not yet received (LOSS_RECOVERY rows in state agreed).</td></tr>
<tr><td class="mono">CO.&lt;VENDOR&gt;.EUR.VENDOR_PAYABLE · CO.&lt;CUSTOMER&gt;.EUR.RESALE_RECEIVABLE · CO.PROJECT.EUR.REMIT_CLAIM</td><td>NPL-GR only: the undischarged part of each open vendor and resale invoice, in the invoice currency, with INVOICE rows created so INVOICE_BALANCE and the instalment lines work from day one. The revenue and cost of those invoices were recognised in the sheets' period and are <i>not</i> re-posted (4.4).</td></tr>
<tr><td class="mono">CO.NONE.&lt;CCY&gt;.OPENING</td><td>The counter-account of every company line: NPL's net position per currency at the opening date. Proposed as a new purpose (4.4). Never posted to again.</td></tr>
</tbody></table>
<p>Income and expense accounts (EARN_GROSS, EARN_REBATE, EXP_*, VAR_*, FX_RESULT, RESELL_REVENUE, RESELL_COST) open at zero: the app's profit and loss starts on the opening date; the period before it is the sheets'.</p>

<h3>4.2 Worked example — Client 1 (the FRS project) at the opening date</h3>
<p>The project of the Configuration Schema's worked example, with illustrative balances. Two transactions, one per currency. The client lines balance among themselves; the company lines balance against the opening-equity account. The build checks both before rendering.</p>
${openingTables}
<p class="small">Reading the EUR transaction: the two DUE lines are two converted deals at Ali; the PAYABLE line is what their receivers are owed, tagged with the default group, so GROUP_ENTITLEMENT(DEFAULT, EUR) = 14,250.00 and PROJECT_BALANCE(Client 1, Ali, EUR) = 14,250.00 from the first minute. NPL's 310.55 at Ali is the pool, and an EARNINGS_RECEIVABLE row of 310.55 is created with it. In USDT, the 3,000 collected and not yet converted is PAYABLE in USDT until the conversion posts; Sender A's 25 overpayment is a CREDIT with its SENDER_CREDIT row; the rebate Jeton owes and NPL's wallet balance are company assets against USDT opening equity.</p>

<h3>4.3 Open deals at the opening date</h3>
<p>A deal that is in flight at the opening date is created in the app in its current state, with the fields the state requires stamped as they were: the market rate and partner rate version it was priced on (entered as rows dated when they were captured), the sender rate, fee parts and tier, the partner entity and endpoint, the collection parts verified so far with their evidence, the quote package reference. The opening entries carry its money (COLLECTED or DUE and PAYABLE); the deal's own later events — conversion, settlement, confirmation — then post normally. An open deal is therefore the one place where the opening entry and a deal record must agree: the reconciliation of 4.4 checks that Σ COLLECTED + DUE of open deals in the opening entries equals the amounts on the open deal records.</p>

<h3>4.4 Rules and two proposed additions to the ERD</h3>
<ol>
<li><b>Balanced or not posted.</b> Where a sheet's client assets at partners do not equal its payables per currency, the difference is investigated before anything posts: it is a missed payout, an unrecorded fee, NPL's money mixed with client money, or a sheet error. It is never plugged with an opening line; the sheet is corrected and the opening entry re-prepared.</li>
<li><b>Opening equity, per currency.</b> The chart of accounts has no equity account because the model's company lines always balance against an income, expense or asset line of the same event. An opening balance has no event, so a counter-account is needed: ${c("CO.NONE.<CCY>.OPENING")}, kind <i>equity</i>, never posted to after the opening transaction. Its reporting-currency value is NPL's net position at the opening date. <b>Proposed ERD addition:</b> purpose OPENING in LEDGER_ACCOUNT.purpose and kind equity in LEDGER_ACCOUNT.kind.</li>
<li><b>Source Opening.</b> One transaction per project × currency names no deal; it needs its own source. <b>Proposed ERD addition:</b> ${c("LEDGER_TRANSACTION.source_type")} Opening, pointing at the PROJECT, allowed only on the opening date, prepared by Finance and approved by Management (an approval action ${c("post_opening_entries")} in ROLE_RIGHT). Invariant 2 stands: an opening entry is corrected by a reversing transaction like any other.</li>
<li><b>Invoices are posted once, and the opening entry is that once.</b> Invariant 44 says NPL-GR's vendor and resale invoices are posted once each; for an invoice open at the opening date, the opening entry carries its undischarged payable or receivable and the sheets' period carries its revenue and cost. The INVOICE row is marked imported so the Invoice source is not posted for it again.</li>
<li><b>Nothing before the opening date is posted.</b> The sheets are the books up to the opening date; the app's books begin with the opening entries. The period's margin, variances and fees are read in the sheets, and the app's profit and loss begins at zero.</li>
</ol>

<h2 class="pb">5 · Backfill: earlier deals</h2>
<p>NPL wants the earlier deals in the app so the history is in one place. They are loaded as <b>imported records</b>: a DEAL_GROUP and its DEAL legs in state closed (confirmed, returned or voided as the sheet says), with the sheet's reference as ${c("client_ref")}, the parties, partner, dates, amounts in and out, the sender rate and the partner rate as the sheet has them, and an ${c("imported")} marker with the sheet and row they came from. They carry no postings, no approvals and no evidence beyond what the sheet linked, and the screens show them as imported: searchable, reportable, countable in PROJECT_MONTH_VOLUME for the current month's tier if the opening date falls inside a month (D21), but outside the ledger. The alternative — reconstructing every posting for every past deal — would need rate versions, conversions and settlements the sheets never recorded, and would move nothing in any balance, since the opening entries already carry the result of that history.</p>
<ul>
<li><b>How far back:</b> NPL decides; the load is the same per deal, so the question is only how many rows the sheets can supply cleanly. Suggested: the current calendar year, or from each project's start if later.</li>
<li><b>Validation on load:</b> every imported deal names an existing sender, receiver, partner configuration and pair; amounts are numeric; dates are in order; a deal that fails is listed, not loaded.</li>
<li><b>When:</b> alongside the parallel run, by Operations, in batches per project; checked by Finance against the sheet's deal count and total per month.</li>
<li><b>Not imported:</b> past rate snapshots (MARKET_RATE starts with the run), past approvals, past audit. The sheets remain the record for those.</li>
</ul>
<div class="box"><b>Proposed ERD note.</b> DEAL_GROUP and DEAL gain ${c("imported_from")} (sheet and row) — nullable, set only on backfilled rows — and the walkthroughs state that an imported deal has no postings. A small addition, recorded here for the next ERD edition with the two of Section 4.4.</div>

<h2>6 · Reconciliation checks</h2>
<p>Run by Finance every evening of the parallel run, and once more on the Saturday before go-live against the frozen sheets. Each check names what the app shows, what the sheet shows and the tolerance; a check outside tolerance is a discrepancy-log entry with an owner and a resolution before the next day.</p>
<table><thead><tr><th style="width:20%">Check</th><th style="width:24%">In the app</th><th style="width:24%">In the sheets</th><th style="width:16%">Tolerance</th><th>Owner</th></tr></thead><tbody>
${CHECKS.map((r) => `<tr><td class="k">${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td></tr>`).join("")}
</tbody></table>
<p class="small">The discrepancy log is a sheet of its own: date, check, project, app figure, sheet figure, cause (app entry · sheet error · method · policy), resolution, who closed it. It is the evidence the go/no-go is signed on, and it is kept after go-live.</p>

<h2 class="pb">7 · Exit criteria and the go / no-go</h2>
<ol>
<li><b>Five consecutive business days</b> with every check of Section 6 inside tolerance at the evening reconciliation, and no discrepancy open for more than one day during the run.</li>
<li><b>Every project NPL runs today</b> has had at least one deal through the app during the run, or a scripted test deal on staging where the days brought none (the dormant Evo products need none).</li>
<li><b>The ten flows of the Scenario Catalogue</b> have each been exercised at least once on staging, by a real deal or a scripted one: ${FLOWS.map((f) => esc(f[0] + " " + f[1])).join("; ")}.</li>
<li><b>Every role has done its own work</b> in the app: Operations has quoted, verified, instructed and prepared; Finance has approved, confirmed rate versions, reconciled and recorded a recovery or an offset; Management has approved an escalation, a configuration change and a user change.</li>
<li><b>The visibility tests</b> of the Roles &amp; Visibility Matrix §6 pass on staging with NPL's real configuration.</li>
<li><b>The backfill</b> is loaded and its counts and totals per project and month agree with the sheets.</li>
<li><b>A restore has been rehearsed:</b> the staging database restored from a snapshot into a scratch instance, and the invariants checked there.</li>
<li><b>Management signs</b> the go/no-go on the Friday, on Finance's discrepancy log and the engineering checklist. A no-go extends the run by whole weeks; nothing is rushed into the Sunday.</li>
</ol>

<h2>8 · The Sunday</h2>
<table><thead><tr><th style="width:14%">When</th><th style="width:16%">Who</th><th>What</th></tr></thead><tbody>
<tr><td class="k">Friday close</td><td>Operations, Finance</td><td>Last entries of the week mirrored; the sheets are frozen (read-only copy made); the app's day is closed with the evening reconciliation.</td></tr>
<tr><td class="k">Saturday</td><td>Finance</td><td>Final reconciliation of every check against the frozen sheets; the discrepancy log closed; the opening-entry totals re-checked against the first day's reconciliation (the chain from opening to today still balances).</td></tr>
<tr><td class="k">Sunday morning</td><td>Engineering</td><td>Production reset once (the single reset of NPL's architecture page): database dropped and recreated empty, bucket emptied of test runs. Staging put in read-only mode. Database snapshot and bucket copied to production; migrations confirmed at the same schema version; the 44 invariants run as checks on production; row counts and balance totals compared with staging — identical, or the copy is repeated.</td></tr>
<tr><td class="k">Sunday afternoon</td><td>Finance, Management</td><td>Sign in to production: one screen per role compared with staging; PROJECT_BALANCE per partner, GROUP_ENTITLEMENT, CUSTODY and the exception list match Saturday's reconciliation. Client journal switched from the copies to the clients' real sheets. Management records the go-live in the audit log.</td></tr>
<tr><td class="k">Monday</td><td>Everyone</td><td>First live day in production. The sheets are not written to; whoever reaches for one records the item in the app instead. Finance reconciles Monday evening against Friday's frozen sheets plus the day's deals, as during the run.</td></tr>
<tr><td class="k">After</td><td>Engineering</td><td>Staging removed after two clean weeks in production (its last snapshot kept 30 days). The frozen sheets stay read-only for four weeks as the fallback, then are archived.</td></tr>
</tbody></table>

<h2>9 · Rollback</h2>
<p>Until the Sunday, rollback is nothing: staging is discarded or the run extended. On the Sunday, if the copy or the verification fails, production is left empty, staging goes back to read-write and the run continues; the Sunday is tried again a week later. After Monday, if the app cannot be used for a day, the team works from the frozen sheets plus Monday's app entries (the Architecture note's fallback) and enters the day into the app afterwards with the real timestamps in the evidence; the ledger is never edited to catch up, it is posted. A restore from backup is the last resort and a Management decision: the ledger is then the ledger as of the restore minute, and the gap is re-entered from the sheets.</p>

<h2>10 · Roles during the cutover</h2>
<table><thead><tr><th style="width:18%">Role</th><th>During the run</th><th>On the Sunday</th></tr></thead><tbody>
<tr><td class="k">Operations</td><td>Mirrors every operational change the same day; loads the backfill in batches; reports what the app would not let them do (a finding either way).</td><td>Nothing to do; first live entries on Monday.</td></tr>
<tr><td class="k">Finance</td><td>Prepares the opening entries; approves as Finance in the app; reconciles every evening; owns the discrepancy log.</td><td>Saturday's final reconciliation; Sunday's sign-in check.</td></tr>
<tr><td class="k">Management</td><td>Approves the opening entries, escalations and configuration in the app as Management; reads the log weekly.</td><td>Signs the go/no-go on Friday; records the go-live.</td></tr>
<tr><td class="k">New XP engineering</td><td>Runs staging; loads and validates the configuration; runs the invariant checks nightly; fixes what the run finds, as releases to staging only.</td><td>The reset, the copy, the verification, the switch; on call Monday.</td></tr>
</tbody></table>

<h2>11 · Assumptions and decisions for NPL</h2>
<ol>
<li><b>Opening date</b> = the close of the last business day before the parallel run starts; nothing before it is posted (Section 4.4, rule 5).</li>
<li><b>Two weeks</b> is the planned length of the run; the exit criteria, not the calendar, end it.</li>
<li><b>Earlier deals are imported records</b>, not reconstructed postings (Section 5). If NPL wants postings for history too, the opening date moves back to the start of that history and every deal from it is entered through the screens — many weeks of work for no change in any balance.</li>
<li><b>Backfill depth</b>: the current calendar year, or from each project's start if later. NPL decides.</li>
<li><b>The one reset of production</b> is the one on NPL's architecture page; the copy from staging replaces "live data after" with "the reconciled run's data, then live data after". The two documents agree on that basis.</li>
<li><b>Client journals</b> write to copies during the run and to the real sheets from the Sunday.</li>
<li><b>ERD additions</b> to be made in the next edition: purpose OPENING and kind equity; source Opening with its approval action; ${c("imported_from")} on DEAL_GROUP and DEAL; and, from the Architecture note, RATE_SOURCE code MANUAL.</li>
<li><b>Staging cost</b>: a second small service and database for the weeks of the run, about the running cost again (Architecture note §8).</li>
</ol>
<p class="small"><i>Draft v${V} — for review with NPL. The opening-entries example is balanced by the script that produced this document; its figures are illustrative.</i></p>
</body></html>`;

const h = path.join(outDir, `NPLify-Cutover-and-Opening-Entries-v${V}.html`), p = path.join(outDir, `NPLify-Cutover-and-Opening-Entries-v${V}.pdf`);
fs.writeFileSync(h, html);
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "opening transactions:", OPENING.length, "checks:", CHECKS.length, "flows:", FLOWS.length);
