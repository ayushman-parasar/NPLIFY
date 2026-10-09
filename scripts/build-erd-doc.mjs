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
const DATE = "9 October 2026";
const DATE52 = "8 October 2026";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const code = (s) => `<code>${esc(s)}</code>`;

import { DIAGRAMS, homeOf } from "./erd-diagram-defs.mjs";
for (const dg of DIAGRAMS) for (const n of dg.nodes) if (!D.E[n.replace("~", "")]) throw new Error(`unknown entity ${n} in diagram ${dg.id}`);
const drawn = new Set(DIAGRAMS.flatMap((dg) => dg.nodes.filter((n) => !n.startsWith("~"))));
const tables = Object.keys(D.E).filter((n) => D.E[n].d !== "view");
for (const n of tables) if (!drawn.has(n)) throw new Error(`table ${n} is drawn in no diagram`);

console.log("rendering diagrams …");
const svgs = renderSvgs(DIAGRAMS.map((dg) => ({ id: dg.id, text: erDiagram(dg.nodes, { direction: "TB" }), config: {} })), path.join(outDir, ".mermaid-work"));
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
    `A partner operates through one or more legal vehicles (${code("PARTNER_ENTITY")}: PT-tour, PT Global Inc); the deal stamps the vehicle at quote so paperwork names the right company. Each vehicle owns the endpoints a sender can pay into (${code("COLLECTION_RECEIVING_ENDPOINT")}): kind = bank with a currency and ${code("bank_details_ref")}, or kind = wallet with ${code("network")} and ${code("address")}. The partner side therefore mirrors the client side — ${code("PARTNER_CONFIG")} → ${code("PARTNER_ENTITY")} → ${code("COLLECTION_RECEIVING_ENDPOINT")} as ${code("RECEIVER")} → ${code("RECEIVING_ENTITY")} → ${code("RECEIVING_ENTITY_ACCOUNT")} (D15). An endpoint also carries a nullable ${code("rail")}: a bank endpoint must have it before it becomes active, and a wallet may leave it null but must match ${code("network")} when it is set (D18); the endpoint's kind must match the leg's ${code("collection_method")} (D19). Cash-in has no endpoint record; the leg carries the city and the collection the token (D30). The collected cash amount is rounded by the pair's ${code("cash_rounding")} option — truncate, nearest or round up — to ${code("cash_rounding_unit")} (100 / 500 / 1,000 by currency), the same menu as payout rounding (D25).`,
    `Destination approval is per partner: ${code("SETTLEMENT_REGISTRATION")} is an account of the project's receiving entity as registered with this partner, carrying the partner's approval status and the payout details the partner holds. Those details follow the account's kind: ${code("bank_details_ref")} for a bank account, ${code("network")} and ${code("address")} for a wallet (D16). ${code("SETTLEMENT_SENDING_ENTITY")} is the narrative on an outgoing transfer; ${code("SETTLEMENT_RAIL")} is the bank/EMI that executes it; neither holds money. ${code("COLLECTION_SENDING_ENTITY")} is provenance only and never a payout destination.`,
    `${code("OWN_WALLET")} exists for rerouting and pass-through (AQN-LT-Sub is an own wallet at Aquanow); ${code("PARTNER_CONFIG.applicable_for_reroute")} defines the alternate-partner set. Under an <b>own-desk</b> partner configuration (${code("is_own_desk")}, the NPL-GR game-reseller project) NPL itself is the converting party: its pairs are priced market plus NPL's markup and its collection endpoints are NPL's own wallets (${code("COLLECTION_RECEIVING_ENDPOINT.own_wallet_id")}); the custody view reports every such balance (D23).`,
    `<b>Fees in v5.3.</b> A ${code("FEE_OVERRIDE")} may carry its own sender / receiver split instead of inheriting the structure's proportion (D20). ${code("FEE_TIER")} rows under a structure price by the project's calendar-month volume; a leg that takes the month past a threshold is split across two tiers (D21). ${code("displayed_fee_basis")} / ${code("displayed_fee_pct")} on the structure say what the customer's quote prints when it differs from the recorded parts; the printed "source rate" is derived at quote, never typed (D22). ${code("CURRENCY_PAIR.amount_rounding")} is a menu — truncate, nearest or round up, to the unit or to ${code("rounding_unit")} — and a pair may have the same currency on both sides (D25, D33).`,
    `<b>Who else earns on a deal.</b> ${code("INTRODUCER")} / ${code("REFERRAL_RULE")} record a share NPL pays — or, with basis ${code("share_of_net_markup")} and ${code("party_kind")} client_party, the customer who provides a sub-account and shares NPL's markup (Raeen): the base is the leg's fee parts less its partner cost, rebates excluded, several parties may hold rules with different shares, and ${code("settlement_mode")} party_retains means the party holds the converted money and pays NPL the remainder monthly (D26). ${code("PARTNER_REBATE_RULE")} records the rebate a partner pays NPL, with a basis (percentage of amount or of the partner's fee) and an optional scope by sender or fee structure; the rebate is NPL's alone and is reported as its own stream (D27).`,
    `<b>Cutoff, screening, single use.</b> ${code("PARTNER.bank_cutoff_time")} (the partner's own clock, beside its rate expiry and holiday calendar), its per-day changes in ${code("PARTNER_CUTOFF_OVERRIDE")} (an agreed extension or an early close) and ${code("PARTNER_PAIR.needs_bank_lock")} drive same-day or next-day conversion and, on bank rails, same-day or next-day settlement (D29). Cash legs carry their city (${code("DEAL.cash_location")}) and cash rate versions theirs (D30). ${code("WALLET_SCREENING")} records the screening of a sending or receiving wallet address, by Operations, and the endpoint's ${code("risk_band")} says which decisions may land on it (D31). An endpoint or a receiving-entity account may be ${code("single_use")}, reserved for one deal (ad hoc local deposit accounts, D32).`,
  ],
  rates: [
    `The rate comparison for the day is created lazily by the first deal that needs it, one per partner × pair × date, and reused by every deal that day. A partner may give a new rate during the day, so one date can hold several versions. Rolling averages are built from confirmed versions only.`,
    `A version is breached when spread &gt; avg_2w × (1 + variance_threshold_rel); quoting and conversion on that partner × pair freeze until Finance approves with a reason, rejects, or asks for a better rate. Versions are never overwritten; every deal leg, conversion and balance conversion references its exact version.`,
    `Cross-source slippage is a query over ${code("MARKET_RATE")} across sources for the same pair and window.`,
    `A version stores the rate <b>as the partner quoted it</b> (${code("quoted_rate")}, ${code("quoted_direction")}); ${code("rate")} is normalised to the pair's direction and derived — 1 ÷ quoted when the directions differ — so Ali's 1.1738 becomes 0.851934 without a hand inversion, and a direction slip is caught by the breach check (D28). Cash pairs are priced per ${code("location")}: INR cash in Delhi and in Mumbai are two versions on the same day (D30).`,
  ],
  deal: [
    `<b>Every deal belongs to a deal group.</b> ${code("DEAL_GROUP")} is the client-facing instruction: the pair as the sender sees it, the sender rate, fee, reference and entry mode. A plain single-partner deal is a group of one leg; a route that needs two partners (INR → USDT at Ali, USDT → EUR at Jeton) has two forward legs; a rejected payout is unwound with a return leg.`,
    `<b>Legs.</b> ${code("leg_type")} forward or return; ${code("funding_source")} collection, prior_leg (leg 2 of a route, no collection) or returned_disbursement (a return leg). Priced once and partner fixed at quote hold per leg. Attribution is to the receiver group: set at quote on the first forward leg, inherited by leg n of a route from leg n−1 and by a return leg from its parent leg. The receiver is optional until settlement.`,
    `Two entry modes as before: collect-first legs are born in state Collected with priced_at = conversion time; quote-first legs carry sent / valid / grace timestamps and a late decision. An estimate-first mode gives an indicative figure and prices at conversion.`,
    `<b>Conversion has exactly one owner</b>: a deal leg or a ${code("BALANCE_CONVERSION")}. The receiver-side fee is taken at conversion. Amounts are rounded at conversion by the pair's option (D25); a dropped fraction (${code("rounding_residual")}, signed) stays client money in the balance and pays out when it reaches a unit, an amount added by rounding up is NPL's cost. NPL's margin is captured at conversion and is never again at risk from a return or a forward.`,
    `<b>Balance conversion</b> is NPL converting a client's held balance (5K SGD → USDT to fund a 15K USDT payout): Finance-initiated, Management-approved, no sender, receiver or collection, same rate machinery, markup by ${code("FEE_DECISION")}. It names the receiver group it serves; ${code("ENTITLEMENT_REATTRIBUTION")} moves that group's entitlement to the new currency, and any excess over the group's entitlement is booked as an approved offset.`,
    `<b>Reroute</b> is the only way partner or partner entity change after quote. Forwarding is forward_full or forward_and_recover_dues: NPL nets what the alternate partner owes it (${code("EARNINGS_RECEIVABLE")}) against the funds forwarded, within the outstanding receivable, with the partner's agreement recorded. Post-collection outcome is via the own wallet or a refund to the sender.`,
    `One settlement model: ${code("DISBURSEMENT")} drains one partner's holding into one or many ${code("DISBURSEMENT_LINE")}s, rounded as the pair says. Under disburse_policy to_zero the balance after release is less than one unit; under hold_allowed the balance may rest at the partner within the project's exposure cap.`,
    `A line paying a counterparty receiver whose group differs from the paying leg's attributed group is an offset, created by the same action, with Management approval and tighter aging. A line paying a sender_return or partner_transit receiver is never an offset: those receivers have no group, and the line debits the group of the leg it names in ${code("deal_id")} (D13, D17).`,
    `<b>Rejected payout.</b> When the receiving or intermediary bank rejects a transfer, ${code("DISBURSEMENT_RETURN")} records the returned amount, bank fee and reason; the line's outcome becomes returned, a reversing ledger transaction puts the money back into the client's balance and the paying leg's group entitlement, and ${code("BANK_FEE_EVENT")} books the bounce fee. The money then stays in balance for later payouts, or funds a return leg — attributed to the same group — that converts back and pays the sender's return receiver.`,
    `<b>Fee decisions.</b> ${code("FEE_DECISION")} is a one-off, approved decision on a single subject: markup applied or waived on a return leg or balance conversion, a network-fee override on a refund, a bank-fee treatment override on one settlement. Standing rules stay in ${code("FEE_STRUCTURE")} and ${code("FEE_OVERRIDE")}.`,
    `${code("CONFIRMATION")} is full or short; a short confirmation opens a ${code("SHORTFALL")} topped up by a later disbursement or an explicit separate payout — cash found short at hand-over included. Rounding differences no longer land here. ${code("REFERRAL_ACCRUAL")} and ${code("PARTNER_REBATE_ACCRUAL")} accrue per deal under their rules; a party_retains referral accrual is a receivable from the party, reconciled monthly like a rebate (D26); rebates are reconciled monthly against the partner's statement, which covers NPLify deals only (D27).`,
    `<b>Pricing stamps (v5.3).</b> A leg stamps the override and the base tier that priced it; a leg that crosses a tier threshold holds two ${code("DEAL_FEE_TIER")} portions and a blended fee (D20, D21). The deal group stamps the displayed fee and source rate the quote printed (D22). On a pair that needs a bank lock the leg records ${code("rate_locked_at")} and ${code("conversion_due_date")}: locked before the partner's cutoff it converts the same day, otherwise the next business day at that day's version; the sender's figures are write-once, NPL absorbs the difference as a cutoff-timing variance, and a conversion whose next-day rate breaches the margin is deferred with a reason. The client balance view shows the locked leg's converted value as pending from the lock; a void removes it (D29).`,
    `<b>Invoices.</b> ${code("INVOICE")} is an obligation in its own currency — a vendor's EUR invoice a reseller customer pays in THB or USDT, in parts, over days. A deal group names the invoice it pays (advance, then balance); each payout line records how much of the obligation it discharged and the market snapshot used; ${code("INVOICE_BALANCE")} is the open remainder (D24).`,
    `<b>Cash and crypto parts.</b> A cash part carries the token (the local-currency bill whose serial identifies the agent), the agent's contact and the partner's count; the leg carries the city, which also selects the rate version (D30). A crypto part carries the sender's declared address and the screening that admitted it, unless the project skips up-front screening (D31).`,
    `<b>Loss events.</b> ${code("LOSS_EVENT")} records money lost after it was verified or released — a frozen local account, cash short that cannot be recovered, a wrong-chain transfer — on either side, by any method, for a partial or full amount, with the loss split across sender, NPL, partner and client; Management approves the split, one reversing transaction posts it, and a collection-side event moves the part to reversed (D32).`,
  ],
  ledger: [
    `Client due balances are held as one account per project × partner × currency (CL.&lt;PARTNER&gt;.&lt;CCY&gt;.DUE); group entitlement is a view, not an account. ${code("holder_type")} never includes a settlement rail or narrative entity.`,
    `<b>Ownership flips client → company at one event only: margin recognition at conversion.</b> NPL never advances money to a receiver, and withholding on a reroute is not a separate event because the margin is always captured by whichever partner converts.`,
    `Recover dues on a reroute posts own-wallet cash against the earnings receivable at the partner: company money on both sides, no income.`,
    `Transaction sources: Collection, Conversion, BalanceConversion, Disbursement, DisbursementReturn, Confirmation, BankFeeEvent, Reroute, Referral, Rebate, LossEvent, Adjustment. Account purposes include PAYABLE, REFERRAL_PAYABLE, SHARE_RECEIVABLE, REBATE_RECEIVABLE, EARN_GROSS, EARN_REBATE, EXP_ROUNDING and EXP_LOSS; ADVANCE does not exist. Cost components include referral, share, rebate, rounding, fx_timing, cutoff_timing and loss.`,
    `<b>Three streams NPL never mixes (v5.3).</b> Earnings on deals post to EARN_GROSS at conversion; a partner's rebate posts to EARN_REBATE and is never in the base a client party shares (D26, D27); NPL's remainder from a party that holds the converted funds sits in SHARE_RECEIVABLE until the party pays it. The cost of rounding up is EXP_ROUNDING, NPL's share of a loss event is EXP_LOSS; the client's and sender's shares of a loss reduce the client balance, the partner's share is a receivable from the partner (D25, D32). Own-desk deals use the ordinary partner-coded accounts with the own-desk configuration as holder and EXP_PARTNER zero by construction (D23).`,
    `${code("APPROVAL")}, ${code("AUDIT_LOG")} and ${code("RECORD_LOCK")} are modelled once and apply to all master data. Approver ≠ initiator on every approval; Operations never sees derived economics. Approval actions include refund_to_third_party, cross_group_payout, balance_conversion, recover_dues, enable_own_desk, approve_loss_split and override_screening_reject. cross_group_payout never fires on a line paying a sender_return or partner_transit receiver. Wallet screening itself is an Operations action, not an approval (D31).`,
  ],
};

const frsVocab = D.FRS_VOCAB;
const frsDev = D.FRS_DEV.map(([a, b, c]) => a.startsWith("Strict Client") ? [a, "RECEIVER_GROUP → RECEIVER → RECEIVING_ENTITY → account; SENDER with a group allow-list; FRS project = one default group", "Generalisation per NPL instruction"] : a.startsWith("One settlement per deal") ? [a, "Accumulate → disburse the balance rounded as the pair says (residual carried), or hold within the exposure cap where the project allows", "Generalisation (D25)"] : a.startsWith("AQN-LT-Sub") ? [a, "OWN_WALLET at Aquanow; pass-through is a two-leg deal group or a reroute via the own wallet; also NPL-GR's own-desk collection endpoint", "Resolved (v4.0, D23)"] : [a, b, c]);

const openOpen = D.OPENQ.filter((q) => q.status !== "answered");
const openDone = D.OPENQ.filter((q) => q.status === "answered");

// ------------------------------------------------------------------ section 6 — what changed
const decision = (title, parts) => `<h4>${title}</h4>${parts.map(([k, v]) => `<p><i>${k}.</i> ${v}</p>`).join("")}`;
const V53 = [
  ["D20 (A) — A per-sender override carries its own split", `${code("FEE_OVERRIDE")} gains ${code("sender_share_pct")} and ${code("receiver_share_pct")}; both blank means the structure's proportion, both set means they sum to ${code("pct")}. ${code("DEAL")} stamps ${code("fee_override_id")}.`, "Keeping the override as a total only, with the structure's proportion.", "Evo's selected senders pay 1.0 % while Evo still pays its 0.6 %; a proportional override would charge 1.12 % and 0.48 %. NPL confirmed the receiver part is fixed for every sender."],
  ["D21 (B) — Fees by monthly volume", `${code("FEE_TIER")} under a fee structure (one tier at volume 0); the tier is chosen at quote from the project's calendar-month volume (${code("PROJECT_MONTH_VOLUME")}) and stamped with the volume that justified it. A leg that takes the month past a threshold is split: ${code("DEAL_FEE_TIER")} holds the portion below the threshold at the lower tier and the portion above at the next, and the leg's fee parts are the blended sum.`, "A rolling 30-day window; switching the whole leg to the new tier; switching from the next leg only.", "GDC pays 2.5 % below USD 500,000 a month and 2.25 % above, switched by hand today. NPL: calendar month; the crossing transaction itself attributes the part above the threshold to the lower tier."],
  ["D22 (C) — What the quote prints", `${code("FEE_STRUCTURE.displayed_fee_basis")} (actual / sender_share_on_partner_rate / fixed) and ${code("displayed_fee_pct")}; ${code("DEAL_GROUP")} stamps ${code("displayed_fee_pct")} and ${code("displayed_source_rate")} = sender_rate ÷ (1 − displayed fee) so a re-printed quote matches. Displayed figures are derived, never typed; Operations sees the displayed pair, Finance both.`, "Leaving the recomputation of the 'market rate' to Operations by hand.", "BF quotes via Ali show 'fee 1 %' while the recorded parts add to 1.4 % (Ali's 1 % inside its rate plus NPL's 0.4 %). NPL: a BF-only rule, to be cleared when the project moves to partner rate plus markup. The Raeen sub-account quote uses the same recomputation."],
  ["D23 (D) — NPL-GR as an own-desk project", `${code("PARTNER_CONFIG.is_own_desk")}; an own wallet is a ${code("COLLECTION_RECEIVING_ENDPOINT")} under it (${code("own_wallet_id")}); own-desk pairs are priced market plus NPL's markup with generated rate versions; invariant 3 restated: client money may rest in NPL's wallet under an approved reroute or in an own-desk project, and the custody view reports both. Enabling an own desk is a Management-approved configuration change (${code("enable_own_desk")}).`, "Keeping the no-custody principle intact and running the game-reseller flows outside NPLify.", "The reseller products (Bala, Fair, 66 Group, TripleSeven, Alpha Plus, 27 Group via THB cash) collect into NPL's own wallet and pay vendors from it on later days; there is no outside partner for the conversion. NPL's framing: NPL-GR, a business unit of NPL, is the client. Management confirmed running it inside the system."],
  ["D24 (E) — Invoices paid in parts", `${code("INVOICE")} owned by the project, naming the vendor; ${code("DEAL_GROUP.invoice_id")}; ${code("DISBURSEMENT_LINE")} gains ${code("invoice_id")}, ${code("obligation_discharged")}, ${code("discharge_rate")} and the market snapshot used; ${code("INVOICE_BALANCE")} = amount − Σ discharged over confirmed lines. The EUR difference between what was collected and what was discharged posts to variance with component fx_timing.`, "Tracking the obligation in a free-text client reference.", "A vendor's EUR invoice is settled in USDT in instalments at different days' rates (EUR/USDT 0.8708 at collection, 0.87527 at the last payment); the open balance changes with every instalment. NPL: wanted; vendors are paid on different days and the forex difference is accepted within the 2 % markup."],
  ["D25 (F) — A rounding menu per pair", `${code("CURRENCY_PAIR.amount_rounding")} grows from one value to truncate_unit / nearest_unit / round_up_unit / nearest_n / round_up_n with ${code("rounding_unit")}; ${code("CONVERSION.rounding_residual")} is signed — a dropped fraction stays client money, an amount added by rounding up is NPL's cost in ${code("EXP_ROUNDING")}. Cash collections use the same menu on the collected amount (${code("cash_rounding")} with ${code("cash_rounding_unit")}).`, "Truncation only, with the other practices left outside the system.", "Live quotes round THB and INR to the nearest 1,000 and round a reseller customer's USDT up. NPL: round up to the nearest 1,000 for Asian currencies, nearest unit for USD, SGD, HKD; round-up on USDT is deliberate."],
  ["D26 (G) — Markup shared with a client party", `${code("REFERRAL_RULE")} basis ${code("share_of_net_markup")}: the base is the leg's fee parts less its partner cost, on amount × market, rebates never included; ${code("party_kind")} introducer / client_party; ${code("settlement_mode")} npl_pays / party_retains; optional scope by fee structure; several rules per project with Σ shares ≤ 100 %. ${code("REFERRAL_ACCRUAL")} gains direction, period and received_amount; a party_retains accrual is a receivable (${code("SHARE_RECEIVABLE")}) reconciled monthly.`, "A fixed percentage per party, reconfigured when the route changes; NPL always paying the share out.", "Raeen's downlines fund sub-accounts at 4 %; whatever is left after the partner's fee is split equally — 1.5 % each via Ali, 1.6 % each via Aquanow — Raeen keeps the converted EUR in its own Aquanow account and pays NPL monthly; direct downlines split 0.2 % 75 / 25. NPL: future deals may have several parties with different shares; the partner's rebate is NPL's alone and not visible to the party."],
  ["D27 (H) — Rebates as their own stream", `Rebate income posts to ${code("EARN_REBATE")}, never ${code("EARN_GROSS")}. ${code("PARTNER_REBATE_RULE")} gains ${code("basis")} (pct_of_amount / pct_of_partner_fee) and ${code("pct")}, retires the old ${code("pct_of_partner_fee")} column (amended 9 October), and gains an optional scope by sender or fee structure. ${code("PARTNER_REBATE_ACCRUAL")} keeps ${code("deal_id")} required and gains ${code("statement_ref")}.`, "Accruals without a deal for clients NPL referred but does not service.", "NPL: the partner statement that NPLify reconciles covers only deals NPLify handled — customers working with Jeton or Aquanow directly are out of scope. Jeton pays 0.4 % of the amount on a 1 % or 1.25 % fee and 0.3 % on Novi's 0.9 %, so the rebate is not a fixed share of the fee. Management reads earnings and rebates as two numbers."],
  ["D28 (I) — Partner rates as quoted", `${code("PARTNER_RATE_VERSION")} gains ${code("quoted_rate")} and ${code("quoted_direction")}; ${code("rate")} is derived (1 ÷ quoted when the directions differ, at the pair's precision) and goes through the breach check like any rate.`, "A single normalised rate typed by Operations.", "Ali sometimes states USDT → EUR as 1.1738 (EUR-per-USDT the other way round); the hand inversion is a 38 % error waiting to happen, and the audit trail should show the number the partner sent."],
  ["D29 (J) — Bank cutoff, rate lock, next-day conversion", `${code("PARTNER.bank_cutoff_time")} / ${code("cutoff_timezone")} (amended 9 October: on PARTNER, not PARTNER_CONFIG — the cutoff is the partner's, whichever project uses it), with ${code("PARTNER_CUTOFF_OVERRIDE")} for a one-day extension the partner agreed (30–60 minutes, urgent requests) or an early close (Fridays, pre-holiday); ${code("PARTNER_PAIR.needs_bank_lock")} for the pairs that rely on the banking channel; the effective cutoff is stamped as ${code("cutoff_at")} on the leg at rate lock and on the disbursement at approval, and ${code("DISBURSEMENT.execution_due_date")} applies the same rule to the outgoing bank transfer — the second event the cutoff governs; ${code("DEAL")} and ${code("BALANCE_CONVERSION")} carry ${code("rate_locked_at")} and ${code("conversion_due_date")} (the lock date before the cutoff, else the next business day; Converting may not start earlier) and a ${code("conversion_deferred_reason")}. The client balance view shows a locked leg's converted value as pending from the lock; a void removes it. The difference between the stamped partner rate and the one used posts to variance with component cutoff_timing.`, "Treating the cutoff as part of quote validity; re-quoting the sender the next day.", "Evo via Ali: the rate is compared in the morning; locked before 14:30 GMT+8 it converts the same day, otherwise the money is collected on the morning's figures and converted the next business day. AK's USD and SGD balances are banking-ready and wait too. NPL: NPL absorbs the difference; if Ali's next-day rate breaches the margin, ask for a better rate or wait a day; today's balances should show the pending converted value."],
  ["D30 (K) — Cash by token, rates per city", `${code("DEAL.cash_location")}; ${code("PARTNER_RATE_VERSION.location")} with uniqueness per partner × pair × day × location; ${code("COLLECTION")} gains ${code("token_ref")}, ${code("agent_contact_ref")} and ${code("counted_at")}, with cash states token_issued → handed_over → counted → verified; ${code("DISBURSEMENT_LINE.token_ref")} for cash payouts.`, "Free-text cash instructions on the deal and one rate per currency; making the city a side of the currency pair (CASH_LOCATION) — proposed and withdrawn on 9 October at NPL's request.", "A cash collection or settlement is arranged by token — a local-currency bill whose serial number identifies the agent — closed by a photo of the token and the partner's count; INR in Delhi and Mumbai, or USD cash in Bangkok and Singapore, are different agents at different rates."],
  ["D31 (L) — Wallet screening", `${code("WALLET_SCREENING")} per address and day for sending and receiving wallets (result, decision, who, when, evidence); ${code("COLLECTION")} gains ${code("sending_address")}, ${code("wallet_screening_id")} and ${code("screening_skipped")}; ${code("COLLECTION_RECEIVING_ENDPOINT.risk_band")}; ${code("SETTLEMENT_REGISTRATION.wallet_screening_id")}. A screening decided accept_alternate lands only on an elevated-band endpoint; a reject is overridden only by Finance.`, "A static risk tier on the sender.", "NPL screens the sender's declared wallet before giving out the partner's receiving wallet, routes elevated-risk wallets to alternate wallets, verifies the hash on chain, and screens receivers' wallets before settlement. NPL: screening is a transaction-coordination activity, so it is an Operations action and Operations sees the result. Not every Evo sender accepts up-front screening."],
  ["D32 (M) — Single-use accounts and loss events", `${code("COLLECTION_RECEIVING_ENDPOINT")} and ${code("RECEIVING_ENTITY_ACCOUNT")} gain ${code("usage")} single_use with ${code("reserved_for_deal_id")} (and an expected amount on the endpoint); ${code("LOSS_EVENT")} on either side, by any method, for a partial or full amount, with the loss split across sender, NPL, partner and client (shares sum to the amount, Management approves); one reversing transaction (source LossEvent); ${code("EXP_LOSS")}; ${code("COLLECTION.state")} reversed. Cash found short at hand-over is a short confirmation topped up at the next settlement or by a separate payout, and a loss event only when unrecoverable.`, "A collection-only reversal borne by the sender in full.", "Local deposits use accounts the partner lends for one transaction; a frozen account can lose the funds. NPL: the loss can be partial, can be shared between NPL and the partner as well as the sender, can happen on the settlement side and by other methods, and single-use local accounts are used for settlement too."],
  ["D33 — Same-currency pass-through stays in scope", `A ${code("CURRENCY_PAIR")} may have the same currency on both sides; the leg converts at rate 1 so the sender and receiver fee parts are captured at conversion like on any pair.`, "Dropping the dormant Evolution bank-transfer products.", "NPL: the fee is still applied because the currency is collected and then settled separately."],
];
const whatChanged = `
<p>Draft v5.3 (${DATE}) applies the thirteen fee-practice gaps found between NPL's fee table, Sud's workbook answers and the Project Context / Payment methods tabs and ERD v5.2 — written up as proposals A–M in "Model Gaps &amp; Proposals v1.0" and confirmed by NPL on 8–9 October — plus the same-currency rule, as decisions D20–D33. Six tables are added (${code("FEE_TIER")}, ${code("DEAL_FEE_TIER")}, ${code("INVOICE")}, ${code("WALLET_SCREENING")}, ${code("LOSS_EVENT")}, ${code("PARTNER_CUTOFF_OVERRIDE")}) and two views (${code("INVOICE_BALANCE")}, ${code("PROJECT_MONTH_VOLUME")}): ${tables.length} tables and ${views.length} views. Earlier: v5.0 / v5.1 (7 October) removed the return group (D13), gave accounts explicit wallet fields (D14) and restructured the partner's collection side (D15); v5.2 (${DATE52}) added D16–D19.</p>

<h3>v5.3 — the fee-practice decisions (${DATE})</h3>
${V53.map(([t, dec, rej, why]) => decision(t, [["Decision", dec], ["Rejected alternative", rej], ["Why", why]])).join("")}
<h4>Amendments of 9 October (same draft)</h4>
<p><b>D15.</b> NPL confirmed the PARTNER_ENTITY rename. <b>D27.</b> ${code("pct_of_partner_fee")} is retired; ${code("basis")} + ${code("pct")} carry the rebate rule. <b>D29.</b> The bank cutoff moves to ${code("PARTNER")}: it is the partner's clock, like its rate expiry and holiday calendar, whichever project uses it. Later the same day NPL added that the cutoff governs two events — locking the rate and initiating the outgoing bank settlement — on the pairs that rely on the banking channel, and that it can be extended (30–60 minutes, partner agrees) or closed early (Fridays, pre-holiday): ${code("PARTNER_CUTOFF_OVERRIDE")} holds those per-day or weekday changes, the effective cutoff is stamped as ${code("cutoff_at")} on the leg and on the disbursement, and ${code("DISBURSEMENT.execution_due_date")} mirrors the leg's conversion due date for bank rails. <b>D30</b> stands as first drafted: the cash city is ${code("DEAL.cash_location")} and ${code("PARTNER_RATE_VERSION.location")}. An amendment making the city a side of the currency pair (a CASH_LOCATION table) was applied and then withdrawn the same day at NPL's request. Stale wording from before D23, D25 and D26 was corrected in the notes, walkthroughs, invariant 4 and the FRS reconciliation.</p>
<h4>New tables (v5.3)</h4>
${table(["Table", "Holds"], [
  [code("FEE_TIER"), "A volume tier of a fee structure: minimum calendar-month volume, currency, pct, optional split (D21)."],
  [code("DEAL_FEE_TIER"), "The tier portions of one leg — two when the leg crosses a threshold; amounts sum to amount_in (D21)."],
  [code("INVOICE"), "A vendor obligation in its own currency, owned by the project, paid by one or more deal groups and discharged line by line (D24)."],
  [code("WALLET_SCREENING"), "A screening of one wallet address on one day — sender or receiver side — with result, decision, who and evidence (D31)."],
  [code("LOSS_EVENT"), "Money lost after verification or release, on either side, partial or full, with the loss split across sender, NPL, partner and client (D32)."],
  [code("PARTNER_CUTOFF_OVERRIDE"), "A one-day or weekday change to a partner's bank cutoff: an agreed extension or an early close (D29, amended 9 October)."],
], ["26%"])}
<h4>Changed tables (v5.3)</h4>
${table(["Table", "Change"], [
  [code("FEE_OVERRIDE"), "+ sender_share_pct, receiver_share_pct (D20)."],
  [code("FEE_STRUCTURE"), "+ displayed_fee_basis, displayed_fee_pct (D22); owns FEE_TIER (D21); may scope a referral or rebate rule (D26, D27)."],
  [code("DEAL"), "+ fee_override_id, fee_tier_id, tier_volume_basis (D20, D21); + rate_locked_at, cutoff_at, conversion_due_date, conversion_deferred_reason (D29); + cash_location (D30)."],
  [code("DISBURSEMENT"), "+ cutoff_at, execution_due_date — a bank-rail settlement approved after the cutoff goes out the next business day (D29, amended 9 October)."],
  [code("DEAL_GROUP"), "+ displayed_fee_pct, displayed_source_rate (D22); + invoice_id (D24)."],
  [code("PARTNER"), "+ bank_cutoff_time, cutoff_timezone (D29, amended 9 October: moved here from PARTNER_CONFIG); owns PARTNER_CUTOFF_OVERRIDE."],
  [code("PARTNER_CONFIG"), "+ is_own_desk (D23)."],
  [code("PARTNER_PAIR"), "+ needs_bank_lock (D29)."],
  [code("COLLECTION_RECEIVING_ENDPOINT"), "+ own_wallet_id (D23); + risk_band (D31); + usage, reserved_for_deal_id, expected_amount (D32)."],
  [code("RECEIVING_ENTITY_ACCOUNT"), "+ usage, reserved_for_deal_id (D32)."],
  [code("CURRENCY_PAIR"), "amount_rounding becomes a menu; + rounding_unit; + cash_rounding, the same menu for the collected cash amount (D25); from_currency may equal to_currency (D33)."],
  [code("CONVERSION"), "rounding_residual signed (D25); rate 1 on a same-currency pair (D33)."],
  [code("REFERRAL_RULE"), "basis + share_of_net_markup; + fee_structure_id, party_kind, settlement_mode (D26)."],
  [code("REFERRAL_ACCRUAL"), "+ direction, period, received_amount; states accrued / reconciled / settled (D26)."],
  [code("PARTNER_REBATE_RULE"), "+ basis, pct, fee_structure_id, sender_id; − pct_of_partner_fee (D27)."],
  [code("PARTNER_REBATE_ACCRUAL"), "+ statement_ref; deal_id stays required (D27)."],
  [code("PARTNER_RATE_VERSION"), "+ quoted_rate, quoted_direction (D28); + location (D30); rate derived."],
  [code("BALANCE_CONVERSION"), "+ rate_locked_at, conversion_due_date (D29)."],
  [code("COLLECTION"), "+ sending_address, wallet_screening_id, screening_skipped (D31); + token_ref, agent_contact_ref, counted_at (D30); state + reversed, cash sub-states (D30, D32)."],
  [code("DISBURSEMENT_LINE"), "+ invoice_id, obligation_discharged, discharge_rate, discharge_market_rate_id (D24); + token_ref (D30)."],
  [code("SETTLEMENT_REGISTRATION"), "+ wallet_screening_id (D31)."],
  [code("LEDGER_ACCOUNT"), "purposes + EARN_REBATE (D27), SHARE_RECEIVABLE (D26), EXP_ROUNDING (D25), EXP_LOSS (D32)."],
  [code("LEDGER_TRANSACTION"), "source types + LossEvent (D32)."],
  [code("LEDGER_POSTING"), "cost components + rebate, share, fx_timing, cutoff_timing, loss."],
  [code("APPROVAL"), "actions + enable_own_desk (D23), approve_loss_split (D32), override_screening_reject (D31)."],
], ["30%"])}
<h4>Views and invariants (v5.3)</h4>
${table(["Item", "Change"], [
  [code("CLIENT_BALANCE"), "+ pending: the expected_out of rate-locked legs not yet collected or converted; removed on void; never a posting (D29)."],
  [code("CUSTODY"), "Includes own-desk client balances with their age (D23)."],
  [code("INVOICE_BALANCE"), "New: invoice amount − Σ obligation_discharged over confirmed lines (D24)."],
  [code("PROJECT_MONTH_VOLUME"), "New: Σ amount_in of the project's forward legs in the calendar month, in the tier currency; read at quote (D21)."],
  ["Invariant 3", "Restated: custody is allowed under an approved reroute or in an own-desk project; the custody view reports both (D23)."],
  ["Invariants 20–32", "New, one per decision D20–D33 (invariant 32 covers D33): override split, tier choice and split, displayed figures derived, invoice discharge bounded, signed rounding residual with an owner, share base and Σ shares, rebate stream and deal-bound accruals, rate derived from the quoted rate, conversion and settlement due dates from the effective cutoff with its overrides, rate uniqueness per location and cash count, screening ↔ endpoint band, single-use references and loss shares, same-currency conversion at rate 1."],
], ["24%"])}
<h4>Dependent documents — not yet regenerated against v5.3</h4>
${table(["Document", "What v5.3 changes in it"], [
  ["Ledger Posting Design v1.1 → v1.2", "Four new worked patterns: party-retains share (SHARE_RECEIVABLE), rebate as its own stream (EARN_REBATE), partial loss with a split (LossEvent, EXP_LOSS), own-desk deal (NPL-GR); signed rounding residual and EXP_ROUNDING; fx_timing and cutoff_timing variances."],
  ["Lifecycle &amp; Approvals v1.1 → v1.2", "Rate-locked and awaiting-cutoff sub-states with the deferral; loss event path with Management approval; cash collection steps (token → hand-over → count); screening before Collecting as an Operations action; enable_own_desk."],
  ["Roles &amp; Visibility Matrix v1.0 → v1.1", "Screening fields in the Operations group; rebate, party share and loss split in the economics group; a party-facing statement shows the share only, never the rebate."],
  ["Calculation Specification v1.0 → v1.1", "Tier split and blended fee; displayed source rate; rate-direction normalisation; rounding menu; same-currency conversion at rate 1; acceptance vectors from NPL's real figures (market 0.86050 / Ali 1 ÷ 1.1738; GDC 86,594; Raeen 41,520.17; THB 17,000,000; USDT 2,598 → 2,600)."],
  ["Configuration Schema v1.0 → v1.1", "Every new column and value set; the NPL-GR own-desk project; rebate rule basis and scope; cutoff times; cash locations; single-use endpoints."],
  ["ERD Reading Guide v1.0 → v1.1", "The new boxes on 1a, 1b, 3a and 3b, the split of the deal diagram into 3a and 3c, and the decisions behind them."],
  ["Fee Outlines v0.2 → v0.3", "Pink cells resolved (Ad Hoc INR 7 % total; Raeen 3.2 %; INR rounding); 'needs a system change' notes become 'configured in v5.3'; the tier split shown on pattern 5."],
  ["Model Gaps &amp; Proposals v1.0 → v1.1", "The corrections of 9 October (H simplified, J pending balance, L Operations, M generalised, B split) and the status 'applied in v5.3' on all thirteen."],
  ["ERD Review — Decision Record", "D20–D33 recorded (9 October 2026)."],
  [`${code("data/erd.v5.json")}, interactive map, knowledge base`, "The data file is at 5.3 with this draft; the map and the knowledge base still read 5.2."],
], ["30%"])}

<h3 class="pb">Earlier revisions — v5.0 to v5.2</h3>
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
<p><i>Decision.</i> ${code("FACILITATING_ENTITY")} is renamed ${code("PARTNER_ENTITY")}: the partner's legal vehicle whose name appears on paperwork, the mirror of ${code("RECEIVING_ENTITY")} on the client side. ${code("COLLECTION_RECEIVING_ENTITY")} (bank-in) and ${code("WALLET")} (crypto-in) merge into one ${code("COLLECTION_RECEIVING_ENDPOINT")} table owned by a partner entity, with kind = bank / wallet and the field shape of ${code("RECEIVING_ENTITY_ACCOUNT")} (rail required only on active bank endpoints, see D18). ${code("COLLECTION")} points at one endpoint (${code("collection_receiving_endpoint_id")}, null for cash) instead of the hand-rolled endpoint_type + endpoint_id pair. NPL confirmed the rename on 9 October 2026; the FRS term "Facilitating Entity" stays in Appendix A.1.</p>
<p><i>Rejected alternative.</i> Keeping two endpoint tables, one with a legal owner (wallets under a vehicle) and one without (bank accounts directly under the partner config).</p>
<p><i>Why.</i> A bank account is always in some legal entity's name, so the v4.0 split left the schema unable to say which vehicle owns a bank-in account, while every wallet knew its owner. One endpoint table under the vehicle fixes the asymmetry, lets the system check that the account a sender paid into belongs to the vehicle stamped on the deal, removes a polymorphic pair from ${code("COLLECTION")}, and makes the partner side read exactly like the client side: config → entity → endpoint.</p>
${table(["Table", "Change"], [
  [code("PARTNER_ENTITY"), "renamed from FACILITATING_ENTITY; − bank_details_ref (moved to its endpoints)."],
  [code("COLLECTION_RECEIVING_ENDPOINT"), "new; replaces COLLECTION_RECEIVING_ENTITY and WALLET. partner_entity_id, kind (bank / wallet), currency, bank_details_ref (bank), network + address (wallet), status."],
  [code("COLLECTION"), "endpoint_type + endpoint_id → collection_receiving_endpoint_id (null for cash)."],
  [code("DEAL"), "facilitating_entity_id → partner_entity_id."],
  ["Invariant 6", "adds: a collection's endpoint must belong to the leg's partner entity."],
], ["30%"])}

<h3>v5.2 — decisions of the review of the v5.1 draft (${DATE52})</h3>
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
<li>The third v5.1 change (D15) is dated ${DATE52}; this baseline is an internal New XP document from which the client deliverables are derived.</li>
</ul>

<h3>Dependent documents as updated for v5.2</h3>
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
<p>The 12 new tables, 16 changed tables and 3 removals listed in v4.0 §6 (INTRODUCER, RECEIVER_GROUP, RECEIVING_ENTITY_ACCOUNT, REFERRAL_RULE, PARTNER_REBATE_RULE, DEAL_GROUP, BALANCE_CONVERSION, ENTITLEMENT_REATTRIBUTION, DISBURSEMENT_RETURN, FEE_DECISION, REFERRAL_ACCRUAL, PARTNER_REBATE_ACCRUAL; the removal of RECEIVER_ENTITLEMENT, withhold_earnings and the ADVANCE purpose) all stand. Of the small gaps noted in the engagement record, cash rounding per currency is closed by D25 and the partner's time zone by D29 (cutoff_timezone); EXCEPTION entity, PARTNER_STATEMENT (a header for the monthly rebate statement would sit above PARTNER_REBATE_ACCRUAL.statement_ref), configuration versioning, SENDER_CREDIT.applied_to_deal_id and DEAL_GROUP.estimate_out remain open.</p>`;

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
<p><b>Status:</b> Draft v${V} (${DATE}) applies the thirteen fee-practice decisions D20–D32 and the same-currency rule D33, confirmed by NPL on 8–9 October from the fee table, Sud's workbook answers and the Project Context and Payment methods tabs: volume tiers and per-sender splits (D20, D21), the displayed fee (D22), NPL-GR as an own-desk project (D23), invoices paid in parts (D24), a rounding menu (D25), markup shared with a client party and rebates as their own stream (D26, D27), partner rates as quoted (D28), the bank cutoff and rate lock (D29), cash by token with rates per city (D30), wallet screening (D31), single-use accounts and loss events (D32), and same-currency pass-through (D33). Six tables and two views are added; invariant 3 is restated; invariants 20–32 are new. The amendments of 9 October (D15 closed, D27, D29) are recorded in §6. It carries v5.0–v5.2 (D13–D19) unchanged. Supersedes v5.2, v5.1, v5.0 and v4.0 in full. This baseline is an internal New XP document; the client deliverables are derived from it. Dependent documents have <b>not</b> yet been regenerated against this version (see §6).</p>
<p><b>Convention:</b> all monetary amounts are stored as exact decimals; every table carries ${code("created_at")} / ${code("created_by")}; audit, approvals and locking are modelled once (domain 4) and apply to all master data. Derived figures (client balance, group entitlement, offsets, custody) are <b>views over postings and deals — never stored</b>.</p>
<p>Seven diagrams across four domains, one schema: ${tables.length} tables and ${views.length} views. In each diagram, entities defined in another diagram appear with no attributes and name that diagram. Relationship lines run from the referenced row to the row that stores the foreign key; ${code("||--o{")} is composition (the parent owns the child), ${code("||..o{")} a reference or a polymorphic link resolved by a type column plus an id. Diagram 3a of v5.2 is split into 3a and 3c in v5.3 because the deal leg and its stamps outgrew one page. Section 6 lists what changed since v4.0; Appendix A reconciles the model with the FRS; Appendix B is the data dictionary.</p>
<div class="rule"></div>

<h2>1 · Configuration domain</h2>
<p>A <b>Project</b> (= client) owns its configuration. Partners are global counterparties; how a partner is used <i>in this project</i> is the <b>partner configuration</b> block — fees, vehicles, endpoints, registrations and rebate terms hang off it. Counterparty receivers are organised in <b>receiver groups</b>, the unit entitlement is tracked on, and each receiving entity holds one or more <b>accounts</b> with a currency and rail.</p>
${diagramPage(DG["1a"])}
${diagramPage(DG["1b"])}
<h3>Notes</h3><ul>${notes.config.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>2 · Rates domain</h2>
${diagramPage(DG["2"])}
<h3>Notes</h3><ul>${notes.rates.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>3 · Deal lifecycle domain</h2>
<h3>3a · Deal group, legs, pricing stamps, invoice, collection</h3>
${diagramPage(DG["3a"])}
<h3>3b · Disbursement, return, confirmation, fees, referrals, rebates and loss events</h3>
${diagramPage(DG["3b"])}
<h3>3c · Conversion, reroute, earnings receivable, balance conversion, entitlement re-attribution</h3>
${diagramPage(DG["3c"])}
<h3>Derived views (never stored)</h3>
${table(["View", "Definition"], views.map((v) => [`<span class="mono">${esc(v)}(${D.E[v].f.map((f) => f[0]).join(", ")})</span>`, esc(D.E[v].desc)]), ["34%"])}
<h3>Notes</h3><ul>${notes.deal.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>4 · Ledger &amp; controls domain</h2>
${diagramPage(DG["4"])}
<h3>Notes</h3><ul>${notes.ledger.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2 class="pb">5 · Invariants (enforced at write time)</h2>
<ol>${D.INV.map((i) => `<li>${esc(i[1])}</li>`).join("")}</ol>

<h2>6 · What changed from v4.0</h2>
${whatChanged}

<h2 class="pb">7 · Open questions</h2>
<p>${openOpen.length} of the questions carried from the Understanding document remain open; the rest were answered by NPL in the review of the Understanding document or settled in the ERD reviews of 6–9 October 2026 and are reflected in this draft.</p>
<h3>Still open</h3>
${table(["#", "Question", "Blocks", "Status"], openOpen.map((q) => [D.OPENQ.indexOf(q) + 1, esc(q.q), esc(q.blocks), esc(q.a)]), ["6%", "", "22%", "22%"])}
<h3>Answered and reflected in v${V}</h3>
${table(["#", "Question", "Answer", "In the model"], openDone.map((q) => [D.OPENQ.indexOf(q) + 1, esc(q.q), esc(q.a), esc(q.impl)]), ["6%", "30%", "", "30%"])}

<h2 class="pb">Appendix A · FRS reconciliation</h2>
<h3>A.1 Vocabulary</h3>
${table(["FRS term", "Model entity"], frsVocab.map(([a, b]) => [esc(a), `<span class="mono">${esc(b)}</span>`]), ["30%"])}
<h3>A.2 Deviations from the FRS (classified)</h3>
${table(["FRS statement", "Model", "Classification"], frsDev.map(([a, b, c]) => [esc(a), esc(b), esc(c)]), ["28%", "", "24%"])}
<p class="small"><i>Draft v${V} — internal baseline. Dependent documents (ledger design, calculation spec, state machines, roles matrix, configuration schema, reading guide, fee outlines) are still at their v5.2 editions and are to be regenerated against this version per §6.</i></p>

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
