// Build the ERD baseline document (HTML + PDF) from data/erd.v5.json.
//   node scripts/build-erd-doc.mjs            -> docs/NPLify-P0-ERD-v<version>.html and .pdf
// Diagrams are Mermaid erDiagrams rendered in headless Chrome (the v5.x document design); the PDF is
// printed with headless Chrome. Each diagram gets its own page, landscape or portrait by its aspect.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { D, erDiagram, renderSvgs, stubNote } from "./mermaid-diagrams.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "docs");
fs.mkdirSync(outDir, { recursive: true });
const V = D.version;
const DATE = "11 October 2026";
const DATE56 = "9 October 2026";
const DATE52 = "8 October 2026";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const code = (s) => `<code>${esc(s)}</code>`;

import { DIAGRAMS, homeOf } from "./erd-diagram-defs.mjs";
import { hist, note, clientFacing } from "./client-facing.mjs";
for (const dg of DIAGRAMS) for (const n of dg.nodes) if (!D.E[n.replace("~", "")]) throw new Error(`unknown entity ${n} in diagram ${dg.id}`);
const drawn = new Set(DIAGRAMS.flatMap((dg) => dg.nodes.filter((n) => !n.startsWith("~"))));
const tables = Object.keys(D.E).filter((n) => D.E[n].d !== "view");
for (const n of tables) if (!drawn.has(n)) throw new Error(`table ${n} is drawn in no diagram`);

console.log("rendering diagrams …");
const svgs = renderSvgs(DIAGRAMS.map((dg) => ({ id: dg.id, text: erDiagram(dg.nodes, { direction: "TB", noSelf: dg.noSelf }), config: {} })), path.join(outDir, ".mermaid-work"));
const DG = Object.fromEntries(DIAGRAMS.map((dg) => [dg.id, dg]));
const diagramPage = (dg) => {
  const svg = svgs[dg.id];
  const m = /data-w="(\d+)" data-h="(\d+)"/.exec(svg);
  const land = m ? +m[1] / +m[2] >= 1.15 : true;
  return `<section class="diagram-page ${land ? "land" : "port"}">
<p class="dgnote"><b>Diagram ${esc(dg.id)}.</b> ${stubNote(dg.nodes, homeOf)}</p>
<figure>${svg}<figcaption>Diagram ${esc(dg.id)} — ${esc(dg.title)}</figcaption></figure>
</section>`;
};

// ------------------------------------------------------------------ text helpers
const fieldTable = (name) => {
  const e = D.E[name];
  return `<h4 id="dd-${name}">${esc(name)}</h4>
<table class="dd"><thead><tr><th>Field</th><th>Type</th><th>Key</th><th>Notes</th></tr></thead><tbody>
${e.f.map((f) => `<tr><td class="mono">${esc(f[0])}</td><td>${esc(f[1])}</td><td class="mono">${esc(f[2] ?? "")}</td><td>${esc(note(f[3] ?? ""))}</td></tr>`).join("\n")}
</tbody></table>`;
};
const byDomain = (d) => Object.keys(D.E).filter((n) => D.E[n].d === d);
const views = byDomain("view");
const table = (head, rows, widths = []) => `<table><thead><tr>${head.map((h, i) => `<th${widths[i] ? ` style="width:${widths[i]}"` : ""}>${h}</th>`).join("")}</tr></thead><tbody>
${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>`;

const notes = {
  config: [
    `A <b>Client</b> is the commercial relationship NPL contracts with; a <b>Project</b> is one arrangement with it (D38) and owns its configuration. Counterparty receivers sit in <b>receiver groups</b>: every project has one default group and every counterparty receiver belongs to exactly one group. Entitlement is tracked per group, so payouts within a group are ordinary settlement and only payouts across groups are offsets; a project with a single group never has an offset.`,
    `A <b>Receiver</b> has a kind: ${code("counterparty")} for a client receiver; ${code("sender_return")} stands for a sender so refunds use the ordinary payout path and the partner's destination approval; ${code("partner_transit")} stands for a partner's collection endpoint so the hop of a two-leg route is an ordinary payout. ${code("sender_return")} and ${code("partner_transit")} receivers belong to no group (${code("group_id")} is null). They never appear on forward deals or allow lists — both validate kind = counterparty — and a payout to them is attributed to the group of the leg that pays them, so no entitlement moves between groups on a refund or a hop. Groups exist for entitlement and offset accounting; refund exclusion is a receiver-kind rule, not a group (D13).`,
    `A receiving entity holds one or more <b>accounts</b>, each with a currency and rail (EUR via SWIFT and EUR via SEPA are two accounts). An account is a bank account or a wallet (${code("account_kind")}): a bank account carries ${code("bank_details_ref")} and a bank rail; a wallet carries ${code("network")} and ${code("address")} explicitly, mirroring the partner-side ${code("COLLECTION_RECEIVING_ENDPOINT")}, so addresses can be checksum-validated, checked against the rail, and found when the same address is registered with two partners. Destination approvals and settlement lines point at the account. No table stores actual bank details: ${code("bank_details_ref")} points at the external store.`,
    `Fees are per partner × pair (${code("FEE_STRUCTURE")} under ${code("PARTNER_PAIR")}), so choosing the partner is part of pricing. ${code("PARTNER.disclosure_style")} records whether the partner's markup is visible; ${code("partner_fee_pct")} is known only for fee_on_market partners.`,
    `A partner operates through one or more legal vehicles (${code("PARTNER_ENTITY")}: PT-tour, PT Global Inc); the deal stamps the vehicle at quote so paperwork names the right company. Each vehicle owns the endpoints a sender can pay into (${code("COLLECTION_RECEIVING_ENDPOINT")}): kind = bank with a currency and ${code("bank_details_ref")}, or kind = wallet with ${code("network")} and ${code("address")}. The partner side therefore mirrors the client side — ${code("PARTNER_CONFIG")} → ${code("PARTNER_ENTITY")} → ${code("COLLECTION_RECEIVING_ENDPOINT")} as ${code("RECEIVER")} → ${code("RECEIVING_ENTITY")} → ${code("RECEIVING_ENTITY_ACCOUNT")} (D15). An endpoint also carries a nullable ${code("rail")}: a bank endpoint must have it before it becomes active, and a wallet may leave it null but must match ${code("network")} when it is set (D18); the endpoint's kind must match the leg's ${code("collection_method")} (D19). Cash-in has no endpoint record; the leg carries the city and the collection the token (D30). The collected cash amount is rounded by the pair's ${code("cash_rounding")} option — truncate, nearest or round up — to ${code("cash_rounding_unit")} (100 / 500 / 1,000 by currency), the same menu as payout rounding (D25).`,
    `Destination approval is per partner: ${code("DESTINATION_APPROVAL")} is an account of the project's receiving entity as registered with this partner, carrying the partner's approval status and the payout details the partner holds. Those details follow the account's kind: ${code("bank_details_ref")} for a bank account, ${code("network")} and ${code("address")} for a wallet (D16). ${code("SETTLEMENT_SENDING_ENTITY")} is the narrative on an outgoing transfer; ${code("SETTLEMENT_RAIL")} is the bank/EMI that executes it; neither holds money. ${code("COLLECTION_SENDING_ENTITY")} is provenance only and never a payout destination.`,
    `${code("OWN_WALLET")} has a role: reroute contingency (AQN-LT-Sub at Aquanow), own desk, or a collection bridge on a network a partner lacks, forwarded to the partner as a hop within the wallet's custody limit (D40); ${code("PARTNER_CONFIG.applicable_for_reroute")} defines the alternate-partner set. ${code("PARTNER.supported_methods")} declares what a partner offers — cash and local deposits have no standing endpoint to read it from (D39). ${code("WALLET_REGISTRY")} lists every known address with its owner and role. Under an <b>own-desk</b> partner configuration (${code("is_own_desk")}, the NPL-GR game-reseller project) NPL itself is the converting party: its pairs are priced market plus NPL's markup and its collection endpoints are NPL's own wallets (${code("COLLECTION_RECEIVING_ENDPOINT.own_wallet_id")}); the custody view reports every such balance (D23).`,
    `<b>Fees.</b> A ${code("FEE_OVERRIDE")} may carry its own sender / receiver split instead of inheriting the structure's proportion (D20). ${code("FEE_TIER")} rows under a structure price by the project's calendar-month volume; a leg that takes the month past a threshold is split across two tiers (D21). ${code("customer_facing_fee_basis")} / ${code("customer_facing_fee_pct")} on the structure say what the customer's quote prints when it differs from the recorded parts; the printed "source rate" is derived at quote, never typed (D22). ${code("CURRENCY_PAIR.amount_rounding")} is a menu — truncate, nearest or round up, to the unit or to ${code("rounding_unit")} — and a pair may have the same currency on both sides (D25, D33).`,
    `<b>Who else earns on a deal.</b> ${code("MARKUP_SHARE_PARTY")} / ${code("MARKUP_SHARE_RULE")} record a share NPL pays — or, with basis ${code("share_of_net_markup")} and ${code("party_kind")} client_party, the customer who provides a sub-account and shares NPL's markup (Raeen): the base is the leg's fee parts less its partner cost, rebates excluded, several parties may hold rules with different shares, and ${code("settlement_mode")} party_retains means the party holds the converted money and pays NPL the remainder monthly (D26). ${code("PARTNER_REBATE_RULE")} records the rebate a partner pays NPL, with a basis (percentage of amount or of the partner's fee) and an optional scope by sender or fee structure; the rebate is NPL's alone and is reported as its own stream (D27).`,
    `<b>Cutoff, screening, single use.</b> ${code("PARTNER.bank_cutoff_time")} (the partner's own clock, beside its rate expiry and holiday calendar), its per-day changes in ${code("PARTNER_CUTOFF_OVERRIDE")} (an agreed extension or an early close) and ${code("PARTNER_PAIR.needs_bank_lock")} drive same-day or next-day conversion and, on bank rails, same-day or next-day settlement (D29). Cash legs carry their city (${code("DEAL.cash_location")}) and cash rate versions theirs (D30). ${code("WALLET_SCREENING")} records the screening of a sending or receiving wallet address, by Operations, and the endpoint's ${code("risk_band")} says which decisions may land on it (D31). An endpoint or a receiving-entity account may be ${code("single_use")}, reserved for one deal (ad hoc local deposit accounts, D32). ${code("HOLIDAY")} rows under the partner are the dates behind every "next business day" (D34); ${code("MESSAGE_TEMPLATE")} is the versioned wording of outgoing messages and declares the fields it may print — a quote template prints sender-facing figures only (D36).`,
  ],
  rates: [
    `The rate comparison for the day is created lazily by the first deal that needs it, one per partner × pair × date, and reused by every deal that day. A partner may give a new rate during the day, so one date can hold several versions. Rolling averages are built from confirmed versions only.`,
    `A version is breached when spread &gt; avg_2w × (1 + variance_threshold_rel); quoting and conversion on that partner × pair freeze until Finance approves with a reason, rejects, or asks for a better rate. Versions are never overwritten; every deal leg, conversion and balance conversion references its exact version.`,
    `Cross-source slippage is a query over ${code("MARKET_RATE")} across sources for the same pair and window.`,
    `A version stores the rate <b>as the partner quoted it</b> (${code("quoted_rate")}, ${code("quoted_direction")}); ${code("rate")} is normalised to the pair's direction and derived — 1 ÷ quoted when the directions differ — so Ali's 1.1738 becomes 0.851934 without a hand inversion, and a direction slip is caught by the breach check (D28). Cash pairs are priced per ${code("location")}: INR cash in Delhi and in Mumbai are two versions on the same day (D30).`,
  ],
  deal: [
    `<b>Every deal belongs to a deal group.</b> ${code("DEAL_GROUP")} is the client-facing instruction: the pair as the sender sees it, the sender rate, fee, reference and entry mode. A plain single-partner deal is a group of one leg; a route that needs two partners (INR → USDT at Ali, USDT → EUR at Jeton) has two forward legs; a rejected payout is unwound with a return leg.`,
    `<b>Legs.</b> ${code("leg_type")} forward or return; ${code("funding_source")} collection, prior_leg (leg 2 of a route, no collection) or returned_settlement (a return leg). Priced once and partner fixed at quote hold per leg. Attribution is to the receiver group: set at quote on the first forward leg, inherited by leg n of a route from leg n−1 and by a return leg from its parent leg. The receiver is optional until settlement.`,
    `Two entry modes as before: collect-first legs are born in state Collected with priced_at = conversion time; quote-first legs carry sent / valid / grace timestamps and a late decision. An estimate-first mode gives an indicative figure and prices at conversion.`,
    `<b>Conversion has exactly one owner</b>: a deal leg or a ${code("BALANCE_CONVERSION")}. The receiver-side fee is taken at conversion. Amounts are rounded at conversion by the pair's option (D25); a dropped fraction (${code("rounding_residual")}, signed) stays client money in the balance and pays out when it reaches a unit, an amount added by rounding up is NPL's cost. NPL's margin is captured at conversion and is never again at risk from a return or a forward.`,
    `<b>Balance conversion</b> is NPL converting a client's held balance (5K SGD → USDT to fund a 15K USDT payout): Finance-initiated, Management-approved, no sender, receiver or collection, same rate machinery, markup by ${code("FEE_DECISION")}. It names the receiver group it serves; ${code("ENTITLEMENT_REATTRIBUTION")} moves that group's entitlement to the new currency, and any excess over the group's entitlement is booked as an approved offset.`,
    `<b>Reroute</b> is the only way partner or partner entity change after quote. Forwarding is forward_full or forward_and_recover_dues: NPL nets what the alternate partner owes it (${code("EARNINGS_RECEIVABLE")}) against the funds forwarded, within the outstanding receivable, with the partner's agreement recorded. Post-collection outcome is via the own wallet or a refund to the sender.`,
    `One settlement model: ${code("SETTLEMENT")} drains one partner's holding into one or many ${code("SETTLEMENT_LINE")}s, rounded as the pair says. Under settlement_policy to_zero the balance after release is less than one unit; under hold_allowed the balance may rest at the partner within the project's exposure cap.`,
    `A line paying a counterparty receiver whose group differs from the paying leg's attributed group is an offset, created by the same action, with Management approval and tighter aging. A line paying a sender_return or partner_transit receiver is never an offset: those receivers have no group, and the line debits the group of the leg it names in ${code("deal_id")} (D13, D17).`,
    `<b>Rejected payout.</b> When the receiving or intermediary bank rejects a transfer, ${code("SETTLEMENT_RETURN")} records the returned amount, bank fee and reason; the line's outcome becomes returned, a reversing ledger transaction puts the money back into the client's balance and the paying leg's group entitlement, and ${code("BANK_FEE_EVENT")} books the bounce fee. The money then stays in balance for later payouts, or funds a return leg — attributed to the same group — that converts back and pays the sender's return receiver.`,
    `<b>Fee decisions.</b> ${code("FEE_DECISION")} is a one-off, approved decision on a single subject: markup applied or waived on a return leg or balance conversion, a network-fee override on a refund, a bank-fee treatment override on one settlement. Standing rules stay in ${code("FEE_STRUCTURE")} and ${code("FEE_OVERRIDE")}.`,
    `${code("CONFIRMATION")} is full or short; a short confirmation opens a ${code("SHORTFALL")} topped up by a later settlement or an explicit separate payout — cash found short at hand-over included. Rounding differences no longer land here. ${code("MARKUP_SHARE_ACCRUAL")} and ${code("PARTNER_REBATE_ACCRUAL")} accrue per deal under their rules; a party_retains markup-share accrual is a receivable from the party, reconciled monthly like a rebate (D26); rebates are reconciled monthly against the partner's statement, which covers NPLify deals only (D27).`,
    `<b>Pricing stamps (v5.3).</b> A leg stamps the override and the base tier that priced it; a leg that crosses a tier threshold holds two ${code("DEAL_FEE_TIER")} portions and a blended fee (D20, D21). The deal group stamps the customer-facing fee and rate the quote printed (D22). On a pair that needs a bank lock the leg records ${code("rate_locked_at")} and ${code("conversion_due_date")}: locked before the partner's cutoff it converts the same day, otherwise the next business day at that day's version; the sender's figures are write-once, NPL absorbs the difference as a cutoff-timing variance, and a conversion whose next-day rate breaches the margin is deferred with a reason. The client balance view shows the locked leg's converted value as pending from the lock; a void removes it (D29). ${code("QUOTE_PACKAGE")} is the record of what was sent for a deal group — template version, channel, printed figures, ${code("sent_at")}, hash — one row per issue; a quote-first leg is Sent only when a package has sent_at, re-issues are new rows, a new price is a new deal group (D35).`,
    `<b>Invoices.</b> ${code("INVOICE")} is an obligation in its own currency — a vendor's EUR invoice a reseller customer pays in THB or USDT, in parts, over days. A deal group names the invoice it pays (advance, then balance); each payout line records how much of the obligation it discharged and the market snapshot used; ${code("INVOICE_BALANCE")} is the open remainder (D24).`,
    `<b>Cash and crypto parts.</b> A cash part carries the token (the local-currency bill whose serial identifies the agent), the agent's contact and the partner's count; the leg carries the city, which also selects the rate version (D30). A crypto part carries the sender's declared address and the screening that admitted it, unless the project skips up-front screening (D31).`,
    `<b>Loss events.</b> ${code("LOSS_EVENT")} records money lost after it was verified or released — a frozen local account, cash short that cannot be recovered, a wrong-chain transfer — on either side, by any method, for a partial or full amount, with the loss split across sender, NPL, partner and client. The whole loss is booked to NPL and the client made whole in one transaction (source LossEvent; MAKEGOOD / LOSS_PAYABLE when it cannot be funded at once); Management approves the split and each share is a separate ${code("LOSS_RECOVERY")} posting; the collection part stays verified and is reversed only when the deal is unwound (D32, D46).`,
  ],
  ledger: [
    `Client due balances are held as one account per project × partner × currency (CL.&lt;PARTNER&gt;.&lt;CCY&gt;.DUE); group entitlement is a view, not an account. ${code("holder_type")} never includes a settlement rail or narrative entity.`,
    `<b>Ownership moves between client and company only at the events invariant 16 names</b> — margin recognition at conversion, the two sides of an earnings offset, the forex true-ups of invoice lines, fees NPL absorbs or covers, top-ups, make-wholes, make-goods and the client's loss share — and every transaction balances per owner as well as per currency (D46). NPL never advances money to a receiver, and withholding on a reroute is not a separate event because the margin is always captured by whichever partner converts.`,
    `Recover dues on a reroute posts own-wallet cash against the earnings receivable at the partner: company money on both sides, no income.`,
    `Transaction sources: Collection, Conversion, BalanceConversion, Settlement, SettlementReturn, Confirmation, BankFeeEvent, Reroute, MarkupShare, Rebate, LossEvent, LossRecovery, Invoice, EarningsOffset, Adjustment (D46). Account purposes include PAYABLE, SHARE_PAYABLE, SHARE_RECEIVABLE, REBATE_RECEIVABLE, LOSS_RECEIVABLE, MAKEGOOD / LOSS_PAYABLE, EARN_GROSS, EARN_REBATE, the four VAR_ accounts, FX_RESULT, the reseller purposes (RESELL_REVENUE, RESELL_COST, VENDOR_PAYABLE, RESALE_RECEIVABLE, REMIT_CLAIM), EXP_ROUNDING and EXP_LOSS; ADVANCE and INTRANSIT do not exist. Cost components include share, rebate, rounding, fx_timing, cutoff_timing, loss and resale.`,
    `<b>Three streams NPL never mixes (v5.3).</b> Earnings on deals post to EARN_GROSS at conversion; a partner's rebate posts to EARN_REBATE and is never in the base a client party shares (D26, D27); NPL's remainder from a party that holds the converted funds sits in SHARE_RECEIVABLE until the party pays it. The cost of rounding up is EXP_ROUNDING (D25). A loss is booked to EXP_LOSS in full first and the client made whole; the partner's and the sender's agreed shares are LOSS_RECEIVABLE owed to NPL, the client's share is a partial reversal of the make-good, and what remains in EXP_LOSS is NPL's own share (D32, D46). Own-desk deals use the ordinary partner-coded accounts with the own-desk configuration as holder and EXP_PARTNER zero by construction (D23).`,
    `One system-settings area (D43, D44): ${code("SYSTEM_SETTING")} holds NPL-wide, Management-approved keys — the reporting currency, its staleness limit, the operating time zone; ${code("ROLE")} holds the user roles and ${code("ROLE_RIGHT")} what each may initiate and approve per controlled action, with the role added on escalation; platform-scope ${code("CURRENCY_PAIR")}s carry the conversion rates through the ordinary rate-source chain. ${code("REPORTING_VALUE")} converts any per-currency figure into the reporting currency at the latest market rate of its platform pair, as a display-only estimate that carries the rate it used (D43). ${code("APPROVAL")}, ${code("AUDIT_LOG")} and ${code("RECORD_LOCK")} are modelled once and apply to all master data. Approver ≠ initiator on every approval; Operations never sees derived economics. Approval actions include price_quote, extend_quote_validity, refund_to_third_party, cross_group_payout, balance_conversion, recover_dues, cover_bank_fee, raise_fee_cap, enable_own_desk, approve_loss_split, override_screening_reject and earnings_offset (ROLE_RIGHT rows, D44, D46). cross_group_payout never fires on a line paying a sender_return or partner_transit receiver. Wallet screening itself is an Operations action, not an approval (D31).`,
  ],
};

const frsVocab = D.FRS_VOCAB;
const frsDev = D.FRS_DEV.map(([a, b, c]) => a.startsWith("Strict Client") ? [a, "RECEIVER_GROUP → RECEIVER → RECEIVING_ENTITY → account; SENDER with a group allow-list; FRS project = one default group", "Generalisation per NPL instruction"] : a.startsWith("One settlement per deal") ? [a, "Accumulate → settle the balance rounded as the pair says (residual carried), or hold within the exposure cap where the project allows", "Generalisation (D25)"] : a.startsWith("AQN-LT-Sub") ? [a, "OWN_WALLET at Aquanow; pass-through is a two-leg deal group or a reroute via the own wallet; also NPL-GR's own-desk collection endpoint", "Resolved (v4.0, D23)"] : [a, b, c]);

// ------------------------------------------------------------------ HTML
const RUN = `NPLify · P0 Technical Baseline · ERD &amp; Data Model · Draft v${V}`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify · P0 Technical Baseline — ERD & Data Model · Draft v${V}</title>
<style>
@page { size: A4; margin: 16mm 18mm 16mm 18mm; @top-left { content: "${RUN.replace(/&amp;/g, "&")}"; font: 8pt Helvetica, Arial, sans-serif; color: #666 } @bottom-right { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
@page land { size: A4 landscape; margin: 12mm 12mm 10mm 12mm; }
html,body{margin:0;padding:0}
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
h4{font:700 10pt Helvetica,Arial,sans-serif;margin:12pt 0 3pt;break-after:avoid}
p{margin:0 0 7pt}
ul{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 4pt}
code{font:8.8pt Menlo,Consolas,monospace}
.mono{font:8.6pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;margin:4pt 0 10pt;font-size:9.2pt}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt}
td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top}
table.dd{font-size:8.8pt} table.dd td,table.dd th{padding:2pt 5pt}
tr{break-inside:avoid}
.title{text-align:center;margin-top:40mm}
.title .sub{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 10pt}
.title .org{margin:0 0 2pt} .title .date{margin:0 0 16pt}
.rule{border-top:2px solid #222;border-bottom:1px solid #222;height:2px;margin:10pt 0 14pt}
.pb{break-before:page}
.diagram-page{break-before:page;break-after:page;display:flex;flex-direction:column}
.diagram-page.land{page:land;height:185mm}
.diagram-page.port{height:262mm}
.diagram-page .dgnote{font-size:9.2pt;margin:0 0 3mm;flex:0 0 auto}
.diagram-page figure{margin:0;flex:1;min-height:0;display:flex;flex-direction:column}
.diagram-page figure svg{flex:1;min-height:0;width:100%;height:100%}
.diagram-page figcaption{font:italic 10pt Georgia,serif;text-align:center;margin-top:2mm;flex:0 0 auto}
.small{font-size:9pt;color:#444}
</style></head><body>

<div class="title">
<h1>NPLify · P0 Technical Baseline</h1>
<p class="sub">Deliverable 1 — Entity-Relationship Diagram &amp; Data Model · Draft v${V}</p>
<p class="org">New XP Technologies Limited</p>
<p class="date">${DATE} · Confidential</p>
</div>

<h2 class="pb">Conventions</h2>
<p><b>Convention:</b> all monetary amounts are stored as exact decimals; every table carries ${code("created_at")} / ${code("created_by")}; audit, approvals and locking are modelled once (domain 4) and apply to all master data. Derived figures (client balance, group entitlement, offsets, custody) are <b>views over postings and deals — never stored</b>.</p>
<p>Seven diagrams across four domains, one schema: ${tables.length} tables and ${views.length} views. In each diagram, entities defined in another diagram appear with no attributes and name that diagram. Relationship lines run from the referenced row to the row that stores the foreign key; ${code("||--o{")} is composition (the parent owns the child), ${code("||..o{")} a reference or a polymorphic link resolved by a type column plus an id. The deal lifecycle has three diagrams: 3a is the deal and its collection, 3b the conversion and its exceptions, 3c the settlement. Appendix A reconciles the model with the FRS; Appendix B is the data dictionary.</p>
<div class="rule"></div>

<h2>1 · Configuration domain</h2>
<p>A <b>Client</b> is the commercial relationship NPL contracts with; a <b>Project</b> is one arrangement with it (D38) and owns its configuration. Partners are global counterparties; how a partner is used <i>in this project</i> is the <b>partner configuration</b> block — fees, vehicles, endpoints, destination approvals and rebate terms hang off it. Counterparty receivers are organised in <b>receiver groups</b>, the unit entitlement is tracked on, and each receiving entity holds one or more <b>accounts</b> with a currency and rail.</p>
${diagramPage(DG["1a"])}
${diagramPage(DG["1b"])}
<h3>Notes</h3><ul>${notes.config.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>2 · Rates domain</h2>
${diagramPage(DG["2"])}
<h3>Notes</h3><ul>${notes.rates.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>3 · Deal lifecycle domain</h2>
<h3>3a · Deal group, legs, pricing stamps, invoice, collection</h3>
${diagramPage(DG["3a"])}
<h3>3b · Conversion, reroute, earnings receivable, balance conversion, entitlement re-attribution</h3>
${diagramPage(DG["3b"])}
<h3>3c · Settlement, return, confirmation, fees, shares, rebates, loss events and recoveries</h3>
${diagramPage(DG["3c"])}
<h3>Derived views (never stored)</h3>
${table(["View", "Definition"], views.map((v) => [`<span class="mono">${esc(v)}(${D.E[v].f.map((f) => f[0]).join(", ")})</span>`, esc(hist(D.E[v].desc))]), ["34%"])}
<h3>Notes</h3><ul>${notes.deal.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>4 · Ledger &amp; controls domain</h2>
${diagramPage(DG["4"])}
<h3>Notes</h3><ul>${notes.ledger.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2 class="pb">Appendix A · FRS reconciliation</h2>
<h3>A.1 Vocabulary</h3>
${table(["FRS term", "Model entity"], frsVocab.map(([a, b]) => [esc(a), `<span class="mono">${esc(note(b))}</span>`]), ["30%"])}
<h3>A.2 Deviations from the FRS (classified)</h3>
${table(["FRS statement", "Model", "Classification"], frsDev.map(([a, b, c]) => [esc(a), esc(note(b)), esc(note(c))]), ["28%", "", "24%"])}
<h2 class="pb">Appendix B · Data dictionary (field annotations)</h2>
<p class="small">Every table also carries ${code("created_at")} and ${code("created_by")}. Types: int, string, bool, decimal, datetime, date.</p>
<h3>B.1 Configuration</h3>${byDomain("config").map(fieldTable).join("")}
<h3>B.2 Rates</h3>${byDomain("rates").map(fieldTable).join("")}
<h3>B.3 Deal, collection, conversion, reroute, balance conversion</h3>${byDomain("deal").map(fieldTable).join("")}
<h3>B.4 Settlement, return, confirmation, fees, shares, rebates, losses and recoveries</h3>${byDomain("settle").map(fieldTable).join("")}
<h3>B.5 Ledger &amp; controls</h3>${byDomain("ledger").map(fieldTable).join("")}
</body></html>`;

const htmlPath = path.join(outDir, `NPLify-P0-ERD-v${V}.html`);
fs.writeFileSync(htmlPath, clientFacing(html));
const pdfPath = path.join(outDir, `NPLify-P0-ERD-v${V}.pdf`);
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, "file://" + htmlPath], { stdio: "ignore" });
fs.rmSync(path.join(outDir, ".mermaid-work"), { recursive: true, force: true });
console.log("wrote", htmlPath, "and", pdfPath, `(${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB)`);
