// Build the client deliverable
//   docs/NPLify-Ledger-Posting-Design-v1.2.{html,pdf}   (chart of accounts + worked postings, ERD v5.6)
// Every number in the worked examples is computed here; every transaction is checked to balance
// per currency and per owner before the document is written.   node scripts/build-ledger-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "docs");
const DOC_VERSION = "1.2", ERD_VERSION = "5.6", DATE = "10 October 2026";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ------------------------------------------------------------------ money helpers (exact to a millionth)
const SCALE = 1e6;
const units = (x) => Math.round(x * SCALE + (x >= 0 ? 1e-7 : -1e-7));
const r2 = (x) => Math.round(x * 100 + (x >= 0 ? 1e-7 : -1e-7)) / 100;
const DP = { ETH: 4 };
const fmt = (x, ccy) => { const dp = DP[ccy] ?? 2; return Math.abs(x) < 10 ** -(dp + 1) ? (0).toFixed(dp) : x.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp }); };
const pct = (p, dp = 2) => (p * 100).toFixed(dp) + " %";
const trunc = (x) => Math.floor(x + 1e-9);
const roundUpN = (x, n) => Math.ceil(x / n - 1e-9) * n;

// ------------------------------------------------------------------ chart of accounts: OWNER.HOLDER.CCY.PURPOSE
// [owner, purpose, kind, holder pattern, since, meaning]; since = ERD edition that has the purpose, or "v1.2" for a purpose this document asks the ERD to add
const PURPOSES = [
  ["CL", "COLLECTED", "asset", "<PARTNER>", "v5.2", "Client money received at this partner and not yet converted (in the collection currency). In a reseller project the same purpose exists under CO."],
  ["CL", "HELD", "asset", "OWN", "v5.2", "Client money in one of NPL's own wallets: an approved reroute, or a collection bridge waiting to be forwarded (D40). Zero otherwise (invariant 3)."],
  ["CL", "DUE", "asset", "<PARTNER>", "v5.2", "Converted client money resting at this partner, waiting to be settled: one account per project × partner × currency, the PROJECT_BALANCE."],
  ["CL", "INTRANSIT", "asset", "<PARTNER> / OWN", "v5.2", "Client money released by this partner (or by a bridge wallet on a hop) and not yet confirmed by the receiver."],
  ["CL", "SHORTFALL", "asset", "<RECEIVER>", "v5.2", "Client money delivered short to a receiver and still to be made good at the next settlement."],
  ["CL", "PAYABLE", "liability", "PROJECT", "v5.2", "What NPL must deliver to the project's receivers, in total per currency. The split by receiver group is the GROUP_ENTITLEMENT view, not an account."],
  ["CL", "CREDIT", "liability", "<SENDER>", "v5.2", "Owed back to a sender: an overpayment waiting to be refunded or applied to the next deal (SENDER_CREDIT)."],
  ["CL", "MAKEGOOD", "asset", "PROJECT", "v1.2", "Client money NPL has undertaken to replace after a loss but has not yet placed at a partner. Appears only when NPL's pool at the partner cannot fund the make-good at once; cleared when NPL's funds land (Pattern L)."],
  ["CO", "POOL", "asset", "<PARTNER>", "v5.2", "NPL's own money resting at this partner: margin captured at conversion (EARNINGS_RECEIVABLE), plus anything NPL transferred there. Settled on the partner's fee cycle or netted on a reroute."],
  ["CO", "WALLET", "asset", "OWN", "v5.2", "NPL's own money in its own wallets: recovered dues, rebates and shares received, gas reserves."],
  ["CO", "REBATE_RECEIVABLE", "asset", "<PARTNER>", "v5.2", "Rebate a partner owes NPL on NPLify deals, accrued at conversion and reconciled against the partner's monthly statement (D27)."],
  ["CO", "SHARE_RECEIVABLE", "asset", "<PARTY>", "v5.3", "NPL's remainder of the markup owed by a party that holds the converted funds (settlement_mode party_retains, D26); reconciled monthly."],
  ["CO", "SHARE_PAYABLE", "liability", "<PARTY>", "v5.2", "Markup share owed by NPL to a markup-share party (settlement_mode npl_pays, D26)."],
  ["CO", "LOSS_RECEIVABLE", "asset", "<PARTNER> / <SENDER>", "v1.2", "The partner's or the sender's agreed share of a loss event, owed to NPL after NPL booked the whole loss first (Pattern L)."],
  ["CO", "LOSS_PAYABLE", "liability", "NONE", "v1.2", "The unfunded part of a make-good: what NPL still has to put in after a loss. Mirrors CL.PROJECT.<CCY>.MAKEGOOD and is cleared by the same transfer."],
  ["CO", "VENDOR_PAYABLE", "liability", "<VENDOR>", "v1.2", "NPL-GR's reseller books: what NPL-GR owes a vendor on a vendor invoice, in the invoice currency; cleared as the remittance side's payout lines discharge the invoice (Pattern M)."],
  ["CO", "RESALE_RECEIVABLE", "asset", "<CUSTOMER>", "v1.2", "NPL-GR's reseller books: what a reseller customer owes on a resale invoice, in the invoice currency; cleared when the customer pays the remittance side (Pattern M)."],
  ["CO", "REMIT_CLAIM", "asset", "PROJECT", "v1.2", "NPL-GR's reseller books: what the remittance side holds for NPL-GR, in the invoice currency — the mirror, in EUR, of the remittance project's PAYABLE to its client NPL-GR (Pattern M)."],
  ["CO", "EARN_GROSS", "income", "NONE", "v5.2", "Margin recognised at conversion (sender and receiver fee parts), before partner cost. Markup shares are debited here, so the balance is NPL's margin after shares."],
  ["CO", "EARN_REBATE", "income", "NONE", "v5.3", "Rebate income, kept apart from EARN_GROSS and never in a markup-share base (D27)."],
  ["CO", "RESELL_REVENUE", "income", "NONE", "v1.2", "NPL-GR's reseller books: the resale invoice to the customer at retail price, in the invoice currency, recognised when issued (Pattern M)."],
  ["CO", "RESELL_COST", "expense", "NONE", "v1.2", "NPL-GR's reseller books: the vendor invoice at NPL's preferential price, in the invoice currency, recognised when received. Revenue − cost is the game reseller revenue, fixed on issue and never touched afterwards (Pattern M)."],
  ["CO", "EXP_PARTNER", "expense", "NONE", "v5.2", "Partner cost where the partner states it separately (fee_on_market). Zero by construction for fee_in_rate partners and the own desk."],
  ["CO", "EXP_BANKFEE", "expense", "NONE", "v5.2", "Bank and payout fees NPL absorbs: gross-ups, shortfall top-ups, bounce fees, covered fees (D41)."],
  ["CO", "EXP_NETWORK", "expense", "NONE", "v5.2", "Crypto network fees NPL absorbs: a refund, a bridge hop, a forwarded reroute."],
  ["CO", "EXP_ROUNDING", "expense", "NONE", "v5.3", "The amount added when a payout is rounded up to the pair's unit (D25)."],
  ["CO", "EXP_LOSS", "expense", "NONE", "v5.3", "Loss events. The whole loss is booked here first; each recovered share is credited back as it is agreed (Pattern L)."],
  ["CO", "VAR_CONVERSION", "expense", "NONE", "v1.2", "Partner converted differently from the engine's expectation (partner_calculates), and basis variance on a reroute. Gain or loss. Was VARIANCE."],
  ["CO", "VAR_CUTOFF", "expense", "NONE", "v1.2", "Rate stamped at lock versus the rate actually used when the conversion ran after the partner's cutoff; NPL absorbs it (D29)."],
  ["CO", "VAR_RATE_HONOUR", "expense", "NONE", "v1.2", "An expired quote's rate honoured by an approved override versus the partner's rate on the day of conversion; NPL's cost, chosen (D45)."],
  ["CO", "VAR_FX_TIMING", "expense", "NONE", "v1.2", "The forex result of discharging an obligation stated in one currency with money held in another: each vendor instalment and the margin line of a resale invoice (D24). Gain or loss, always on the remittance margin, never on the reseller revenue."],
  ["CO", "FX_CLEARING", "asset", "NONE", "v1.2", "Used only when a company balance in one currency is settled in another: a EUR share receivable paid in USDT, or NPL-GR's EUR claim paid out to its own wallet in USDT. The balance clears in its own currency, the receipt lands in its own, and the two legs meet here. Its balances are NPL's open currency position, valued through REPORTING_VALUE."],
];
const KIND = {};
for (const p of PURPOSES) for (const name of p[1].split(" / ")) KIND[name] = p[2];

// ------------------------------------------------------------------ posting engine
class Ledger {
  constructor() { this.bal = new Map(); this.txs = []; }
  tx(title, source, rows, note) {
    // rows: [account, side, amount, ccy, ownership, component, why]; a zero row is simply not posted
    rows = rows.filter((r) => units(r[2]) !== 0);
    const sums = {}, ownerSums = {};
    for (const [acct, side, amt, ccy, owner] of rows) {
      if (amt <= 0) throw new Error(`non-positive amount in ${title}: ${acct} ${amt}`);
      const purpose = acct.split(".").pop();
      if (!KIND[purpose]) throw new Error(`unknown purpose ${purpose} in ${title}`);
      if ((acct.startsWith("CL.") && owner !== "client") || (acct.startsWith("CO.") && owner !== "company")) throw new Error(`owner tag mismatch in ${title}: ${acct} ${owner}`);
      const signed = side === "Dr" ? units(amt) : -units(amt);
      sums[ccy] = (sums[ccy] ?? 0) + signed;
      ownerSums[owner + "|" + ccy] = (ownerSums[owner + "|" + ccy] ?? 0) + signed;
      const k = `${acct}|${ccy}`;
      const sign = (KIND[purpose] === "asset" || KIND[purpose] === "expense") === (side === "Dr") ? 1 : -1;
      this.bal.set(k, (this.bal.get(k) ?? 0) + sign * units(amt));
    }
    for (const [ccy, s] of Object.entries(sums)) if (s !== 0) throw new Error(`UNBALANCED ${title} in ${ccy}: ${s / SCALE}`);
    for (const [k, s] of Object.entries(ownerSums)) if (s !== 0) throw new Error(`UNBALANCED PER OWNER ${title} ${k}: ${s / SCALE}`);
    this.txs.push({ title, source, rows, note });
    return this;
  }
  balance(acct, ccy, snap) { return ((snap ?? this.bal).get(`${acct}|${ccy}`) ?? 0) / SCALE; }
  snapshot() { return new Map(this.bal); }
  find(key) { const t = this.txs.findIndex((x) => x.title.startsWith(key + " ·")); if (t < 0) throw new Error("no transaction " + key); return t; }
  html(key) {
    const t = this.txs[this.find(key)];
    const inOut = (acct, side) => {
      const kind = KIND[acct.split(".").pop()];
      const grows = (kind === "asset" || kind === "expense") === (side === "Dr");
      const word = { asset: "money", liability: "owed", income: "earned", expense: "cost" }[kind];
      return `<b>${grows ? "IN" : "OUT"}</b> · ${word}`;
    };
    return `<div class="tx"><div class="txh"><b>${esc(t.title)}</b> <span class="src">source: ${esc(t.source)}</span></div>
<table class="post"><colgroup><col style="width:22%"><col style="width:9%"><col style="width:9%"><col style="width:11%"><col style="width:5.5%"><col style="width:8.5%"><col style="width:10%"><col style="width:25%"></colgroup><thead><tr><th>Account</th><th class="n">Debit</th><th class="n">Credit</th><th>In / Out</th><th>Ccy</th><th>Owner</th><th>Component</th><th>Why</th></tr></thead><tbody>
${t.rows.map(([a, s, amt, c, o, comp, why]) => `<tr><td class="mono">${esc(a).replace(/\./g, ".<wbr>")}</td><td class="n">${s === "Dr" ? fmt(amt, c) : ""}</td><td class="n">${s === "Cr" ? fmt(amt, c) : ""}</td><td class="io">${inOut(a, s)}</td><td>${c}</td><td>${o}</td><td>${comp}</td><td>${why}</td></tr>`).join("")}
</tbody></table>${t.note ? `<p class="txnote">${t.note}</p>` : ""}</div>`;
  }
  balancesHtml(list, caption, snap) {
    return `<table class="bal"><caption>${esc(caption)}</caption><thead><tr><th>Account</th><th>Ccy</th><th class="n">Balance</th><th>Meaning</th></tr></thead><tbody>
${list.map(([a, c, why]) => `<tr><td class="mono">${esc(a)}</td><td>${c}</td><td class="n">${fmt(this.balance(a, c, snap), c)}</td><td>${esc(why)}</td></tr>`).join("")}</tbody></table>`;
  }
}

// ------------------------------------------------------------------ pricing (the Calculation Specification's formulas)
// All rates are OUT units per 1 IN unit. s = sender_pays share, r = receiver_pays share, s + r = the fee pct.
function price({ amountIn, Rm, Rp, basis, s, r, partnerFee = 0, dp = 2, rounding = "truncate_unit", unit = 1 }) {
  const rd = (x) => Math.round(x * 10 ** dp + 1e-9) / 10 ** dp;
  const Rb = basis === "market" ? Rm : Rp;                   // market or agent_rate basis
  const Rs = Rb * (1 - s);                                   // sender rate: embeds the sender's part
  const grossOut = rd(amountIn * Rs);
  const feeReceiver = rd(grossOut * r);
  const clientNet = rd(grossOut - feeReceiver);               // the receiver group's entitlement
  const feeSender = rd(amountIn * Rb - grossOut);
  const grossConverted = rd(amountIn * (partnerFee ? Rm : Rp));   // fee_on_market partners convert at market, then charge
  const partnerCost = partnerFee ? rd(grossConverted * partnerFee) : 0;
  const actualOut = rd(grossConverted - partnerCost);
  const grossMargin = rd(grossConverted - clientNet);          // = partner cost + NPL earnings
  const earnings = rd(actualOut - clientNet);
  const payable = rounding === "round_up_n" ? roundUpN(clientNet, unit) : trunc(clientNet);
  const residual = rd(clientNet - payable);                    // signed (D25): + dropped fraction stays client money, − added by rounding up is NPL's cost
  const inferredPartnerCost = partnerFee ? partnerCost : rd(amountIn * (Rm - Rp));
  return { Rb, Rs, grossOut, feeReceiver, clientNet, feeSender, grossConverted, partnerCost, actualOut, grossMargin, earnings, payable, residual, inferredPartnerCost };
}

// ------------------------------------------------------------------ worked example parameters
const EX = { Rm: 0.9000, Rp: 0.8950, s: 0.014, r: 0.006 };   // Evo USDT → EUR: sender pays 1.4 % (the other sender type pays 1 %), receiver always pays 0.6 %
const D1 = price({ amountIn: 10000, Rm: EX.Rm, Rp: EX.Rp, basis: "market", s: EX.s, r: EX.r });
const D2 = price({ amountIn: 5000, Rm: EX.Rm, Rp: EX.Rp, basis: "market", s: EX.s, r: EX.r });
const DJ = price({ amountIn: 10000, Rm: EX.Rm, Rp: EX.Rm, basis: "market", s: EX.s, r: EX.r, partnerFee: 0.005 });
const DT = price({ amountIn: 3000, Rm: 32.60, Rp: 32.50, basis: "market", s: EX.s, r: EX.r, rounding: "round_up_n", unit: 1000 });
const D4 = price({ amountIn: 2000, Rm: 0.7800, Rp: 0.7750, basis: "market", s: EX.s, r: EX.r });
const DS = price({ amountIn: 5000, Rm: 1, Rp: 1, basis: "market", s: EX.s, r: EX.r });          // same-currency pass-through
const DR = price({ amountIn: 10000, Rm: 0.9000, Rp: 0.9000, basis: "market", s: 0.04, r: 0, partnerFee: 0.008 }); // Raeen at Aquanow: 4 % sender_pays on market, partner 0.80 %

const L = new Ledger();
const EUR = "EUR", USDT = "USDT", GBP = "GBP", THB = "THB", SGD = "SGD", ETH = "ETH";
const CL = "client", CO = "company";

// ---- Pattern A: collection, conversion, accumulation
L.tx("T1 · Collection of deal 1: 10,000 USDT arrive at Ali's USDT wallet endpoint (COLLECTION_RECEIVING_ENDPOINT, kind wallet)", "Collection", [
  ["CL.ALI.USDT.COLLECTED", "Dr", 10000, USDT, CL, "principal", "client money now sits at Ali, unconverted; the account is per partner, the endpoint only says which vehicle's wallet"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", 10000, USDT, CL, "principal", "NPL owes this onward on the client's behalf"],
]);
L.tx(`T2 · Conversion of deal 1 at Ali (fee_in_rate): 10,000 USDT → ${fmt(D1.actualOut)} EUR at ${EX.Rp}`, "Conversion", [
  ["CL.PROJECT.USDT.PAYABLE", "Dr", 10000, USDT, CL, "principal", "the USDT obligation is discharged by the conversion"],
  ["CL.ALI.USDT.COLLECTED", "Cr", 10000, USDT, CL, "principal", "the USDT left the collected position"],
  ["CL.ALI.EUR.DUE", "Dr", D1.payable, EUR, CL, "principal", "client net in whole euros, waiting to be settled"],
  ["CL.ALI.EUR.DUE", "Dr", D1.residual, EUR, CL, "rounding", "the cents below one euro (amount_rounding truncate_unit) stay client money"],
  ["CO.ALI.EUR.POOL", "Dr", D1.earnings, EUR, CO, "earnings", "NPL's margin, physically still at Ali (EARNINGS_RECEIVABLE)"],
  ["CL.PROJECT.EUR.PAYABLE", "Cr", D1.clientNet, EUR, CL, "principal", "owed to the receiver group, now in EUR"],
  ["CO.NONE.EUR.EARN_GROSS", "Cr", D1.earnings, EUR, CO, "earnings", "margin recognised: the client's claim shrinks from 10,000 USDT to its EUR entitlement, the difference is NPL's"],
], `Ownership changes here and only here: ${fmt(D1.earnings)} EUR becomes company money, because the client's claim is re-denominated at the sender's price while the partner delivers at its rate. The sender is priced on the market rate (rate_basis market: the fee is disclosed) and Ali converts at its own rate, so Ali's cost — ${fmt(D1.inferredPartnerCost)} EUR against market, inside its rate (fee_in_rate) — comes out of NPL's ${pct(EX.s + EX.r)} and no partner-cost line exists; NPL keeps the ${fmt(D1.earnings)} EUR. Under rate_basis agent_rate (a calculated rate, breakdown not disclosed) the sender's rate would be Ali's rate less the fee instead, and NPL would keep the whole ${pct(EX.s + EX.r)}; the postings have the same shape. Evo's other sender type pays 1.00 % instead of 1.40 %: a second fee structure (or a FEE_OVERRIDE with its own split, D20), same postings, smaller sender part. Nothing differs for a leg split across two fee tiers (D21): the fee parts are the blended sum and the posting is identical. The customer-facing rate and fee (D22) are print-only and never post.`);
const snapDeal1 = L.snapshot();
L.tx(`T3 · Same-currency pass-through (D33): 5,000 EUR collected by bank transfer and converted at rate 1 — fee ${pct(EX.s + EX.r)} captured, client net ${fmt(DS.clientNet)} EUR`, "Conversion", [
  ["CL.ALI.EUR.COLLECTED", "Dr", 5000, EUR, CL, "principal", "collection (shown with the conversion)"],
  ["CL.PROJECT.EUR.PAYABLE", "Cr", 5000, EUR, CL, "principal", "collection"],
  ["CL.PROJECT.EUR.PAYABLE", "Dr", 5000, EUR, CL, "principal", "conversion: the obligation is re-stated at the sender's price"],
  ["CL.ALI.EUR.COLLECTED", "Cr", 5000, EUR, CL, "principal", ""],
  ["CL.ALI.EUR.DUE", "Dr", DS.payable, EUR, CL, "principal", "client net, available to settle"],
  ["CL.ALI.EUR.DUE", "Dr", DS.residual, EUR, CL, "rounding", ""],
  ["CO.ALI.EUR.POOL", "Dr", DS.earnings, EUR, CO, "earnings", ""],
  ["CL.PROJECT.EUR.PAYABLE", "Cr", DS.clientNet, EUR, CL, "principal", ""],
  ["CO.NONE.EUR.EARN_GROSS", "Cr", DS.earnings, EUR, CO, "earnings", "the fee is earned at conversion even though no currency changes"],
], "A pair with the same currency on both sides converts at rate 1 like any other pair (invariant 32): the in-leg and the out-leg happen to be in one currency, and the balance arithmetic is unchanged.");

// ---- Pattern B: part collection
L.tx("T4 · Collection of deal 2, part 1 of 2: 4,000 USDT", "Collection", [
  ["CL.ALI.USDT.COLLECTED", "Dr", 4000, USDT, CL, "principal", "first part"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", 4000, USDT, CL, "principal", ""],
]);
L.tx("T5 · Collection of deal 2, part 2 of 2: 1,000 USDT (next day)", "Collection", [
  ["CL.ALI.USDT.COLLECTED", "Dr", 1000, USDT, CL, "principal", "second part completes the deal"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", 1000, USDT, CL, "principal", ""],
]);
L.tx(`T6 · Conversion of deal 2 at Ali: 5,000 USDT → ${fmt(D2.actualOut)} EUR`, "Conversion", [
  ["CL.PROJECT.USDT.PAYABLE", "Dr", 5000, USDT, CL, "principal", ""],
  ["CL.ALI.USDT.COLLECTED", "Cr", 5000, USDT, CL, "principal", ""],
  ["CL.ALI.EUR.DUE", "Dr", D2.payable, EUR, CL, "principal", ""],
  ["CL.ALI.EUR.DUE", "Dr", D2.residual, EUR, CL, "rounding", ""],
  ["CO.ALI.EUR.POOL", "Dr", D2.earnings, EUR, CO, "earnings", ""],
  ["CL.PROJECT.EUR.PAYABLE", "Cr", D2.clientNet, EUR, CL, "principal", ""],
  ["CO.NONE.EUR.EARN_GROSS", "Cr", D2.earnings, EUR, CO, "earnings", ""],
], "Parts are posted as they arrive; the conversion is one transaction once the deal is fully collected. A cash part is verified only after the partner's count (counted_at, D30) and posts then; the cash amount itself was rounded to the pair's cash unit at quote (cash_rounding, D25), so no residual arises on the collection side.");

// ---- Pattern C: settlement, confirmation, bank fees, shortfall, round-up
const dueTotal = r2(D1.payable + D1.residual + D2.payable + D2.residual + DS.clientNet);
const dueWhole = trunc(dueTotal), dust = r2(dueTotal - dueWhole);
const line1 = 8000, line2 = dueWhole - 8000;
L.tx(`T7 · Settlement from Ali: ${fmt(dueWhole)} EUR in two lines (Entity X1 ${fmt(line1)}, Entity X2 ${fmt(line2)})`, "Settlement", [
  ["CL.ALI.EUR.INTRANSIT", "Dr", line1, EUR, CL, "principal", "line 1 released by Ali"],
  ["CL.ALI.EUR.INTRANSIT", "Dr", line2, EUR, CL, "principal", "line 2 released by Ali"],
  ["CL.ALI.EUR.DUE", "Cr", dueWhole, EUR, CL, "principal", `whole euros leave DUE; ${fmt(dust)} EUR of rounding dust stays`],
], `Settle to the residual (invariant 4): the client balance at Ali drops from ${fmt(dueTotal)} to ${fmt(dust)} EUR. Both lines pay entities of the same receiver and each names the leg it settles in deal_id, so no offset arises. The transaction posts when the partner releases the money, which for a bank rail is no earlier than execution_due_date (approval before the partner's cutoff → same day, after it → next business day; weekends and HOLIDAY rows skipped, D29, D34). Approval and release are two moments; only the release posts.`);
L.tx(`T8 · Confirmation, line 1 full: Entity X1 received ${fmt(line1)} EUR`, "Confirmation", [
  ["CL.PROJECT.EUR.PAYABLE", "Dr", line1, EUR, CL, "principal", "the obligation is discharged"],
  ["CL.ALI.EUR.INTRANSIT", "Cr", line1, EUR, CL, "principal", "the money reached the receiver"],
]);
const bankFee = 50;
L.tx(`T9 · Confirmation, line 2 short: Entity X2 received ${fmt(line2 - bankFee)} EUR, the bank took ${fmt(bankFee)} (treatment carry_forward)`, "Confirmation", [
  ["CL.PROJECT.EUR.PAYABLE", "Dr", line2 - bankFee, EUR, CL, "principal", "delivered part"],
  ["CL.RECEIVER_X.EUR.SHORTFALL", "Dr", bankFee, EUR, CL, "bank_fee", "still owed to the receiver, topped up at the next settlement"],
  ["CL.ALI.EUR.INTRANSIT", "Cr", line2, EUR, CL, "principal", "nothing is left in transit"],
], "With treatment <i>waived</i> the second line would instead be <code>Dr CL.PROJECT.EUR.PAYABLE 50</code>: the client bears the fee and its claim falls by 50. With <i>absorbed</i> the fee is expected up front and funded as in T10. A fee <i>covered</i> by a FEE_DECISION (D41: Finance recommends, Management approves) posts exactly as absorbed.");
L.tx("T10 · Shortfall top-up funded from NPL's pool at Ali (BANK_FEE_EVENT applied to the next settlement)", "BankFeeEvent", [
  ["CO.NONE.EUR.EXP_BANKFEE", "Dr", bankFee, EUR, CO, "bank_fee", "NPL bears the cost"],
  ["CO.ALI.EUR.POOL", "Cr", bankFee, EUR, CO, "bank_fee", "paid out of NPL's money resting at Ali"],
  ["CL.ALI.EUR.DUE", "Dr", bankFee, EUR, CL, "bank_fee", "the 50 EUR is client money again, in balance at Ali"],
  ["CL.RECEIVER_X.EUR.SHORTFALL", "Cr", bankFee, EUR, CL, "bank_fee", "the shortfall is cleared"],
], "The 50 EUR now sits in DUE and goes out with the next settlement like any other balance. Company → client transfers like this one are the only way company money becomes client money (besides a loss make-good, Pattern L).");
const snapSettled = L.snapshot();
L.tx(`T11 · Conversion with round-up (D25): 3,000 USDT → ${fmt(DT.actualOut, THB)} THB at 32.50; client net ${fmt(DT.clientNet, THB)}, paid out as ${fmt(DT.payable, THB)} (round_up_n, unit 1,000)`, "Conversion", [
  ["CL.PROJECT.USDT.PAYABLE", "Dr", 3000, USDT, CL, "principal", "(collection of the 3,000 USDT assumed posted as T1)"],
  ["CL.ALI.USDT.COLLECTED", "Cr", 3000, USDT, CL, "principal", ""],
  ["CL.ALI.THB.DUE", "Dr", DT.clientNet, THB, CL, "principal", "client net as priced"],
  ["CL.ALI.THB.DUE", "Dr", -DT.residual, THB, CL, "rounding", "the amount added by rounding up: client money from now on"],
  ["CO.ALI.THB.POOL", "Dr", r2(DT.earnings + DT.residual), THB, CO, "earnings", "NPL's margin less the round-up it funded"],
  ["CO.NONE.THB.EXP_ROUNDING", "Dr", -DT.residual, THB, CO, "rounding", "the cost of rounding up (rounding_residual is negative)"],
  ["CL.PROJECT.THB.PAYABLE", "Cr", DT.payable, THB, CL, "principal", "the obligation is the rounded payout"],
  ["CO.NONE.THB.EARN_GROSS", "Cr", DT.earnings, THB, CO, "earnings", "margin as priced"],
], `The residual is signed: ${fmt(DT.residual, THB)} THB here, so NPL funds the round-up from its margin and the client's claim is the whole 97,000. With truncate_unit (T2) the sign is positive and the dust stays client money. Every rounding difference therefore has an owner (invariant 24).`);

// ---- Pattern D: reroute via own wallet; bridge hop
const recover = 30;
L.tx("T12 · Deal 3, Ali unavailable: 10,000 USDT collected into NPL's contingency wallet under an approved REROUTE", "Collection", [
  ["CL.OWN.USDT.HELD", "Dr", 10000, USDT, CL, "principal", "client money in custody, with deal, reason and age"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", 10000, USDT, CL, "principal", ""],
], "Only an approved REROUTE, an own-desk leg or a bridge collection may debit CL.OWN.*.HELD (invariant 3). The custody view shows this balance until it is forwarded.");
L.tx(`T13 · Forward to Jeton with recover dues: 10,000 USDT of client money credited at Jeton, ${fmt(recover)} USDT of NPL's dues netted`, "Reroute", [
  ["CL.JETON.USDT.COLLECTED", "Dr", 10000, USDT, CL, "principal", "Jeton credits the full client amount"],
  ["CL.OWN.USDT.HELD", "Cr", 10000, USDT, CL, "principal", "custody ends"],
  ["CO.OWN.USDT.WALLET", "Dr", recover, USDT, CO, "earnings", "NPL keeps 30 USDT in its wallet instead of sending it"],
  ["CO.JETON.USDT.POOL", "Cr", recover, USDT, CO, "earnings", "Jeton's debt to NPL falls by the same 30 USDT"],
], `NPL physically sends ${fmt(10000 - recover)} USDT; Jeton treats it as 10,000 of client money because it owed NPL ${fmt(recover)} USDT of earnings from earlier deals (partner_agreement_ref). The recovery is an asset swap, never income, and names the deal it recovers (invariant 15). <b>Nothing is withheld from the client amount:</b> NPL's margin is captured when Jeton converts (T14).`);
L.tx(`T14 · Conversion of deal 3 at Jeton (fee_on_market, ${pct(0.005)}): 10,000 USDT → ${fmt(DJ.grossConverted)} EUR at market, Jeton keeps ${fmt(DJ.partnerCost)}`, "Conversion", [
  ["CL.PROJECT.USDT.PAYABLE", "Dr", 10000, USDT, CL, "principal", ""],
  ["CL.JETON.USDT.COLLECTED", "Cr", 10000, USDT, CL, "principal", ""],
  ["CL.JETON.EUR.DUE", "Dr", DJ.payable, EUR, CL, "principal", "client net, whole euros"],
  ["CL.JETON.EUR.DUE", "Dr", DJ.residual, EUR, CL, "rounding", ""],
  ["CO.JETON.EUR.POOL", "Dr", DJ.earnings, EUR, CO, "earnings", "NPL's net margin resting at Jeton"],
  ["CO.NONE.EUR.EXP_PARTNER", "Dr", DJ.partnerCost, EUR, CO, "partner_cost", "Jeton's stated fee, deducted at transaction level"],
  ["CL.PROJECT.EUR.PAYABLE", "Cr", DJ.clientNet, EUR, CL, "principal", ""],
  ["CO.NONE.EUR.EARN_GROSS", "Cr", DJ.grossMargin, EUR, CO, "earnings", "gross margin before partner cost"],
], `Total cost to the client = partner cost ${fmt(DJ.partnerCost)} + NPL earnings ${fmt(DJ.earnings)} = ${fmt(DJ.grossMargin)} EUR. For a fee_in_rate partner (T2) the partner cost is inside the rate and no EXP_PARTNER line exists.`);
const snapDeal3 = L.snapshot();
const gas = 0.0012;
L.tx("T15 · Deal 4 (D40): the sender can only pay on ERC-20, which Ali does not accept; 10,000 USDT arrive on NPL's bridge wallet", "Collection", [
  ["CL.OWN.USDT.HELD", "Dr", 10000, USDT, CL, "principal", "client money on the bridge (OWN_WALLET.role collection_bridge), to be forwarded within custody_max_hours"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", 10000, USDT, CL, "principal", ""],
]);
L.tx(`T16 · Hop: the bridge forwards 10,000 USDT to Ali on TRC-20 (a SETTLEMENT_LINE to the partner_transit receiver); gas ${fmt(gas, ETH)} ETH paid by NPL`, "Settlement", [
  ["CL.OWN.USDT.INTRANSIT", "Dr", 10000, USDT, CL, "principal", "left the bridge, not yet credited by Ali"],
  ["CL.OWN.USDT.HELD", "Cr", 10000, USDT, CL, "principal", "custody ends when Ali credits (T17)"],
  ["CO.NONE.ETH.EXP_NETWORK", "Dr", gas, ETH, CO, "network_fee", "network fee of the hop, NPL's cost (project network_fee_policy)"],
  ["CO.OWN.ETH.WALLET", "Cr", gas, ETH, CO, "network_fee", "paid from NPL's gas reserve"],
], "The hop line carries deal_id (invariant 19) so the entitlement view keeps the leg's group; nothing is earned or charged to the client on a hop.");
L.tx("T17 · Ali credits the hop: 10,000 USDT now sit at Ali as collected client money", "Confirmation", [
  ["CL.ALI.USDT.COLLECTED", "Dr", 10000, USDT, CL, "principal", "the leg continues at its partner exactly as T1"],
  ["CL.OWN.USDT.INTRANSIT", "Cr", 10000, USDT, CL, "principal", ""],
]);

// ---- Pattern E: reversals and voids
L.tx("T18 · Erroneous posting: a collection of 2,000 USDT was booked against the wrong deal (as posted)", "Collection", [
  ["CL.ALI.USDT.COLLECTED", "Dr", 2000, USDT, CL, "principal", "booked in error"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", 2000, USDT, CL, "principal", ""],
]);
L.tx("T19 · Reversal of T18 (LEDGER_TRANSACTION.reversal_of_id = T18), then T18 is re-posted correctly", "Adjustment", [
  ["CL.PROJECT.USDT.PAYABLE", "Dr", 2000, USDT, CL, "principal", "mirror image of T18"],
  ["CL.ALI.USDT.COLLECTED", "Cr", 2000, USDT, CL, "principal", ""],
], "Nothing is edited or deleted: the wrong transaction stays, the reversal points at it, and the correct transaction follows (invariant 2). Any report at any past moment still adds up.");
const netFee = 2;
L.tx("T20 · Collection of deal 5: 3,000 USDT arrive at Ali (the deal is voided afterwards)", "Collection", [
  ["CL.ALI.USDT.COLLECTED", "Dr", 3000, USDT, CL, "principal", ""],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", 3000, USDT, CL, "principal", ""],
]);
L.tx(`T21 · Deal 5 voided after collection: refund to the sender in USDT, network fee ${fmt(netFee)} USDT charged back to the sender (project network_fee_policy)`, "Adjustment", [
  ["CL.PROJECT.USDT.PAYABLE", "Dr", 3000, USDT, CL, "principal", "the obligation ends"],
  ["CL.ALI.USDT.COLLECTED", "Cr", 3000 - netFee, USDT, CL, "principal", "returned to the sender's wallet"],
  ["CL.ALI.USDT.COLLECTED", "Cr", netFee, USDT, CL, "network_fee", "paid to the network; the sender bears it"],
], `If the policy, or a FEE_DECISION for this transaction, says NPL absorbs the fee, the last line becomes <code>Dr CO.NONE.USDT.EXP_NETWORK ${fmt(netFee)} / Cr CO.ALI.USDT.POOL ${fmt(netFee)}</code> and the sender receives the full 3,000. Management approves the disposition of any post-money void.`);

// ---- Pattern F: rejected payout and return leg
L.tx(`T22 · Deal 6 collected and converted at Ali: 2,000 USDT → ${fmt(D4.actualOut)} GBP (collection and conversion shown together)`, "Conversion", [
  ["CL.ALI.USDT.COLLECTED", "Dr", 2000, USDT, CL, "principal", "collection"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", 2000, USDT, CL, "principal", "collection"],
  ["CL.PROJECT.USDT.PAYABLE", "Dr", 2000, USDT, CL, "principal", "conversion, USDT leg"],
  ["CL.ALI.USDT.COLLECTED", "Cr", 2000, USDT, CL, "principal", "conversion, USDT leg"],
  ["CL.ALI.GBP.DUE", "Dr", D4.payable, GBP, CL, "principal", ""],
  ["CL.ALI.GBP.DUE", "Dr", D4.residual, GBP, CL, "rounding", ""],
  ["CO.ALI.GBP.POOL", "Dr", D4.earnings, GBP, CO, "earnings", ""],
  ["CL.PROJECT.GBP.PAYABLE", "Cr", D4.clientNet, GBP, CL, "principal", ""],
  ["CO.NONE.GBP.EARN_GROSS", "Cr", D4.earnings, GBP, CO, "earnings", ""],
]);
L.tx(`T23 · Settlement of deal 6: ${fmt(D4.payable)} GBP released to the receiver's bank (the line names deal 6 in deal_id)`, "Settlement", [
  ["CL.ALI.GBP.INTRANSIT", "Dr", D4.payable, GBP, CL, "principal", ""],
  ["CL.ALI.GBP.DUE", "Cr", D4.payable, GBP, CL, "principal", ""],
]);
const bounce = 15;
L.tx(`T24 · The receiving bank rejects the transfer: ${fmt(D4.payable - bounce)} GBP come back to Ali, the bank kept ${fmt(bounce)} (SETTLEMENT_RETURN; line outcome = returned)`, "SettlementReturn", [
  ["CL.ALI.GBP.DUE", "Dr", D4.payable - bounce, GBP, CL, "principal", "back in the client balance at Ali"],
  ["CO.NONE.GBP.EXP_BANKFEE", "Dr", bounce, GBP, CO, "bank_fee", "bounce fee absorbed by NPL (treatment absorbed)"],
  ["CL.ALI.GBP.INTRANSIT", "Cr", D4.payable, GBP, CL, "principal", "nothing is in transit any more"],
  ["CL.ALI.GBP.DUE", "Dr", bounce, GBP, CL, "bank_fee", "NPL makes the client whole"],
  ["CO.ALI.GBP.POOL", "Cr", bounce, GBP, CO, "bank_fee", "funded from NPL's pool at Ali"],
], "The failed line is reversed before anything else happens (invariant 13), so the entitlement of the group deal 6 is attributed to is restored. The money can now stay in balance for a later payout or fund a return leg (T25).");
const Rret = 1.2850, retIn = D4.payable, retOut = r2(retIn * Rret);
L.tx(`T25 · Return leg: ${fmt(retIn)} GBP converted back to ${fmt(retOut)} USDT at Ali (rate ${Rret}); markup waived by FEE_DECISION`, "Conversion", [
  ["CL.PROJECT.GBP.PAYABLE", "Dr", retIn, GBP, CL, "principal", "GBP obligation ends"],
  ["CL.ALI.GBP.DUE", "Cr", retIn, GBP, CL, "principal", ""],
  ["CL.ALI.USDT.DUE", "Dr", retOut, USDT, CL, "principal", "USDT owed to the sender's return receiver"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", retOut, USDT, CL, "principal", ""],
], `NPL's margin from T22 (${fmt(D4.earnings)} GBP) stays in the pool: it was captured at the first conversion and is never at risk from a return. The round trip's rate loss falls on the client's funds. Had the FEE_DECISION applied a markup, part of the ${fmt(retOut)} USDT would have gone to CO.ALI.USDT.POOL and EARN_GROSS exactly as in T2. The return leg inherits its parent's group (D13); the payout to the sender's return receiver follows T23 and T8 with deal_id = the return leg (invariant 19).`);

// ---- Pattern H: balance conversion
const RsgdUsdt = 0.7400, bcOut = r2(5000 * RsgdUsdt), bcWhole = trunc(bcOut), bcDust = r2(bcOut - bcWhole);
L.tx("T26 · Opening position: 5,000 SGD of converted client balance at Ali from earlier deals (summarised)", "Conversion", [
  ["CL.ALI.SGD.DUE", "Dr", 5000, SGD, CL, "principal", "balance built up by earlier SGD deals"],
  ["CL.PROJECT.SGD.PAYABLE", "Cr", 5000, SGD, CL, "principal", ""],
]);
L.tx(`T27 · Balance conversion at Ali: 5,000 SGD of client balance → ${fmt(bcOut)} USDT at ${RsgdUsdt}, no markup (serves Group B)`, "BalanceConversion", [
  ["CL.PROJECT.SGD.PAYABLE", "Dr", 5000, SGD, CL, "principal", "SGD obligation ends"],
  ["CL.ALI.SGD.DUE", "Cr", 5000, SGD, CL, "principal", "SGD balance leaves"],
  ["CL.ALI.USDT.DUE", "Dr", bcWhole, USDT, CL, "principal", "USDT balance arrives, whole units"],
  ["CL.ALI.USDT.DUE", "Dr", bcDust, USDT, CL, "rounding", ""],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", bcOut, USDT, CL, "principal", "same obligation, new currency"],
], "No sender, receiver or collection: Finance requests, Management approves. ENTITLEMENT_REATTRIBUTION moves Group B's SGD entitlement into USDT; an excess over Group B's SGD entitlement is another group's flow and is booked as an approved offset. A banking-ready balance (USD, SGD) waits for conversion_due_date like a deal leg (D29); a markup, if any, is a FEE_DECISION and posts as in T2.");

// ---- Pattern I: sender credit
L.tx("T28 · Overpayment: a sender sends 10,050 USDT against a 10,000 USDT deal; 50 USDT becomes sender credit", "Collection", [
  ["CL.ALI.USDT.COLLECTED", "Dr", 10050, USDT, CL, "principal", "all of it is client money at Ali"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", 10000, USDT, CL, "principal", "the deal"],
  ["CL.SENDER_A.USDT.CREDIT", "Cr", 50, USDT, CL, "principal", "owed back to the sender (SENDER_CREDIT), or applied to the next deal"],
]);
L.tx("T29 · The credit is applied to the sender's next deal of 5,000 USDT: the sender pays 4,950", "Collection", [
  ["CL.ALI.USDT.COLLECTED", "Dr", 4950, USDT, CL, "principal", "what actually arrives"],
  ["CL.SENDER_A.USDT.CREDIT", "Dr", 50, USDT, CL, "principal", "the credit is consumed (state applied)"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", 5000, USDT, CL, "principal", "the full deal is collected"],
], "A refund instead of an application is a payout to the sender's return receiver: <code>Dr CL.SENDER_A.USDT.CREDIT 50 / Cr CL.ALI.USDT.COLLECTED 50</code> through an ordinary settlement line and confirmation. Sender credits are client money and are never netted against anything NPL is owed.");

// ---- Pattern J: markup shares and rebates (accrued at conversion)
const refShare = 0.25, referral = r2(DJ.earnings * refShare);
L.tx(`T30 · Markup share, npl_pays (D26): an external markup-share party earns ${pct(refShare, 0)} of NPL's earnings on deal 3 = ${fmt(referral)} EUR, accrued with the conversion`, "MarkupShare", [
  ["CO.NONE.EUR.EARN_GROSS", "Dr", referral, EUR, CO, "share", "reduces NPL's margin"],
  ["CO.PARTY_P.EUR.SHARE_PAYABLE", "Cr", referral, EUR, CO, "share", "owed to the party (MARKUP_SHARE_ACCRUAL, direction payable)"],
], "Basis share_of_earnings. A fixed_pct party is priced into the sender rate instead and the posting has the same shape with the amount from the Calculation Specification. The accrual is posted in the same moment as T14, as its own transaction with source MarkupShare.");
L.tx(`T31 · Month-end: NPL pays the party ${fmt(referral)} EUR from its own wallet`, "MarkupShare", [
  ["CO.PARTY_P.EUR.SHARE_PAYABLE", "Dr", referral, EUR, CO, "share", "accrual state settled, paid_at set"],
  ["CO.OWN.EUR.WALLET", "Cr", referral, EUR, CO, "share", "or from the pool at a partner, when the partner pays the party on NPL's instruction"],
]);
const shareBase = r2(DR.grossMargin - DR.partnerCost), raeenShare = r2(shareBase * 0.5), nplRemainder = r2(shareBase - raeenShare);
const rebateAqn = r2(10000 * 0.003);
L.tx(`T32 · Raeen sub-account at Aquanow (party_retains, D26): 10,000 USDT → ${fmt(DR.actualOut)} EUR; sender pays ${pct(0.04, 0)} on market, Aquanow charges ${pct(0.008)}; net markup ${fmt(shareBase)} EUR shared 50 / 50`, "Conversion", [
  ["CL.PROJECT.USDT.PAYABLE", "Dr", 10000, USDT, CL, "principal", ""],
  ["CL.AQN.USDT.COLLECTED", "Cr", 10000, USDT, CL, "principal", ""],
  ["CL.AQN.EUR.DUE", "Dr", DR.clientNet, EUR, CL, "principal", "client net, in Raeen's sub-account at Aquanow, settled to Raeen's receivers as usual"],
  ["CO.RAEEN.EUR.SHARE_RECEIVABLE", "Dr", nplRemainder, EUR, CO, "share", "NPL's remainder: Raeen holds the converted funds and owes it (direction receivable, period)"],
  ["CO.NONE.EUR.EARN_GROSS", "Dr", raeenShare, EUR, CO, "share", "Raeen's share of the net markup; never NPL's money"],
  ["CO.NONE.EUR.EXP_PARTNER", "Dr", DR.partnerCost, EUR, CO, "partner_cost", "Aquanow's stated fee"],
  ["CL.PROJECT.EUR.PAYABLE", "Cr", DR.clientNet, EUR, CL, "principal", ""],
  ["CO.NONE.EUR.EARN_GROSS", "Cr", DR.grossMargin, EUR, CO, "earnings", "gross margin: the sender's 4 %"],
], `Share base = fee parts ${fmt(DR.grossMargin)} − partner cost ${fmt(DR.partnerCost)} = ${fmt(shareBase)} EUR (invariant 25); the rebate below is not in the base. No POOL line: NPL's margin is not resting at the partner but with Raeen, so it is a receivable from Raeen instead. A second party with its own rule on the same leg adds one more pair of lines; the shares may not exceed 100 % of the base.`);
L.tx(`T33 · Partner rebate accrued with the same conversion (D27): Aquanow returns ${pct(0.003, 1)} of the amount = ${fmt(rebateAqn)} USDT`, "Rebate", [
  ["CO.AQN.USDT.REBATE_RECEIVABLE", "Dr", rebateAqn, USDT, CO, "rebate", "expected from Aquanow (PARTNER_REBATE_ACCRUAL, state expected, period)"],
  ["CO.NONE.USDT.EARN_REBATE", "Cr", rebateAqn, USDT, CO, "rebate", "NPL's alone: never in EARN_GROSS, never visible to Raeen (invariant 26)"],
], "The accrual names the NPLify deal it arises on; a partner statement is reconciled only against those deals. A rule with basis pct_of_partner_fee accrues in the currency the partner pays it in (see Section 22).");
const stmtRebate = 29.50;
L.tx(`T34 · Month-end: Aquanow's statement shows ${fmt(stmtRebate)} USDT for the deal and pays it in USDT; the ${fmt(rebateAqn - stmtRebate)} USDT difference trues up the income`, "Rebate", [
  ["CO.OWN.USDT.WALLET", "Dr", stmtRebate, USDT, CO, "rebate", "received (statement_ref on the accrual, state received)"],
  ["CO.NONE.USDT.EARN_REBATE", "Dr", rebateAqn - stmtRebate, USDT, CO, "rebate", "true-up against the statement: the accrual's received_amount"],
  ["CO.AQN.USDT.REBATE_RECEIVABLE", "Cr", rebateAqn, USDT, CO, "rebate", "the expectation is cleared"],
], "A statement line that NPL cannot match to a deal is not posted: NPL only reconciles rebates on NPLify deals (D27).");
L.tx(`T35 · Month-end: Raeen pays NPL its remainder ${fmt(nplRemainder)} EUR`, "MarkupShare", [
  ["CO.OWN.EUR.WALLET", "Dr", nplRemainder, EUR, CO, "share", "received"],
  ["CO.RAEEN.EUR.SHARE_RECEIVABLE", "Cr", nplRemainder, EUR, CO, "share", "accrual state settled, received_amount"],
], "Had Raeen paid in USDT, the receipt would land as <code>Dr CO.OWN.USDT.WALLET / Cr CO.NONE.USDT.FX_CLEARING</code> and the receivable clear as <code>Dr CO.NONE.EUR.FX_CLEARING / Cr CO.RAEEN.EUR.SHARE_RECEIVABLE</code> at the statement's agreed amounts; FX_CLEARING then carries NPL's open currency position (Section 3).");

// ---- Pattern K: variances by kind
function varianceTx(key, title, source, { amountIn, Rexp, Ract, purpose, expectedNote, note }) {
  const expected = r2(amountIn * Rexp), actual = r2(amountIn * Ract);
  const priced = price({ amountIn, Rm: EX.Rm, Rp: Rexp, basis: "market", s: EX.s, r: EX.r });
  const variance = r2(expected - actual); // positive = NPL received less than priced
  const rows = [
    ["CL.PROJECT.USDT.PAYABLE", "Dr", amountIn, USDT, CL, "principal", ""],
    ["CL.ALI.USDT.COLLECTED", "Cr", amountIn, USDT, CL, "principal", ""],
    ["CL.ALI.EUR.DUE", "Dr", priced.payable, EUR, CL, "principal", "client net is unchanged: the sender's price is write-once (invariant 5)"],
    ["CL.ALI.EUR.DUE", "Dr", priced.residual, EUR, CL, "rounding", ""],
    ["CO.ALI.EUR.POOL", actual >= priced.clientNet ? "Dr" : "Cr", Math.abs(r2(actual - priced.clientNet)), EUR, CO, "earnings", actual >= priced.clientNet ? "margin actually left at Ali" : "the partner delivered less than the client net: NPL's pool at Ali funds the gap"],
    [`CO.NONE.EUR.${purpose}`, variance > 0 ? "Dr" : "Cr", Math.abs(variance), EUR, CO, purpose === "VAR_CONVERSION" ? "variance" : purpose === "VAR_CUTOFF" ? "cutoff_timing" : "variance", expectedNote],
    ["CL.PROJECT.EUR.PAYABLE", "Cr", priced.clientNet, EUR, CL, "principal", ""],
    ["CO.NONE.EUR.EARN_GROSS", "Cr", r2(expected - priced.clientNet), EUR, CO, "earnings", "margin as priced"],
  ];
  L.tx(`${key} · ${title}: expected ${fmt(expected)} EUR, actual ${fmt(actual)} EUR, variance ${fmt(variance)} EUR`, source, rows, note);
  return { expected, actual, variance, priced };
}
const V1 = varianceTx("T36", "Partner calculates (calc_mode partner_calculates): Ali booked 3,000 USDT at 0.8945 instead of the 0.8950 version", "Conversion", { amountIn: 3000, Rexp: 0.8950, Ract: 0.8945, purpose: "VAR_CONVERSION", expectedNote: "what the partner did worse than expected; beyond the project's tolerance an exception opens, the deal does not wait", note: "The same account takes the basis variance of a reroute (the alternate partner's expected conversion on the net amount forwarded)." });
const V2 = varianceTx("T37", "Cutoff timing (D29): 3,000 USDT locked at 0.8950 after Ali's 14:30 cutoff, converted next business day at 0.8930", "Conversion", { amountIn: 3000, Rexp: 0.8950, Ract: 0.8930, purpose: "VAR_CUTOFF", expectedNote: "rate stamped at lock vs rate used; NPL absorbs it", note: "The leg stamps rate_locked_at, cutoff_at and conversion_due_date; Converting may not start before the due date (invariant 28). If the next day's rate would breach the minimum margin, the due date is pushed with conversion_deferred_reason and nothing posts until it runs." });
const V3 = varianceTx("T38", "Honoured expired rate (D45): a new leg priced on yesterday's 0.8950 by an approved override (honour_expired_rate); Ali converts today at 0.8900", "Conversion", { amountIn: 3000, Rexp: 0.8950, Ract: 0.8900, purpose: "VAR_RATE_HONOUR", expectedNote: "the reused rate vs the day's rate: NPL's cost, chosen (invariant 39)", note: "The leg stamps rate_reused_from_deal_id, rate_override_reason and rate_override_approved_by (Finance). A variance can also be a gain, in which case the line is a credit." });

// ---- Pattern L: loss event, booked to NPL first, recovered later
const lossAmt = 10000, poolPart = 6000, walletPart = 4000;
L.tx("T39 · Deal 7 collected: 10,000 USDT verified on a single-use local account at Ali (shown as T1)", "Collection", [
  ["CL.ALI.USDT.COLLECTED", "Dr", lossAmt, USDT, CL, "principal", ""],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", lossAmt, USDT, CL, "principal", ""],
]);
L.tx(`T40 · Loss event (D32): the account is frozen before conversion and the ${fmt(lossAmt)} USDT are lost; NPL books the whole loss and makes the client whole`, "LossEvent", [
  ["CO.NONE.USDT.EXP_LOSS", "Dr", lossAmt, USDT, CO, "loss", "the whole loss is NPL's first (LOSS_EVENT state approved → posted)"],
  ["CO.ALI.USDT.POOL", "Cr", poolPart, USDT, CO, "loss", "NPL's money at Ali funds the make-good as far as it goes"],
  ["CO.OWN.USDT.WALLET", "Cr", walletPart, USDT, CO, "loss", "the rest is transferred from NPL's own wallet to Ali (partner_agreement_ref)"],
  ["CL.ALI.USDT.COLLECTED", "Cr", lossAmt, USDT, CL, "principal", "the client money that was lost"],
  ["CL.ALI.USDT.COLLECTED", "Dr", lossAmt, USDT, CL, "loss", "replaced by NPL's money: the deal proceeds, the collection part stays verified"],
], "The client's claim (PAYABLE) is untouched and the deal converts and settles normally. When neither the pool nor an immediate transfer can fund the make-good, the unfunded part is posted as <code>Dr CL.PROJECT.USDT.MAKEGOOD / Cr CO.NONE.USDT.LOSS_PAYABLE</code> instead and the client balance at Ali is restored only when NPL's funds land there (then <code>Dr CL.ALI.USDT.COLLECTED / Cr CL.PROJECT.USDT.MAKEGOOD</code> and <code>Dr CO.NONE.USDT.LOSS_PAYABLE / Cr CO.OWN.USDT.WALLET</code>). A loss on the settlement side credits INTRANSIT instead of COLLECTED and restores DUE, from which a new settlement follows. A collection is moved to state reversed only when Management decides the deal is unwound instead; the make-good then becomes a refund to the sender.");
const shares = { partner: 4000, sender: 2000, client: 1000, npl: 3000 };
L.tx(`T41 · Management approves the split (approve_loss_split): partner ${fmt(shares.partner)}, sender ${fmt(shares.sender)}, client ${fmt(shares.client)}, NPL ${fmt(shares.npl)} USDT`, "LossEvent", [
  ["CO.ALI.USDT.LOSS_RECEIVABLE", "Dr", shares.partner, USDT, CO, "loss", "Ali's agreed share, now owed to NPL"],
  ["CO.SENDER_A.USDT.LOSS_RECEIVABLE", "Dr", shares.sender, USDT, CO, "loss", "the sender's agreed share"],
  ["CO.ALI.USDT.POOL", "Dr", shares.client, USDT, CO, "loss", "NPL takes back the part of its make-good the client bears"],
  ["CO.NONE.USDT.EXP_LOSS", "Cr", shares.partner + shares.sender + shares.client, USDT, CO, "loss", `NPL's expense falls to its own share, ${fmt(shares.npl)}`],
  ["CL.PROJECT.USDT.PAYABLE", "Dr", shares.client, USDT, CL, "loss", "the client's claim falls by the share it bears"],
  ["CL.ALI.USDT.COLLECTED", "Cr", shares.client, USDT, CL, "loss", "and the restored balance with it"],
], "Each share is a separate recovery posting against the loss; the shares sum to the amount (invariant 31). The client-share lines are the partial reversal of the make-good in T40, which is why invariant 16 is restated in Section 22.");
L.tx(`T42 · Ali settles its share: ${fmt(shares.partner)} USDT credited to NPL's pool at Ali`, "LossEvent", [
  ["CO.ALI.USDT.POOL", "Dr", shares.partner, USDT, CO, "loss", "received (LOSS_RECOVERY, Section 22)"],
  ["CO.ALI.USDT.LOSS_RECEIVABLE", "Cr", shares.partner, USDT, CO, "loss", ""],
]);
L.tx(`T43 · The sender settles its share: ${fmt(shares.sender)} USDT paid to NPL's own wallet`, "LossEvent", [
  ["CO.OWN.USDT.WALLET", "Dr", shares.sender, USDT, CO, "loss", "a payment to NPL, never a netting against a sender credit (client money)"],
  ["CO.SENDER_A.USDT.LOSS_RECEIVABLE", "Cr", shares.sender, USDT, CO, "loss", ""],
]);
const snapLoss = L.snapshot();

// ---- Pattern M: the reseller project (NPL-GR): reseller books in EUR, remittance as an ordinary client project
const VENDOR_INV = 9000, RESALE_INV = 9450;                       // EUR
const Rq = 0.8708, Rd2 = 0.87527;                                 // EUR per USDT at pricing and at the second instalment (NPL's figures, D24)
const RmT = 1 / 32.50, RpT = 1 / 32.73;                           // USDT per THB: market and Ali (Ali's 0.7 % inside its rate)
const targetOut = r2(RESALE_INV / Rq);                            // USDT the remittance side must deliver for the resale invoice
const thbIn = r2(targetOut / (RmT * (1 - 0.02)));                 // amount_mode target_out, 2 % remittance markup on market (rate_basis market), bank transfer (no cash rounding)
const DM = price({ amountIn: thbIn, Rm: RmT, Rp: RpT, basis: "market", s: 0.02, r: 0 });
const mktValue = r2(thbIn * RmT);
const inst1Eur = 3000, inst2Eur = 6000, marginEur = RESALE_INV - VENDOR_INV;
const paid1 = r2(inst1Eur / Rq), reserved1 = r2(inst1Eur / Rq);
const paid2 = r2(inst2Eur / Rd2), reserved2 = r2(inst2Eur / Rq), fx2 = r2(reserved2 - paid2);   // positive = gain for NPL
const reserved3 = r2(DM.clientNet - reserved1 - reserved2), paid3 = r2(marginEur * (1 / Rd2)), fx3 = r2(reserved3 - paid3);
const hop = r2(DM.clientNet - paid1);
L.tx(`T44 · NPL-GR receives the vendor's invoice: ${fmt(VENDOR_INV)} EUR at NPL's preferential price (INVOICE kind vendor)`, "Invoice", [
  ["CO.NONE.EUR.RESELL_COST", "Dr", VENDOR_INV, EUR, CO, "resale", "NPL-GR's cost, in the invoice currency, when received"],
  ["CO.VENDOR_V.EUR.VENDOR_PAYABLE", "Cr", VENDOR_INV, EUR, CO, "resale", "owed to the vendor; INVOICE_BALANCE shows the open part"],
], "These are NPL-GR's reseller books: two invoice postings per deal, both in the invoice currency, and nothing else. The multi-currency work is left to the remittance side below.");
L.tx(`T45 · NPL-GR issues the resale invoice to its customer: ${fmt(RESALE_INV)} EUR at retail price (INVOICE kind resale); game reseller revenue ${fmt(marginEur)} EUR is fixed here`, "Invoice", [
  ["CO.CUSTOMER_C.EUR.RESALE_RECEIVABLE", "Dr", RESALE_INV, EUR, CO, "resale", "owed by the customer"],
  ["CO.NONE.EUR.RESELL_REVENUE", "Cr", RESALE_INV, EUR, CO, "resale", "NPL-GR's revenue, in the invoice currency, when issued"],
], `RESELL_REVENUE − RESELL_COST = ${fmt(marginEur)} EUR, and no later posting touches either account. The deal group that collects this invoice names it (DEAL_GROUP.invoice_id = the resale invoice).`);
L.tx(`T46 · The customer pays the resale invoice in THB by bank transfer to Ali: ${fmt(thbIn, THB)} THB = ${fmt(RESALE_INV)} EUR at the sender rate with the ${pct(0.02, 0)} remittance markup (amount_mode target_out)`, "Collection", [
  ["CL.ALI.THB.COLLECTED", "Dr", thbIn, THB, CL, "principal", "client money at Ali — the client of this remittance project is NPL-GR"],
  ["CL.PROJECT.THB.PAYABLE", "Cr", thbIn, THB, CL, "principal", "the remittance side owes it onward on NPL-GR's behalf"],
  ["CO.PROJECT.EUR.REMIT_CLAIM", "Dr", RESALE_INV, EUR, CO, "resale", "reseller books: the customer has paid, the remittance side now holds the value for NPL-GR"],
  ["CO.CUSTOMER_C.EUR.RESALE_RECEIVABLE", "Cr", RESALE_INV, EUR, CO, "resale", "the customer's debt is settled"],
], "The remittance side posts exactly like any client project (T1): Evo's sender is a customer of NPL-GR's here, and NPL-GR is the client. The two EUR lines are the reseller books recording that the customer paid; each owner's lines balance in their own currency.");
L.tx(`T47 · Conversion at Ali (fee_in_rate, markup on market): ${fmt(thbIn, THB)} THB → ${fmt(DM.actualOut)} USDT at 32.73 (market 32.50); client net ${fmt(DM.clientNet)} USDT (= ${fmt(RESALE_INV)} EUR at ${Rq}), NPL's earnings ${fmt(DM.earnings)} USDT`, "Conversion", [
  ["CL.PROJECT.THB.PAYABLE", "Dr", thbIn, THB, CL, "principal", ""],
  ["CL.ALI.THB.COLLECTED", "Cr", thbIn, THB, CL, "principal", ""],
  ["CL.ALI.USDT.DUE", "Dr", DM.clientNet, USDT, CL, "principal", "NPL-GR's entitlement in USDT, reserved for the vendor and for NPL-GR's margin"],
  ["CO.ALI.USDT.POOL", "Dr", DM.earnings, USDT, CO, "earnings", "remittance earnings resting at Ali"],
  ["CL.PROJECT.USDT.PAYABLE", "Cr", DM.clientNet, USDT, CL, "principal", ""],
  ["CO.NONE.USDT.EARN_GROSS", "Cr", DM.earnings, USDT, CO, "earnings", `${pct(DM.earnings / mktValue)} of the market value: the 2 % markup less Ali's 0.7 % inside its rate`],
], `The markup is applied on the market rate because the price is built from the EUR invoice; Ali's agent rate is used for the THB → USDT conversion and only decides whether 2 % leaves enough: the fee structure's minimum margin is checked against the spread between market and agent rate (FEE_STRUCTURE mode variable, min_margin_pct, floor and cap), and when Ali's rate leaves less, the markup rises within the cap or Finance asks for a better rate. The markup pays for the remittance service and carries the rate risk of the instalments, so the ${fmt(marginEur)} EUR reseller revenue is never diluted. Had the customer paid in USDT, the pair would be USDT → USDT at rate 1 (D33) and the same lines would post in USDT.`);
L.tx(`T48 · Instalment 1 paid by Ali: ${fmt(paid1)} USDT to the vendor, discharging ${fmt(inst1Eur)} EUR of the vendor invoice at discharge_rate ${Rq} (settlement and confirmation shown together)`, "Confirmation", [
  ["CL.ALI.USDT.INTRANSIT", "Dr", paid1, USDT, CL, "principal", "released by Ali on NPL's instruction"],
  ["CL.ALI.USDT.DUE", "Cr", paid1, USDT, CL, "principal", ""],
  ["CL.PROJECT.USDT.PAYABLE", "Dr", paid1, USDT, CL, "principal", "the vendor confirms: the obligation is discharged"],
  ["CL.ALI.USDT.INTRANSIT", "Cr", paid1, USDT, CL, "principal", ""],
  ["CO.VENDOR_V.EUR.VENDOR_PAYABLE", "Dr", inst1Eur, EUR, CO, "resale", "reseller books: the vendor is owed 3,000 EUR less (INVOICE_BALANCE 6,000)"],
  ["CO.PROJECT.EUR.REMIT_CLAIM", "Cr", inst1Eur, EUR, CO, "resale", "the remittance side holds 3,000 EUR less for NPL-GR"],
], `The line names the vendor invoice (SETTLEMENT_LINE.invoice_id, obligation_discharged ${fmt(inst1Eur)} EUR, discharge_rate ${Rq}). Paid on the pricing day, so the USDT reserved for these 3,000 EUR (${fmt(reserved1)}) equals the USDT paid: no forex line.`);
L.tx(`T49 · Variant route: the remaining ${fmt(hop)} USDT of NPL-GR's balance hop from Ali to NPL's own desk (LT Sub at Aquanow; a SETTLEMENT_LINE to the partner_transit receiver; release and credit shown together)`, "Confirmation", [
  ["CL.ALI.USDT.INTRANSIT", "Dr", hop, USDT, CL, "principal", "released by Ali"],
  ["CL.ALI.USDT.DUE", "Cr", hop, USDT, CL, "principal", ""],
  ["CL.OWNDESK.USDT.DUE", "Dr", hop, USDT, CL, "principal", "credited at the own desk: an ordinary partner-coded account with the own-desk configuration as holder (D23), reported by the custody view"],
  ["CL.ALI.USDT.INTRANSIT", "Cr", hop, USDT, CL, "principal", ""],
], "Whether Ali or the own desk pays the vendor depends on the vendor; the postings that follow are identical apart from the holder. Nothing is earned or charged on the hop; a network fee NPL bears posts as in T16.");
L.tx(`T50 · Instalment 2 paid by the own desk four days later: ${fmt(paid2)} USDT discharge the remaining ${fmt(inst2Eur)} EUR at ${Rd2}; ${fmt(reserved2)} USDT had been reserved at ${Rq}, so ${fmt(fx2)} USDT are a forex gain for the remittance side`, "Confirmation", [
  ["CL.OWNDESK.USDT.INTRANSIT", "Dr", paid2, USDT, CL, "principal", "released"],
  ["CL.OWNDESK.USDT.DUE", "Cr", paid2, USDT, CL, "principal", ""],
  ["CL.PROJECT.USDT.PAYABLE", "Dr", paid2, USDT, CL, "principal", "the vendor confirms"],
  ["CL.OWNDESK.USDT.INTRANSIT", "Cr", paid2, USDT, CL, "principal", ""],
  ["CL.PROJECT.USDT.PAYABLE", "Dr", fx2, USDT, CL, "fx_timing", "forex true-up: the 6,000 EUR cost fewer USDT than reserved, the surplus is not NPL-GR's"],
  ["CL.OWNDESK.USDT.DUE", "Cr", fx2, USDT, CL, "fx_timing", "it leaves NPL-GR's balance"],
  ["CO.OWNDESK.USDT.POOL", "Dr", fx2, USDT, CO, "fx_timing", "and becomes NPL's, resting at the own desk"],
  ["CO.NONE.USDT.VAR_FX_TIMING", "Cr", fx2, USDT, CO, "fx_timing", "a gain; with the rate the other way the line is a debit and the pool tops NPL-GR's balance up"],
  ["CO.VENDOR_V.EUR.VENDOR_PAYABLE", "Dr", inst2Eur, EUR, CO, "resale", "reseller books: the vendor invoice is settled (INVOICE_BALANCE 0)"],
  ["CO.PROJECT.EUR.REMIT_CLAIM", "Cr", inst2Eur, EUR, CO, "resale", ""],
], "The forex true-up is the one place where the remittance side's USDT obligation to NPL-GR is re-measured: NPL-GR is entitled to EUR value, the markup absorbs the rate movement either way (NPL's 1.3 % less a 0.1 % forex loss gives 1.2 % in NPL's own example), and the reseller books never see it.");
L.tx(`T51 · The margin line: ${fmt(marginEur)} EUR of the resale invoice are paid to NPL-GR's own wallet, ${fmt(paid3)} USDT at ${Rd2}; ${fmt(reserved3)} USDT had been reserved, ${fmt(fx3)} USDT forex gain`, "Confirmation", [
  ["CL.OWNDESK.USDT.INTRANSIT", "Dr", paid3, USDT, CL, "principal", "released to NPL-GR's wallet (a receiver of the project)"],
  ["CL.OWNDESK.USDT.DUE", "Cr", paid3, USDT, CL, "principal", ""],
  ["CL.PROJECT.USDT.PAYABLE", "Dr", paid3, USDT, CL, "principal", "confirmed: the resale invoice is fully discharged (INVOICE_BALANCE 0)"],
  ["CL.OWNDESK.USDT.INTRANSIT", "Cr", paid3, USDT, CL, "principal", ""],
  ["CL.PROJECT.USDT.PAYABLE", "Dr", fx3, USDT, CL, "fx_timing", "forex true-up on the margin line"],
  ["CL.OWNDESK.USDT.DUE", "Cr", fx3, USDT, CL, "fx_timing", ""],
  ["CO.OWNDESK.USDT.POOL", "Dr", fx3, USDT, CO, "fx_timing", ""],
  ["CO.NONE.USDT.VAR_FX_TIMING", "Cr", fx3, USDT, CO, "fx_timing", ""],
  ["CO.OWN.USDT.WALLET", "Dr", paid3, USDT, CO, "resale", "reseller books: NPL-GR's margin arrives, in USDT"],
  ["CO.NONE.USDT.FX_CLEARING", "Cr", paid3, USDT, CO, "resale", "the USDT leg of a EUR claim settled in USDT"],
  ["CO.NONE.EUR.FX_CLEARING", "Dr", marginEur, EUR, CO, "resale", "the EUR leg"],
  ["CO.PROJECT.EUR.REMIT_CLAIM", "Cr", marginEur, EUR, CO, "resale", "nothing is held for NPL-GR any more"],
], `NPL-GR may instead leave its margin in the project balance to fund the next vendor payment (settlement_policy hold_allowed): then nothing in T51 posts, REMIT_CLAIM keeps ${fmt(marginEur)} EUR, the remittance side keeps the matching USDT payable, and the forex true-up of the margin waits for the line that pays it. FX_CLEARING carries ${fmt(marginEur)} EUR against ${fmt(paid3)} USDT, NPL's own currency position, valued through REPORTING_VALUE and closed when NPL converts or reports.`);
const snapReseller = L.snapshot();
const remitMargin = r2(DM.earnings + fx2 + fx3);

// ------------------------------------------------------------------ identities
const identities = [
  ["Client assets = client liabilities, per currency", "Σ COLLECTED + Σ HELD + Σ DUE + Σ INTRANSIT + Σ SHORTFALL + MAKEGOOD = PAYABLE + Σ CREDIT. Holds after every transaction because every transaction balances per owner as well as per currency."],
  ["PAYABLE = Σ GROUP_ENTITLEMENT", "Per project and currency (invariant 7). Every payout line resolves to one group — the paid receiver's for a counterparty, the paying leg's via deal_id otherwise — so the identity is checked line by line (invariant 19)."],
  ["PROJECT_BALANCE(partner) = CL.<PARTNER>.<CCY>.DUE", "The view and the account agree; the pending converted value of a locked, not yet converted leg (D29) is shown by the view and is not posted."],
  ["Pool per partner = the partner's statement", "CO.<PARTNER>.<CCY>.POOL agrees to what the partner says it holds for NPL; Σ EARNINGS_RECEIVABLE outstanding ≤ POOL."],
  ["Rebates and shares agree to statements", "Σ REBATE_RECEIVABLE = Σ PARTNER_REBATE_ACCRUAL expected − received, per partner; Σ SHARE_RECEIVABLE / SHARE_PAYABLE = Σ MARKUP_SHARE_ACCRUAL not yet settled, per party."],
  ["Loss accounting closes", "Per LOSS_EVENT: EXP_LOSS net of recoveries = npl_share once every share is settled; Σ LOSS_RECEIVABLE = agreed shares not yet received."],
  ["Exposure ≤ ceiling", "Σ DUE + Σ INTRANSIT at a partner is within the project's exposure ceiling; Σ PROJECT_BALANCE across a client's projects, as REPORTING_VALUE, within CLIENT.exposure_ceiling (invariant 35)."],
  ["Own wallets hold client money only in three cases", "CL.OWN.<CCY>.HELD is zero except for rows the custody view can name: an open reroute, a bridge collection within custody_max_hours, an own-desk leg (invariant 3)."],
  ["Each confirmation = its released amount", "Confirmed + shortfall + fees booked = the amount released on the line."],
  ["Reseller revenue is intact", "Per resale invoice: RESELL_REVENUE − RESELL_COST is set when the two invoices are posted and no later transaction touches either account. Σ VENDOR_PAYABLE = Σ INVOICE_BALANCE of vendor invoices; Σ RESALE_RECEIVABLE = resale invoices not yet paid; REMIT_CLAIM = the resale invoices paid by customers and not yet discharged by payout lines, in EUR."],
  ["Remittance margin per deal", "EARN_GROSS − EXP_PARTNER ± VAR_FX_TIMING − fees on the deal's lines, in the converted currency; the forex result of the instalments lands here and nowhere else."],
  ["Every figure shown is a sum", "No screen stores a balance; all are sums over postings or deals (invariant 10). A converted total is a REPORTING_VALUE: an estimate at the latest platform-pair rate, never posted (invariant 38)."],
];

// ------------------------------------------------------------------ page style
const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;margin:0}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
p{margin:0 0 7pt} ul,ol{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 4pt}
code,.mono{font:8.8pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;margin:4pt 0 10pt;font-size:9.2pt}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt;vertical-align:bottom}
td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr{break-inside:avoid}
.title{text-align:center;margin-top:40mm}
.title .sub{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 10pt}
.title .org{margin:0 0 2pt} .title .date{margin:0 0 16pt}
.rule{border-top:2px solid #222;border-bottom:1px solid #222;height:2px;margin:10pt 0 14pt}
.pb{break-before:page}
.tx{break-inside:avoid;margin:10pt 0 12pt}
.txh{font-size:10pt;margin-bottom:2pt} .src{color:#666;font-size:9pt;margin-left:8pt}
table.post td,table.post th{font-size:8.4pt;padding:2pt 3pt}
table.post{table-layout:fixed}
td.io{font-size:8.2pt;white-space:nowrap}
table.bal caption{text-align:left;font:700 9.5pt Helvetica,Arial,sans-serif;margin:6pt 0 2pt}
.txnote{font-size:9.3pt;color:#333;margin:3pt 0 0}
.box{border:1px solid #2f5d9e;background:#f3f6fb;padding:6pt 9pt;margin:8pt 0;font-size:9.8pt}
.small{font-size:9pt;color:#444}
.new{color:#8a4b00;font-weight:600}
`;
const code = (s) => `<code>${esc(s)}</code>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Ledger Posting Design &amp; Chart of Accounts v${DOC_VERSION}</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Ledger Posting Design &amp; Chart of Accounts · Draft v${DOC_VERSION}</p><p class="org">New XP Technologies Limited</p><p class="date">${DATE} · Confidential</p></div>
<p><b>Status:</b> Built against ERD &amp; Data Model Draft v${ERD_VERSION} (decisions D1–D45) and NPL's answers of 10 October on accrual timing, loss events, the reseller project and variance accounts. Every worked example was produced by a small posting engine that refuses any transaction whose debits and credits do not match per currency and per owner, so the figures add up by construction. Supersedes Draft v1.1 (ERD v5.2).<br>
<b>Audience:</b> NPL Finance and Management, and the New XP engineering team. Written in plain language; the account codes and field names are the ones in the ERD, with NPL's vocabulary (settlement, partner entity, markup share, sender pays / receiver pays, fee on market / fee in rate, agent rate).</p>
<div class="box"><b>What changed since v1.1.</b> The chart of accounts grows with the v5.3–v5.6 purposes (EARN_REBATE, SHARE_RECEIVABLE, EXP_ROUNDING, EXP_LOSS) and with the purposes this draft proposes (Section 22): four variance accounts in place of one, loss receivables and the unfunded make-good pair, the reseller revenue and cost accounts, and a clearing account for company balances settled in another currency. Rebates and markup shares are accrued at conversion. A loss is booked to NPL in full and recovered share by share. The NPL-GR project keeps a full reseller P&amp;L inside NPLify: the vendor and resale invoices are posted in the invoice currency, the remittance deal posts like any client project with NPL-GR as the client, and the forex result of instalments lands on the remittance margin. New worked patterns: same-currency pass-through, round-up rounding, bridge-wallet hop, party-retains share with rebate, cutoff and honoured-rate variances, loss event with recoveries, the reseller deal with its two invoices and instalments.</div>
<div class="rule"></div>

<h2>1 · What the ledger is for, in one paragraph</h2>
<p>NPL coordinates other people's money and, in one project, is also its own client: NPL-GR resells goods and pays for the remittance like any customer. The ledger answers, at any moment and for any past moment, three questions: <b>where is the money</b> (at which partner, in transit, in one of NPL's wallets), <b>whose money is it</b> (the client's, a sender's, or NPL's), and <b>what did each movement cost or earn</b> (NPL's margin and shares of it, rebates, partner cost, bank and network fees, rounding, losses, and the four kinds of variance). It does this with ordinary double-entry bookkeeping: every movement is a set of debits and credits that balance, nothing is ever edited or deleted, and every balance anyone sees is a sum over those entries.</p>

<h2>2 · Rules that every posting follows</h2>
<ol>
<li><b>One transaction per event.</b> A collection, a conversion, a balance conversion, a settlement, a settlement return, a confirmation, a bank-fee event, a reroute, a markup-share or rebate accrual or settlement, a loss event or recovery, and a manual adjustment each produce exactly one ${code("LEDGER_TRANSACTION")} that points at its source record (${code("source_type")}, ${code("source_id")}).</li>
<li><b>Balanced per currency and per owner.</b> Within one transaction the debits equal the credits in each currency separately, and separately again for client-tagged and company-tagged lines. A conversion therefore has an in-currency part and an out-currency part that each balance on their own; no exchange-rate plug is ever needed, and nothing silently moves between the client's books and NPL's.</li>
<li><b>Ownership is a tag on every line</b> (${code("ownership_tag")} client / company) and the account code says the same (${code("CL.")} / ${code("CO.")}). Client money becomes NPL's at one event only, margin recognition at conversion (invariant 16); company money becomes client money only where NPL absorbs a fee, tops up a shortfall or makes good a loss.</li>
<li><b>A cost component on every line</b> (${code("cost_component")}): principal, earnings, rebate, partner_cost, bank_fee, network_fee, variance, share, rounding, fx_timing, cutoff_timing, loss, and <span class="new">resale</span> for the reseller project. Reports of margin, cost and variance are sums over this tag; no figure is stored.</li>
<li><b>Accruals post with the conversion.</b> NPL's margin, each markup-share party's part and the partner rebate expected on the leg are all recognised at conversion, as separate transactions that name the same deal; the monthly statement settles them and any difference is a true-up, never a rewrite.</li>
<li><b>Variances are booked by kind</b>, to four accounts: VAR_CONVERSION (the partner did something other than expected), VAR_CUTOFF (D29), VAR_RATE_HONOUR (D45), VAR_FX_TIMING (D24 and the own desk). Each can be a gain or a loss; each line names the leg or line it arose on.</li>
<li><b>A loss is NPL's first.</b> A LOSS_EVENT posts the whole amount to EXP_LOSS and makes the client whole in the same transaction; each share the partner, the sender or the client agrees to bear is a separate, later recovery posting.</li>
<li><b>NPL-GR is the client of its own remittance project.</b> Its reseller books are two postings per deal in the invoice currency, one per invoice, and a claim on the remittance side; the remittance deal posts like any client project; the forex result of paying the vendor in instalments is a true-up to VAR_FX_TIMING against NPL's pool, so the reseller revenue is never diluted.</li>
<li><b>Append-only.</b> A correction is a reversing transaction that names what it reverses (${code("reversal_of_id")}) followed by the correct posting (invariant 2).</li>
<li><b>Amounts stay in their own currency.</b> A converted total (volumes, earnings, balances, custody in the reporting currency) is a REPORTING_VALUE: computed at read time from the latest platform-pair market rate, carrying that rate and its time, flagged when stale, and never posted, quoted or settled (invariant 38).</li>
<li><b>Rounding has an owner.</b> A dropped fraction stays client money in the balance; an amount added by rounding up is NPL's cost in EXP_ROUNDING (invariant 24).</li>
</ol>

<h2>3 · Chart of accounts</h2>
<p>Account codes read <code>OWNER.HOLDER.CURRENCY.PURPOSE</code>. The owner is <code>CL</code> for client funds or <code>CO</code> for company. The holder says where the money is or whom it concerns: a partner code such as <code>ALI</code>, <code>JETON</code> or <code>AQN</code> (a ${code("PARTNER_CONFIG")}, so always within one project), <code>OWNDESK</code> for the own-desk configuration of the reseller project, <code>OWN</code> for NPL's own wallets, a receiver, a sender, a markup-share party, <code>PROJECT</code> for the project as a whole, or <code>NONE</code> for income, expense and clearing accounts. One account exists per combination actually used; accounts are created on first posting (${code("LEDGER_ACCOUNT")}: code, ownership, holder_type, holder_id, currency, purpose, kind). Purposes marked <span class="new">v1.2</span> are proposed by this draft and listed in Section 22.</p>
<table><thead><tr><th>Code</th><th>Kind</th><th>Since</th><th>What the balance means</th></tr></thead><tbody>
${PURPOSES.map(([o, p, k, h, since, w]) => `<tr><td class="mono">${o}.${esc(h)}.&lt;CCY&gt;.${esc(p)}</td><td>${k}</td><td>${since === "v1.2" ? '<span class="new">v1.2</span>' : since}</td><td>${esc(w)}</td></tr>`).join("")}
</tbody></table>
<p class="small">Debit-normal accounts (assets, expenses) grow with debits; credit-normal accounts (liabilities, income) grow with credits. A variance account with a credit balance is a gain. <code>ADVANCE</code> does not exist because NPL never advances money to a receiver (invariant 16). The former single <code>VARIANCE</code> purpose is replaced by the four VAR_ accounts; the former referral payable is <code>SHARE_PAYABLE</code> (D37).</p>

<h2>4 · Cost components, owners and sources</h2>
<table><thead><tr><th>Cost component</th><th>Used on</th><th>Meaning</th></tr></thead><tbody>
<tr><td>principal</td><td>client money moving</td><td>The amount itself: collected, converted, released, confirmed, returned.</td></tr>
<tr><td>earnings</td><td>POOL, EARN_GROSS, WALLET on dues recovery</td><td>NPL's margin (sender and receiver fee parts) and where it rests.</td></tr>
<tr><td>partner_cost</td><td>EXP_PARTNER</td><td>A fee_on_market partner's stated fee, deducted at transaction level.</td></tr>
<tr><td>rebate</td><td>REBATE_RECEIVABLE, EARN_REBATE, WALLET</td><td>A partner's rebate on NPLify deals: accrual, receipt, true-up.</td></tr>
<tr><td>share</td><td>EARN_GROSS (debit), SHARE_PAYABLE, SHARE_RECEIVABLE</td><td>A markup-share party's part of the net markup and its settlement.</td></tr>
<tr><td>bank_fee</td><td>EXP_BANKFEE, SHORTFALL, POOL, DUE</td><td>Bank and payout fees: waived, carried forward, absorbed, covered, bounce.</td></tr>
<tr><td>network_fee</td><td>EXP_NETWORK, WALLET, COLLECTED</td><td>Crypto network fees on refunds, hops and forwards.</td></tr>
<tr><td>rounding</td><td>DUE, EXP_ROUNDING, POOL</td><td>The signed residual of the pair's rounding option.</td></tr>
<tr><td>variance</td><td>VAR_CONVERSION, VAR_RATE_HONOUR, VAR_FX_TIMING</td><td>Expected versus actual, by kind.</td></tr>
<tr><td>cutoff_timing</td><td>VAR_CUTOFF</td><td>Rate at lock versus rate used after the partner's cutoff.</td></tr>
<tr><td>fx_timing</td><td>VAR_FX_TIMING</td><td>Obligation priced on one day, discharged on another.</td></tr>
<tr><td>loss</td><td>EXP_LOSS, LOSS_RECEIVABLE, POOL, WALLET, COLLECTED, PAYABLE</td><td>A loss event, its make-good and its recoveries.</td></tr>
<tr><td><span class="new">resale</span></td><td>RESELL_REVENUE, RESELL_COST, VENDOR_PAYABLE, RESALE_RECEIVABLE, REMIT_CLAIM, FX_CLEARING</td><td>NPL-GR's reseller books: the two invoices and the claim on the remittance side.</td></tr>
</tbody></table>
<p>Transaction sources (${code("LEDGER_TRANSACTION.source_type")}): Collection, Conversion, BalanceConversion, Settlement, SettlementReturn, Confirmation, BankFeeEvent, Reroute, MarkupShare, Rebate, LossEvent, Adjustment, and <span class="new">Invoice</span> for the reseller books. Section 21 lists what each one posts; Section 23 asks for the source record a loss recovery points at.</p>

<h2>5 · Reading a posting table</h2>
<p>Each worked example shows one transaction as a table. <i>Debit</i> and <i>Credit</i> are the amounts in bookkeeping's two columns; <i>In / Out</i> says the same thing in plain words, from the point of view of the account on that line: <b>IN · money</b> means money arrives in that place (a partner, a wallet, a balance), <b>OUT · money</b> that it leaves; <b>IN · owed</b> means NPL owes more to that party, <b>OUT · owed</b> that it owes less; <b>IN · earned</b> is margin or income recognised, <b>IN · cost</b> a cost NPL bears, and <b>OUT</b> on either is a reduction. A reader who ignores the Debit and Credit columns and reads only Account, In / Out and Why will follow every example. <i>Owner</i> is the ownership tag; <i>Cost component</i> is the breakdown tag; <i>Why</i> says in plain words what that line records. The running example is project Evo: Sender A, Receiver X (receiver group A, the default group) with entities Entity X1 and Entity X2; partner Ali (fee_in_rate: its cost is inside its rate), partner Jeton (fee_on_market + ${pct(0.005)}) and partner Aquanow (fee_on_market + ${pct(0.008)}, rebate ${pct(0.003, 1)} of the amount). Rates: market ${EX.Rm.toFixed(4)} EUR per USDT, Ali ${EX.Rp.toFixed(4)}. Fee structure: rate_basis market (the sender is priced on the market rate and Ali converts at its own), fixed, ${pct(EX.s + EX.r)} in total: this sender type pays ${pct(EX.s)} (Evo's other type pays 1.00 %) and the receiver always pays ${pct(EX.r)}. The arithmetic is in the Calculation Specification; the headline figures for deal 1 are:</p>
<table><thead><tr><th>Figure</th><th class="n">Deal 1 (10,000 USDT at Ali)</th><th>How</th></tr></thead><tbody>
<tr><td>Sender rate</td><td class="n">${D1.Rs.toFixed(5)}</td><td>market ${EX.Rm.toFixed(4)} × (1 − ${pct(EX.s)}): the sender's part is taken off the rate</td></tr>
<tr><td>Gross out</td><td class="n">${fmt(D1.grossOut)} EUR</td><td>10,000 × sender rate</td></tr>
<tr><td>Receiver pays</td><td class="n">${fmt(D1.feeReceiver)} EUR</td><td>gross out × ${pct(EX.r)}</td></tr>
<tr><td>Client net (entitlement)</td><td class="n">${fmt(D1.clientNet)} EUR</td><td>gross out − receiver part</td></tr>
<tr><td>Converted at Ali</td><td class="n">${fmt(D1.actualOut)} EUR</td><td>10,000 × ${EX.Rp} (Ali's own rate; its spread against market is ${fmt(D1.inferredPartnerCost)} EUR)</td></tr>
<tr><td>NPL earnings</td><td class="n">${fmt(D1.earnings)} EUR</td><td>converted − client net = fee parts ${fmt(r2(D1.feeSender + D1.feeReceiver))} (sender ${fmt(D1.feeSender)} + receiver ${fmt(D1.feeReceiver)}) − Ali's spread ${fmt(D1.inferredPartnerCost)}</td></tr>
<tr><td>Paid out in whole euros / dust</td><td class="n">${fmt(D1.payable)} / ${fmt(D1.residual)} EUR</td><td>amount_rounding truncate_unit; the dust stays client money</td></tr>
</tbody></table>

<h2 class="pb">6 · Pattern A — direct collection, conversion and accumulation</h2>
<p>The everyday case: the sender pays, the partner converts, the client balance at that partner grows until it is settled. Collect-first and quote-first deals post identically; only the moment pricing is fixed differs. A quote extended any number of times (D45) still posts once, at conversion.</p>
${L.html("T1")}${L.html("T2")}
${L.balancesHtml([["CL.ALI.USDT.COLLECTED", USDT, "nothing left unconverted"], ["CL.ALI.EUR.DUE", EUR, "client balance at Ali (PROJECT_BALANCE)"], ["CL.PROJECT.EUR.PAYABLE", EUR, "owed to receivers; equals group entitlement"], ["CO.ALI.EUR.POOL", EUR, "NPL's margin resting at Ali"], ["CO.NONE.EUR.EARN_GROSS", EUR, "margin recognised to date"]], "Balances after deal 1", snapDeal1)}
${L.html("T3")}

<h2>7 · Pattern B — part collection</h2>
<p>A deal may be collected in parts, by any method; the obligation grows with each part and the conversion waits for the last one (or for the partner's cash count).</p>
${L.html("T4")}${L.html("T5")}${L.html("T6")}

<h2>8 · Pattern C — settlement, confirmation, bank fees, shortfalls, rounding</h2>
<p>A settlement drains a partner's holding into one or many lines; each line is confirmed by its receiver in full or short. The bank-fee treatment of the project or of a FEE_DECISION decides who bears a fee the bank took.</p>
${L.html("T7")}${L.html("T8")}${L.html("T9")}${L.html("T10")}
${L.balancesHtml([["CL.ALI.EUR.DUE", EUR, "dust plus the topped-up 50 EUR, out with the next settlement"], ["CL.ALI.EUR.INTRANSIT", EUR, "nothing in transit"], ["CL.PROJECT.EUR.PAYABLE", EUR, "the 50 EUR still owed to Receiver X plus the dust"], ["CL.RECEIVER_X.EUR.SHORTFALL", EUR, "cleared"], ["CO.ALI.EUR.POOL", EUR, "NPL's margin at Ali after funding the top-up"], ["CO.NONE.EUR.EXP_BANKFEE", EUR, "bank fees NPL bore"]], "Balances after settlement and confirmation", snapSettled)}
${L.html("T11")}

<h2>9 · Pattern D — contingency routes and the bridge wallet</h2>
<p>NPL's own wallets hold client money in three cases only (invariant 3): an approved reroute, a collection bridge for a network the partner lacks, and the own desk. The first two are shown here; the own desk is Pattern M.</p>
${L.html("T12")}${L.html("T13")}${L.html("T14")}
${L.balancesHtml([["CL.OWN.USDT.HELD", USDT, "custody ended"], ["CL.JETON.EUR.DUE", EUR, "client balance at Jeton"], ["CO.JETON.EUR.POOL", EUR, "NPL's net margin at Jeton"], ["CO.OWN.USDT.WALLET", USDT, "recovered dues in NPL's wallet"], ["CO.NONE.EUR.EXP_PARTNER", EUR, "Jeton's stated fees to date"]], "Balances after the contingency route", snapDeal3)}
${L.html("T15")}${L.html("T16")}${L.html("T17")}

<h2>10 · Pattern E — cancellations, reversals and voids</h2>
${L.html("T18")}${L.html("T19")}${L.html("T20")}${L.html("T21")}

<h2>11 · Pattern F — rejected payout and return leg</h2>
${L.html("T22")}${L.html("T23")}${L.html("T24")}${L.html("T25")}

<h2>12 · Pattern G — inter-group offsets</h2>
<p>An offset is not an account. It arises only when a counterparty receiver of one group is paid from a leg attributed to another group (invariant 17): the settlement posts exactly as T7 and T8, and the ${code("OFFSET")} view, reading ${code("GROUP_ENTITLEMENT")}, shows one group owed and the other holding its flow. A project with a single group never has an offset; a cross-group payout needs Management approval (cross_group_payout) and tighter aging. No ledger line differs, which is the point: the money and the claim are right, only the attribution needs watching.</p>

<h2>13 · Pattern H — balance conversion</h2>
${L.html("T26")}${L.html("T27")}

<h2>14 · Pattern I — overpayment and sender credit</h2>
${L.html("T28")}${L.html("T29")}

<h2 class="pb">15 · Pattern J — markup shares and partner rebates</h2>
<p>Both are accrued with the conversion they arise on (NPL, 10 October) and settled monthly against a statement. A share is a part of NPL's net markup owed to a party; a rebate is NPL's own income from a partner, kept apart from the margin and never in a share base (D26, D27).</p>
${L.html("T30")}${L.html("T31")}${L.html("T32")}${L.html("T33")}${L.html("T34")}${L.html("T35")}

<h2>16 · Pattern K — variances, by kind</h2>
<p>The sender's figures are write-once, so whenever the partner's actual conversion differs from the one the leg was priced on, the client's entitlement is unchanged and the difference is NPL's. Three of the four variance kinds have the same posting shape and differ only in the account; the fourth, fx timing, belongs to invoices and the own desk (Pattern M).</p>
${L.html("T36")}${L.html("T37")}${L.html("T38")}

<h2>17 · Pattern L — loss events: booked to NPL first, recovered share by share</h2>
<p>Money lost after it was verified or released: a frozen single-use account, cash found short and unrecoverable, a wrong-chain transfer (D32). The whole loss is NPL's expense at once and the client is made whole; the split Management approves is then recovered from each party by its own posting (NPL, 10 October).</p>
${L.html("T39")}${L.html("T40")}${L.html("T41")}${L.html("T42")}${L.html("T43")}
${L.balancesHtml([["CO.NONE.USDT.EXP_LOSS", USDT, "NPL's own share of the loss, once every recovery is settled"], ["CO.ALI.USDT.LOSS_RECEIVABLE", USDT, "nothing outstanding from Ali"], ["CO.SENDER_A.USDT.LOSS_RECEIVABLE", USDT, "nothing outstanding from the sender"]], "Loss accounts after the recoveries", snapLoss)}
<p class="small">Net effect on NPL's money: the pool at Ali gave 6,000 and received 1,000 + 4,000 back (−1,000); the own wallet gave 4,000 and received 2,000 (−2,000); together −3,000, NPL's share. The client's claim on deal 7 is 9,000 USDT, backed by 9,000 at Ali.</p>

<h2>18 · Pattern M — the reseller project (NPL-GR): two invoices, one remittance deal</h2>
<p>NPL-GR, a business unit of NPL, buys from vendors at a preferential price and sells to its customers at a retail price (D23, D24). There are two invoices per deal: the vendor's invoice to NPL-GR, and NPL-GR's resale invoice to its customer, both in the vendor's currency. The difference is the game reseller revenue, and it must stay intact whatever happens afterwards. The customer pays the resale invoice through the remittance service with NPL's remittance markup on top; that markup pays for the remittance work, covers the partner's cost and absorbs the forex result of paying the vendor in instalments at different days' rates, and what is left is remittance earnings (NPL, 10 October).</p>
<p>The ledger therefore keeps three things apart. <b>The reseller books</b> are two postings per deal in the invoice currency, one per invoice, plus a claim on the remittance side. <b>The remittance deal</b> posts exactly like any client project, with NPL-GR as the client (holder PROJECT = the NPL-GR remittance project) and the resale invoice as the obligation the deal group pays. <b>The forex result</b> of each discharging line is a true-up between NPL-GR's USDT balance and NPL's pool, booked to VAR_FX_TIMING. The example uses NPL's own figures: a 9,000 EUR vendor invoice resold at 9,450 EUR, collected in THB, paid to the vendor in USDT in two instalments at ${Rq} and ${Rd2}. Both payout routes are shown: Ali pays the first instalment; the balance hops to NPL's own desk, which pays the second and the margin line.</p>
${L.html("T44")}${L.html("T45")}${L.html("T46")}${L.html("T47")}${L.html("T48")}${L.html("T49")}${L.html("T50")}${L.html("T51")}
${L.balancesHtml([["CO.NONE.EUR.RESELL_REVENUE", EUR, "resale invoice, untouched since issue"], ["CO.NONE.EUR.RESELL_COST", EUR, "vendor invoice, untouched since receipt"], ["CO.VENDOR_V.EUR.VENDOR_PAYABLE", EUR, "vendor settled"], ["CO.CUSTOMER_C.EUR.RESALE_RECEIVABLE", EUR, "customer paid"], ["CO.PROJECT.EUR.REMIT_CLAIM", EUR, "nothing held for NPL-GR"], ["CL.OWNDESK.USDT.DUE", USDT, "NPL-GR's balance at the own desk, fully paid out"], ["CO.OWNDESK.USDT.POOL", USDT, "the forex gains, resting at the own desk (the 143.66 USDT of earnings rest in NPL's pool at Ali, which this example's loss pattern also touched)"], ["CO.NONE.USDT.EARN_GROSS", USDT, "remittance earnings on the deal"], ["CO.NONE.USDT.VAR_FX_TIMING", USDT, "forex result (negative = gain)"], ["CO.NONE.EUR.FX_CLEARING", EUR, "NPL-GR's margin claim settled in USDT: the EUR leg"], ["CO.NONE.USDT.FX_CLEARING", USDT, "the USDT leg (negative = credit)"]], "Balances after the resale invoice is fully discharged", snapReseller)}
<p>Reseller revenue ${fmt(marginEur)} EUR, intact. Remittance margin on the deal ${fmt(remitMargin)} USDT = earnings ${fmt(DM.earnings)} + forex ${fmt(r2(fx2 + fx3))}, which is ${pct(remitMargin / mktValue)} of the market value of the THB collected. Bank fees on a vendor payment, a bounced vendor transfer, a loss event and a rebate from Ali post exactly as in the other patterns, with NPL-GR as the client. A loss on NPL-GR's funds is made good like any client's (Pattern L) and the client share, if any, is NPL-GR's.</p>

<h2 class="pb">19 · Identities and controls</h2>
<table><thead><tr><th>Identity</th><th>Statement</th></tr></thead><tbody>
${identities.map(([a, b]) => `<tr><td><b>${esc(a)}</b></td><td>${esc(b)}</td></tr>`).join("")}
</tbody></table>
<p>Month-end, Finance runs the identities above and reconciles three statements: each partner's statement of what it holds for NPL (POOL), each partner's rebate statement (REBATE_RECEIVABLE, NPLify deals only), and each markup-share party's statement (SHARE_RECEIVABLE / SHARE_PAYABLE). A difference is a true-up posting that names the statement line, never an edit.</p>

<h2>20 · Reports the ledger answers</h2>
<ul>
<li><b>Where the money is.</b> Client money by partner, in transit, in custody (CUSTODY view: reroutes, bridge, own desk), shortfalls and credits; NPL's money by partner (POOL) and wallet (WALLET), receivables and payables by counterparty.</li>
<li><b>Client position.</b> PROJECT_BALANCE per partner and GROUP_ENTITLEMENT per group, rolled up per client (CLIENT_POSITION) with the period's EARN_GROSS and EARN_REBATE; compared with the client's exposure ceiling as a REPORTING_VALUE.</li>
<li><b>Profit and loss, per currency.</b> EARN_GROSS (net of shares) + EARN_REBATE + RESELL_REVENUE − RESELL_COST − EXP_PARTNER − EXP_BANKFEE − EXP_NETWORK − EXP_ROUNDING − EXP_LOSS ± the four VAR_ accounts, by project, partner, pair and month, from the cost-component and source tags. A total across currencies is a REPORTING_VALUE with its rate and time.</li>
<li><b>Partner commissions.</b> Per partner and period: margin captured there, dues outstanding (EARNINGS_RECEIVABLE), rebates expected, reconciled and received (statement_ref).</li>
<li><b>Markup shares.</b> Per party and period: base, share, direction, settled and open amounts; a party never sees a rebate.</li>
<li><b>Variance and loss.</b> The four variance kinds by partner and month, each line traceable to its leg; loss events with their shares and recovery state.</li>
<li><b>Reseller and remittance margins, kept apart.</b> Per resale invoice: revenue, cost and game reseller revenue in EUR, intact. Per NPL-GR deal: remittance earnings, partner cost, forex result and fees in the converted currency. INVOICE_BALANCE per vendor and resale invoice.</li>
</ul>

<h2>21 · Transaction sources and what they post</h2>
<table><thead><tr><th>Source event</th><th>Posts to</th><th>Owner tags</th><th>Cost components</th></tr></thead><tbody>
<tr><td><span class="new">Invoice</span></td><td>RESELL_COST and VENDOR_PAYABLE (vendor invoice); RESALE_RECEIVABLE and RESELL_REVENUE (resale invoice)</td><td>company</td><td>resale</td></tr>
<tr><td>Collection</td><td>COLLECTED or HELD, PAYABLE, CREDIT; in NPL-GR also REMIT_CLAIM and RESALE_RECEIVABLE</td><td>client (and company)</td><td>principal, resale</td></tr>
<tr><td>Conversion (deal leg)</td><td>COLLECTED / PAYABLE in the in-currency; DUE, PAYABLE, POOL, EARN_GROSS, EXP_PARTNER, EXP_ROUNDING, SHARE_RECEIVABLE, a VAR_ account in the out-currency</td><td>client and company</td><td>principal, rounding, earnings, partner_cost, share, variance, cutoff_timing</td></tr>
<tr><td>BalanceConversion</td><td>DUE and PAYABLE in both currencies; POOL and EARN_GROSS if a markup is decided</td><td>client (and company)</td><td>principal, rounding, earnings</td></tr>
<tr><td>Settlement</td><td>INTRANSIT, DUE; EXP_BANKFEE and POOL when a fee is absorbed up front; EXP_NETWORK and WALLET on a hop. Each line names the leg it settles (deal_id) and, in NPL-GR, the invoice it discharges</td><td>client (and company)</td><td>principal, bank_fee, network_fee</td></tr>
<tr><td>SettlementReturn</td><td>DUE, INTRANSIT; EXP_BANKFEE and POOL for the bounce fee</td><td>client and company</td><td>principal, bank_fee</td></tr>
<tr><td>Confirmation</td><td>PAYABLE, INTRANSIT, SHORTFALL; a hop: COLLECTED or DUE at the partner; a line discharging an invoice: VENDOR_PAYABLE or REMIT_CLAIM, and the forex true-up PAYABLE / DUE / POOL / VAR_FX_TIMING</td><td>client and company</td><td>principal, bank_fee, resale, fx_timing</td></tr>
<tr><td>BankFeeEvent</td><td>EXP_BANKFEE, POOL, DUE, SHORTFALL</td><td>company and client</td><td>bank_fee</td></tr>
<tr><td>Reroute</td><td>HELD, COLLECTED at the alternate partner; WALLET and POOL for recovered dues; VAR_CONVERSION for basis variance</td><td>client and company</td><td>principal, earnings, variance</td></tr>
<tr><td>MarkupShare</td><td>EARN_GROSS, SHARE_PAYABLE or SHARE_RECEIVABLE; WALLET or POOL on settlement</td><td>company</td><td>share</td></tr>
<tr><td>Rebate</td><td>REBATE_RECEIVABLE, EARN_REBATE; WALLET on receipt</td><td>company</td><td>rebate</td></tr>
<tr><td>LossEvent</td><td>EXP_LOSS, POOL or WALLET (or LOSS_PAYABLE), COLLECTED / INTRANSIT / DUE (or MAKEGOOD); then LOSS_RECEIVABLE, PAYABLE for the recoveries</td><td>company and client</td><td>loss, principal</td></tr>
<tr><td>Adjustment</td><td>any, always as a reversal plus a correct re-posting, a Management-approved disposition, or a cross-currency clearing through FX_CLEARING</td><td>as reversed</td><td>as reversed</td></tr>
</tbody></table>

<h2>22 · Who sees what, and who may post</h2>
<p>Rights are rows, not text (D44): ${code("ROLE")} holds the three roles of today, operations, finance and management, and ${code("ROLE_RIGHT")} says per controlled action which role may initiate and which may approve, with the role added on escalation; the approver is never the initiator (invariant 9).</p>
<ul>
<li><b>Operations</b> (sees_economics false) sees operational fields, sender-facing prices and partner rates as entered, but never a ledger balance, a margin, a pool, a share, a rebate, a cost breakdown or a variance, on any screen, export, message or report.</li>
<li><b>Finance</b> sees all postings and balances, owns reconciliation and the month-end true-ups, initiates adjustments, balance conversions and dues recovery, recommends covered bank fees and fee caps (FEE_DECISION.recommended_by), approves honoured expired rates and quote-validity extensions, and overrides a screening reject.</li>
<li><b>Management</b> approves the actions the ledger patterns depend on: approve_loss_split, balance_conversion, recover_dues, cross_group_payout, cover_bank_fee, raise_fee_cap, enable_own_desk, settlements above limit and past the cutoff, own-wallet outbound transfers, and post-money voids. Every controlled action is audited with actor, time, reason and record version.</li>
</ul>

<h2>23 · What this design asks of the ERD (proposed D46)</h2>
<p>The patterns above need the following additions to Draft v${ERD_VERSION}. Each is small; none changes an existing posting. They are listed for NPL's agreement and will be cut into the next ERD edition together.</p>
<ol>
<li><b>Variance by kind.</b> ${code("LEDGER_ACCOUNT.purpose")}: VARIANCE replaced by VAR_CONVERSION, VAR_CUTOFF, VAR_RATE_HONOUR, VAR_FX_TIMING. Invariants 28 and 39 and decisions D24, D29, D45 then name the account they post to.</li>
<li><b>Loss first, recover later.</b> Purposes LOSS_RECEIVABLE (holder Partner or Sender), and the pair MAKEGOOD (client asset, holder Project) / LOSS_PAYABLE (company liability) for an unfunded make-good. A table ${code("LOSS_RECOVERY")} (loss_event_id, party kind sender / partner / client, amount, state agreed / received, received_at, reference, approved_by) as the source record of each recovery posting, under source LossEvent. ${code("COLLECTION.state")} reversed is used only when the deal is unwound. Invariant 16 restated: ownership moves between client and company at margin recognition, at the forex true-up of a line that discharges an invoice obligation (either way), and by partial reversal of a make-good when a Management-approved loss share is borne by the client.</li>
<li><b>Accrual timing.</b> ${code("MARKUP_SHARE_ACCRUAL")} and ${code("PARTNER_REBATE_ACCRUAL")} are created and posted by the conversion that gives rise to them (invariant 25 and 26 restated to say so); ${code("PARTNER_REBATE_RULE.payout_currency")} names the currency the partner pays in, in which the accrual is expressed (the amount basis for pct_of_amount, the conversion's own rate for pct_of_partner_fee).</li>
<li><b>Reseller project.</b> ${code("INVOICE.kind")} vendor / resale, with ${code("receiver_id")} for the vendor and ${code("sender_id")} for the customer of a resale invoice; ${code("DEAL_GROUP.invoice_id")} names the resale invoice the deal collects; ${code("SETTLEMENT_LINE.invoice_id")} names the invoice a line discharges (vendor invoice for a vendor line, resale invoice for the margin line), with ${code("obligation_discharged")} and ${code("discharge_rate")} as today; purposes RESELL_REVENUE, RESELL_COST, VENDOR_PAYABLE, RESALE_RECEIVABLE, REMIT_CLAIM; source Invoice; cost component resale; views ${code("RESELLER_MARGIN")}(resale invoice) = resale − vendor amount and ${code("REMITTANCE_MARGIN")}(deal) = earnings − partner cost ± fx timing − fees. D24's forex line is the true-up of T50 and T51; D23 stands: own-desk balances are ordinary partner-coded client accounts with the own-desk configuration as holder.</li>
<li><b>Cross-currency company settlements.</b> Purpose FX_CLEARING (holder None), used when a company balance in one currency is settled in another: a rebate, share or loss share paid in another currency, or NPL-GR's EUR claim paid to its wallet in USDT; its balances are NPL's open currency position, reported through REPORTING_VALUE and closed by a Finance adjustment when NPL converts.</li>
<li><b>Holder types.</b> ${code("LEDGER_ACCOUNT.holder_type")} keeps Sender for LOSS_RECEIVABLE and RESALE_RECEIVABLE and Receiver for VENDOR_PAYABLE; the own desk is a PARTNER_CONFIG, not a new type.</li>
</ol>
<p class="small"><i>Draft v${DOC_VERSION} — for review with NPL. Figures are worked examples, not NPL data, except the invoice amounts and instalment rates of Pattern M, which are NPL's.</i></p>
</body></html>`;

// ------------------------------------------------------------------ write + print
fs.mkdirSync(outDir, { recursive: true });
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const name = `NPLify-Ledger-Posting-Design-v${DOC_VERSION}`;
const h = path.join(outDir, name + ".html"), p = path.join(outDir, name + ".pdf");
fs.writeFileSync(h, html);
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "· transactions checked:", L.txs.length);
