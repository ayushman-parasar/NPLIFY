// Build docs/NPLify-Roles-and-Visibility-Matrix-v5.9.{html,pdf}: the cumulative-visibility model
// (Operations ⊂ Finance ⊂ Management) as a per-module, per-field-group table of view and approval
// rights, the approval rights per controlled action (ROLE_RIGHT rows, D44), the enforcement rules,
// acceptance tests, and a field-by-field appendix generated from data/erd.v5.json (every one of the
// model's tables and views must be mapped; the build refuses otherwise).   node scripts/build-roles-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ACTIONS } from "./controlled-actions.mjs";
import { clientFacing } from "./client-facing.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));
const REVIEW = !!process.env.NPLIFY_REVIEW;                      // round-2 review marks: yellow = new, red strike = goes
const outDir = process.env.NPLIFY_OUT || path.join(root, "docs");
const mk = (t) => (REVIEW ? `<mark class="rev">${t}</mark>` : t);
const dl = (t) => (REVIEW ? `<del class="rev">${t}</del> ` : "");
const REV_TABLES = new Set(["BANK_ACCOUNT_DETAILS", "BANK_DETAILS_TEMPLATE"]), REV_FIELD = "bank_account_details_id";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const c = (s) => `<code>${esc(s)}</code>`;
const V = D.version, DATE = "22 October 2026";

// ------------------------------------------------------------------ field groups
// Every field of every table belongs to exactly one group; the group decides who may see it.
const GROUPS = {
  OPS: { name: "Operational", who: "Operations · Finance · Management", desc: "Identities, states, references, timestamps, instructions, parties, accounts, endpoints, screenings, quote packages, invoices and the amounts that physically move (collected, released, confirmed, returned, discharged). Everything Operations needs to run a deal." },
  PRICE: { name: "Sender-facing prices", who: "Operations · Finance · Management", desc: "What the sender is quoted and pays: the sender rate, the fee percentages applied to the sender and receiver, the tier that applied, the customer-facing fee and rate the quote prints, the gross and net amounts promised. Visible to Operations because they are what the customer sees." },
  PRATE: { name: "Partner rates as entered", who: "Operations · Finance · Management", desc: "The rate a partner quoted, as Operations typed it in (with its direction and, for cash, its city); the partner's pricing style; what the partner actually delivered; the rate a payout line was discharged at. Entered by Operations, so visible to Operations." },
  REF: { name: "Reference rate and comparison", who: "Finance · Management", desc: "The market snapshot at capture, the day's comparison, spreads, rolling averages, breach thresholds. Operations sees only whether a partner × pair is usable or frozen." },
  ECON: { name: "Margin, pool, cost breakdown", who: "Finance · Management", desc: "NPL's margin and earnings, the expected conversion the engine computed, the four variances by cause, rounding residuals, partner fees, minimum margins, earnings resting at partners and offset between them, rebates, markup shares, bank and network fees as costs, loss shares and recoveries, FX_RESULT, the reseller and remittance margins and NPL's profit, and every figure converted into the reporting currency." },
  LEDGER: { name: "Ledger and balances", who: "Finance · Management", desc: "Accounts, transactions, postings, and every balance derived from them: client balance per partner, group entitlement, offsets, custody, the client-level roll-up. Operations sees one figure only: the amount available to pay out at a partner." },
  CONFIG: { name: "Configuration and master data", who: "view: all · propose: Finance · approve: Management", desc: "Clients, project settings, pairs and rounding, thresholds, partner configuration, cutoffs and holidays, fee structures and tiers, destination approvals, templates, system settings. Visible to everyone who operates them; changed only through Finance's proposal and Management's approval." },
  CTRL: { name: "Approvals, audit, users, roles", who: "own requests: Operations · all: Finance · Management", desc: "Approval records, the audit log, record locks, users, roles and the rights per controlled action." },
};
// Entities whose every field belongs to one group
const ENTITY_GROUP = {
  // configuration
  PROJECT: "CONFIG", PARTNER: "CONFIG", RATE_SOURCE: "CONFIG", MARKUP_SHARE_PARTY: "CONFIG", SENDER: "CONFIG", RECEIVER_GROUP: "CONFIG", RECEIVER: "CONFIG", OWN_WALLET: "CONFIG", THRESHOLD: "CONFIG",
  CURRENCY_PAIR: "CONFIG", PARTNER_CONFIG: "CONFIG", COLLECTION_SENDING_ENTITY: "CONFIG", SENDER_RECEIVER_ALLOW: "CONFIG", RECEIVING_ENTITY: "CONFIG", PAIR_RATE_SOURCE: "CONFIG", SETTLEMENT_SENDING_ENTITY: "CONFIG",
  FEE_OVERRIDE: "CONFIG", RECEIVING_ENTITY_ACCOUNT: "CONFIG", DESTINATION_APPROVAL: "CONFIG", PARTNER_ENTITY: "CONFIG", COLLECTION_RECEIVING_ENDPOINT: "CONFIG", FEE_TIER: "CONFIG", PARTNER_CUTOFF_OVERRIDE: "CONFIG",
  HOLIDAY: "CONFIG", MESSAGE_TEMPLATE: "CONFIG", CLIENT: "CONFIG", SYSTEM_SETTING: "CONFIG", WALLET_SCREENING: "OPS",
  MARKUP_SHARE_RULE: "ECON", PARTNER_REBATE_RULE: "ECON", BANK_ACCOUNT_DETAILS: "CONFIG", BANK_DETAILS_TEMPLATE: "CONFIG",
  // rates
  MARKET_RATE: "REF",
  // deal
  COLLECTION: "OPS", SENDER_CREDIT: "OPS", EARNINGS_RECEIVABLE: "ECON", ENTITLEMENT_REATTRIBUTION: "LEDGER", DEAL_FEE_TIER: "PRICE", INVOICE: "OPS", QUOTE_VALIDITY_EXTENSION: "OPS", EARNINGS_OFFSET: "ECON",
  // settlement
  SETTLEMENT: "OPS", SETTLEMENT_RETURN: "OPS", CONFIRMATION: "OPS", SHORTFALL: "OPS", MARKUP_SHARE_ACCRUAL: "ECON", PARTNER_REBATE_ACCRUAL: "ECON", LOSS_RECOVERY: "ECON",
  // ledger and controls
  LEDGER_TRANSACTION: "LEDGER", LEDGER_POSTING: "LEDGER", LEDGER_ACCOUNT: "LEDGER", OPENING_ENTRY: "LEDGER", PARTNER_STATEMENT_RECONCILIATION: "LEDGER",
  USER: "CTRL", APPROVAL: "CTRL", AUDIT_LOG: "CTRL", RECORD_LOCK: "CTRL", ROLE: "CTRL", ROLE_RIGHT: "CTRL", EMERGENCY_ACTION: "CTRL",
  // views
  PROJECT_BALANCE: "LEDGER", GROUP_ENTITLEMENT: "LEDGER", OFFSET: "LEDGER", CUSTODY: "LEDGER", INVOICE_BALANCE: "OPS", PROJECT_MONTH_VOLUME: "PRICE", CLIENT_POSITION: "LEDGER", WALLET_REGISTRY: "OPS",
  REPORTING_VALUE: "ECON", RESELLER_MARGIN: "ECON", REMITTANCE_MARGIN: "ECON", NPL_PROFIT: "ECON",
};
// Field-level exceptions: entity -> field -> group ("*" is the entity's default)
const FIELD_GROUP = {
  PARTNER_PAIR: { "*": "CONFIG", partner_fee_pct: "ECON" },
  FEE_STRUCTURE: { "*": "CONFIG", min_margin_pct: "ECON", variance_threshold_rel: "REF", customer_facing_fee_basis: "PRICE", customer_facing_fee_pct: "PRICE" },
  SETTLEMENT_RAIL: { "*": "CONFIG", expected_bank_fee: "ECON" },
  RATE_COMPARISON: { "*": "REF", id: "OPS", partner_pair_id: "OPS", rate_date: "OPS", status: "OPS" },
  PARTNER_RATE_VERSION: { "*": "PRATE", spread_pct: "REF", market_rate_id: "REF", status: "OPS", approval_reason: "CTRL" },
  DEAL_GROUP: { "*": "OPS", sender_rate: "PRICE", fee_structure_id: "PRICE", amount_in: "PRICE", target_out: "PRICE", customer_facing_fee_pct: "PRICE", customer_facing_rate: "PRICE", invoice_rate: "PRICE" },
  DEAL: { "*": "OPS", market_rate_id: "REF", partner_rate_version_id: "PRATE", fee_structure_id: "PRICE", sender_rate: "PRICE", amount_in: "PRICE", gross_out: "PRICE", client_net: "PRICE", fee_sender_part: "PRICE", fee_receiver_part: "PRICE", fee_override_id: "PRICE", fee_tier_id: "PRICE", tier_volume_basis: "PRICE" },
  CONVERSION: { "*": "OPS", partner_rate_version_id: "PRATE", actual_out: "PRATE", expected_out: "ECON", variance: "ECON", basis_variance: "ECON", residual_in: "ECON", rounding_residual: "ECON", fee_receiver_part: "PRICE" },
  BALANCE_CONVERSION: { "*": "OPS", market_rate_id: "REF", partner_rate_version_id: "PRATE", actual_out: "PRATE", expected_out: "ECON", variance: "ECON", rounding_residual: "ECON" },
  REROUTE: { "*": "OPS", forwarding_policy: "ECON", recovered_amount: "ECON", partner_agreement_ref: "ECON" },
  QUOTE_PACKAGE: { "*": "OPS", printed_source_rate: "PRICE", printed_fee_pct: "PRICE", printed_amount_out: "PRICE" },
  SETTLEMENT_LINE: { "*": "OPS", discharge_rate: "PRATE", discharge_market_rate_id: "REF" },
  BANK_FEE_EVENT: { "*": "OPS", expected_amount: "ECON", actual_amount: "ECON" },
  FEE_DECISION: { "*": "OPS", pct: "ECON" },
  LOSS_EVENT: { "*": "OPS", sender_share: "ECON", npl_share: "ECON", partner_share: "ECON", client_share: "ECON", pool_funded: "ECON", wallet_funded: "ECON", funding_reference: "ECON" },
  CLIENT: { "*": "CONFIG", exposure_ceiling: "ECON" },
  PROJECT: { "*": "CONFIG", exposure_ceiling: "ECON" },
};
const ACTOR_FIELDS = new Set(["approved_by", "requested_by", "verified_by", "confirmed_by", "posted_by", "prepared_by", "escalated_to", "locked_by", "actor_id", "screened_by", "recorded_by", "sent_by", "rate_override_approved_by", "recommended_by", "relationship_owner"]);
for (const n of Object.keys(D.E)) if (!ENTITY_GROUP[n] && !(FIELD_GROUP[n] && FIELD_GROUP[n]["*"])) throw new Error(`entity ${n} has no field group`);
for (const n of Object.keys(ENTITY_GROUP)) if (!D.E[n]) throw new Error(`mapped entity ${n} is not in the model`);
for (const n of Object.keys(FIELD_GROUP)) { if (!D.E[n]) throw new Error(`mapped entity ${n} is not in the model`); for (const f of Object.keys(FIELD_GROUP[n])) if (f !== "*" && !D.E[n].f.some((x) => x[0] === f)) throw new Error(`${n}.${f} is not in the model`); }
function groupOf(entity, field) {
  if (ACTOR_FIELDS.has(field)) return "CTRL";
  const fg = FIELD_GROUP[entity];
  if (fg) return fg[field] || fg["*"] || ENTITY_GROUP[entity] || "OPS";
  return ENTITY_GROUP[entity];
}
const RIGHTS = { // group -> [Operations, Finance, Management]
  OPS: ["view · enter", "view", "view"], PRICE: ["view (quotes)", "view", "view"], PRATE: ["view · enter", "view · confirm", "view"],
  REF: ["usable / frozen only", "view · approve breach", "view"], ECON: ["—", "view", "view"], LEDGER: ["available-to-pay figure only", "view · reconcile", "view"],
  CONFIG: ["view", "view · propose", "view · approve"], CTRL: ["own requests", "view all · approve own scope", "view all · approve · users and roles"],
};

// ------------------------------------------------------------------ the matrix by module
const MATRIX = [
  ["Clients and system", [
    ["Clients, their projects, system settings and the reporting currency", "CONFIG", "CLIENT, PROJECT.client_id, SYSTEM_SETTING, platform-scope CURRENCY_PAIRs (D38, D43, D44)"],
    ["Exposure ceilings (project and client)", "ECON", "PROJECT.exposure_ceiling, CLIENT.exposure_ceiling — compared through REPORTING_VALUE; Operations sees that a release is blocked, not the figure"]]],
  ["Configuration", [
    ["Project, pairs and rounding, rate-source chains, thresholds, own wallets, templates", "CONFIG", "PROJECT, CURRENCY_PAIR (amount_rounding, cash_rounding), PAIR_RATE_SOURCE, THRESHOLD, OWN_WALLET (role), MESSAGE_TEMPLATE"],
    ["Parties: senders, groups, receivers, entities, accounts, allow-lists", "CONFIG", "SENDER, SENDER_RECEIVER_ALLOW, COLLECTION_SENDING_ENTITY, RECEIVER_GROUP, RECEIVER, RECEIVING_ENTITY, RECEIVING_ENTITY_ACCOUNT (single_use)"],
    ["Bank account details, in full (holder, bank, IBAN or account number, BIC, sort code …) and the templates per rail", "CONFIG", "BANK_ACCOUNT_DETAILS, BANK_DETAILS_TEMPLATE — Operations enters, Finance or Management approves; all three roles read in full, no masking; every full read is logged (rule 10)", true],
    ["Partner block: methods, cutoff and holidays, pairs, vehicles, endpoints, rails, narratives, destination approvals", "CONFIG", "PARTNER (supported_methods, bank_cutoff_time), PARTNER_CUTOFF_OVERRIDE, HOLIDAY, PARTNER_CONFIG (is_own_desk), PARTNER_PAIR (needs_bank_lock), PARTNER_ENTITY, COLLECTION_RECEIVING_ENDPOINT (risk_band, single_use), SETTLEMENT_SENDING_ENTITY, SETTLEMENT_RAIL, DESTINATION_APPROVAL"],
    ["Fee structures, tiers and overrides (the percentages applied to the sender and receiver; what the quote prints)", "CONFIG", "FEE_STRUCTURE (pct, sender_pays_pct, receiver_pays_pct, min_markup_pct, max_markup_pct, rate_basis, mode, customer_facing_*), FEE_TIER, FEE_OVERRIDE"],
    ["Minimum margin, partner fee, variance thresholds, expected bank fees", "ECON", "FEE_STRUCTURE.min_margin_pct, PARTNER_PAIR.partner_fee_pct, FEE_STRUCTURE.variance_threshold_rel, SETTLEMENT_RAIL.expected_bank_fee"],
    ["Markup-share and rebate terms", "ECON", "MARKUP_SHARE_PARTY (name only is configuration), MARKUP_SHARE_RULE (basis, pct, settlement_mode), PARTNER_REBATE_RULE (basis, pct, payout_currency)"]]],
  ["Rates", [
    ["Partner rate of the day, as quoted (rate, direction, city), its version and whether it is usable", "PRATE", "PARTNER_RATE_VERSION.quoted_rate, quoted_direction, rate, location, version_no, expires_at, status (usable / frozen)"],
    ["Market snapshots, day comparison, spread, averages, breach", "REF", "MARKET_RATE, RATE_COMPARISON, PARTNER_RATE_VERSION.spread_pct and the breach decision"]]],
  ["Quoting", [
    ["Deal group and legs: parties, states, references, clocks, extensions, packages", "OPS", "DEAL_GROUP, DEAL (identities, leg_type, funding_source, states, sent_at, effective_valid_until, grace_until, rate_locked_at, cutoff_at, conversion_due_date), QUOTE_PACKAGE, QUOTE_VALIDITY_EXTENSION, the invoice a group collects"],
    ["Sender-facing price: sender rate, fee applied, tier, customer-facing figures, amounts promised", "PRICE", "DEAL_GROUP.sender_rate, customer_facing_fee_pct, customer_facing_rate, invoice_rate; DEAL.sender_rate, amount_in, gross_out, client_net, fee_sender_part, fee_receiver_part, fee_override_id, fee_tier_id; DEAL_FEE_TIER; PROJECT_MONTH_VOLUME; the printed figures of a QUOTE_PACKAGE"],
    ["Reference rate stamped on the leg", "REF", "DEAL.market_rate_id"]]],
  ["Collection", [
    [["Parts, endpoints, evidence, verification; cash tokens and counts" + dl("; wallet screening")], "OPS", ["COLLECTION (amount, endpoint, evidence_ref, state, token_ref, counted_at, sending_address), " + dl("WALLET_SCREENING, ") + "WALLET_REGISTRY"]],
    ["Wallet screening: the provider's report as returned, the result, the decision and who made it", "OPS", "WALLET_SCREENING — Operations screens and accepts a clear report; a report that is not clear is Management's second look (ROLE_RIGHT screening_second_look); Finance has no right on it; the decision is write-once; a partner's hold, freeze or decline is an event (REROUTE, LOSS_EVENT, EMERGENCY_ACTION) that no role at NPL lifts (rule 11)", true],
    ["Overpayment credit", "OPS", "SENDER_CREDIT"]]],
  ["Conversion", [
    ["Instruction, partner rate used, what the partner delivered", "PRATE", "CONVERSION.partner_rate_version_id, actual_out, calc_mode, state"],
    ["Expected conversion, variances by cause, residuals, margin retained, margin recognised", "ECON", "CONVERSION.expected_out, variance, basis_variance, residual_in, rounding_residual; EARN_GROSS, VAR_CONVERSION, VAR_CUTOFF, VAR_RATE_HONOUR postings"]]],
  ["Settlement", [
    ["Runs, lines, destinations, confirmations, shortfalls, returns; invoice lines discharged", "OPS", "SETTLEMENT (incl. cutoff_at, execution_due_date), SETTLEMENT_LINE (deal_id, outcome, invoice_id, obligation_discharged, token_ref, evidence_ref), CONFIRMATION, SHORTFALL, SETTLEMENT_RETURN, INVOICE_BALANCE"],
    ["Amount available to pay out at a partner", "LEDGER", "PROJECT_BALANCE due figure (one number per partner × currency, no postings)"],
    ["Bank fee expected vs actual, covered fees, fee decisions", "ECON", "BANK_FEE_EVENT.expected_amount, actual_amount; FEE_DECISION.pct"]]],
  ["Losses, reroutes and balance conversions", [
    ["Request, phase, outcome, custody wallet, alternate partner; the loss event as a fact (side, amount, reason)", "OPS", "REROUTE (trigger, phase, outcome, own_wallet_id, alternate partner), BALANCE_CONVERSION (request fields), LOSS_EVENT (side, amount, reason, state)"],
    ["Loss split and recoveries, how the make-good was funded; dues recovered, forwarding policy; expected out and variance of a balance conversion", "ECON", "LOSS_EVENT shares, pool_funded, wallet_funded; LOSS_RECOVERY; REROUTE.forwarding_policy, recovered_amount, partner_agreement_ref; BALANCE_CONVERSION.expected_out / variance; ENTITLEMENT_REATTRIBUTION"]]],
  ["Earnings, shares and rebates", [
    ["Earnings resting at partners, offsets between partners, accruals, reconciliation, payment", "ECON", "EARNINGS_RECEIVABLE, EARNINGS_OFFSET, MARKUP_SHARE_ACCRUAL, PARTNER_REBATE_ACCRUAL, FX_RESULT postings"]]],
  ["Reseller project (NPL-GR)", [
    ["The two invoices as obligations: amounts, parties, what each line discharged", "OPS", "INVOICE (kind, amount, currency, vendor_invoice_id), INVOICE_BALANCE, DEAL_GROUP.invoice_amount"],
    ["Reseller and remittance margins, forex true-ups, NPL's profit", "ECON", "RESELLER_MARGIN, REMITTANCE_MARGIN, NPL_PROFIT, VAR_FX_TIMING and RESELL_* postings"]]],
  ["Ledger and reconciliation", [
    ["Accounts, transactions, postings, balances, identities, the client roll-up; opening entries and partner statement reconciliations", "LEDGER", "LEDGER_ACCOUNT, LEDGER_TRANSACTION, LEDGER_POSTING, OPENING_ENTRY, PARTNER_STATEMENT_RECONCILIATION, PROJECT_BALANCE, GROUP_ENTITLEMENT, OFFSET, CUSTODY, CLIENT_POSITION"],
    ["Figures in the reporting currency", "ECON", "REPORTING_VALUE (any per-currency figure converted at the latest platform-pair rate, D43)"]]],
  ["Reports, exports and messages", [
    ["Operational reports and sender-facing documents", "OPS", "deal lists, collection and settlement reports, quote packages rendered from MESSAGE_TEMPLATE (sender-facing fields only, D36), partner instructions, the client journal"],
    ["Economic reports: margin, pool, cost breakdown, variances, earnings, offsets, losses, reseller margins, Finance Log", "ECON", "every report, export, message or notification that carries a value from groups REF, ECON or LEDGER"]]],
  ["Administration", [
    ["Approvals: request, approve, reject, escalate", "CTRL", "APPROVAL"],
    ["Audit log, record locks and emergency actions", "CTRL", "AUDIT_LOG, RECORD_LOCK, EMERGENCY_ACTION"],
    ["Users, roles and rights per controlled action", "CTRL", "USER (role_id), ROLE (sees_economics), ROLE_RIGHT (may_initiate, may_approve, escalates_to_role_id)"]]],
];

// ------------------------------------------------------------------ acceptance tests
const TESTS = [
  ["Field stripping on read", "An Operations user requests any deal, conversion, balance conversion, reroute, loss event or offset through the API or the screen.", "The response contains no field of groups REF, ECON or LEDGER (Appendix A lists them by table); the same request by Finance contains them all."],
  ["Field stripping on export", "Operations exports a deal list, a settlement report, a quote package or the client journal.", "No column, footnote or total derived from groups REF, ECON or LEDGER appears; Finance's export of the same report carries them."],
  ["Customer-facing figures", "Operations opens a quote-first deal.", "The sender rate, the customer-facing fee and rate, the tier and the amounts promised are shown (group Sender-facing prices); the market snapshot, the spread and NPL's margin are not."],
  ["Notifications", "A variance exception, a breached rate version, an open offset, a negative pool or an unfunded make-good is raised while an Operations user is on shift.", "Operations is told the item is blocked and why in operational terms (\"rate version frozen — awaiting Finance\"); the spread, variance, offset amount or shortfall of funds is not in the notification."],
  ["Available-to-pay figure", "Operations prepares a settlement at a partner.", "The screen shows one figure per partner × currency (amount available to pay out) and no posting, pool or entitlement detail."],
  ["Loss events", "Operations records a loss event and later views it.", "Side, amount, reason and state are visible; the split across partner, sender, client and NPL, how the make-good was funded and the recoveries are not (group Margin, pool, cost breakdown)."],
  ["Maker-checker from rows", "A user approves an APPROVAL they requested themselves, or a user whose ROLE has no ROLE_RIGHT row with may_approve for the action approves it.", "The server refuses with a reason; nothing changes; the attempt is in the audit log."],
  ["Escalation adds, never replaces", "A settlement above the settlement limit is approved by Finance only.", "It stays Approved-pending-Management; release is refused until a Management approval exists in addition to Finance's (ROLE_RIGHT.escalates_to_role_id)."],
  ["Countersign", "Only one Finance user is on shift and a release needs a second Finance approval.", "A Management countersignature is accepted in place of the second Finance user, and recorded as such."],
  ["Configuration path", "Finance edits a threshold, fee structure, tier, holiday, template or partner configuration directly.", "Refused: configuration changes are proposals by Finance that become effective only on Management approval, as a new version with an effective date."],
  ["Own requests only", "Operations lists approvals.", "Only approvals Operations initiated are returned; Finance and Management see all."],
  ["Users and roles", "A Management user creates, changes or removes a user, a role or a ROLE_RIGHT row.", "A second Management user must approve; one Management user alone cannot."],
  ["Rejection reason", "Any approval is rejected.", "The reason is mandatory, is shown to the initiator, and any economic figure inside it is stripped for Operations."],
  ["Audit", "Any controlled action is taken.", "AUDIT_LOG holds actor, time, reason and record version; APPROVAL holds requester, approver and state; neither can be edited or deleted."],
  ["No client-side leakage", "Any screen shown to Operations is inspected (page source, network responses, cached data).", "No value of groups REF, ECON or LEDGER is present, even hidden: the filtering happens on the server, not in the user interface."],
  ["Template fields", "A quote template is saved with a field outside the sender-facing set, or a message is rendered for a sender.", "The template is refused (MESSAGE_TEMPLATE.printed_fields); a rendered message never carries a partner rate, a margin or a cost (D36)."],
  [mk("A hold cannot be cleared from any channel"), mk("A Finance or Operations user tries to lift a partner's hold, freeze or decline, or to change a screening decision of reject, through the screen, the API, an export re-imported, or a re-submitted or replayed approval request."), mk("Refused in every channel: the decision field is write-once, the replayed request returns the first result and writes nothing, and each attempt is in the audit log. Only a new screening row decided by Management changes what the address may do, and only for NPL's own alert, never for a partner's block (rule 11).")],
  [mk("Fallback workbook and incident channels"), mk("An Operations user opens the fallback workbook, the day's notifications, a monitoring alarm and the incident raised on the delivery board; the share lists of both workbooks are read."), mk("The operational workbook holds no partner balance, pool, margin or spread; the Finance workbook is not shared with the Operations account; no notification, alarm, chat message or incident text carries a figure of groups REF, ECON or LEDGER; both share lists equal the user list by role, and a leaver's account is on neither (rule 12).")],
  [mk("Bank details read in full, and logged"), mk("A user of any role opens the bank-details card of an account, endpoint, rail or destination approval, or exports it."), mk("The card shows every field of the current BANK_ACCOUNT_DETAILS version unmasked; an AUDIT_LOG row (record_type BANK_ACCOUNT_DETAILS, field read, actor, time) exists for the read; a superseded version is shown only from the account's history, and the read of it is logged the same way.")],
];

// ------------------------------------------------------------------ appendix: every field, its group, its rights
const byDomain = (d) => Object.keys(D.E).filter((n) => D.E[n].d === d);
const DOMAIN_NAME = { config: "Configuration", rates: "Rates", deal: "Deal lifecycle", settle: "Settlement", ledger: "Ledger & controls", view: "Derived views" };
const appendix = Object.keys(DOMAIN_NAME).map((dom) => `<h3>${esc(DOMAIN_NAME[dom])}</h3>` + byDomain(dom).map((n) => {
  const e = D.E[n];
  const rows = e.f.map((f) => { const g = groupOf(n, f[0]); const r = [f[0], GROUPS[g].name, ...RIGHTS[g]]; return REVIEW && (REV_TABLES.has(n) || f[0] === REV_FIELD) ? r.map((c) => mk(esc(c))) : r.map(esc); });
  return `<h4>${REVIEW && REV_TABLES.has(n) ? mk(esc(n)) : esc(n)}</h4><table class="dd"><thead><tr><th style="width:30%">Field</th><th style="width:24%">Group</th><th>Operations</th><th>Finance</th><th>Management</th></tr></thead><tbody>
${rows.map((r) => `<tr><td class="mono">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join("")}</tbody></table>`;
}).join("")).join("");

// summary counts for the status line
const counts = {}; for (const n of Object.keys(D.E)) for (const f of D.E[n].f) { const g = groupOf(n, f[0]); counts[g] = (counts[g] || 0) + 1; }
const hiddenFromOps = (counts.REF || 0) + (counts.ECON || 0) + (counts.LEDGER || 0);
const totalFields = Object.values(counts).reduce((a, b) => a + b, 0);
const withCode = ACTIONS.filter((a) => a[5] !== "—");

// ------------------------------------------------------------------ HTML
const CSS = `
mark.rev{background:#ffe58a;color:inherit;padding:0 1px} del.rev{color:#b00020;text-decoration:line-through} .rev-note{background:#ffe58a;padding:3pt 6pt;font-size:9pt;margin:0 0 8pt}
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

const nest = `<figure class="chart"><svg viewBox="0 0 760 290" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cumulative visibility: Operations inside Finance inside Management">
<style>.s{font:8.4px Helvetica,Arial,sans-serif;fill:#333}.h{font:700 10.5px Helvetica,Arial,sans-serif}</style>
<rect x="10" y="12" width="740" height="266" rx="10" fill="#eaf3ea" stroke="#2f7d3c" stroke-width="1.4"/><text x="24" y="32" class="h" fill="#2f7d3c">MANAGEMENT sees everything</text>
<text x="24" y="47" class="s">+ approves escalations, configuration and system settings, users and roles, own-wallet transfers, balance conversions, dues recovery,</text>
<text x="24" y="59" class="s">earnings offsets, loss splits, covered fees, own desks, post-money voids, cross-group payouts</text>
<rect x="24" y="70" width="712" height="196" rx="9" fill="#eaf0f8" stroke="#1f4e8c" stroke-width="1.4"/><text x="38" y="90" class="h" fill="#1f4e8c">FINANCE sees all of Operations' view plus the economics</text>
<text x="38" y="105" class="s">reference rate at capture · spread and averages · margin and earnings · pool · cost breakdown · ledger balances · the four variances · FX_RESULT</text>
<text x="38" y="117" class="s">loss shares and recoveries · offsets · shares and rebates · reseller margins</text>
<text x="38" y="131" class="s">+ approves quotes, extensions, rate versions, conversions, settlements, exceptions; recommends covered fees; proposes configuration;</text>
<text x="38" y="143" class="s">owns reconciliation, true-ups and adjustments</text>
<rect x="38" y="154" width="684" height="100" rx="8" fill="#fbf1e6" stroke="#8a3a00" stroke-width="1.4"/><text x="52" y="174" class="h" fill="#8a3a00">OPERATIONS sees the operational view (ROLE.sees_economics = false)</text>
<text x="52" y="189" class="s">parties · states · references · instructions · amounts moved · sender-facing prices and the customer-facing figures · partner rates as entered</text>
<text x="52" y="201" class="s">one available-to-pay figure per partner</text>
<text x="52" y="215" class="s">never: reference rate at capture, spread, margin, pool, cost breakdown, ledger balances, variances, earnings, loss shares, offsets —</text>
<text x="52" y="227" class="s">on any screen, export, message or report</text>
<text x="52" y="241" class="s">initiates: quotes, extensions, screenings, verifications, conversions, settlements, reroute and endpoint requests, destination approvals,</text>
<text x="52" y="253" class="s">loss records, FEE_DECISION proposals</text>
</svg><figcaption>Figure 1 — Cumulative visibility. Each ring sees everything inside it. Rights to approve grow outward; rights to see never shrink.</figcaption></figure>`;

const matrixRows = MATRIX.map(([mod, rows]) => rows.map((r, i) => {
  const [label, g, fields, rv] = r; const rt = RIGHTS[g]; const W = (t) => (rv && REVIEW ? mk(t) : t); const X = (t) => (Array.isArray(t) ? t[0] : W(esc(t)));   // a cell given as [html] is inserted raw
  return `<tr>${i === 0 ? `<td class="mod" rowspan="${rows.length}">${esc(mod)}</td>` : ""}<td>${X(label)}</td><td>${W(esc(GROUPS[g].name))}</td><td class="r-ops">${W(esc(rt[0]))}</td><td class="r-fin">${W(esc(rt[1]))}</td><td class="r-mgmt">${W(esc(rt[2]))}</td><td class="small">${X(fields)}</td></tr>`;
}).join("")).join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Roles &amp; Visibility Matrix v${V}</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Roles &amp; Visibility Matrix · Draft v${V}</p><p class="small">Numbered with the ERD edition it is built against.</p><p class="org">New XP Technologies Limited</p><p class="date">${DATE} · Confidential</p></div>
<div class="rule"></div>

${REVIEW ? `<p class="rev-note"><b>Round-2 review draft, 27 October 2026 (findings 08.1 and 08.2 of the v6.0 design review, and the bank account details of 26 October).</b> Yellow = added or replaced; red strike = what goes.</p>` : ""}
<h2>How to read this pack</h2>
<p>Four map pages are now part of the pack as documents of their own, and are the place to start: the Top-Down Map (from the business, through the data model and the deal states, to the scenarios and the reading order), the Deal Flow on one page (Quote, Collect, Convert, Settle, with the roles and the money path), the Workflow Tree (8 classes, 27 sub-classes, 92 procedures, each naming who initiates, who approves, the codes it is written under and the records it touches) and the Workflow Tree on one page. Read them in that order, then this document. Every worked transaction (T), acceptance vector (L, B), walkthrough (W, X), flow (F) and procedure (C, A, D) has one identifier, listed in the Reading Companion's identifier register; the Test Strategy &amp; Coverage document says which test proves each procedure.</p>

<h2>1 · The model in one page</h2>
<p>Three roles, three nested rings. <b>Operations</b> runs deals: quotes and extends quotes, screens wallets, verifies collections, instructs conversions, prepares settlements, enters partner rates as quoted, requests reroutes, records destination approvals and loss events. <b>Finance</b> sees everything Operations sees plus the economics, approves what Operations initiates, resolves exceptions, recommends covered fees, requests balance conversions, dues recovery, earnings offsets and loss splits, proposes configuration and owns reconciliation. <b>Management</b> sees everything and approves the heavier actions, every configuration change and every user change. Visibility is <i>cumulative</i> — a wider role never loses a narrower role's view — and approval is <i>maker-checker</i>: the person who initiates an action is never the person who approves it, enforced by the server from the ROLE_RIGHT rows, not by convention.</p>
${nest}
<div class="box"><b>Derived economics — what Operations never sees.</b> The reference rate at capture · the spread and rolling averages · NPL's margin and earnings, retained or offset · the pool resting at a partner · the cost breakdown (partner fee, bank and network fees, rounding, loss) · the four variances by cause and FX_RESULT · ledger balances · markup-share and rebate accruals · a loss event's split, funding and recoveries · the reseller and remittance margins and NPL's profit · any figure converted into the reporting currency. The rule applies on <i>any screen, export, message or report</i>; it is enforced where values leave the system, not in the user interface. Operations does see the customer-facing fee and rate a quote prints (D22): they are what the sender sees.</div>

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

<section class="land"><h2>4 · Approval rights per controlled action — the ROLE_RIGHT rows</h2>
<p class="small">The approving role is always a different user from the initiator. "Escalates to Management when" lists the conditions that add a Management approval on top of, not instead of, the approving role's. The last column is the ${c("ROLE_RIGHT.action")} code; a row with a code is configuration (may_initiate, may_approve, escalates_to_role_id per role), a row marked — is an audited operational step. Identical to §5 of the Lifecycle &amp; Approvals document, from the same source.</p>
<table style="font-size:8.2pt"><thead><tr><th style="width:19%">Controlled action</th><th style="width:9%">Initiates</th><th style="width:10%">Approves</th><th style="width:30%">Escalates to Management when</th><th style="width:20%">On rejection</th><th>ROLE_RIGHT</th></tr></thead><tbody>
${ACTIONS.map((a) => `<tr>${a.map((x, i) => `<td${i === 5 ? ' class="mono"' : ""}>${/class="rev"/.test(x) ? x : esc(x)}</td>`).join("")}</tr>`).join("")}
</tbody></table>
</section>

<h2>5 · Enforcement rules (build reference)</h2>
<ol>
<li><b>Role on the user, rights on the role.</b> ${c("USER.role_id")} names one ${c("ROLE")} (operations, finance, management today); ${c("ROLE.sees_economics")} is false for Operations; ${c("ROLE_RIGHT")} holds one row per role × controlled action with may_initiate, may_approve and the role added on escalation (D44). Rights follow Sections 3 and 4 with no per-user exceptions; a new role is a Management-approved configuration change.</li>
<li><b>Server-side field filtering on every read.</b> Each table's fields carry the group of Appendix A. Any read by a role whose sees_economics is false strips the fields of groups <i>Reference rate and comparison</i>, <i>Margin, pool, cost breakdown</i> and <i>Ledger and balances</i> before the response is built; the same filter applies to list views, search, exports, generated documents, notifications, messages, the client journal and scheduled reports. The user interface receives only what the role may see, so nothing can be revealed by inspecting a page or a cached response.</li>
<li><b>Derived figures follow their inputs.</b> A figure computed from a hidden field is hidden; a total, average, chart or reporting-currency value that would reveal a hidden field is hidden. The one exception is deliberate: Operations sees the <i>amount available to pay out</i> per partner × currency as a single number, because preparing a settlement needs it. Customer-facing figures (D22) are not derived economics: they are what the quote prints.</li>
<li><b>Writes are role-scoped.</b> Operations may create and edit operational records only (group <i>Operational</i>, <i>Sender-facing prices</i> through quoting, <i>Partner rates as entered</i>); Finance may additionally resolve exceptions, record reconciliation, recoveries and true-ups; configuration, system settings, users and roles are written only through an approved proposal.</li>
<li><b>Maker-checker at the approval endpoint.</b> ${c("APPROVAL.approved_by")} must differ from ${c("APPROVAL.requested_by")}; the approver's role must hold may_approve for the action in ROLE_RIGHT (invariant 9); the escalation conditions of Section 4 add a Management approval rather than replacing Finance's; when only one Finance user is on shift a Management countersignature stands in for the second Finance user and is recorded as a countersignature.</li>
<li><b>Nothing is deleted.</b> Rejections keep the request, the decision and the mandatory reason; a re-submission is a new approval that points at the rejected one; ${c("AUDIT_LOG")} records actor, time, reason and record version for every controlled action and every configuration change.</li>
<li><b>Users and roles need two Management users.</b> Creating, changing or removing a user, a role or a ROLE_RIGHT row is a Management action approved by a second Management user.</li>
<li><b>Exceptions are shown as blockers, not as figures.</b> A frozen partner × pair, an open variance exception, an open offset, custody aging, a negative pool, an unfunded make-good and an open loss recovery appear to Operations as the state that blocks their work and the role that must act; the spread, variance, offset amount, pool and loss shares are Finance's view.</li>
<li><b>Messages print only what the template allows.</b> ${c("MESSAGE_TEMPLATE.printed_fields")} is the list of model fields a template may render; a quote template is sender-facing only (D36), so a message can never carry a partner rate, a margin or a cost whichever role sends it.</li>
<li>${mk("<b>Bank account details are read in full and read-logged.</b> BANK_ACCOUNT_DETAILS belongs to group <i>Configuration and master data</i>: Operations enters a row from the rail's template, Finance or Management approves it (controlled action bank_details_approve), and all three roles read every field unmasked, on one card component, because the people who instruct and verify transfers need the details as the bank sees them. In return every full read — card, export or API — writes an AUDIT_LOG row with the actor and time, and the quarterly access review (5a) samples those rows. The evidence files (bank letters, KYC, legal documents) stay under the restricted prefix of the file store, which only Finance and Management resolve.")}</li>
<li>${mk("<b>Screening outcomes have three owners, and there is no override right.</b> (1) A partner's sanctions or AML hold, freeze or decline is the partner's decision: no role at NPL has a right that lifts it; NPL records it as the event it is (REROUTE with trigger compliance_hold, LOSS_EVENT with reason account_frozen, EMERGENCY_ACTION of kind destination_freeze), routes around it, and records the partner's clearance reference when the partner lifts it. (2) NPL's own wallet screening is operational when the provider's report is clear under its Strict rulebook (Operations records accept) and a Management decision otherwise: the screening row requests the second look, Management decides accept, accept_alternate or reject with a reason (ROLE_RIGHT screening_second_look: may_initiate Operations, may_approve Management; no Finance row), and the approver is never the person who screened. The Finance right override_screening_reject no longer exists. (3) A technical false positive is a new screening row with its evidence, decided on its own report. Enforcement: WALLET_SCREENING.decision is write-once for every role and every channel (screen, API, export re-import, a re-submitted or replayed approval request, which carries the same idempotency key and returns the first result without writing); the provider's report is operational data the three roles read, while a partner's clearance letter is an evidence file under the restricted prefix.")}</li>
<li>${mk("<b>The field groups apply outside the application too.</b> The fallback workbook of the Architecture (the export every 15 minutes) is two workbooks, not two tabs: an operational workbook (open deals and their states, cutoffs, pending approvals, the partner rates of the day as entered, the amount available to pay out per partner and currency) shared with the Operations, Finance and Management accounts, and a Finance workbook (partner balances, pool, margins, spreads, the reconciliation figures) shared with Finance and Management only; tab-level protection is not relied on. Both are shared to named accounts, never by link; the export job writes through a service account; a leaver's account is removed from both on the day (procedure A.10) and the share lists are compared with the user list at the quarterly access review. Generated extracts and scheduled reports pass the same server-side filter as a screen (rule 2). Notifications, monitoring alarms, chat messages and incidents raised on the delivery board name the item and the state in operational terms (rule 8) and carry no figure of the groups Reference rate and comparison, Margin, pool, cost breakdown or Ledger and balances; the alarms of the Architecture's monitoring carry no deal figures at all.")}</li>
</ol>
<div class="box"><b>One point for Management to confirm.</b> Operations enters the partner's rate and sees the sender rate and the amount the receiver is owed. For a fee_on_market partner those three numbers let a careful user work out NPL's gross margin on a deal by hand. The policy hides the <i>computed</i> figures, not the inputs Operations must handle; this follows today's practice (Operations types the agent rate). If Management wants the inference closed too, the partner's rate would have to be entered by Finance — a change to who does what, not to this matrix.</div>

<h2>5a · Absence cover, scoped rights and delegation</h2>
<p>Three questions from the design review, answered with NPL's decisions of 19 and 20 October. None of them adds a role or a per-user right; rule 1 of Section 5 stands.</p>
<h3>${dl("10.")}${mk("13.")} Cover for staff absence is the role, not a delegation</h3>
<p>Rights belong to the role, so any user holding a role may do what that role permits; nothing is handed from one person to another when someone is on leave, off shift or unreachable. If a whole role is unavailable, a user of a wider role may work a narrower role's steps through an account of that role (a Finance user takes an Operations-role account for the Operations steps and returns to the Finance account for the Finance steps). One safeguard makes this safe: the “approver is not the initiator” check of rule 5 is made on the person, not the account. Every USER row names the natural person behind it (${c("USER.person_ref")}, ERD Appendix B.5), the two accounts of one person carry the same person_ref, and APPROVAL refuses an approver whose person_ref equals the initiator's. The Management countersignature when only one Finance user is on shift (rule 5) is unchanged.</p>
<h3>Scoped rights: documented, not built</h3>
<p>A per-user, per-project scope (a user limited to named projects, approved by Management) is a possible later addition for an unusually sensitive counterparty. It is recorded here as an option and is not built unless NPL chooses it; until then there are no per-user exceptions and visibility is by role only.</p>
<h3>Time-limited delegation: not in P0</h3>
<p>The reviewer's revised recommendation is adopted as written: “Define backup approval arrangements for staff absence, holidays and emergencies, ensuring maker-checker controls remain intact. Automated temporary delegation can be considered in a later phase.” Rule ${dl("10")}${mk("13")} is that arrangement. No delegation feature, no expiring rights and no delegation records exist in the P0 model.</p>
<h3>Periodic access review</h3>
<p>Management reviews users, roles, dormant accounts and leavers once a quarter and records the review; the procedure is A.10 of the Client Operating Procedures, and the users-and-access report that supports it is built in Phase 2 (M6).</p>

<h2 class="pb">Appendix A · Every field, its group, its rights</h2>
<p class="small">Generated from the data model: ${Object.keys(D.E).length} tables and views, ${totalFields} fields. Rights per role as in Section 2; "view · enter" means Operations creates or edits the record in the normal course; actor fields (who approved, verified, posted, screened, recorded) belong to the approvals group.</p>
${appendix}
</body></html>`;

const base = REVIEW ? "NPLify-Roles-and-Visibility-Matrix-review" : `NPLify-Roles-and-Visibility-Matrix-v${V}`;
const h = path.join(outDir, `${base}.html`), p = path.join(outDir, `${base}.pdf`);
// The client-facing pass knows the v1–v5 edition tokens; this edition's own token and draft marker are removed here.
const thisEdition = (s) => s.replace(/\s*[·—–-]\s*Draft v6\.0\b/g, "").replace(/\bDraft v6\.0\b/g, "").replace(/\(v6\.0,\s*/g, "(").replace(/\bv6\.0[,:]?\s*/g, "");
fs.writeFileSync(h, thisEdition(clientFacing(html)));
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "fields:", totalFields, "hidden from Operations:", hiddenFromOps, JSON.stringify(counts));
