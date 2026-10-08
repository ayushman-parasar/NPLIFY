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
const DATE = "8 October 2026";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const code = (s) => `<code>${esc(s)}</code>`;

// ------------------------------------------------------------------ diagrams
// Full entities draw their attribute table; "~NAME" is defined in another diagram and appears name-only.
const DIAGRAMS = [
  { id: "1a", title: "Configuration — project, parties and receiver groups", nodes: [
      "PROJECT", "INTRODUCER", "RATE_SOURCE", "SENDER", "RECEIVER_GROUP", "OWN_WALLET", "THRESHOLD", "CURRENCY_PAIR",
      "COLLECTION_SENDING_ENTITY", "SENDER_RECEIVER_ALLOW", "RECEIVER", "PAIR_RATE_SOURCE", "REFERRAL_RULE", "RECEIVING_ENTITY", "RECEIVING_ENTITY_ACCOUNT",
      "~PARTNER_CONFIG", "~PARTNER_PAIR", "~SETTLEMENT_REGISTRATION"] },
  { id: "1b", title: "Configuration — partner configuration block", nodes: [
      "PARTNER", "PARTNER_CONFIG", "PARTNER_PAIR", "PARTNER_ENTITY", "COLLECTION_RECEIVING_ENDPOINT", "SETTLEMENT_SENDING_ENTITY", "SETTLEMENT_RAIL",
      "SETTLEMENT_REGISTRATION", "PARTNER_REBATE_RULE", "FEE_STRUCTURE", "FEE_OVERRIDE",
      "~PROJECT", "~CURRENCY_PAIR", "~SENDER", "~RECEIVING_ENTITY_ACCOUNT"] },
  { id: "2", title: "Rates", nodes: [
      "MARKET_RATE", "RATE_COMPARISON", "PARTNER_RATE_VERSION", "~RATE_SOURCE", "~CURRENCY_PAIR", "~PARTNER_PAIR", "~DEAL", "~CONVERSION", "~BALANCE_CONVERSION"] },
  { id: "3a", title: "Deal lifecycle — deal group, legs, collection, conversion, reroute, balance conversion", nodes: [
      "DEAL_GROUP", "DEAL", "COLLECTION", "CONVERSION", "REROUTE", "SENDER_CREDIT", "EARNINGS_RECEIVABLE", "BALANCE_CONVERSION", "ENTITLEMENT_REATTRIBUTION",
      "~PROJECT", "~SENDER", "~RECEIVER_GROUP", "~PARTNER_PAIR", "~PARTNER_ENTITY", "~FEE_STRUCTURE", "~MARKET_RATE", "~PARTNER_RATE_VERSION",
      "~OWN_WALLET", "~PARTNER_CONFIG", "~COLLECTION_SENDING_ENTITY", "~COLLECTION_RECEIVING_ENDPOINT", "~DISBURSEMENT_RETURN", "~RECEIVER"] },
  { id: "3b", title: "Disbursement, return, confirmation, fees, referrals and rebates", nodes: [
      "DISBURSEMENT", "DISBURSEMENT_LINE", "BANK_FEE_EVENT", "DISBURSEMENT_RETURN", "CONFIRMATION", "SHORTFALL", "FEE_DECISION", "REFERRAL_ACCRUAL", "PARTNER_REBATE_ACCRUAL",
      "~PROJECT", "~PARTNER_CONFIG", "~SETTLEMENT_SENDING_ENTITY", "~SETTLEMENT_RAIL", "~SETTLEMENT_REGISTRATION", "~RECEIVER", "~DEAL", "~BALANCE_CONVERSION", "~REFERRAL_RULE", "~PARTNER_REBATE_RULE"] },
  { id: "4", title: "Ledger & controls", nodes: [
      "LEDGER_TRANSACTION", "LEDGER_POSTING", "LEDGER_ACCOUNT", "USER", "APPROVAL", "AUDIT_LOG", "RECORD_LOCK",
      "~COLLECTION", "~CONVERSION", "~BALANCE_CONVERSION", "~DISBURSEMENT", "~DISBURSEMENT_RETURN", "~CONFIRMATION", "~BANK_FEE_EVENT", "~REROUTE",
      "~REFERRAL_ACCRUAL", "~PARTNER_REBATE_ACCRUAL", "~PARTNER_CONFIG", "~OWN_WALLET", "~RECEIVER", "~SENDER", "~INTRODUCER"] },
];
const homeOf = {};
for (const dg of DIAGRAMS) for (const n of dg.nodes) if (!n.startsWith("~")) homeOf[n] = dg.id;
for (const dg of DIAGRAMS) for (const n of dg.nodes) if (!D.E[n.replace("~", "")]) throw new Error(`unknown entity ${n} in diagram ${dg.id}`);
const drawn = new Set(DIAGRAMS.flatMap((dg) => dg.nodes.filter((n) => !n.startsWith("~"))));
const tables = Object.keys(D.E).filter((n) => D.E[n].d !== "view");
for (const n of tables) if (!drawn.has(n)) throw new Error(`table ${n} is drawn in no diagram`);

console.log("rendering diagrams …");
const svgs = renderSvgs(DIAGRAMS.map((dg) => ({ id: dg.id, text: erDiagram(dg.nodes, { direction: "TB" }), config: {} })), path.join(outDir, ".mermaid-work"));
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
${e.f.map((f) => `<tr><td class="mono">${esc(f[0])}</td><td>${esc(f[1])}</td><td class="mono">${esc(f[2] ?? "")}</td><td>${esc(f[3] ?? "")}</td></tr>`).join("\n")}
</tbody></table>`;
};
const byDomain = (d) => Object.keys(D.E).filter((n) => D.E[n].d === d);
const views = byDomain("view");
const table = (head, rows, widths = []) => `<table><thead><tr>${head.map((h, i) => `<th${widths[i] ? ` style="width:${widths[i]}"` : ""}>${h}</th>`).join("")}</tr></thead><tbody>
${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>`;

const notes = {
  config: [
    `A <b>Project</b> (= client) owns its configuration. Counterparty receivers sit in <b>receiver groups</b>: every project has one default group and every counterparty receiver belongs to exactly one group. Entitlement is tracked per group, so payouts within a group are ordinary settlement and only payouts across groups are offsets; a project with a single group never has an offset.`,
    `A <b>Receiver</b> has a kind: ${code("counterparty")} for a client receiver; ${code("sender_return")} stands for a sender so refunds use the ordinary payout path and the partner's destination approval; ${code("partner_transit")} stands for a partner's collection endpoint so the hop of a two-leg route is an ordinary payout. ${code("sender_return")} and ${code("partner_transit")} receivers belong to no group (${code("group_id")} is null). They never appear on forward deals or allow lists — both validate kind = counterparty — and a payout to them is attributed to the group of the leg that pays them, so no entitlement moves between groups on a refund or a hop. Groups exist for entitlement and offset accounting; refund exclusion is a receiver-kind rule, not a group (D13).`,
    `A receiving entity holds one or more <b>accounts</b>, each with a currency and rail (EUR via SWIFT and EUR via SEPA are two accounts). An account is a bank account or a wallet (${code("account_kind")}): a bank account carries ${code("bank_details_ref")} and a bank rail; a wallet carries ${code("network")} and ${code("address")} explicitly, mirroring the partner-side ${code("COLLECTION_RECEIVING_ENDPOINT")}, so addresses can be checksum-validated, checked against the rail, and found when the same address is registered with two partners. Registrations and payout lines point at the account. No table stores actual bank details: ${code("bank_details_ref")} points at the external store.`,
    `Fees are per partner × pair (${code("FEE_STRUCTURE")} under ${code("PARTNER_PAIR")}), so choosing the partner is part of pricing. ${code("PARTNER.disclosure_style")} records whether the partner's markup is visible; ${code("partner_markup_pct")} is known only for market_plus partners.`,
    `A partner operates through one or more legal vehicles (${code("PARTNER_ENTITY")}: PT-tour, PT Global Inc); the deal stamps the vehicle at quote so paperwork names the right company. Each vehicle owns the endpoints a sender can pay into (${code("COLLECTION_RECEIVING_ENDPOINT")}): kind = bank with a currency and ${code("bank_details_ref")}, or kind = wallet with ${code("network")} and ${code("address")}. The partner side therefore mirrors the client side — ${code("PARTNER_CONFIG")} → ${code("PARTNER_ENTITY")} → ${code("COLLECTION_RECEIVING_ENDPOINT")} as ${code("RECEIVER")} → ${code("RECEIVING_ENTITY")} → ${code("RECEIVING_ENTITY_ACCOUNT")} (D15). An endpoint also carries a nullable ${code("rail")}: a bank endpoint must have it before it becomes active, and a wallet may leave it null but must match ${code("network")} when it is set (D18); the endpoint's kind must match the leg's ${code("collection_method")} (D19). Cash-in has no endpoint record; instructions live on the deal. Cash collections round to the nearest 100 / 500 / 1000 units by currency (${code("CURRENCY_PAIR.cash_rounding_unit")}).`,
    `Destination approval is per partner: ${code("SETTLEMENT_REGISTRATION")} is an account of the project's receiving entity as registered with this partner, carrying the partner's approval status and the payout details the partner holds. Those details follow the account's kind: ${code("bank_details_ref")} for a bank account, ${code("network")} and ${code("address")} for a wallet (D16). ${code("SETTLEMENT_SENDING_ENTITY")} is the narrative on an outgoing transfer; ${code("SETTLEMENT_RAIL")} is the bank/EMI that executes it; neither holds money. ${code("COLLECTION_SENDING_ENTITY")} is provenance only and never a payout destination.`,
    `${code("OWN_WALLET")} exists for rerouting and pass-through (AQN-LT-Sub is an own wallet at Aquanow); ${code("PARTNER_CONFIG.applicable_for_reroute")} defines the alternate-partner set. ${code("INTRODUCER")} / ${code("REFERRAL_RULE")} record referral commissions NPL pays; ${code("PARTNER_REBATE_RULE")} records rebates a partner pays NPL.`,
  ],
  rates: [
    `The rate comparison for the day is created lazily by the first deal that needs it, one per partner × pair × date, and reused by every deal that day. A partner may give a new rate during the day, so one date can hold several versions. Rolling averages are built from confirmed versions only.`,
    `A version is breached when spread &gt; avg_2w × (1 + variance_threshold_rel); quoting and conversion on that partner × pair freeze until Finance approves with a reason, rejects, or asks for a better rate. Versions are never overwritten; every deal leg, conversion and balance conversion references its exact version.`,
    `Cross-source slippage is a query over ${code("MARKET_RATE")} across sources for the same pair and window.`,
  ],
  deal: [
    `<b>Every deal belongs to a deal group.</b> ${code("DEAL_GROUP")} is the client-facing instruction: the pair as the sender sees it, the sender rate, fee, reference and entry mode. A plain single-partner deal is a group of one leg; a route that needs two partners (INR → USDT at Ali, USDT → EUR at Jeton) has two forward legs; a rejected payout is unwound with a return leg.`,
    `<b>Legs.</b> ${code("leg_type")} forward or return; ${code("funding_source")} collection, prior_leg (leg 2 of a route, no collection) or returned_disbursement (a return leg). Priced once and partner fixed at quote hold per leg. Attribution is to the receiver group: set at quote on the first forward leg, inherited by leg n of a route from leg n−1 and by a return leg from its parent leg. The receiver is optional until settlement.`,
    `Two entry modes as before: collect-first legs are born in state Collected with priced_at = conversion time; quote-first legs carry sent / valid / grace timestamps and a late decision. An estimate-first mode gives an indicative figure and prices at conversion.`,
    `<b>Conversion has exactly one owner</b>: a deal leg or a ${code("BALANCE_CONVERSION")}. The receiver-side fee is taken at conversion. Amounts are truncated to whole units at conversion; the dropped fraction (${code("rounding_residual")}) stays client money in the balance and pays out when it reaches a whole unit. NPL's margin is captured at conversion and is never again at risk from a return or a forward.`,
    `<b>Balance conversion</b> is NPL converting a client's held balance (5K SGD → USDT to fund a 15K USDT payout): Finance-initiated, Management-approved, no sender, receiver or collection, same rate machinery, markup by ${code("FEE_DECISION")}. It names the receiver group it serves; ${code("ENTITLEMENT_REATTRIBUTION")} moves that group's entitlement to the new currency, and any excess over the group's entitlement is booked as an approved offset.`,
    `<b>Reroute</b> is the only way partner or partner entity change after quote. Forwarding is forward_full or forward_and_recover_dues: NPL nets what the alternate partner owes it (${code("EARNINGS_RECEIVABLE")}) against the funds forwarded, within the outstanding receivable, with the partner's agreement recorded. Post-collection outcome is via the own wallet or a refund to the sender.`,
    `One settlement model: ${code("DISBURSEMENT")} drains one partner's holding into one or many ${code("DISBURSEMENT_LINE")}s, in whole units. Under disburse_policy to_zero the balance after release is less than one unit; under hold_allowed the balance may rest at the partner within the project's exposure cap.`,
    `A line paying a counterparty receiver whose group differs from the paying leg's attributed group is an offset, created by the same action, with Management approval and tighter aging. A line paying a sender_return or partner_transit receiver is never an offset: those receivers have no group, and the line debits the group of the leg it names in ${code("deal_id")} (D13, D17).`,
    `<b>Rejected payout.</b> When the receiving or intermediary bank rejects a transfer, ${code("DISBURSEMENT_RETURN")} records the returned amount, bank fee and reason; the line's outcome becomes returned, a reversing ledger transaction puts the money back into the client's balance and the paying leg's group entitlement, and ${code("BANK_FEE_EVENT")} books the bounce fee. The money then stays in balance for later payouts, or funds a return leg — attributed to the same group — that converts back and pays the sender's return receiver.`,
    `<b>Fee decisions.</b> ${code("FEE_DECISION")} is a one-off, approved decision on a single subject: markup applied or waived on a return leg or balance conversion, a network-fee override on a refund, a bank-fee treatment override on one settlement. Standing rules stay in ${code("FEE_STRUCTURE")} and ${code("FEE_OVERRIDE")}.`,
    `${code("CONFIRMATION")} is full or short; a short confirmation opens a ${code("SHORTFALL")} topped up by a later disbursement. Rounding differences no longer land here. ${code("REFERRAL_ACCRUAL")} and ${code("PARTNER_REBATE_ACCRUAL")} accrue per deal under their rules; rebates are reconciled monthly against the partner's statement.`,
  ],
  ledger: [
    `Client due balances are held as one account per project × partner × currency (CL.&lt;PARTNER&gt;.&lt;CCY&gt;.DUE); group entitlement is a view, not an account. ${code("holder_type")} never includes a settlement rail or narrative entity.`,
    `<b>Ownership flips client → company at one event only: margin recognition at conversion.</b> NPL never advances money to a receiver, and withholding on a reroute is not a separate event because the margin is always captured by whichever partner converts.`,
    `Recover dues on a reroute posts own-wallet cash against the earnings receivable at the partner: company money on both sides, no income.`,
    `Transaction sources: Collection, Conversion, BalanceConversion, Disbursement, DisbursementReturn, Confirmation, BankFeeEvent, Reroute, Referral, Rebate, Adjustment. Account purposes include PAYABLE, REFERRAL_PAYABLE and REBATE_RECEIVABLE; ADVANCE does not exist. Cost components include referral and rounding.`,
    `${code("APPROVAL")}, ${code("AUDIT_LOG")} and ${code("RECORD_LOCK")} are modelled once and apply to all master data. Approver ≠ initiator on every approval; Operations never sees derived economics. Approval actions include refund_to_third_party, cross_group_payout, balance_conversion, recover_dues. cross_group_payout never fires on a line paying a sender_return or partner_transit receiver.`,
  ],
};

const frsVocab = D.FRS_VOCAB;
const frsDev = D.FRS_DEV.map(([a, b, c]) => a.startsWith("Strict Client") ? [a, "RECEIVER_GROUP → RECEIVER → RECEIVING_ENTITY → account; SENDER with a group allow-list; FRS project = one default group", "Generalisation per NPL instruction"] : a.startsWith("One settlement per deal") ? [a, "Accumulate → disburse to less than one unit (whole units; rounding dust carried), or hold within the exposure cap where the project allows", "Generalisation"] : a.startsWith("AQN-LT-Sub") ? [a, "OWN_WALLET at Aquanow; pass-through is a two-leg deal group or a reroute via the own wallet", "Resolved (v4.0)"] : [a, b, c]);

const openOpen = D.OPENQ.filter((q) => q.status !== "answered");
const openDone = D.OPENQ.filter((q) => q.status === "answered");

// ------------------------------------------------------------------ section 6 — what changed
const decision = (title, parts) => `<h4>${title}</h4>${parts.map(([k, v]) => `<p><i>${k}.</i> ${v}</p>`).join("")}`;
const whatChanged = `
<p>Three changes came in v5.0 / v5.1 (7 October 2026): the per-project return receiver group is removed (D13), ${code("RECEIVING_ENTITY_ACCOUNT")} gains explicit wallet fields (D14), and the partner's collection side is restructured — ${code("FACILITATING_ENTITY")} becomes ${code("PARTNER_ENTITY")}, and ${code("COLLECTION_RECEIVING_ENTITY")} and ${code("WALLET")} merge into ${code("COLLECTION_RECEIVING_ENDPOINT")} (D15). Two tables became one, so the count is 54 tables and 4 views. Draft v5.2 (${DATE}) adds the four decisions of the review of the v5.1 draft (D16–D19) and a set of editorial corrections; no table is added or dropped.</p>

<h3>D13 — No return group</h3>
<p><i>Decision.</i> ${code("sender_return")} and ${code("partner_transit")} receivers belong to no group. Attribution of a return or hop leg is inherited from its parent leg. Offsets are defined between a leg's attributed group and the group of a counterparty receiver.</p>
<p><i>Rejected alternative.</i> A dedicated group of kind = return per project holding the sender_return receivers (ERD v4.0 §6; config schema rule "one default and one return group").</p>
<p><i>Why.</i> Groups exist for entitlement and offset accounting; refund exclusion is a receiver-kind rule, not an entitlement rule, and ${code("RECEIVER.kind")} already enforces it. The return group (a) made every project have at least two groups, so the Understanding document's "a project with a single group never has an offset" was false by construction; (b) classified every refund as a cross-group payout under the v4.0 offset definition, triggering Management approval and offset aging; (c) left the return group's entitlement negative after each refund, breaking invariant 7, unless a reattribution path was added. Removing it restores the Understanding document's §3.3 and §6.3 wording without change. The return group entered during the v4.0 write-up; decision D3 of the review record relied on it and is amended there.</p>
<h4>Changed tables</h4>
${table(["Table", "Change"], [
  [code("RECEIVER_GROUP"), "− kind. A group is a group; exactly one is_default per project (D13)."],
  [code("RECEIVER"), "group_id required when kind = counterparty, null otherwise. sender_return and partner_transit receivers never appear on forward deals or allow lists (validation on kind) (D13)."],
  [code("DEAL"), "receiver_group_id: set at quote on the first forward leg; a return leg inherits it from its parent leg, leg n of a route from leg n−1 (D13)."],
  [code("DISBURSEMENT_LINE"), "A line paying a group-less receiver debits the paying leg's group and is never an offset (D13)."],
  [code("RECEIVING_ENTITY_ACCOUNT"), "+ account_kind (bank / wallet); details_ref → bank_details_ref (bank accounts only); + network, + address (wallets only). Write-time rule: a bank account has bank_details_ref and a bank rail; a wallet has network and address and a crypto rail matching the network (D14)."],
], ["30%"])}
<p><b>D14 — Explicit wallet fields on receiving-entity accounts.</b> Rejected: keeping wallet details inside the opaque details_ref. Why: the collection side already stored network and address explicitly; the payout side did not, so addresses could not be validated, checked against the rail, or queried across partners. Bank details stay external by reference, as before.</p>

<h3>D15 — Partner entity and collection endpoint</h3>
<p><i>Decision.</i> ${code("FACILITATING_ENTITY")} is renamed ${code("PARTNER_ENTITY")}: the partner's legal vehicle whose name appears on paperwork, the mirror of ${code("RECEIVING_ENTITY")} on the client side. ${code("COLLECTION_RECEIVING_ENTITY")} (bank-in) and ${code("WALLET")} (crypto-in) merge into one ${code("COLLECTION_RECEIVING_ENDPOINT")} table owned by a partner entity, with kind = bank / wallet and the field shape of ${code("RECEIVING_ENTITY_ACCOUNT")} (rail required only on active bank endpoints, see D18). ${code("COLLECTION")} points at one endpoint (${code("collection_receiving_endpoint_id")}, null for cash) instead of the hand-rolled endpoint_type + endpoint_id pair. The rename is pending NPL confirmation; the FRS term "Facilitating Entity" stays in Appendix A.1.</p>
<p><i>Rejected alternative.</i> Keeping two endpoint tables, one with a legal owner (wallets under a vehicle) and one without (bank accounts directly under the partner config).</p>
<p><i>Why.</i> A bank account is always in some legal entity's name, so the v4.0 split left the schema unable to say which vehicle owns a bank-in account, while every wallet knew its owner. One endpoint table under the vehicle fixes the asymmetry, lets the system check that the account a sender paid into belongs to the vehicle stamped on the deal, removes a polymorphic pair from ${code("COLLECTION")}, and makes the partner side read exactly like the client side: config → entity → endpoint.</p>
${table(["Table", "Change"], [
  [code("PARTNER_ENTITY"), "renamed from FACILITATING_ENTITY; − bank_details_ref (moved to its endpoints)."],
  [code("COLLECTION_RECEIVING_ENDPOINT"), "new; replaces COLLECTION_RECEIVING_ENTITY and WALLET. partner_entity_id, kind (bank / wallet), currency, bank_details_ref (bank), network + address (wallet), status."],
  [code("COLLECTION"), "endpoint_type + endpoint_id → collection_receiving_endpoint_id (null for cash)."],
  [code("DEAL"), "facilitating_entity_id → partner_entity_id."],
  ["Invariant 6", "adds: a collection's endpoint must belong to the leg's partner entity."],
], ["30%"])}

<h3>v5.2 — decisions of the review of the v5.1 draft (${DATE})</h3>
${decision("D16 — Registration payout details follow the account's kind", [
  ["Decision", `${code("SETTLEMENT_REGISTRATION")} gains ${code("network")} and ${code("address")} (nullable). ${code("bank_details_ref")} ("as paid by this partner") is set only when the registered account's ${code("account_kind")} is bank; for a wallet account the registration carries the network and address as the partner registered them, and the bank field stays empty. The registration remains the partner's view of the destination; ${code("RECEIVING_ENTITY_ACCOUNT")} remains NPL's.`],
  ["Rejected alternative", "Keeping a bank-only field on wallet registrations (the v5.1 shape)."],
  ["Why", "After D14 and D15 every other destination record is kind-aware; a wallet registration had no field that fitted, so an approved wallet destination either carried no details or carried an address in a field named for bank details. Storing the partner's copy also lets the system compare NPL's record with the partner's before paying to a wallet, where a wrong address is unrecoverable."],
])}
${decision("D17 — DISBURSEMENT_LINE.deal_id", [
  ["Decision", `${code("DISBURSEMENT_LINE")} gains ${code("deal_id")}, a nullable foreign key to ${code("DEAL")}: required when the paid receiver is group-less (sender_return, partner_transit), optional on counterparty lines. New invariant 19. ${code("GROUP_ENTITLEMENT")} reads the paying leg's group from it.`],
  ["Rejected alternative", "Leaving the rule in prose (\"a payout to a group-less receiver debits the paying leg's group\")."],
  ["Why", "A DISBURSEMENT pools many deals, and neither it nor its lines named one; the D13 rule and the view that depends on it could not be computed from stored columns, and invariant 7 could not be checked mechanically. The same column will carry the per-line discharge facts of the scenario in which a EUR invoice is paid in USDT in parts."],
])}
${decision("D18 — Nullable rail on COLLECTION_RECEIVING_ENDPOINT", [
  ["Decision", `The endpoint gains ${code("rail")}, nullable. Null means "not yet known", never "does not matter": a bank endpoint cannot become active — and no ${code("COLLECTION")} or payment instruction may reference it — until rail is set; a wallet endpoint may leave rail null (its network already names the road), and when rail is set on a wallet it must match ${code("network")} (mirrors D14).`],
  ["Rejected alternative", "A NOT NULL rail, which forces a guessed value when a partner sends incomplete details; or no rail at all (the v5.1 shape), which made the \"same field shape as RECEIVING_ENTITY_ACCOUNT\" claim inexact."],
  ["Why", "The road matters on the collection side as much as on the payout side: the same EUR account reachable by SEPA or SWIFT needs different instructions and arrives with different fees; local rails carry transaction limits (UPI caps, RTGS minimums); and a wrong rail recorded with confidence causes the failures a blank cannot."],
])}
${decision("D19 — Endpoint kind must match the leg's collection method", [
  ["Decision", `A write-time rule, added to invariant 6: a collection endpoint's ${code("kind")} must match the leg's ${code("collection_method")} — wallet for crypto-in, bank for bank-in, and cash-in has no endpoint.`],
  ["Rejected alternative", "None; the rule was missing."],
  ["Why", `After D15 the fact "how does the money arrive" lives in two places — ${code("DEAL.collection_method")} and the endpoint's kind — and nothing stopped them disagreeing silently.`],
])}
<h4>Changed tables (v5.2)</h4>
${table(["Table", "Change"], [
  [code("SETTLEMENT_REGISTRATION"), "+ network, + address (wallet accounts only); bank_details_ref only when the account's kind is bank (D16)."],
  [code("DISBURSEMENT_LINE"), "+ deal_id — nullable FK to DEAL; required when the paid receiver is group-less, optional on counterparty lines (D17)."],
  [code("COLLECTION_RECEIVING_ENDPOINT"), "+ rail — nullable; required before a bank endpoint becomes active; on a wallet, must match network when set (D18)."],
  [code("COLLECTION"), "No column change: may reference only an active endpoint whose kind matches the leg's collection_method (D18, D19)."],
], ["30%"])}

<h3>Views and invariants</h3>
${table(["Item", "Change"], [
  [code("GROUP_ENTITLEMENT"), "Sums client_net over converted legs of both types; a payout line debits the paid receiver's group (counterparty) or the group of the leg named by its deal_id (group-less receivers) — computable from stored columns (D13, D17)."],
  [code("OFFSET"), "Entitlement − paid per group, arising only when a counterparty receiver is paid from a leg attributed to another group."],
  ["Invariant 6", "Adds: a collection's endpoint must belong to the leg's partner entity (D15); its kind must match the leg's collection_method (D19); a COLLECTION may reference only an active endpoint, and a bank endpoint is active only with rail set (D18)."],
  ["Invariant 7", "Restated: return and hop legs preserve conservation by inheriting the parent leg's group; since v5.2 every payout line resolves to a group, so the invariant is checkable mechanically (D17)."],
  ["Invariant 17", "Restated: offsets only between a leg's attributed group and a counterparty receiver's group; a single-group project never has an offset."],
  ["Invariant 18", "group_id iff kind = counterparty; forward legs and the allow list target counterparty groups and receivers only; return and hop legs inherit attribution."],
  ["Invariant 19", "New: a line paying a group-less receiver carries deal_id; the paying leg's group is a stored fact, never inferred (D17)."],
], ["24%"])}

<h3>Editorial corrections in v5.2</h3>
<ul>
<li>Invariant 18's note now says the allow list targets counterparty <i>groups and receivers</i>, not receivers alone.</li>
<li>The D13 write-up no longer claims the return group appeared in no decision-record entry: decision D3 of the review record did place sender_return receivers in a return group; the record amends D3 and carries D13–D19.</li>
<li>The dependent-documents table is refreshed: the data file is already ${code("erd.v5.json")} and the decision record carries D13–D19.</li>
<li>The third v5.1 change (D15) is dated ${DATE}; this baseline is an internal New XP document from which the client deliverables are derived.</li>
</ul>

<h3>Dependent documents to update</h3>
${table(["Document", "Change"], [
  ["Configuration Schema Specification v1.0", "Replace \"one default and one return group\" with \"exactly one default group\"; add \"every counterparty receiver names a group; no other kind does\". Partner section: entities own endpoints; endpoint kind decides which fields are required; rail nullable with the activation rule (D18); registration fields follow the account's kind (D16). Re-validate the FRS Client 1 example — it should pass with one group."],
  ["Lifecycle &amp; Approvals v1.0", "cross_group_payout must not fire on return legs or hop legs; endpoint activation gated on rail (D18); collection verification checks the endpoint's kind against the leg's collection_method (D19)."],
  ["Ledger Posting Design v1.0", "No account changes. Confirm the return-leg example posts the payout against the parent leg's group entitlement; payout postings may cite the line's deal_id (D17)."],
  ["Calculation Specification v1.0", "No change."],
  ["ERD Review — Decision Record", "D13–D19 recorded (8 October 2026)."],
  ["Understanding document v1.1", "Nothing to apply; it never had a return group."],
  [`${code("data/erd.v5.json")}, interactive map, knowledge base`, "Updated to version 5.2 with this draft (fields, views, invariants, notes, vocabulary)."],
], ["30%"])}

<h3>Carried over from v4.0 unchanged</h3>
<p>The 12 new tables, 16 changed tables and 3 removals listed in v4.0 §6 (INTRODUCER, RECEIVER_GROUP, RECEIVING_ENTITY_ACCOUNT, REFERRAL_RULE, PARTNER_REBATE_RULE, DEAL_GROUP, BALANCE_CONVERSION, ENTITLEMENT_REATTRIBUTION, DISBURSEMENT_RETURN, FEE_DECISION, REFERRAL_ACCRUAL, PARTNER_REBATE_ACCRUAL; the removal of RECEIVER_ENTITLEMENT, withhold_earnings and the ADVANCE purpose) all stand. The small gaps noted in the engagement record (EXCEPTION entity, PARTNER_STATEMENT, configuration versioning, SENDER_CREDIT.applied_to_deal_id, DEAL_GROUP.estimate_out, cash rounding per currency, operating time zone) are not addressed in v5.2 and remain open.</p>`;

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
<p class="date">${DATE} · Confidential · Internal baseline document</p>
</div>

<h2 class="pb">Status and conventions</h2>
<p><b>Status:</b> Draft v${V} (${DATE}) carries the three changes v5.0 / v5.1 made to v4.0 — (1) the per-project return receiver group is removed: ${code("sender_return")} and ${code("partner_transit")} receivers belong to no group, and a return or hop leg inherits its attribution from its parent leg (D13); (2) ${code("RECEIVING_ENTITY_ACCOUNT")} carries explicit wallet fields (${code("account_kind")}, ${code("network")}, ${code("address")}) beside the bank reference (D14); (3) ${code("FACILITATING_ENTITY")} is renamed ${code("PARTNER_ENTITY")}, and the partner's collection endpoints are merged into one ${code("COLLECTION_RECEIVING_ENDPOINT")} table owned by the partner entity (D15; rename pending NPL confirmation) — and adds the four decisions of the review of the v5.1 draft on ${DATE}: (4) ${code("SETTLEMENT_REGISTRATION")} payout details follow the account's kind (D16); (5) ${code("DISBURSEMENT_LINE.deal_id")}, required when the paid receiver is group-less (D17); (6) a nullable ${code("rail")} on ${code("COLLECTION_RECEIVING_ENDPOINT")}, required before a bank endpoint is active (D18); (7) an endpoint's kind must match the leg's collection method (D19). Everything else carries over unchanged. Supersedes v5.1, v5.0 and v4.0 in full. This baseline is an internal New XP document; the client deliverables are derived from it.</p>
<p><b>Convention:</b> all monetary amounts are stored as exact decimals; every table carries ${code("created_at")} / ${code("created_by")}; audit, approvals and locking are modelled once (domain 4) and apply to all master data. Derived figures (client balance, group entitlement, offsets, custody) are <b>views over postings and deals — never stored</b>.</p>
<p>Six diagrams across four domains, one schema: ${tables.length} tables and ${views.length} views. In each diagram, entities defined in another diagram appear with no attributes and name that diagram. Relationship lines run from the referenced row to the row that stores the foreign key; ${code("||--o{")} is composition (the parent owns the child), ${code("||..o{")} a reference or a polymorphic link resolved by a type column plus an id. Section 6 lists what changed since v4.0; Appendix A reconciles the model with the FRS; Appendix B is the data dictionary.</p>
<div class="rule"></div>

<h2>1 · Configuration domain</h2>
<p>A <b>Project</b> (= client) owns its configuration. Partners are global counterparties; how a partner is used <i>in this project</i> is the <b>partner configuration</b> block — fees, vehicles, endpoints, registrations and rebate terms hang off it. Counterparty receivers are organised in <b>receiver groups</b>, the unit entitlement is tracked on, and each receiving entity holds one or more <b>accounts</b> with a currency and rail.</p>
${diagramPage(DIAGRAMS[0])}
${diagramPage(DIAGRAMS[1])}
<h3>Notes</h3><ul>${notes.config.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>2 · Rates domain</h2>
${diagramPage(DIAGRAMS[2])}
<h3>Notes</h3><ul>${notes.rates.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>3 · Deal lifecycle domain</h2>
<h3>3a · Deal group, legs, collection, conversion, reroute, balance conversion</h3>
${diagramPage(DIAGRAMS[3])}
<h3>3b · Disbursement, return, confirmation, fees, referrals and rebates</h3>
${diagramPage(DIAGRAMS[4])}
<h3>Derived views (never stored)</h3>
${table(["View", "Definition"], views.map((v) => [`<span class="mono">${esc(v)}(${D.E[v].f.map((f) => f[0]).join(", ")})</span>`, esc(D.E[v].desc)]), ["34%"])}
<h3>Notes</h3><ul>${notes.deal.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>4 · Ledger &amp; controls domain</h2>
${diagramPage(DIAGRAMS[5])}
<h3>Notes</h3><ul>${notes.ledger.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2 class="pb">5 · Invariants (enforced at write time)</h2>
<ol>${D.INV.map((i) => `<li>${esc(i[1])}</li>`).join("")}</ol>

<h2>6 · What changed from v4.0</h2>
${whatChanged}

<h2 class="pb">7 · Open questions</h2>
<p>${openOpen.length} of the questions carried from the Understanding document remain open; the rest were answered by NPL in the review of the Understanding document or settled in the ERD reviews of 6–8 October 2026 and are reflected in this draft.</p>
<h3>Still open</h3>
${table(["#", "Question", "Blocks", "Status"], openOpen.map((q) => [D.OPENQ.indexOf(q) + 1, esc(q.q), esc(q.blocks), esc(q.a)]), ["6%", "", "22%", "22%"])}
<h3>Answered and reflected in v${V}</h3>
${table(["#", "Question", "Answer", "In the model"], openDone.map((q) => [D.OPENQ.indexOf(q) + 1, esc(q.q), esc(q.a), esc(q.impl)]), ["6%", "30%", "", "30%"])}

<h2 class="pb">Appendix A · FRS reconciliation</h2>
<h3>A.1 Vocabulary</h3>
${table(["FRS term", "Model entity"], frsVocab.map(([a, b]) => [esc(a), `<span class="mono">${esc(b)}</span>`]), ["30%"])}
<h3>A.2 Deviations from the FRS (classified)</h3>
${table(["FRS statement", "Model", "Classification"], frsDev.map(([a, b, c]) => [esc(a), esc(b), esc(c)]), ["28%", "", "24%"])}
<p class="small"><i>Draft v${V} — internal baseline. Dependent documents (ledger design, calculation spec, state machines, roles matrix, configuration schema, cutover) to be re-validated against this version per §6.</i></p>

<h2 class="pb">Appendix B · Data dictionary (field annotations)</h2>
<p class="small">Every table also carries ${code("created_at")} and ${code("created_by")}. Types: int, string, bool, decimal, datetime, date. Rows changed in a revision are marked with the revision and decision that changed them.</p>
<h3>B.1 Configuration</h3>${byDomain("config").map(fieldTable).join("")}
<h3>B.2 Rates</h3>${byDomain("rates").map(fieldTable).join("")}
<h3>B.3 Deal, collection, conversion, reroute, balance conversion</h3>${byDomain("deal").map(fieldTable).join("")}
<h3>B.4 Disbursement, return, confirmation, fees, referrals, rebates</h3>${byDomain("settle").map(fieldTable).join("")}
<h3>B.5 Ledger &amp; controls</h3>${byDomain("ledger").map(fieldTable).join("")}
</body></html>`;

const htmlPath = path.join(outDir, `NPLify-P0-ERD-v${V}.html`);
fs.writeFileSync(htmlPath, html);
const pdfPath = path.join(outDir, `NPLify-P0-ERD-v${V}.pdf`);
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, "file://" + htmlPath], { stdio: "ignore" });
fs.rmSync(path.join(outDir, ".mermaid-work"), { recursive: true, force: true });
console.log("wrote", htmlPath, "and", pdfPath, `(${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB)`);
