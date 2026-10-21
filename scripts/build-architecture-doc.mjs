// Build docs/NPLify-Architecture-and-Stack-v6.0.{html,pdf}: NPL's architecture and stack page (one Next.js app,
// one PostgreSQL database in NPL's own AWS account, S3 for files, own login with an authenticator app, AWS Hong
// Kong, Kraken → CoinMarketCap → manual rates, Tronscan / Etherscan hash checks, a Google Sheet per client,
// daily backups) expanded against ERD v6.0: which tables each piece serves, which background jobs the model
// needs, how the insert-only ledger and the visibility rule are enforced, and the environments the cutover plan
// adds.                                                              node scripts/build-architecture-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { clientFacing } from "./client-facing.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));
const outDir = path.join(root, "docs");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const c = (s) => `<code>${esc(s)}</code>`;
const V = D.version, DATE = "22 October 2026";
const byDomain = (d) => Object.keys(D.E).filter((n) => D.E[n].d === d);
const VIEWS = byDomain("view"), LEDGER = byDomain("ledger");
const tables = Object.keys(D.E).length - VIEWS.length;
// every *_ref field in the model: what the file store and the external stores hold
const refs = [];
for (const n of Object.keys(D.E)) for (const f of D.E[n].f) if (/_ref$/.test(f[0]) && f[0] !== "client_ref") refs.push([n, f[0], f[3] || ""]);
const refGroups = {
  "Evidence and documents (S3)": refs.filter((r) => /evidence|body_ref|token_ref|agent_contact|provider_ref|slip_ref/.test(r[1])),
  "Bank details, KYC and legal (restricted store)": refs.filter((r) => /bank_details|kyc_ref|legal_entity|details_ref/.test(r[1])),
  "References to outside records (text only)": refs.filter((r) => /partner_agreement|account_ref|funding_reference/.test(r[1])),
};
const covered = new Set(Object.values(refGroups).flat().map((r) => r[0] + "." + r[1]));
const other = refs.filter((r) => !covered.has(r[0] + "." + r[1]));
if (other.length) refGroups["Other references"] = other;

// ------------------------------------------------------------------ background jobs the model needs
const JOBS = [
  ["Rate capture", "every 60 s per active pair", "Walks each CURRENCY_PAIR's PAIR_RATE_SOURCE chain (project pairs and platform pairs alike): Kraken first, CoinMarketCap next; writes a MARKET_RATE row per source that answered; marks a source stale when its snapshot is older than RATE_SOURCE.staleness_threshold_s. With every source down the job raises an alert and pricing waits for a manual rate entered by Finance with evidence and approved; it is recorded like any other market rate, with its approval.", "MARKET_RATE, RATE_SOURCE, PAIR_RATE_SOURCE, CURRENCY_PAIR"],
  ["Quote clocks", "every 30 s", "Moves quote-first legs along the clocks of the project: freshness (re-price before sending), validity (effective_valid_until, extended by QUOTE_VALIDITY_EXTENSION rows — D45), grace (grace_until with the drift test); expires what passed; a late sender gets a new deal group (invariant 39).", "DEAL, DEAL_GROUP, QUOTE_PACKAGE, QUOTE_VALIDITY_EXTENSION, PROJECT"],
  ["Partner clocks and business days", "every minute, in each partner's cutoff_timezone", "Applies the effective cutoff (one-day override, else weekday rule, else PARTNER.bank_cutoff_time — D29) to legs on pairs with needs_bank_lock: stamps cutoff_at and conversion_due_date, defers a next-day conversion that would breach the minimum margin, moves a settlement approved after cutoff to the next business day (execution_due_date) skipping weekends and HOLIDAY rows (D34, invariant 33). Expires PARTNER_RATE_VERSION rows at expires_at and freezes a breached partner × pair until Finance decides.", "PARTNER, PARTNER_CUTOFF_OVERRIDE, HOLIDAY, PARTNER_PAIR, DEAL, SETTLEMENT, PARTNER_RATE_VERSION, RATE_COMPARISON"],
  ["Hash checks", "on demand and every 5 min for pending ones", "For a crypto collection or payout whose hash was shared: asks Tronscan (TRC-20) or Etherscan (ERC-20) for the transaction, compares address, amount and confirmations, and attaches the result as evidence. If the explorer does not answer, the item stays pending and Operations verifies by the explorer link; the job never auto-verifies a collection — verification is an Operations action with the evidence attached.", "COLLECTION, SETTLEMENT_LINE, CONFIRMATION, COLLECTION_RECEIVING_ENDPOINT, RECEIVING_ENTITY_ACCOUNT"],
  ["Aging and exceptions", "every 15 min", "Builds the exception list every role sees in its own terms (Roles &amp; Visibility §5, rule 8): custody beyond OWN_WALLET.custody_max_hours, open OFFSET rows past their aging, a pool below zero outside the allowed window (invariant 41), unfunded make-goods, open loss recoveries, frozen pairs, variance exceptions, destination approvals pending, settlements due today, single-use endpoints past their deal. Sends alerts to the role that must act.", "CUSTODY, OFFSET, PROJECT_BALANCE, LOSS_EVENT, LOSS_RECOVERY, DESTINATION_APPROVAL, SETTLEMENT, APPROVAL"],
  ["Exposure and reporting values", "at request time, cached 60 s", "REPORTING_VALUE is computed when a screen or report asks for it — never stored (invariant 38): the latest MARKET_RATE of the platform pair, refused as stale beyond reporting_rate_max_age_min. The same job compares Σ balances at partners with PROJECT.exposure_ceiling and CLIENT.exposure_ceiling (invariant 35) and blocks a release that would cross either.", "REPORTING_VALUE, SYSTEM_SETTING, CLIENT_POSITION, PROJECT_BALANCE"],
  ["Monthly accruals and statements", "first business day of the month, and on demand", "Rolls PROJECT_MONTH_VOLUME for tier selection (D21); produces the partner rebate statement to reconcile PARTNER_REBATE_ACCRUAL against the partner's statement (D27) and the markup-share statement per party (D26); lists EARNINGS_RECEIVABLE rows resting at each partner for Finance to settle or offset (D46).", "PROJECT_MONTH_VOLUME, PARTNER_REBATE_ACCRUAL, MARKUP_SHARE_ACCRUAL, EARNINGS_RECEIVABLE, EARNINGS_OFFSET"],
  ["Client journal", "on every deal-state change, retried until confirmed", "Appends one row to the client's Google Sheet for each state change of a deal group (quoted, sent, collected, converted, settled, confirmed, returned, voided) with sender-facing fields only (Roles &amp; Visibility rule 2), then reads the row back and records the confirmation. A failed write stays queued and is shown on the exception list; the deal does not wait for the sheet.", "DEAL_GROUP, DEAL, SETTLEMENT_LINE, MESSAGE_TEMPLATE"],
  ["Backup verification", "daily, after the backup window", "Confirms the day's automated snapshot exists and restores last week's snapshot into a scratch database once a week to prove the restore path; checks S3 versioning is on. Reports to Management monthly.", "all tables"],
];

// ------------------------------------------------------------------ the diagram
const diagram = `<figure class="chart"><svg viewBox="0 0 760 358" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NPL staff in a browser use the NPLify app, two tasks in two zones in NPL's AWS account; the app uses a Multi-AZ PostgreSQL and S3 inside the account, with backups copied to a second region, and Kraken / CoinMarketCap, Tronscan / Etherscan and Google Sheets (client journals and the fallback workbook) outside it">
<style>.b{fill:#fff;stroke:#333;stroke-width:1.3}.o{fill:#f4f6f9;stroke:#999;stroke-width:1.1}.t{font:700 10.5px Helvetica,Arial,sans-serif;fill:#111}.s{font:8.8px Helvetica,Arial,sans-serif;fill:#444}.h{font:700 10px Helvetica,Arial,sans-serif;fill:#2f5d9e}.l{stroke:#555;stroke-width:1.2;fill:none;marker-end:url(#a)}.d{stroke-dasharray:3 2}</style>
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>
<rect x="150" y="18" width="340" height="322" rx="8" fill="none" stroke="#2f5d9e" stroke-width="1.3" stroke-dasharray="5 3"/><text x="162" y="36" class="h">NPL's AWS account · Hong Kong (ap-east-1)</text>
<rect x="6" y="130" width="136" height="58" rx="6" class="o"/><text x="16" y="152" class="t">NPL staff</text><text x="16" y="167" class="s">browser, NPLify login</text><text x="16" y="179" class="s">password + authenticator code</text>
<rect x="170" y="60" width="160" height="66" rx="6" class="b"/><text x="182" y="80" class="t">NPLify app · task 1 (zone A)</text><text x="182" y="96" class="s">screens · API · jobs</text><text x="182" y="108" class="s">Next.js, TypeScript</text>
<rect x="170" y="150" width="160" height="66" rx="6" class="b"/><text x="182" y="170" class="t">NPLify app · task 2 (zone B)</text><text x="182" y="186" class="s">same image; the jobs take</text><text x="182" y="198" class="s">a lock so only one runs</text>
<rect x="346" y="48" width="138" height="92" rx="6" class="b"/><text x="356" y="68" class="t">PostgreSQL, Multi-AZ</text><text x="356" y="83" class="s">primary (zone A) + standby</text><text x="356" y="95" class="s">(zone B), auto failover</text><text x="356" y="110" class="s">${tables} tables · ${VIEWS.length} views</text><text x="356" y="122" class="s">ledger insert-only</text>
<rect x="346" y="160" width="138" height="68" rx="6" class="b"/><text x="356" y="180" class="t">File storage</text><text x="356" y="195" class="s">S3 bucket, versioned</text><text x="356" y="207" class="s">slips, screenshots, photos,</text><text x="356" y="219" class="s">quote packages</text>
<rect x="346" y="248" width="138" height="70" rx="6" class="b"/><text x="356" y="268" class="t">Backups</text><text x="356" y="283" class="s">daily · 30 days · any minute</text><text x="356" y="295" class="s">+ daily copy to a second region</text>
<rect x="520" y="40" width="230" height="52" rx="6" class="o"/><text x="532" y="60" class="t">Kraken, CoinMarketCap</text><text x="532" y="75" class="s">market rates (MARKET_RATE), in that order;</text><text x="532" y="87" class="s">manual with Finance approval</text>
<rect x="520" y="110" width="230" height="52" rx="6" class="o"/><text x="532" y="130" class="t">Tronscan, Etherscan</text><text x="532" y="145" class="s">check transaction hashes (TRC-20, ERC-20)</text>
<rect x="520" y="180" width="230" height="66" rx="6" class="o"/><text x="532" y="200" class="t">Google Sheets</text><text x="532" y="215" class="s">one client journal per client, written and read back;</text><text x="532" y="227" class="s">+ the fallback workbook, refreshed every 15 minutes</text><text x="532" y="239" class="s">(tenth job)</text>
<rect x="520" y="264" width="230" height="52" rx="6" class="o"/><text x="532" y="284" class="t">Authenticator app</text><text x="532" y="299" class="s">on each user's phone (TOTP); no outside identity provider</text>
<path class="l" d="M142,152 C156,152 156,93 170,93"/><path class="l d" d="M142,166 C156,166 156,183 170,183"/>
<path class="l" d="M330,100 C338,100 338,94 346,94"/><path class="l d" d="M330,176 C338,176 338,120 346,120"/><path class="l d" d="M330,196 C338,196 338,194 346,194"/>
<path class="l d" d="M415,140 V160" marker-end="none"/><path class="l d" d="M415,228 V248" marker-end="none"/>
<path class="l d" d="M250,60 V46 H504" marker-end="none"/><path class="l d" d="M504,46 V66 H520"/><path class="l d" d="M504,66 V136 H520"/><path class="l d" d="M504,136 V213 H520"/><path class="l d" d="M70,188 V350 H635 V316"/>
</svg><figcaption>Figure 1 — Two application tasks in two zones, a Multi-AZ database, backups copied to a second region, and the fallback workbook as the tenth job. Recovery inside one hour (Cutover Approach 8a): a zone failure fails over to the standby and the second task; a whole-region outage is covered by the cross-region backup copy and the runbook; the fallback workbook bridges the hours in between. Running cost about USD 165–245 a month (Section 6).</figcaption></figure>`;

const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;margin:0}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
p{margin:0 0 7pt} ul,ol{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 3pt}
code,.mono{font:8.8pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin:4pt 0 8pt;font-size:9.2pt}
td,th{overflow-wrap:anywhere}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt;vertical-align:bottom;background:#f3f6fb}
td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top}
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
td.k{font-weight:700}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Architecture &amp; Stack Note v${V}</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Architecture &amp; Stack Note · Draft v${V}</p><p class="small">Numbered with the ERD edition it is built against.</p><p class="org">New XP Technologies Limited</p><p class="date">${DATE} · Confidential</p></div>
<div class="rule"></div>

<h2>How to read this pack</h2>
<p>Four map pages are now part of the pack as documents of their own, and are the place to start: the Top-Down Map (from the business, through the data model and the deal states, to the scenarios and the reading order), the Deal Flow on one page (Quote, Collect, Convert, Settle, with the roles and the money path), the Workflow Tree (8 classes, 27 sub-classes, 92 procedures, each naming who initiates, who approves, the codes it is written under and the records it touches) and the Workflow Tree on one page. Read them in that order, then this document. Every worked transaction (T), acceptance vector (L, B), walkthrough (W, X), flow (F) and procedure (C, A, D) has one identifier, listed in the Reading Companion's identifier register; the Test Strategy &amp; Coverage document says which test proves each procedure.</p>

<h2>1 · In one paragraph</h2>
<p>NPLify is an internal tool. It runs as <b>one application</b> — screens, API and background jobs in a single Next.js / TypeScript service — against <b>one PostgreSQL database</b> whose ledger and audit tables accept inserts only, with <b>one S3 bucket</b> for slips, screenshots and photos, all inside <b>NPL's own AWS account in Hong Kong</b>. Staff sign in with NPLify's own login: email, password and a code from an authenticator app; users, roles and rights are rows in NPLify. Four outside services are used and none is trusted with the books: Kraken and CoinMarketCap for market rates, Tronscan and Etherscan to check transaction hashes, and one Google Sheet per client as that client's status journal. Daily backups are kept thirty days with restore to any minute. Running cost with the resilience decided on 20 October: about USD 165 to 245 a month (Section 6). At ten deals a weekday the whole model is a few thousand rows a month; nothing here is sized for more than that, and nothing needs to be.</p>
${diagram}

<h2>2 · Stack</h2>
<table><thead><tr><th style="width:12%">Piece</th><th style="width:38%">NPL's page</th><th>What it has to do for the model (v${V})</th></tr></thead><tbody>
<tr><td class="k">App</td><td>Next.js with TypeScript: screens, API and background jobs (quote clocks, rate fetch, alerts) in one app.</td><td>Screens per role (Section 5); a JSON API the screens call, which is also where every rule of the model is enforced — pricing (Calculation Specification), the state machines (Lifecycle &amp; Approvals), maker-checker from ROLE_RIGHT rows, the field filter of ROLE.sees_economics; and a job runner inside the same service for the nine jobs of Section 4. One process, one deployment, one log.</td></tr>
<tr><td class="k">Database</td><td>PostgreSQL. Ledger and audit tables accept inserts only; the database refuses updates and deletes.</td><td>${tables} tables and ${VIEWS.length} derived views of the ERD. ${LEDGER.filter((n) => /^LEDGER_|AUDIT/.test(n)).join(", ")} are insert-only at the database level (Section 3). Every balance anywhere is a SQL view over postings (invariant 10); nothing is stored twice. Money is ${c("numeric")}, never floating point; time is ${c("timestamptz")}, shown in SYSTEM_SETTING.operating_timezone and in each partner's cutoff_timezone where the partner's clock applies.</td></tr>
<tr><td class="k">Files</td><td>Amazon S3 for slips, screenshots and photos.</td><td>The model never stores a file or a bank detail in a table: it stores a reference. Objects go into one versioned bucket, private, encrypted at rest, reached through short-lived signed links the app issues; bank details, KYC and legal documents sit under a restricted prefix only Finance and Management roles can resolve.</td></tr>
<tr><td class="k">Sign-in</td><td>NPLify's own login: email and password plus a code from an authenticator app. Users and roles are managed in NPLify.</td><td>USER (email, role_id, status) → ROLE (sees_economics) → ROLE_RIGHT (may_initiate, may_approve, escalates_to_role_id) (D44). Password hashed with a modern algorithm; TOTP secret per user; a session cookie, server-side, that expires on inactivity; every user change approved by a second Management user (Roles &amp; Visibility rule 7). No outside identity provider: the ERD's note "Google Workspace" on USER.email describes the address, not the login.</td></tr>
<tr><td class="k">Hosting</td><td>AWS in Hong Kong: one small container service, a managed PostgreSQL database and an S3 bucket.</td><td>Region ap-east-1. Two small application tasks in two availability zones (App Runner or ECS on Fargate), and a Multi-AZ managed PostgreSQL instance with a standby in the second zone (Section 7, item 5, as decided on 20 October): RDS, smallest burstable class, storage auto-growing, automated backups on; one S3 bucket with versioning. Secrets (database password, rate-feed and explorer keys, the Sheets service account) in the account's secrets store, never in the image or the repository. Outbound calls only to the four services of Figure 1.</td></tr>
</tbody></table>

<h2>3 · The insert-only ledger, enforced by the database</h2>
<p>NPL's page says the database refuses updates and deletes on ledger and audit tables. In the model, ledger tables are append-only and corrections are reversing transactions, and that is enforced in three layers so that no screen, no job and no mistake can get around it:</p>
<ol>
<li><b>Privileges.</b> The application's database role has INSERT and SELECT on ${c("LEDGER_TRANSACTION")}, ${c("LEDGER_POSTING")}, ${c("LEDGER_ACCOUNT")} and ${c("AUDIT_LOG")} and <i>no</i> UPDATE or DELETE. Nobody uses the owner role day to day; schema changes are migrations run by deployment under a separate role.</li>
<li><b>Triggers.</b> A BEFORE UPDATE OR DELETE trigger on the same tables raises an error whatever the role, so even an operator connected as the owner cannot change a posting by hand. ${c("LEDGER_ACCOUNT")} allows one exception: a row's ${c("status")} may be changed to closed; its code, owner, holder, currency and purpose may not.</li>
<li><b>Balance at commit.</b> A deferred constraint trigger on ${c("LEDGER_POSTING")} checks, when a transaction commits, that its postings sum to zero per currency and, separately, per ownership tag (invariant 1), that every ${c("CL.PROJECT.<CCY>.PAYABLE")} line carries a ${c("receiver_group_id")} (invariant 7), and that the transaction names a source record of the stated ${c("source_type")}. An unbalanced transaction never reaches the books.</li>
</ol>
<p>Everything else in the model is a normal row with a lifecycle (a deal, a settlement, a conversion, an approval) or a versioned configuration row (a fee structure, a threshold, a template, a system setting: new rows with an effective date, never edits). For those, ${c("AUDIT_LOG")} holds every field change with old and new value and the acting user, written by the API in the same database transaction as the change, and ${c("RECORD_LOCK")} prevents two people editing one record at once. Reversal is the only correction: ${c("LEDGER_TRANSACTION.reversal_of_id")} names the transaction reversed, and the Adjustment source is a Finance-initiated, Management-approved action (Lifecycle &amp; Approvals §5).</p>


<h2 class="pb">4 · Background jobs the model needs</h2>
<p>NPL's page names quote clocks, rate fetch and alerts. The model's clocks and checks need the nine jobs below; all run inside the single app process on a schedule table, each run recorded with its outcome so the exception list can show a job that failed. None of them moves money: a job may stamp a clock, expire a quote, attach evidence or raise an alert, but every posting is made by a controlled action of a person (or by the engine as part of one).</p>
<table><thead><tr><th style="width:15%">Job</th><th style="width:14%">When</th><th>What it does</th><th style="width:19%">Tables</th></tr></thead><tbody>
${JOBS.map((j) => `<tr><td class="k">${esc(j[0])}</td><td>${esc(j[1])}</td><td>${j[2]}</td><td class="small mono">${esc(j[3])}</td></tr>`).join("")}
</tbody></table>

<h3>How the jobs stay reliable</h3>
<p>Four rules apply to every job above, and to the tenth job added on 20 October, the fallback workbook export (every 15 minutes: open deals and their states, partner balances, the day's confirmed rates, cutoffs and pending approvals, written to a Google Sheet that NPL restricts to the people who need it).</p>
<table><colgroup><col style="width:24%"><col></colgroup><thead><tr><th>Rule</th><th>What it means</th></tr></thead><tbody>
<tr><td class="k">One run at a time per job</td><td>Each job takes a lock row before it runs and releases it at the end (Lifecycle &amp; Approvals 6a); a run that finds the lock held exits at once and is recorded as skipped. Two tasks in two zones therefore never run the same job together.</td></tr>
<tr><td class="k">Catch-up after a restart</td><td>A job resumes from the last recorded run, not from now: rate capture fills the gap it can, quote clocks expire what passed, the aging job rebuilds the list. A deployment or a zone failure delays a job; it never loses one.</td></tr>
<tr><td class="k">Bounded retries</td><td>A run that fails is retried three times with a growing wait, then left for the next schedule; the failure is recorded with its reason and raises the account alarm after the second failure (Section 6, Monitoring). Nothing is retried forever, and nothing that failed is silently skipped.</td></tr>
<tr><td class="k">A job-health line on the exception list</td><td>The exception list every role sees shows, for each job, its last successful run, its last failure and whether it is overdue, so a stale rate feed or a stopped journal writer is visible to Operations before a deal is affected.</td></tr>
</tbody></table>
<p>None of this moves money: a job still never posts (Ledger Posting Design, Pattern P). Built in Phase 1 with the jobs; the concurrency test of the go-live acceptance starts a job twice and expects one run (Cutover Approach, exit criterion 10).</p>

<h2>5 · Screens, API and the visibility rule</h2>
<p>There is one application with three views of it, by role. The <b>Operations</b> screens are the working day: inquiries and quotes, the quote package, wallet screening, collections to verify, conversions to instruct, settlements to prepare, destination approvals, loss events to record, the client journal; the <b>Finance</b> screens add the approvals queue, the partner rate versions and the day's comparison, variance and other exceptions, reconciliation, earnings resting at partners and offsets, invoices and the reseller books, statements, the Finance Log; the <b>Management</b> screens add the escalations queue, configuration proposals to approve, system settings, users and roles, and the reports in the reporting currency. Every screen is served by the same API, and the API applies the rule of the Roles &amp; Visibility Matrix at the point where a response is built: for a role whose ${c("ROLE.sees_economics")} is false the fields of the groups <i>Reference rate and comparison</i>, <i>Margin, pool, cost breakdown</i> and <i>Ledger and balances</i> are removed before the data leaves the server, on every read, list, export, document and notification. The browser never receives what the role may not see, so there is nothing to hide in the page.</p>
<p>Three API conventions carry the state machines: every state change is a named action (${c("POST /deals/{id}/actions/instruct-conversion")}), never a field edit; an action that needs approval creates the APPROVAL row and returns the state the record is now in; the approver's call is a second action by a different user, checked against ROLE_RIGHT (invariant 9). Idempotency keys on every money-moving action, so a retried request cannot post twice.</p>

<h2 class="pb">6 · Environments, backups and running cost</h2>
<table><thead><tr><th style="width:16%">Environment</th><th style="width:30%">Where</th><th>Data</th></tr></thead><tbody>
<tr><td class="k">Local</td><td>Developers' machines</td><td>Test data only; the configuration example of the Configuration Schema (config-example-client1.json) and the worked transactions of the Ledger Posting Design as fixtures.</td></tr>
<tr><td class="k">Staging <span class="small">(temporary)</span></td><td>NPL's AWS account: a second small service and database, same image, own bucket</td><td>The parallel run of the Cutover Approach: NPL's real configuration, the backfilled deals and every deal mirrored from the spreadsheets for three to four weeks. Its database becomes production's at cutover; the instance is removed afterwards.</td></tr>
<tr><td class="k">Production</td><td>NPL's AWS account</td><td>Phase test runs before go-live (NPL's page); reset once, just before cutover, and loaded from the staging database so the live ledger starts from reconciled opening entries and the mirrored days, not from test runs.</td></tr>
</tbody></table>
<p class="small">NPL's page had two environments and a single reset of production before go-live. The cutover plan (a staging instance for the parallel run, then a copy of its database to production) keeps the single reset and adds the temporary staging instance.</p>
<ul>
<li><b>Backups.</b> Daily automated snapshots of the database kept 30 days, with point-in-time restore to any minute in that window (RDS automated backups); S3 versioning for files. A weekly restore test (Section 4, last job). A restore is a Management decision recorded in the audit log, because the ledger after a restore is the ledger as of that minute and the sheets fill the gap.</li>
<li><b>Recovery objectives and resilience (NPL decision, 20 October 2026).</b> Recovery time: one hour in operating hours. Recovery point: 15 minutes, and near zero for a hardware failure, the evidence bucket included. To meet them, three things are part of the design rather than options: a Multi-AZ database (a hot standby in a second availability zone with automatic failover, roughly doubling the database line of the running cost), two application tasks in two zones, and a daily cross-region copy of the backup. Engineering restores, Finance validates the financial data after any recovery, Management authorises a production restore and the resumption of processing; the steps are the recovery runbook of the Cutover Approach (8a). The fallback workbook, an export refreshed every 15 minutes to a Google Sheet with open deals, balances, rates, cutoffs and pending approvals, is the tenth job of Section 4 and is built in Phase 2 (M7).</li>
<li><b>Monitoring.</b> The app's own exception list is the first monitor; underneath it, the account's basic alarms: service unhealthy, database storage or connections, a job run that failed twice, a rate feed stale for more than ten minutes, a journal row unconfirmed for more than an hour. Alerts go to Finance and the engineering contact.</li>
<li><b>Deployment.</b> One container image per release, built from the repository, migrations applied on start under the migration role, a release note that names the ERD edition the schema matches (the ${c("version")} of ${c("erd.v5.json")}, ${V} today).</li>
</ul>
<p><b>Schema change policy.</b> Every change to the database is a numbered, forward-only migration kept in the repository with the code that needs it; there is no manual change to a live schema. Before release, each migration is run against last week's restored snapshot (the weekly restore test of Section 4) and the ledger checks are run on the result, so a migration that would break a balance or an invariant is caught on a copy. Migrations on LEDGER_TRANSACTION, LEDGER_POSTING, LEDGER_ACCOUNT and AUDIT_LOG are additive only: a column may be added, never removed or retyped, and no migration updates or deletes a posting. The release note names the migration numbers it carries and the ERD edition the schema matches, and the first start of the new image applies them under the migration role (Section 6, Deployment).</p>
<h3>Running cost, line by line</h3>
<p>Recalculated on 21 October for the design as decided: two application tasks, a Multi-AZ database, a daily cross-region backup copy and a small staging environment kept after go-live. Monthly, in USD, region ap-east-1, at today's list prices; the ranges cover the smallest sensible sizes. NPL pays AWS directly; nothing here is a New XP fee.</p>
<table><colgroup><col style="width:26%"><col><col style="width:14%"></colgroup><thead><tr><th>Line</th><th>Basis</th><th>USD a month</th></tr></thead><tbody>
<tr><td>Application, two tasks</td><td>2 × 0.5 vCPU / 1 GB on App Runner or Fargate, running continuously in two zones; the jobs run inside them</td><td>50 to 80</td></tr>
<tr><td>Managed PostgreSQL, Multi-AZ</td><td>Smallest burstable class with a standby in a second zone (the standby roughly doubles the database line), 20 GB storage, 30-day automated backups, point-in-time restore</td><td>60 to 75</td></tr>
<tr><td>Cross-region backup copy</td><td>Daily copy of the database snapshot to a second region, 30 days kept</td><td>3 to 6</td></tr>
<tr><td>Files</td><td>S3 bucket with versioning: slips, screenshots, photos, quote packages</td><td>2 to 4</td></tr>
<tr><td>Logs and alarms</td><td>CloudWatch logs for the application and the database, the basic alarms of Section 6</td><td>5 to 10</td></tr>
<tr><td>Secrets</td><td>Secrets store for the database password, feed and explorer keys, the Sheets service account</td><td>2 to 3</td></tr>
<tr><td>Data transfer</td><td>Outbound calls to the four services and the Google Sheet, backups to the second region</td><td>3 to 8</td></tr>
<tr><td>Staging after go-live</td><td>One small task and a single-AZ database of the same image, for releases and the yearly restore rehearsal; stopped outside working hours</td><td>40 to 60</td></tr>
<tr><td class="k">Total</td><td></td><td class="k">165 to 245</td></tr>
</tbody></table>
<p>Against the proposal’s assumption of USD 100 to 200 a month: the first eight lines without the standby, the second task and the cross-region copy would sit at about USD 85 to 125, inside the proposal; the resilience decided on 20 October for the one-hour recovery target adds about USD 80 to 120, which NPL accepted with that decision. Rate-feed and explorer calls stay within the free tiers at this volume; Google Sheets is free; the authenticator app is the user's own; no licence is needed anywhere in the stack. The staging instance of the parallel run is a further USD 40 to 60 for the weeks it exists, as before.</p>

<h2 class="pb">6a · Security operations</h2>
<p>What is already specified stays: NPLify's own login with an authenticator code, a secrets store, encrypted private storage reached through short-lived links, and database roles that cannot alter the ledger. This section adds how security is run after go-live and how NPL raises an incident or a request.</p>
<table><colgroup><col style="width:15%"><col><col style="width:19%"><col style="width:16%"></colgroup><thead><tr><th>Area</th><th>What is done</th><th>Who</th><th>When</th></tr></thead><tbody>
<tr><td class="k">Patching</td><td>Operating-system, runtime and dependency updates are applied monthly, and within five business days for a published critical vulnerability in a component the platform uses; each patch release goes through the pipeline of the proposal (build, QA, staging, UAT, production) like any release</td><td>New XP under the support bundle (Schedule D)</td><td>Monthly; from the eight-week warranty onwards</td></tr>
<tr><td class="k">Privileged access</td><td>An access register lists every person who holds the AWS account, the database owner role, the deployment role, the secrets store or the repository, and why; NPL holds the account root and the owner roles; New XP engineers hold time-bound deployment access; the register is reviewed at the quarterly access review (Operating Procedures A.10)</td><td>NPL Management owns the register; New XP keeps it current</td><td>Quarterly</td></tr>
<tr><td class="k">Key rotation</td><td>Database password, feed and explorer keys, the Sheets service account and the deployment credentials are rotated every 90 days and at once when a holder leaves; rotation is a recorded change with no downtime (the secrets store serves the new value to the next start)</td><td>New XP</td><td>Every 90 days and on a leaver</td></tr>
<tr><td class="k">Vulnerability assessment</td><td>A basic automated assessment of the staging environment before go-live, repeated after every major release; findings rated critical or high are fixed before production</td><td>New XP</td><td>Before go-live, then per major release</td></tr>
<tr><td class="k">Penetration test</td><td>The optional add-on of the proposal: an independent OWASP Top 10 test against staging, about USD 1,500 paid to the vendor, over two to three weeks in parallel with delivery; critical and high findings within scope are remediated under the engagement</td><td>NPL decides whether to take it</td><td>Phase 3, if taken</td></tr>
</tbody></table>
<h3>Raising an incident or a request</h3>
<table><colgroup><col style="width:19%"><col style="width:36%"><col></colgroup><thead><tr><th>Step</th><th>During the build</th><th>After go-live (support bundle)</th></tr></thead><tbody>
<tr><td class="k">1. NPL raises it</td><td>Logs it on the shared delivery board (proposal, Section 5) with what was seen, when, and the deal or screen concerned; anything urgent is also a call to the engineering contact</td><td>Logs it on the same board under the support bundle (Schedule D) with its priority; a production incident is also a call to the on-call contact</td></tr>
<tr><td class="k">2. New XP acknowledges and classifies</td><td>Within the weekly cycle for requests; the same day for anything that blocks the test run</td><td>Within the bundle's priority turnaround: a production incident the same business day, a defect within two business days, a request at the next planning</td></tr>
<tr><td class="k">3. What New XP freezes</td><td>Nothing in staging is changed until the incident is understood</td><td>For a security incident: the affected credentials are rotated at once, deployments are paused, and no data is deleted; a restore is a Management decision under the recovery runbook (Cutover Approach 8a)</td></tr>
<tr><td class="k">4. Who is called</td><td>The engineering contact and NPL's point of contact</td><td>The on-call engineer, the second named engineer on the support bundle, NPL Management for anything touching money or client data</td></tr>
<tr><td class="k">5. How NPL is kept informed</td><td>On the board and at the weekly demo</td><td>A first update within the turnaround, then at least daily until closed, and a written note with cause, fix and prevention within five business days of closing</td></tr>
<tr><td class="k">6. Record</td><td>The board item</td><td>The board item plus the audit log entries for every action taken on production</td></tr>
</tbody></table>

<h2>7 · Decisions for NPL and assumptions made here</h2>
<ol>
<li><b>Container service.</b> App Runner (simplest) or ECS on Fargate (more control); both fit the cost line. Assumed: App Runner.</li>
<li><b>Wallet screening provider</b> (D31): which tool, and whether the app calls it or Operations pastes the result. Assumed: pasted result with evidence until a provider is chosen.</li>
<li><b>The restricted store</b> for bank details, KYC and legal documents: the same bucket under a restricted prefix (assumed), or a separate secrets store.</li>
<li><b>Client journal content</b>: which state changes and which fields each client sees; assumed the sender-facing set of MESSAGE_TEMPLATE quote plus state and timestamps, per client.</li>
<li><b>Availability,</b> decided on 20 October 2026 with the one-hour recovery target: a Multi-AZ database (a hot standby in a second availability zone with automatic failover) and two application tasks in two zones, so that one zone's failure neither loses the database nor stops the application. The cost of both is in the table of Section 6. The residual risk accepted is a whole-region outage, covered by the daily cross-region backup copy and the recovery runbook (Cutover Approach 8a), with the fallback workbook bridging the hours until restore.</li>
</ol>
<p class="small"><i>Draft v${V} — for review with NPL. This note describes the build; the data model it serves is the ERD &amp; Data Model, and the rules it enforces are those of the Lifecycle &amp; Approvals, Roles &amp; Visibility, Calculation and Configuration documents.</i></p>
</body></html>`;

const h = path.join(outDir, `NPLify-Architecture-and-Stack-v${V}.html`), p = path.join(outDir, `NPLify-Architecture-and-Stack-v${V}.pdf`);
fs.writeFileSync(h, clientFacing(html));
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "refs:", refs.length, "jobs:", JOBS.length);
