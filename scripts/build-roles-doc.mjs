// Build docs/NPLify-Roles-and-Visibility-Matrix-v1.0.pdf: the cumulative-visibility model
// (Operations ⊂ Finance ⊂ Management) as a per-module, per-field-group table of view and approval
// rights, the approval rights per controlled action, the enforcement rules, acceptance tests, and a
// field-by-field appendix generated from data/erd.v5.json.   node scripts/build-roles-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ACTIONS } from "./controlled-actions.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));
const outDir = path.join(root, "docs");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const c = (s) => `<code>${esc(s)}</code>`;
const V = "1.0", DATE = "8 October 2026";

// ------------------------------------------------------------------ field groups
// Every field of every table belongs to exactly one group; the group decides who may see it.
const GROUPS = {
  OPS: { name: "Operational", who: "Operations · Finance · Management", desc: "Identities, states, references, timestamps, instructions, parties, accounts, endpoints, the amounts that physically move (collected, released, confirmed, returned). Everything Operations needs to run a deal." },
  PRICE: { name: "Sender-facing prices", who: "Operations · Finance · Management", desc: "What the sender is quoted and pays: the sender rate, the fee percentages applied to the sender and receiver, the gross and net amounts promised. Visible to Operations because they are what the customer sees." },
  PRATE: { name: "Partner rates as entered", who: "Operations · Finance · Management", desc: "The rate a partner offered, as Operations typed it in; the partner's pricing style; what the partner actually delivered. Entered by Operations, so visible to Operations." },
  REF: { name: "Reference rate and comparison", who: "Finance · Management", desc: "The market snapshot at capture, the day's comparison, spreads, rolling averages, breach thresholds. Operations sees only whether a partner × pair is usable or frozen." },
  ECON: { name: "Margin, pool, cost breakdown", who: "Finance · Management", desc: "NPL's margin and earnings, the expected conversion the engine computed, variances, rounding residuals, partner markups, minimum margins, earnings resting at partners, rebates and referral commissions, bank and network fees as costs." },
  LEDGER: { name: "Ledger and balances", who: "Finance · Management", desc: "Accounts, transactions, postings, and every balance derived from them: client balance per partner, group entitlement, offsets, custody. Operations sees one figure only: the amount available to pay out at a partner." },
  CONFIG: { name: "Configuration and master data", who: "view: all · propose: Finance · approve: Management", desc: "Project settings, pairs, thresholds, partner configuration, fee structures, registrations. Visible to everyone who operates them; changed only through Finance's proposal and Management's approval." },
  CTRL: { name: "Approvals, audit, users", who: "own requests: Operations · all: Finance · Management", desc: "Approval records, the audit log, record locks and user administration." },
};
// Entities whose every field belongs to one group
const ENTITY_GROUP = {
  MARKET_RATE: "REF", RATE_COMPARISON: "REF", PARTNER_RATE_VERSION: "PRATE",
  LEDGER_TRANSACTION: "LEDGER", LEDGER_POSTING: "LEDGER", LEDGER_ACCOUNT: "LEDGER", CLIENT_BALANCE: "LEDGER", GROUP_ENTITLEMENT: "LEDGER", OFFSET: "LEDGER", CUSTODY: "LEDGER",
  EARNINGS_RECEIVABLE: "ECON", REFERRAL_RULE: "ECON", REFERRAL_ACCRUAL: "ECON", PARTNER_REBATE_RULE: "ECON", PARTNER_REBATE_ACCRUAL: "ECON", INTRODUCER: "CONFIG",
  USER: "CTRL", APPROVAL: "CTRL", AUDIT_LOG: "CTRL", RECORD_LOCK: "CTRL",
  PROJECT: "CONFIG", PARTNER: "CONFIG", RATE_SOURCE: "CONFIG", THRESHOLD: "CONFIG", CURRENCY_PAIR: "CONFIG", PAIR_RATE_SOURCE: "CONFIG", OWN_WALLET: "CONFIG",
  SENDER: "CONFIG", SENDER_RECEIVER_ALLOW: "CONFIG", COLLECTION_SENDING_ENTITY: "CONFIG", RECEIVER_GROUP: "CONFIG", RECEIVER: "CONFIG", RECEIVING_ENTITY: "CONFIG", RECEIVING_ENTITY_ACCOUNT: "CONFIG",
  PARTNER_CONFIG: "CONFIG", PARTNER_ENTITY: "CONFIG", COLLECTION_RECEIVING_ENDPOINT: "CONFIG", SETTLEMENT_SENDING_ENTITY: "CONFIG", SETTLEMENT_RAIL: "CONFIG", SETTLEMENT_REGISTRATION: "CONFIG", FEE_OVERRIDE: "CONFIG",
};
// Field-level exceptions: entity -> field -> group
const FIELD_GROUP = {
  PARTNER_PAIR: { "*": "CONFIG", partner_markup_pct: "ECON" },
  FEE_STRUCTURE: { "*": "CONFIG", min_margin_pct: "ECON", variance_threshold_rel: "REF" },
  RATE_COMPARISON: { "*": "REF", id: "OPS", partner_pair_id: "OPS", rate_date: "OPS" },
  PARTNER_RATE_VERSION: { "*": "PRATE", spread: "REF", breach_status: "REF", breached: "REF", approved_by: "CTRL" },
  DEAL_GROUP: { "*": "OPS", sender_rate: "PRICE", fee_structure_id: "PRICE", amount_in: "PRICE", target_out: "PRICE" },
  DEAL: { "*": "OPS", market_rate_id: "REF", partner_rate_version_id: "PRATE", fee_structure_id: "PRICE", sender_rate: "PRICE", amount_in: "PRICE", gross_out: "PRICE", client_net: "PRICE", fee_sender_part: "PRICE", fee_receiver_part: "PRICE" },
  CONVERSION: { "*": "OPS", partner_rate_version_id: "PRATE", actual_out: "PRATE", expected_out: "ECON", variance: "ECON", basis_variance: "ECON", residual_in: "ECON", rounding_residual: "ECON", fee_receiver_part: "PRICE" },
  BALANCE_CONVERSION: { "*": "OPS", market_rate_id: "REF", partner_rate_version_id: "PRATE", actual_out: "PRATE", expected_out: "ECON", variance: "ECON", rounding_residual: "ECON" },
  REROUTE: { "*": "OPS", forwarding_policy: "ECON", recovered_amount: "ECON", partner_agreement_ref: "ECON" },
  BANK_FEE_EVENT: { "*": "OPS", expected_amount: "ECON", actual_amount: "ECON" },
  FEE_DECISION: { "*": "OPS", pct: "ECON", decision: "OPS" },
  SETTLEMENT_RAIL: { "*": "CONFIG", expected_bank_fee: "ECON" },
  DISBURSEMENT: { "*": "OPS", bank_fee_treatment: "OPS" },
};
const ACTOR_FIELDS = new Set(["approved_by", "requested_by", "verified_by", "confirmed_by", "posted_by", "prepared_by", "escalated_to", "locked_by", "actor_id"]);
function groupOf(entity, field) {
  if (ACTOR_FIELDS.has(field)) return "CTRL";
  const fg = FIELD_GROUP[entity];
  if (fg) return fg[field] || fg["*"] || ENTITY_GROUP[entity] || "OPS";
  return ENTITY_GROUP[entity] || "OPS";
}
const RIGHTS = { // group -> [Operations, Finance, Management]
  OPS: ["view · enter", "view", "view"], PRICE: ["view (quotes)", "view", "view"], PRATE: ["view · enter", "view · confirm", "view"],
  REF: ["usable / frozen only", "view · approve breach", "view"], ECON: ["—", "view", "view"], LEDGER: ["available-to-pay figure only", "view · reconcile", "view"],
  CONFIG: ["view", "view · propose", "view · approve"], CTRL: ["own requests", "view all · approve own scope", "view all · approve · users"],
};

// ------------------------------------------------------------------ the matrix by module
const MATRIX = [
  ["Configuration", [
    ["Project, pairs, thresholds, policies", "CONFIG", "PROJECT, CURRENCY_PAIR, PAIR_RATE_SOURCE, THRESHOLD, OWN_WALLET"],
    ["Parties: senders, groups, receivers, entities, accounts", "CONFIG", "SENDER, SENDER_RECEIVER_ALLOW, COLLECTION_SENDING_ENTITY, RECEIVER_GROUP, RECEIVER, RECEIVING_ENTITY, RECEIVING_ENTITY_ACCOUNT"],
    ["Partner block: pairs, vehicles, endpoints, rails, narratives, registrations", "CONFIG", "PARTNER, PARTNER_CONFIG, PARTNER_PAIR, PARTNER_ENTITY, COLLECTION_RECEIVING_ENDPOINT, SETTLEMENT_SENDING_ENTITY, SETTLEMENT_RAIL, SETTLEMENT_REGISTRATION"],
    ["Fee structures and overrides (the percentages applied to the sender and receiver)", "CONFIG", "FEE_STRUCTURE (pct, shares, floor, cap, basis, mode), FEE_OVERRIDE"],
    ["Minimum margin, partner markup, variance thresholds, expected bank fees", "ECON", "FEE_STRUCTURE.min_margin_pct, PARTNER_PAIR.partner_markup_pct, FEE_STRUCTURE.variance_threshold_rel, SETTLEMENT_RAIL.expected_bank_fee"],
    ["Referral and rebate terms", "ECON", "INTRODUCER, REFERRAL_RULE, PARTNER_REBATE_RULE"]]],
  ["Rates", [
    ["Partner rate of the day, as entered", "PRATE", "PARTNER_RATE_VERSION.rate, given_at, version, status (usable / frozen)"],
    ["Market snapshots, day comparison, spread, averages, breach", "REF", "MARKET_RATE, RATE_COMPARISON, PARTNER_RATE_VERSION.spread / breach"]]],
  ["Quoting", [
    ["Deal group and legs: parties, states, references, clocks", "OPS", "DEAL_GROUP, DEAL (identities, leg_type, funding_source, states, sent_at, valid_until, grace_until)"],
    ["Sender-facing price: sender rate, fee applied, amounts promised", "PRICE", "DEAL_GROUP.sender_rate, DEAL.sender_rate, amount_in, gross_out, client_net, fee_sender_part, fee_receiver_part"],
    ["Reference rate stamped on the leg", "REF", "DEAL.market_rate_id"]]],
  ["Collection", [
    ["Parts, endpoints, evidence, verification", "OPS", "COLLECTION (amount, endpoint, evidence_ref, state, verified)"],
    ["Overpayment credit", "OPS", "SENDER_CREDIT"]]],
  ["Conversion", [
    ["Instruction, partner rate used, what the partner delivered", "PRATE", "CONVERSION.partner_rate_version_id, actual_out, state"],
    ["Expected conversion, variance, residuals, margin recognised", "ECON", "CONVERSION.expected_out, variance, basis_variance, residual_in, rounding_residual; EARN_GROSS postings"]]],
  ["Settlement", [
    ["Runs, lines, destinations, confirmations, shortfalls", "OPS", "DISBURSEMENT, DISBURSEMENT_LINE (incl. deal_id), CONFIRMATION, SHORTFALL (amount owed to the receiver)"],
    ["Amount available to pay out at a partner", "LEDGER", "CLIENT_BALANCE due figure (one number per partner × currency, no postings)"],
    ["Bank fee expected vs actual, treatment override", "ECON", "BANK_FEE_EVENT.expected_amount, actual_amount; FEE_DECISION.pct"]]],
  ["Returns and exceptions", [
    ["Returned lines, reasons, bounce fee as a fact", "OPS", "DISBURSEMENT_RETURN (returned_amount, reason); bank_fee as recorded"],
    ["Variance exceptions, offsets, custody aging, breached versions", "ECON", "variance exception records; OFFSET view; CUSTODY view; RATE_COMPARISON breach — Operations sees that an item is blocked, not the figures"]]],
  ["Balance conversions and reroutes", [
    ["Request, phase, outcome, custody wallet, alternate partner", "OPS", "BALANCE_CONVERSION (request fields), REROUTE (trigger, phase, outcome, own_wallet_id, alternate partner)"],
    ["Expected out, variance, dues recovered, forwarding policy", "ECON", "BALANCE_CONVERSION.expected_out / variance; REROUTE.forwarding_policy, recovered_amount, partner_agreement_ref; ENTITLEMENT_REATTRIBUTION"]]],
  ["Referrals and rebates", [
    ["Accruals, reconciliation, payment", "ECON", "REFERRAL_ACCRUAL, PARTNER_REBATE_ACCRUAL, EARNINGS_RECEIVABLE"]]],
  ["Ledger and reconciliation", [
    ["Accounts, transactions, postings, balances, identities", "LEDGER", "LEDGER_ACCOUNT, LEDGER_TRANSACTION, LEDGER_POSTING, CLIENT_BALANCE, GROUP_ENTITLEMENT, OFFSET, CUSTODY"]]],
  ["Reports, exports and messages", [
    ["Operational reports and sender-facing documents", "OPS", "deal lists, collection and settlement reports, quote packages, partner instructions"],
    ["Economic reports: margin, pool, cost breakdown, variances, earnings, Finance Log", "ECON", "every report, export, message or notification that carries a value from groups REF, ECON or LEDGER"]]],
  ["Administration", [
    ["Approvals: request, approve, reject, escalate", "CTRL", "APPROVAL"],
    ["Audit log and record locks", "CTRL", "AUDIT_LOG, RECORD_LOCK"],
    ["Users and roles", "CTRL", "USER"]]],
];

// ------------------------------------------------------------------ acceptance tests
const TESTS = [
  ["Field stripping on read", "An Operations user requests any deal, conversion, balance conversion or reroute through the API or the screen.", "The response contains no field of groups REF, ECON or LEDGER (Appendix A lists them by table); the same request by Finance contains them all."],
  ["Field stripping on export", "Operations exports a deal list, a settlement report or a quote package to CSV, PDF or a message.", "No column, footnote or total derived from groups REF, ECON or LEDGER appears; Finance's export of the same report carries them."],
  ["Notifications", "A variance exception, a breached rate version or an open offset is raised while an Operations user is on shift.", "Operations is told the item is blocked and why in operational terms (\"rate version frozen — awaiting Finance\"); the spread, variance or offset amount is not in the notification."],
  ["Available-to-pay figure", "Operations prepares a disbursement at a partner.", "The screen shows one figure per partner × currency (amount available to pay out) and no posting, pool or entitlement detail."],
  ["Maker-checker", "A user approves an APPROVAL they requested themselves, or Operations approves anything.", "The server refuses with a reason; nothing changes; the attempt is in the audit log."],
  ["Escalation adds, never replaces", "A disbursement above the settlement limit is approved by Finance only.", "It stays Approved-pending-Management; release is refused until a Management approval exists in addition to Finance's."],
  ["Countersign", "Only one Finance user is on shift and a release needs a second Finance approval.", "A Management countersignature is accepted in place of the second Finance user, and recorded as such."],
  ["Configuration path", "Finance edits a threshold, fee structure or partner configuration directly.", "Refused: configuration changes are proposals by Finance that become effective only on Management approval, as a new version with an effective date."],
  ["Own requests only", "Operations lists approvals.", "Only approvals Operations initiated are returned; Finance and Management see all."],
  ["Users and roles", "A Management user creates, changes or removes a user or role.", "A second Management user must approve; one Management user alone cannot."],
  ["Rejection reason", "Any approval is rejected.", "The reason is mandatory, is shown to the initiator, and any economic figure inside it is stripped for Operations."],
  ["Audit", "Any controlled action is taken.", "AUDIT_LOG holds actor, time, reason and record version; APPROVAL holds requester, approver and state; neither can be edited or deleted."],
  ["No client-side leakage", "Any screen shown to Operations is inspected (page source, network responses, cached data).", "No value of groups REF, ECON or LEDGER is present, even hidden: the filtering happens on the server, not in the user interface."],
];

// ------------------------------------------------------------------ appendix: every field, its group, its rights
const byDomain = (d) => Object.keys(D.E).filter((n) => D.E[n].d === d);
const DOMAIN_NAME = { config: "Configuration", rates: "Rates", deal: "Deal lifecycle", settle: "Settlement", ledger: "Ledger & controls", view: "Derived views" };
const appendix = Object.keys(DOMAIN_NAME).map((dom) => `<h3>${esc(DOMAIN_NAME[dom])}</h3>` + byDomain(dom).map((n) => {
  const e = D.E[n];
  const rows = e.f.map((f) => { const g = groupOf(n, f[0]); return [f[0], GROUPS[g].name, ...RIGHTS[g]]; });
  return `<h4>${esc(n)}</h4><table class="dd"><thead><tr><th style="width:30%">Field</th><th style="width:24%">Group</th><th>Operations</th><th>Finance</th><th>Management</th></tr></thead><tbody>
${rows.map((r) => `<tr><td class="mono">${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td></tr>`).join("")}</tbody></table>`;
}).join("")).join("");

// summary counts for the status line
const counts = {}; for (const n of Object.keys(D.E)) for (const f of D.E[n].f) { const g = groupOf(n, f[0]); counts[g] = (counts[g] || 0) + 1; }
const hiddenFromOps = (counts.REF || 0) + (counts.ECON || 0) + (counts.LEDGER || 0);
const totalFields = Object.values(counts).reduce((a, b) => a + b, 0);

// ------------------------------------------------------------------ HTML
const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
@page land { size: A4 landscape; margin: 12mm 14mm 12mm 14mm; }
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;margin:0}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
h4{font:700 10pt Helvetica,Arial,sans-serif;margin:12pt 0 2pt;break-after:avoid}
p{margin:0 0 7pt} ul,ol{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 3pt}
code,.mono{font:8.8pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;margin:4pt 0 8pt;font-size:9.2pt}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt;vertical-align:bottom;background:#f3f6fb}
td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top}
table.dd{font-size:8.6pt} table.dd td,table.dd th{padding:2pt 5pt}
tr{break-inside:avoid}
td.mod{font-weight:700;background:#f7f7f7}
.r-ops{color:#8a3a00} .r-fin{color:#1f4e8c} .r-mgmt{color:#2f7d3c} .no{color:#999}
.title{text-align:center;margin-top:40mm}
.title .sub{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 10pt}
.title .org{margin:0 0 2pt} .title .date{margin:0 0 16pt}
.rule{border-top:2px solid #222;border-bottom:1px solid #222;height:2px;margin:10pt 0 14pt}
.pb{break-before:page} section.land{page:land;break-before:page;break-after:page}
.box{border:1px solid #2f5d9e;background:#f3f6fb;padding:6pt 9pt;margin:8pt 0;font-size:9.8pt}
.small{font-size:9pt;color:#444}
figure.chart{margin:8pt 0 12pt;break-inside:avoid} figcaption{font:italic 9.5pt Georgia,serif;margin-top:3pt}
`;

const nest = `<figure class="chart"><svg viewBox="0 0 760 230" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cumulative visibility: Operations inside Finance inside Management">
<style>.t{font:700 10px Helvetica,Arial,sans-serif;fill:#111}.s{font:8.6px Helvetica,Arial,sans-serif;fill:#333}.h{font:700 10.5px Helvetica,Arial,sans-serif}</style>
<rect x="10" y="12" width="740" height="206" rx="10" fill="#eaf3ea" stroke="#2f7d3c" stroke-width="1.4"/><text x="24" y="32" class="h" fill="#2f7d3c">MANAGEMENT sees everything</text>
<text x="24" y="48" class="s">+ approves escalations, configuration, users, own-wallet transfers, balance conversions, dues recovery, post-money voids, cross-group payouts</text>
<rect x="24" y="60" width="712" height="146" rx="9" fill="#eaf0f8" stroke="#1f4e8c" stroke-width="1.4"/><text x="38" y="80" class="h" fill="#1f4e8c">FINANCE sees all of Operations' view plus the economics</text>
<text x="38" y="96" class="s">reference rate at capture · spread and averages · margin and earnings · pool · cost breakdown · ledger balances · variances · referral and rebate accruals</text>
<text x="38" y="110" class="s">+ approves quotes, rate versions, conversions, settlements, exceptions; proposes configuration; owns reconciliation and the Finance Log</text>
<rect x="38" y="122" width="684" height="72" rx="8" fill="#fbf1e6" stroke="#8a3a00" stroke-width="1.4"/><text x="52" y="142" class="h" fill="#8a3a00">OPERATIONS sees the operational view</text>
<text x="52" y="158" class="s">parties · states · references · instructions · amounts moved · sender-facing prices · partner rates as entered · one available-to-pay figure per partner</text>
<text x="52" y="172" class="s">never: reference rate at capture, spread, margin, pool, cost breakdown, ledger balances, variances, earnings — on any screen, export, message or report</text>
<text x="52" y="186" class="s">initiates: quotes, verifications, conversions, disbursements, reroute and endpoint requests, registrations, FEE_DECISION proposals</text>
</svg><figcaption>Figure 1 — Cumulative visibility. Each ring sees everything inside it. Rights to approve grow outward; rights to see never shrink.</figcaption></figure>`;

const matrixRows = MATRIX.map(([mod, rows]) => rows.map((r, i) => {
  const [label, g, fields] = r; const rt = RIGHTS[g];
  return `<tr>${i === 0 ? `<td class="mod" rowspan="${rows.length}">${esc(mod)}</td>` : ""}<td>${esc(label)}</td><td>${esc(GROUPS[g].name)}</td><td class="r-ops">${esc(rt[0])}</td><td class="r-fin">${esc(rt[1])}</td><td class="r-mgmt">${esc(rt[2])}</td><td class="small">${esc(fields)}</td></tr>`;
}).join("")).join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Roles &amp; Visibility Matrix v${V}</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Deliverable 6 — Roles &amp; Visibility Matrix · Draft v${V}</p><p class="org">New XP Technologies Limited</p><p class="date">${DATE} · Confidential</p></div>
<p><b>Status:</b> Built against ERD &amp; Data Model Draft v${D.version}, the Transaction Lifecycle &amp; Approval State Machines v1.1 and the Project Understanding v1.1 (§9, roles and visibility). It turns the one-sentence rule — Operations sees the least, Finance sees everything Operations sees plus the economics, Management sees everything — into a concrete table: for every module and every group of fields, who may view, enter, propose and approve. Appendix A applies the same classification to every one of the ${totalFields} fields of the ${Object.keys(D.E).length} tables and views, so the build has one list to implement and the acceptance tests in Section 6 have one list to check against: ${hiddenFromOps} fields are never shown to Operations.<br>
<b>Audience:</b> NPL Management, who own the roles, and the New XP engineering team, for whom this is the build and acceptance reference for permissions.</p>
<div class="rule"></div>

<h2>1 · The model in one page</h2>
<p>Three roles, three nested rings. <b>Operations</b> runs deals: quotes, verifies collections, instructs conversions, prepares disbursements, enters partner rates, requests reroutes and records partner approvals. <b>Finance</b> sees everything Operations sees plus the economics, approves what Operations initiates, resolves exceptions, proposes configuration and owns reconciliation. <b>Management</b> sees everything and approves the heavier actions, every configuration change and every user change. Visibility is <i>cumulative</i> — a wider role never loses a narrower role's view — and approval is <i>maker-checker</i>: the person who initiates an action is never the person who approves it, enforced by the server, not by convention.</p>
${nest}
<div class="box"><b>Derived economics — the eight things Operations never sees.</b> The reference rate at capture · the spread and rolling averages · NPL's margin and earnings · the pool resting at a partner · the cost breakdown (partner cost, bank and network fees, variance, referral, rounding) · ledger balances · variances and exceptions in figures · referral and rebate accruals. The rule applies on <i>any screen, export, message or report</i>; it is enforced where values leave the system, not in the user interface.</div>

<h2>2 · Field groups</h2>
<p>Every field of every table belongs to exactly one of eight groups, and the group decides who sees it. The groups are the unit of enforcement: the build filters by group, and the tests check by group.</p>
<table><thead><tr><th style="width:20%">Group</th><th style="width:22%">Who sees it</th><th>What it holds</th></tr></thead><tbody>
${Object.entries(GROUPS).map(([k, g]) => `<tr><td><b>${esc(g.name)}</b></td><td>${esc(g.who)}</td><td>${esc(g.desc)}</td></tr>`).join("")}
</tbody></table>

<section class="land"><h2>3 · The matrix: view and approval rights by module and field group</h2>
<p class="small">view = may read · enter = may create or edit the operational record · propose = may submit a change for approval · approve = may approve within the role's scope · confirm = Finance confirms a partner rate version · — = no access. Approvals of controlled actions are in Section 4; configuration is always proposed by Finance and approved by Management.</p>
<table style="font-size:8.4pt"><thead><tr><th style="width:11%">Module</th><th style="width:22%">Field group in this module</th><th style="width:11%">Group</th><th style="width:11%">Operations</th><th style="width:11%">Finance</th><th style="width:11%">Management</th><th>Tables and fields covered</th></tr></thead><tbody>
${matrixRows}
</tbody></table>
</section>

<section class="land"><h2>4 · Approval rights per controlled action</h2>
<p class="small">The approving role is always a different user from the initiator. "Escalates to Management when" lists the conditions that add a Management approval on top of, not instead of, the approving role's. Identical to §4 of the Lifecycle &amp; Approvals document, from the same source.</p>
<table style="font-size:8.4pt"><thead><tr><th style="width:21%">Controlled action</th><th style="width:9%">Initiates</th><th style="width:11%">Approves</th><th style="width:29%">Escalates to Management when</th><th>On rejection</th></tr></thead><tbody>
${ACTIONS.map((a) => `<tr>${a.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}
</tbody></table>
</section>

<h2>5 · Enforcement rules (build reference)</h2>
<ol>
<li><b>Role on the user.</b> ${c("USER.role")} is one of operations, finance, management; one role per user; rights follow Sections 3 and 4 with no per-user exceptions.</li>
<li><b>Server-side field filtering on every read.</b> Each table's fields carry the group of Appendix A. Any read by an Operations user strips the fields of groups <i>Reference rate and comparison</i>, <i>Margin, pool, cost breakdown</i> and <i>Ledger and balances</i> before the response is built; the same filter applies to list views, search, exports, generated documents, notifications, messages and scheduled reports. The user interface receives only what the role may see, so nothing can be revealed by inspecting a page or a cached response.</li>
<li><b>Derived figures follow their inputs.</b> A figure computed from a hidden field is hidden; a total, average or chart that would reveal a hidden field is hidden. The one exception is deliberate: Operations sees the <i>amount available to pay out</i> per partner × currency as a single number, because preparing a disbursement needs it.</li>
<li><b>Writes are role-scoped.</b> Operations may create and edit operational records only (group <i>Operational</i>, <i>Sender-facing prices</i> through quoting, <i>Partner rates as entered</i>); Finance may additionally resolve exceptions and record reconciliation; configuration and users are written only through an approved proposal.</li>
<li><b>Maker-checker at the approval endpoint.</b> ${c("APPROVAL.approved_by")} must differ from ${c("APPROVAL.requested_by")}; Operations is never an approver; the escalation conditions of Section 4 add a Management approval rather than replacing Finance's; when only one Finance user is on shift a Management countersignature stands in for the second Finance user and is recorded as a countersignature.</li>
<li><b>Nothing is deleted.</b> Rejections keep the request, the decision and the mandatory reason; a re-submission is a new approval that points at the rejected one; ${c("AUDIT_LOG")} records actor, time, reason and record version for every controlled action and every configuration change.</li>
<li><b>Users and roles need two Management users.</b> Creating, changing or removing a user or role is a Management action approved by a second Management user.</li>
<li><b>Exceptions are shown as blockers, not as figures.</b> A frozen partner × pair, an open variance exception, an open offset and custody aging appear to Operations as the state that blocks their work and the role that must act; the spread, variance, offset amount and custody balance are Finance's view.</li>
</ol>
<div class="box"><b>One point for Management to confirm.</b> Operations enters the partner's rate and sees the sender rate and the amount the receiver is owed. For a disclosed-rate partner those three numbers let a careful user work out NPL's gross margin on a deal by hand. The policy hides the <i>computed</i> figures, not the inputs Operations must handle; this follows today's practice (Operations types the agent rate) and the Understanding document's wording. If Management wants the inference closed too, the partner's rate would have to be entered by Finance — a change to who does what, not to this matrix.</div>

<h2>6 · Acceptance tests</h2>
<p>The build passes when every test below holds for every role. Tests are stated as scenario → expected outcome; the field lists they refer to are those of Appendix A.</p>
<table><thead><tr><th style="width:18%">Test</th><th style="width:38%">Scenario</th><th>Expected</th></tr></thead><tbody>
${TESTS.map(([t, s, e]) => `<tr><td><b>${esc(t)}</b></td><td>${esc(s)}</td><td>${esc(e)}</td></tr>`).join("")}
</tbody></table>
<p class="small"><i>Draft v${V} — for review with NPL. The group assignments in Appendix A are New XP's proposal from the Understanding document's §9 and are the decision Management is asked to confirm.</i></p>

<h2 class="pb">Appendix A · Every field, its group, its rights</h2>
<p class="small">Generated from the data model (Draft v${D.version}). Rights per role as in Section 2; "view · enter" means Operations creates or edits the record in the normal course; actor fields (who approved, verified, posted) belong to the approvals group.</p>
${appendix}
</body></html>`;

const h = path.join(outDir, `NPLify-Roles-and-Visibility-Matrix-v${V}.html`), p = path.join(outDir, `NPLify-Roles-and-Visibility-Matrix-v${V}.pdf`);
fs.writeFileSync(h, html);
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "fields:", totalFields, "hidden from Operations:", hiddenFromOps, JSON.stringify(counts));
