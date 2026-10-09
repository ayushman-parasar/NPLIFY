// Build two client deliverables from the agreed model:
//   docs/NPLify-Ledger-Posting-Design-v1.1.pdf      (chart of accounts + worked postings)
//   docs/NPLify-Calculation-Specification-v1.0.pdf  (formulas + reference vectors)
// Every number in the worked examples is computed here; every transaction is checked to
// balance per currency before the document is written. node scripts/build-finance-docs.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "docs");
fs.mkdirSync(outDir, { recursive: true });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ------------------------------------------------------------------ money helpers (exact to the cent)
const cents = (x) => Math.round(x * 100 + (x >= 0 ? 1e-7 : -1e-7)); // amounts are held as integer cents
const r2 = (x) => cents(x) / 100;                                        // round half up to 2 dp
const rN = (x, dp) => Math.round(x * 10 ** dp + (x >= 0 ? 1e-9 : -1e-9)) / 10 ** dp; // round half up to dp decimals
const fmt = (x, dp = 2) => (Math.abs(x) < 0.005 ? "0.00" : x.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const pct = (p, dp = 2) => (p * 100).toFixed(dp) + " %";
const trunc = (x) => Math.floor(x + 1e-9);                                // whole-unit truncation (Q8)

// ------------------------------------------------------------------ chart of accounts
// code = OWNER.HOLDER.CCY.PURPOSE ; owner CL = client funds, CO = company (NPL)
const PURPOSES = [
  ["CL", "COLLECTED", "asset", "<PARTNER>", "Client money received at this partner, before conversion (in the collection currency)."],
  ["CL", "HELD", "asset", "OWN", "Client money in NPL's own wallet, only under an approved reroute. Must be zero otherwise."],
  ["CL", "DUE", "asset", "<PARTNER>", "Converted client money held at this partner, waiting to be paid out. One account per project × partner × currency: the client balance per partner."],
  ["CL", "INTRANSIT", "asset", "<PARTNER>", "Client money released by this partner and not yet confirmed by the receiver."],
  ["CL", "SHORTFALL", "asset", "<RECEIVER>", "Client money delivered short to a receiver and still to be made good on the next settlement."],
  ["CL", "PAYABLE", "liability", "PROJECT", "What is owed to the client's receivers, in total per currency. The split by receiver group is the GROUP_ENTITLEMENT view, not an account."],
  ["CL", "CREDIT", "liability", "<SENDER>", "Owed back to a sender: an overpayment, or a refund waiting to be paid."],
  ["CO", "POOL", "asset", "<PARTNER>", "NPL's earnings resting at this partner (the FRS \"PT Comms\"). Settled on the partner's fee cycle or netted on a reroute."],
  ["CO", "WALLET", "asset", "OWN", "NPL's own money in its wallet, for example dues recovered on a reroute."],
  ["CO", "REBATE_RECEIVABLE", "asset", "<PARTNER>", "Rebate a partner owes NPL on its fees, reconciled monthly."],
  ["CO", "REFERRAL_PAYABLE", "liability", "<INTRODUCER>", "Referral commission owed to an introducer."],
  ["CO", "EARN_GROSS", "income", "NONE", "Gross margin recognised at conversion. Referral commissions are booked against it, so the balance is NPL's margin after referrals."],
  ["CO", "EXP_PARTNER", "expense", "NONE", "Partner cost where the partner states it separately (market + x %). Rebates received are credited here."],
  ["CO", "EXP_BANKFEE", "expense", "NONE", "Bank or payout fees NPL absorbs, including gross-ups and shortfall top-ups."],
  ["CO", "EXP_NETWORK", "expense", "NONE", "Crypto network fees NPL absorbs, for example on a refund."],
  ["CO", "VARIANCE", "expense", "NONE", "Difference between the engine's expected conversion and what the partner actually did, and basis variance on a reroute. Can be a gain or a loss."],
];
const KIND = Object.fromEntries(PURPOSES.map((p) => [p[1], p[2]]));

// ------------------------------------------------------------------ posting engine
class Ledger {
  constructor() { this.bal = new Map(); this.txs = []; }
  tx(title, source, rows, note) {
    // rows: [account, side, amount, ccy, ownership, component, why]; a zero row (e.g. no rounding residual) is simply not posted
    rows = rows.filter((r) => cents(r[2]) !== 0);
    const sums = {};
    for (const [acct, side, amt, ccy] of rows) {
      if (amt <= 0) throw new Error(`non-positive amount in ${title}: ${acct} ${amt}`);
      sums[ccy] = (sums[ccy] ?? 0) + (side === "Dr" ? cents(amt) : -cents(amt));
      const purpose = acct.split(".").pop();
      if (!KIND[purpose]) throw new Error(`unknown purpose ${purpose} in ${title}`);
      const k = `${acct}|${ccy}`;
      // debit-normal for asset/expense, credit-normal for liability/income
      const sign = (KIND[purpose] === "asset" || KIND[purpose] === "expense") === (side === "Dr") ? 1 : -1;
      this.bal.set(k, (this.bal.get(k) ?? 0) + sign * cents(amt));
    }
    for (const [ccy, s] of Object.entries(sums)) if (s !== 0) throw new Error(`UNBALANCED ${title} in ${ccy}: ${s} cents`);
    this.txs.push({ title, source, rows, note });
    return this;
  }
  balance(acct, ccy, snap) { return ((snap ?? this.bal).get(`${acct}|${ccy}`) ?? 0) / 100; }
  snapshot() { return new Map(this.bal); }
  find(key) { const t = this.txs.findIndex((x) => x.title.startsWith(key + " ·")); if (t < 0) throw new Error("no transaction " + key); return t; }
  html(key) {
    const t = this.txs[this.find(key)];
    return `<div class="tx"><div class="txh"><b>${esc(t.title)}</b> <span class="src">source: ${esc(t.source)}</span></div>
<table class="post"><thead><tr><th>Account</th><th class="n">Debit</th><th class="n">Credit</th><th>Ccy</th><th>Owner</th><th>Cost component</th><th>Why</th></tr></thead><tbody>
${t.rows.map(([a, s, amt, c, o, comp, why]) => `<tr><td class="mono">${esc(a)}</td><td class="n">${s === "Dr" ? fmt(amt) : ""}</td><td class="n">${s === "Cr" ? fmt(amt) : ""}</td><td>${c}</td><td>${o}</td><td>${comp}</td><td>${esc(why)}</td></tr>`).join("")}
</tbody></table>${t.note ? `<p class="txnote">${t.note}</p>` : ""}</div>`;
  }
  balancesHtml(list, caption, snap) {
    return `<table class="bal"><caption>${esc(caption)}</caption><thead><tr><th>Account</th><th>Ccy</th><th class="n">Balance</th><th>Meaning</th></tr></thead><tbody>
${list.map(([a, c, why]) => `<tr><td class="mono">${esc(a)}</td><td>${c}</td><td class="n">${fmt(this.balance(a, c, snap))}</td><td>${esc(why)}</td></tr>`).join("")}</tbody></table>`;
  }
}

// ------------------------------------------------------------------ the calculation model (shared by both documents)
// All rates are OUT units per 1 IN unit. Shares s (sender) and r (receiver) add up to the fee pct f.
function price({ amountIn, Rm, Rp, basis, s, r, partnerMarkup = 0, dp = 2 }) {
  const r2 = (x) => rN(x, dp);
  const Rb = basis === "market" ? Rm : Rp;
  const Rs = Rb * (1 - s);                                   // sender rate, embeds the sender share
  const grossOut = r2(amountIn * Rs);                         // promised before the receiver share
  const feeReceiver = r2(grossOut * r);
  const clientNet = r2(grossOut - feeReceiver);               // entitlement of the receiver group
  const feeSender = r2(amountIn * Rb - grossOut);             // sender share, in OUT currency
  // what the partner delivers
  const grossConverted = r2(amountIn * (partnerMarkup ? Rm : Rp)); // market_plus partners convert at market, then charge
  const partnerCost = partnerMarkup ? r2(grossConverted * partnerMarkup) : 0;
  const actualOut = r2(grossConverted - partnerCost);
  const grossMargin = r2(grossConverted - clientNet);         // = partner cost + NPL earnings
  const earnings = r2(actualOut - clientNet);
  const payable = trunc(clientNet);                           // whole units go out
  const residual = r2(clientNet - payable);
  const inferredPartnerCost = partnerMarkup ? partnerCost : r2(amountIn * (Rm - Rp)); // disclosed-rate partners: informational
  return { Rb, Rs, grossOut, feeReceiver, clientNet, feeSender, grossConverted, partnerCost, actualOut, grossMargin, earnings, payable, residual, inferredPartnerCost, marginPct: earnings / actualOut };
}
function targetOutAmountIn({ targetOut, Rm, Rp, basis, s, r }) {
  const Rb = basis === "market" ? Rm : Rp;
  return targetOut / (Rb * (1 - s) * (1 - r));
}
function variableFee({ Rm, Rp, basis, minMargin, floor, cap }) {
  const spread = 1 - Rp / Rm;                                  // what the partner keeps relative to market
  const required = minMargin + (basis === "market" ? spread : 0);
  const f = Math.min(cap, Math.max(floor, required));
  return { spread, required, f, belowMargin: f < required - 1e-12 };
}
function breach({ Rm, Rp, avg2w, varianceThresholdRel }) {
  const spread = 1 - Rp / Rm;
  const limit = avg2w * (1 + varianceThresholdRel);
  return { spread, limit, breached: spread > limit + 1e-12 };
}

// ------------------------------------------------------------------ worked example parameters
const EX = {
  project: "Evo", sender: "Sender A", group: "Group A (default)", receiver: "Receiver X", entity: "Entity X1 · EUR via SEPA",
  pt: { code: "PT", name: "Ali (PT Sukses)", pricing: "disclosed rate (markup inside the rate)" },
  jt: { code: "JETON", name: "Jeton", pricing: "market + 0.50 % (markup stated separately)", markup: 0.005 },
  Rm: 0.9000, Rp: 0.8950, s: 0.004, r: 0.006,
};
const D1 = price({ amountIn: 10000, Rm: EX.Rm, Rp: EX.Rp, basis: "partner", s: EX.s, r: EX.r });              // deal 1 at PT
const D2 = price({ amountIn: 5000, Rm: EX.Rm, Rp: EX.Rp, basis: "partner", s: EX.s, r: EX.r });               // deal 2 at PT
const DJ = price({ amountIn: 10000, Rm: EX.Rm, Rp: EX.Rm, basis: "market", s: EX.s, r: EX.r, partnerMarkup: EX.jt.markup }); // Jeton, market_plus

// ------------------------------------------------------------------ build the ledger examples
const L = new Ledger();
const P = (p) => `CL.${p}.`; // helper for client accounts at a partner
const EUR = "EUR", USDT = "USDT";
const CLIENT = "client", CO = "company";

// Pattern 1: direct collection, conversion, accumulation (deal 1, collect-first, 10,000 USDT at PT)
L.tx("T1 · Collection of deal 1: 10,000 USDT arrive at PT-tour's USDT wallet endpoint (COLLECTION_RECEIVING_ENDPOINT, kind wallet)", "Collection", [
  [`CL.PT.USDT.COLLECTED`, "Dr", 10000, USDT, CLIENT, "principal", "client money now sits at PT, unconverted; the account is per partner, the endpoint only says which vehicle's wallet"],
  [`CL.PROJECT.USDT.PAYABLE`, "Cr", 10000, USDT, CLIENT, "principal", "NPL owes this onward on the client's behalf"],
]);
L.tx("T2 · Conversion of deal 1 at PT: 10,000 USDT → 8,950.00 EUR at 0.8950", "Conversion", [
  [`CL.PROJECT.USDT.PAYABLE`, "Dr", 10000, USDT, CLIENT, "principal", "the USDT obligation is settled by the conversion"],
  [`CL.PT.USDT.COLLECTED`, "Cr", 10000, USDT, CLIENT, "principal", "the USDT left the collected position"],
  [`CL.PT.EUR.DUE`, "Dr", D1.payable, EUR, CLIENT, "principal", "client net in whole euros, waiting to be paid"],
  [`CL.PT.EUR.DUE`, "Dr", D1.residual, EUR, CLIENT, "rounding", "the cents below one euro stay client money (Q8)"],
  [`CO.PT.EUR.POOL`, "Dr", D1.earnings, EUR, CO, "earnings", "NPL's margin, physically still at PT"],
  [`CL.PROJECT.EUR.PAYABLE`, "Cr", D1.clientNet, EUR, CLIENT, "principal", "owed to the receiver group, now in EUR"],
  [`CO.NONE.EUR.EARN_GROSS`, "Cr", D1.earnings, EUR, CO, "earnings", "margin recognised: the only client → company event"],
], `Ownership changes here and only here: ${fmt(D1.earnings)} EUR becomes company money. The partner's own cost is inside its rate (disclosed rate), so no partner-cost posting is needed; the inferred cost against market is ${fmt(D1.inferredPartnerCost)} EUR and is kept as information only.`);

const snapDeal1 = L.snapshot();

// Pattern 2: part collection (deal 2: 4,000 + 1,000 USDT), conversion once complete
L.tx("T3 · Collection of deal 2, part 1 of 2: 4,000 USDT", "Collection", [
  [`CL.PT.USDT.COLLECTED`, "Dr", 4000, USDT, CLIENT, "principal", "first part"],
  [`CL.PROJECT.USDT.PAYABLE`, "Cr", 4000, USDT, CLIENT, "principal", ""],
]);
L.tx("T4 · Collection of deal 2, part 2 of 2: 1,000 USDT (next day)", "Collection", [
  [`CL.PT.USDT.COLLECTED`, "Dr", 1000, USDT, CLIENT, "principal", "second part completes the deal"],
  [`CL.PROJECT.USDT.PAYABLE`, "Cr", 1000, USDT, CLIENT, "principal", ""],
]);
L.tx("T5 · Conversion of deal 2 at PT: 5,000 USDT → 4,475.00 EUR", "Conversion", [
  [`CL.PROJECT.USDT.PAYABLE`, "Dr", 5000, USDT, CLIENT, "principal", ""],
  [`CL.PT.USDT.COLLECTED`, "Cr", 5000, USDT, CLIENT, "principal", ""],
  [`CL.PT.EUR.DUE`, "Dr", D2.payable, EUR, CLIENT, "principal", ""],
  [`CL.PT.EUR.DUE`, "Dr", D2.residual, EUR, CLIENT, "rounding", ""],
  [`CO.PT.EUR.POOL`, "Dr", D2.earnings, EUR, CO, "earnings", ""],
  [`CL.PROJECT.EUR.PAYABLE`, "Cr", D2.clientNet, EUR, CLIENT, "principal", ""],
  [`CO.NONE.EUR.EARN_GROSS`, "Cr", D2.earnings, EUR, CO, "earnings", ""],
], "Parts are posted as they arrive; the conversion is one transaction once the deal is fully collected.");

// Pattern 6/7: accumulated settlement, two lines to the same group, whole units only
const dueTotal = D1.payable + D1.residual + D2.payable + D2.residual; // client EUR at PT
const dueWhole = trunc(dueTotal);
const dust = r2(dueTotal - dueWhole);
const line1 = 9000, line2 = dueWhole - 9000;
L.tx(`T6 · Disbursement from PT: ${fmt(dueWhole)} EUR in two lines (Entity X1 ${fmt(line1)}, Entity X2 ${fmt(line2)})`, "Disbursement", [
  [`CL.PT.EUR.INTRANSIT`, "Dr", line1, EUR, CLIENT, "principal", "line 1 released by PT"],
  [`CL.PT.EUR.INTRANSIT`, "Dr", line2, EUR, CLIENT, "principal", "line 2 released by PT"],
  [`CL.PT.EUR.DUE`, "Cr", dueWhole, EUR, CLIENT, "principal", `whole euros leave DUE; ${fmt(dust)} EUR of rounding dust stays`],
], `Disburse to less than one unit: the client balance at PT drops from ${fmt(dueTotal)} to ${fmt(dust)} EUR. Both lines pay entities of the same receiver and each line names the leg it settles in deal_id (deals 1 and 2), so no offset arises.`);
L.tx(`T7 · Confirmation, line 1 full: Entity X1 received ${fmt(line1)} EUR`, "Confirmation", [
  [`CL.PROJECT.EUR.PAYABLE`, "Dr", line1, EUR, CLIENT, "principal", "the obligation is discharged"],
  [`CL.PT.EUR.INTRANSIT`, "Cr", line1, EUR, CLIENT, "principal", "the money reached the receiver"],
]);
// bank fee treatments on line 2: carry-forward example
const bankFee = 50;
L.tx(`T8 · Confirmation, line 2 short: ReferScout received ${fmt(line2 - bankFee)} EUR, bank took ${fmt(bankFee)} (treatment carry_forward)`, "Confirmation", [
  [`CL.PROJECT.EUR.PAYABLE`, "Dr", line2 - bankFee, EUR, CLIENT, "principal", "delivered part"],
  [`CL.SUD.EUR.SHORTFALL`, "Dr", bankFee, EUR, CLIENT, "bank_fee", "still owed to the receiver, topped up next settlement"],
  [`CL.PT.EUR.INTRANSIT`, "Cr", line2, EUR, CLIENT, "principal", "nothing is left in transit"],
], "With treatment <i>waived</i> the second line would instead be <code>Dr CL.PROJECT.EUR.PAYABLE 50</code> (the client bears the fee and its claim falls by 50). With <i>absorbed</i> the fee is expected up front: see T9.");
L.tx("T9 · Shortfall top-up funded from NPL's pool at PT (BANK_FEE_EVENT applied to the next disbursement)", "BankFeeEvent", [
  [`CO.NONE.EUR.EXP_BANKFEE`, "Dr", bankFee, EUR, CO, "bank_fee", "NPL bears the cost"],
  [`CO.PT.EUR.POOL`, "Cr", bankFee, EUR, CO, "bank_fee", "paid out of NPL's earnings resting at PT"],
  [`CL.PT.EUR.DUE`, "Dr", bankFee, EUR, CLIENT, "bank_fee", "the 50 EUR is client money again, in balance at PT"],
  [`CL.SUD.EUR.SHORTFALL`, "Cr", bankFee, EUR, CLIENT, "bank_fee", "the shortfall is cleared"],
], "The 50 EUR now sits in DUE and goes out with the next disbursement like any other balance. Company → client transfers like this one are the only way company money becomes client money.");

const snapSettled = L.snapshot();

// Pattern 3: reroute via own wallet with recover dues (deal 3 at Jeton, market_plus)
const recover = 30;
L.tx("T10 · Deal 3, PT unavailable: 10,000 USDT collected into NPL's own wallet under an approved reroute", "Collection", [
  [`CL.OWN.USDT.HELD`, "Dr", 10000, USDT, CLIENT, "principal", "client money in custody, with deal, reason and age"],
  [`CL.PROJECT.USDT.PAYABLE`, "Cr", 10000, USDT, CLIENT, "principal", ""],
], "Only an approved REROUTE may debit CL.OWN.*.HELD (invariant 3). The custody aging view shows this balance until it is forwarded.");
L.tx(`T11 · Forward to Jeton with recover dues: 10,000 USDT of client money credited at Jeton, ${fmt(recover)} USDT of NPL's dues netted`, "Reroute", [
  [`CL.JETON.USDT.COLLECTED`, "Dr", 10000, USDT, CLIENT, "principal", "Jeton credits the full client amount"],
  [`CL.OWN.USDT.HELD`, "Cr", 10000, USDT, CLIENT, "principal", "custody ends"],
  [`CO.OWN.USDT.WALLET`, "Dr", recover, USDT, CO, "earnings", "NPL keeps 30 USDT in its wallet instead of sending it"],
  [`CO.JETON.USDT.POOL`, "Cr", recover, USDT, CO, "earnings", "Jeton's debt to NPL falls by the same 30 USDT"],
], `NPL physically sends ${fmt(10000 - recover)} USDT; Jeton agrees to treat it as 10,000 of client money because it owed NPL ${fmt(recover)} USDT of earnings from earlier deals. The recovery is an asset swap (receivable → cash), never income, and every deduction names the deal it recovers. <b>No earnings are withheld from the client amount:</b> NPL's margin is captured when Jeton converts (T12).`);
L.tx(`T12 · Conversion of deal 3 at Jeton (market + 0.50 %): 10,000 USDT → ${fmt(DJ.grossConverted)} EUR at market, Jeton keeps ${fmt(DJ.partnerCost)}`, "Conversion", [
  [`CL.PROJECT.USDT.PAYABLE`, "Dr", 10000, USDT, CLIENT, "principal", ""],
  [`CL.JETON.USDT.COLLECTED`, "Cr", 10000, USDT, CLIENT, "principal", ""],
  [`CL.JETON.EUR.DUE`, "Dr", DJ.payable, EUR, CLIENT, "principal", "client net, whole euros"],
  [`CL.JETON.EUR.DUE`, "Dr", DJ.residual, EUR, CLIENT, "rounding", ""],
  [`CO.JETON.EUR.POOL`, "Dr", DJ.earnings, EUR, CO, "earnings", "NPL's net margin resting at Jeton"],
  [`CO.NONE.EUR.EXP_PARTNER`, "Dr", DJ.partnerCost, EUR, CO, "partner_cost", "Jeton's stated fee, deducted at transaction level"],
  [`CL.PROJECT.EUR.PAYABLE`, "Cr", DJ.clientNet, EUR, CLIENT, "principal", ""],
  [`CO.NONE.EUR.EARN_GROSS`, "Cr", DJ.grossMargin, EUR, CO, "earnings", "gross margin before partner cost"],
], `Total cost to the client = partner cost ${fmt(DJ.partnerCost)} + NPL earnings ${fmt(DJ.earnings)} = ${fmt(DJ.grossMargin)} EUR, the gross margin. For a disclosed-rate partner (T2) the partner cost is inside the rate and no EXP_PARTNER line exists.`);

const snapDeal3 = L.snapshot();

// Pattern 4: cancellation / reversal
L.tx("T13 · Erroneous posting: a collection of 2,000 USDT was booked against the wrong deal (as posted)", "Collection", [
  [`CL.PT.USDT.COLLECTED`, "Dr", 2000, USDT, CLIENT, "principal", "booked in error"],
  [`CL.PROJECT.USDT.PAYABLE`, "Cr", 2000, USDT, CLIENT, "principal", ""],
]);
L.tx("T14 · Reversal of T13 (LEDGER_TRANSACTION.reversal_of_id = T13), then T13 is re-posted correctly", "Adjustment", [
  [`CL.PROJECT.USDT.PAYABLE`, "Dr", 2000, USDT, CLIENT, "principal", "mirror image of T13"],
  [`CL.PT.USDT.COLLECTED`, "Cr", 2000, USDT, CLIENT, "principal", ""],
], "Nothing is edited or deleted: the wrong transaction stays, the reversal points at it, and the correct transaction follows. Any report at any past moment still adds up.");
const netFee = 2;
L.tx("T15a · Collection of deal 5: 3,000 USDT arrive at PT (later voided)", "Collection", [
  [`CL.PT.USDT.COLLECTED`, "Dr", 3000, USDT, CLIENT, "principal", ""],
  [`CL.PROJECT.USDT.PAYABLE`, "Cr", 3000, USDT, CLIENT, "principal", ""],
]);
L.tx(`T15 · Deal voided after collection, refund to the sender in USDT; network fee ${fmt(netFee)} USDT charged back to the sender (project policy)`, "Adjustment", [
  [`CL.PROJECT.USDT.PAYABLE`, "Dr", 3000, USDT, CLIENT, "principal", "the obligation ends"],
  [`CL.PT.USDT.COLLECTED`, "Cr", 3000 - netFee, USDT, CLIENT, "principal", "returned to the sender's wallet"],
  [`CL.PT.USDT.COLLECTED`, "Cr", netFee, USDT, CLIENT, "network_fee", "paid to the network; the sender bears it"],
], `If the project policy (or a FEE_DECISION for this transaction) says NPL absorbs the fee, the last line becomes <code>Dr CO.NONE.USDT.EXP_NETWORK ${fmt(netFee)} / Cr CO.PT.USDT.POOL ${fmt(netFee)}</code> and the sender receives the full 3,000. Management approves the disposition of any post-money void.`);
// to keep the ledger coherent, pre-post the 3,000 collection silently before T15 in the balances: emulate by posting it as T15a before. Simpler: insert a collection tx before T15 in order.

// Pattern: rejected payout and return leg (deal 4 at PT: 2,000 USDT → GBP)
const D4 = price({ amountIn: 2000, Rm: 0.7800, Rp: 0.7750, basis: "partner", s: EX.s, r: EX.r });
L.tx("T16 · Deal 4 collected and converted at PT: 2,000 USDT → 1,550.00 GBP (collection and conversion shown together)", "Conversion", [
  [`CL.PT.USDT.COLLECTED`, "Dr", 2000, USDT, CLIENT, "principal", "collection"],
  [`CL.PROJECT.USDT.PAYABLE`, "Cr", 2000, USDT, CLIENT, "principal", "collection"],
  [`CL.PROJECT.USDT.PAYABLE`, "Dr", 2000, USDT, CLIENT, "principal", "conversion, USDT leg"],
  [`CL.PT.USDT.COLLECTED`, "Cr", 2000, USDT, CLIENT, "principal", "conversion, USDT leg"],
  [`CL.PT.GBP.DUE`, "Dr", D4.payable, "GBP", CLIENT, "principal", ""],
  [`CL.PT.GBP.DUE`, "Dr", D4.residual, "GBP", CLIENT, "rounding", ""],
  [`CO.PT.GBP.POOL`, "Dr", D4.earnings, "GBP", CO, "earnings", ""],
  [`CL.PROJECT.GBP.PAYABLE`, "Cr", D4.clientNet, "GBP", CLIENT, "principal", ""],
  [`CO.NONE.GBP.EARN_GROSS`, "Cr", D4.earnings, "GBP", CO, "earnings", ""],
]);
L.tx(`T17 · Disbursement of deal 4: ${fmt(D4.payable)} GBP released to the receiver's bank (the line names deal 4 in deal_id)`, "Disbursement", [
  [`CL.PT.GBP.INTRANSIT`, "Dr", D4.payable, "GBP", CLIENT, "principal", ""],
  [`CL.PT.GBP.DUE`, "Cr", D4.payable, "GBP", CLIENT, "principal", ""],
]);
const bounce = 15;
L.tx(`T18 · The receiving bank rejects the transfer: ${fmt(D4.payable - bounce)} GBP come back to PT, the bank kept ${fmt(bounce)} (DISBURSEMENT_RETURN; line outcome = returned)`, "DisbursementReturn", [
  [`CL.PT.GBP.DUE`, "Dr", D4.payable - bounce, "GBP", CLIENT, "principal", "back in the client balance at PT"],
  [`CO.NONE.GBP.EXP_BANKFEE`, "Dr", bounce, "GBP", CO, "bank_fee", "bounce fee absorbed by NPL (treatment absorbed)"],
  [`CL.PT.GBP.INTRANSIT`, "Cr", D4.payable, "GBP", CLIENT, "principal", "nothing is in transit any more"],
  [`CL.PT.GBP.DUE`, "Dr", bounce, "GBP", CLIENT, "bank_fee", "NPL makes the client whole"],
  [`CO.PT.GBP.POOL`, "Cr", bounce, "GBP", CO, "bank_fee", "funded from NPL's pool at PT"],
], "The failed line is reversed before anything else happens, so the entitlement of Group A — the group deal 4 is attributed to — is restored. The money can now stay in balance for a later payout (option B) or fund a return leg (option A, T19).");
const Rret = 1.2850; // USDT per GBP on the return conversion
const retIn = D4.payable; // GBP available to convert back (whole units)
const retOut = r2(retIn * Rret);
L.tx(`T19 · Return leg: ${fmt(retIn)} GBP converted back to ${fmt(retOut)} USDT at PT (rate ${Rret}); markup waived by FEE_DECISION`, "Conversion", [
  [`CL.PROJECT.GBP.PAYABLE`, "Dr", retIn, "GBP", CLIENT, "principal", "GBP obligation ends"],
  [`CL.PT.GBP.DUE`, "Cr", retIn, "GBP", CLIENT, "principal", ""],
  [`CL.PT.USDT.DUE`, "Dr", retOut, USDT, CLIENT, "principal", "USDT owed to the sender's return receiver"],
  [`CL.PROJECT.USDT.PAYABLE`, "Cr", retOut, USDT, CLIENT, "principal", ""],
], `NPL's margin from T16 (${fmt(D4.earnings)} GBP) stays in the pool: it was captured at the first conversion and is never at risk from a return. The round trip's rate loss falls on the client's funds. Had the FEE_DECISION applied a markup, part of the ${fmt(retOut)} USDT would have been posted to CO.PT.USDT.POOL and EARN_GROSS exactly as in T2. The return leg inherits Group A from its parent leg (ERD D13), so this conversion and the payout that follows are attributed to Group A: no entitlement moves between groups. The payout of ${fmt(retOut)} USDT to the sender's return receiver then follows T17 and T7; that receiver has no group, so the payout line carries deal_id = the return leg (ERD D17), which is how GROUP_ENTITLEMENT knows which group it debits.`);

// Balance conversion: 5,000 SGD → USDT at PT for group B
const RsgdUsdt = 0.7400;
const bcOut = r2(5000 * RsgdUsdt);
const bcWhole = trunc(bcOut), bcDust = r2(bcOut - bcWhole);
L.tx("T20a · Opening position: 5,000 SGD of converted client balance at PT from earlier deals (summarised)", "Conversion", [
  [`CL.PT.SGD.DUE`, "Dr", 5000, "SGD", CLIENT, "principal", "balance built up by earlier SGD deals"],
  [`CL.PROJECT.SGD.PAYABLE`, "Cr", 5000, "SGD", CLIENT, "principal", ""],
]);
L.tx("T20 · Balance conversion at PT: 5,000 SGD of client balance → USDT at 0.7400, no markup (serves Group B)", "BalanceConversion", [
  [`CL.PROJECT.SGD.PAYABLE`, "Dr", 5000, "SGD", CLIENT, "principal", "SGD obligation ends"],
  [`CL.PT.SGD.DUE`, "Cr", 5000, "SGD", CLIENT, "principal", "SGD balance leaves"],
  [`CL.PT.USDT.DUE`, "Dr", bcWhole, USDT, CLIENT, "principal", "USDT balance arrives, whole units"],
  [`CL.PT.USDT.DUE`, "Dr", bcDust, USDT, CLIENT, "rounding", ""],
  [`CL.PROJECT.USDT.PAYABLE`, "Cr", bcOut, USDT, CLIENT, "principal", "same obligation, new currency"],
], "No sender, receiver or collection: Finance requests, Management approves. ENTITLEMENT_REATTRIBUTION moves Group B's SGD entitlement into USDT; if Group B held less than 5,000 SGD of entitlement, the excess is another group's flow and is booked as an approved offset.");

// Referral commission and partner rebate on deal 3 (Jeton)
const refShare = 0.25, referral = r2(DJ.earnings * refShare);
L.tx(`T21 · Referral commission on deal 3: introducer John is owed ${pct(refShare, 0)} of NPL's earnings = ${fmt(referral)} EUR`, "Referral", [
  [`CO.NONE.EUR.EARN_GROSS`, "Dr", referral, EUR, CO, "referral", "reduces NPL's margin"],
  [`CO.JOHN.EUR.REFERRAL_PAYABLE`, "Cr", referral, EUR, CO, "referral", "owed to the introducer"],
], "A fixed-percentage introducer (1 % of the transaction inside the sender-facing markup) is priced into the sender rate instead; the posting is the same shape with the amount from the calculation specification.");
const rebate = r2(DJ.partnerCost * 0.32);
L.tx(`T22 · Partner rebate on deal 3: Jeton returns 32 % of its fee = ${fmt(rebate)} EUR (reconciled monthly)`, "Rebate", [
  [`CO.JETON.EUR.REBATE_RECEIVABLE`, "Dr", rebate, EUR, CO, "partner_cost", "expected from Jeton"],
  [`CO.NONE.EUR.EXP_PARTNER`, "Cr", rebate, EUR, CO, "partner_cost", "net partner cost falls"],
], "When Jeton pays (usually in crypto) the receivable is cleared against NPL's wallet or pool.");

// Sender credit (overpayment)
L.tx("T23 · Overpayment: a sender sends 10,050 USDT against a 10,000 USDT deal; 50 USDT becomes sender credit", "Collection", [
  [`CL.PT.USDT.COLLECTED`, "Dr", 10050, USDT, CLIENT, "principal", "all of it is client money at PT"],
  [`CL.PROJECT.USDT.PAYABLE`, "Cr", 10000, USDT, CLIENT, "principal", "the deal"],
  [`CL.AYUSH.USDT.CREDIT`, "Cr", 50, USDT, CLIENT, "principal", "owed back to the sender, or applied to the next deal"],
]);

// Variance: partner_calculates
const expected = r2(3000 * 0.8950), actual = r2(3000 * 0.8945), variance = r2(expected - actual);
L.tx(`T24 · Conversion where the partner calculates: expected ${fmt(expected)} EUR, partner booked ${fmt(actual)} EUR; variance ${fmt(variance)} EUR`, "Conversion", [
  [`CL.PROJECT.USDT.PAYABLE`, "Dr", 3000, USDT, CLIENT, "principal", ""],
  [`CL.PT.USDT.COLLECTED`, "Cr", 3000, USDT, CLIENT, "principal", ""],
  [`CL.PT.EUR.DUE`, "Dr", 2658, EUR, CLIENT, "principal", "client net is unchanged: the sender's price is fixed"],
  [`CL.PT.EUR.DUE`, "Dr", r2(2658.21 - 2658), EUR, CLIENT, "rounding", ""],
  [`CO.PT.EUR.POOL`, "Dr", r2(actual - 2658.21), EUR, CO, "earnings", "margin actually left at PT"],
  [`CO.NONE.EUR.VARIANCE`, "Dr", variance, EUR, CO, "variance", "what the partner did worse than expected"],
  [`CL.PROJECT.EUR.PAYABLE`, "Cr", 2658.21, EUR, CLIENT, "principal", ""],
  [`CO.NONE.EUR.EARN_GROSS`, "Cr", r2(expected - 2658.21), EUR, CO, "earnings", "margin as priced"],
], "The sender's stamped price fixes the client net, so a partner that converts worse than expected costs NPL, not the client. An exception opens when the variance is beyond the project's tolerance; the deal does not wait.");

// Pre-posted collection for T15 (3,000) and SGD balance for T20 are assumptions; note them in the text rather than in balances.

const identities = [
  ["Client due per partner = Σ group entitlements", "For each currency: client assets equal client liabilities, Σ COLLECTED + Σ HELD + Σ DUE + Σ INTRANSIT + Σ SHORTFALL = CL.PROJECT.<CCY>.PAYABLE + Σ CREDIT; and PAYABLE = Σ GROUP_ENTITLEMENT (ERD invariant 7). Since ERD v5.2 every payout line resolves to one group — the paid receiver's for a counterparty, the paying leg's via the line's deal_id for a refund or hop — so the identity is checked line by line, not only in total."],
  ["Pool per partner = partner-stated comms balance ± logged difference", "CO.<PARTNER>.<CCY>.POOL agrees to the partner's statement of what it holds for NPL."],
  ["Exposure ≤ policy", "Σ DUE + Σ INTRANSIT at a partner is within the project's exposure ceiling; under disburse_policy to_zero, DUE after each release is below one unit."],
  ["Own-wallet holdings = 0 unless an open reroute", "CL.OWN.<CCY>.HELD is zero except for rows the custody aging view can name (deal, reason, age)."],
  ["Each confirmation = its in-transit amount exactly", "Confirmed + shortfall + fees booked = the amount released."],
  ["Ownership flips once", "The only client → company postings are EARN_GROSS recognitions at conversion. Company → client postings exist only for fees NPL absorbs."],
  ["Every balance shown is a sum", "No screen or report shows a stored figure; all are sums over postings or deals (ERD invariant 10)."],
];

// ------------------------------------------------------------------ calculation specification: reference vectors
const vectors = [
  { name: "V1 · Collect-first, disclosed-rate partner (deal 1 in the ledger document)", in: { amountIn: 10000, Rm: 0.9, Rp: 0.895, basis: "partner", s: 0.004, r: 0.006 } },
  { name: "V2 · Same deal priced on market basis", in: { amountIn: 10000, Rm: 0.9, Rp: 0.895, basis: "market", s: 0.004, r: 0.006 } },
  { name: "V3 · market + 0.50 % partner, market basis (deal 3 in the ledger document)", in: { amountIn: 10000, Rm: 0.9, Rp: 0.9, basis: "market", s: 0.004, r: 0.006, partnerMarkup: 0.005 } },
  { name: "V4 · All fee on the sender side (FRS style), 1 : 1 rate", in: { amountIn: 1004.02, Rm: 1, Rp: 1, basis: "market", s: 0.004, r: 0 } },
  { name: "V5 · Receiver share only", in: { amountIn: 10000, Rm: 0.9, Rp: 0.895, basis: "partner", s: 0, r: 0.006 } },
  { name: "V6 · Sub-unit pair, 8 dp rate (USDT → BTC)", in: { amountIn: 10000, Rm: 0.00001532, Rp: 0.00001525, basis: "partner", s: 0.004, r: 0.006, dp: 8 } },
].map((v) => ({ ...v, out: price(v.in) }));
const vFmt = (x, ccyDp = 2) => fmt(x, ccyDp);
const tgt = targetOutAmountIn({ targetOut: 1000, Rm: 1, Rp: 1, basis: "market", s: 0.004, r: 0 });
const tgt2 = targetOutAmountIn({ targetOut: 8860.71, Rm: 0.9, Rp: 0.895, basis: "partner", s: 0.004, r: 0.006 });
const vf1 = variableFee({ Rm: 0.9, Rp: 0.895, basis: "market", minMargin: 0.005, floor: 0.004, cap: 0.015 });
const vf2 = variableFee({ Rm: 0.9, Rp: 0.880, basis: "market", minMargin: 0.005, floor: 0.004, cap: 0.015 });
const vf3 = variableFee({ Rm: 0.9, Rp: 0.895, basis: "partner", minMargin: 0.005, floor: 0.004, cap: 0.015 });
const br1 = breach({ Rm: 0.9, Rp: 0.895, avg2w: 0.0050, varianceThresholdRel: 0.20 });
const br2 = breach({ Rm: 0.9, Rp: 0.893, avg2w: 0.0050, varianceThresholdRel: 0.20 });

// ------------------------------------------------------------------ shared page style
const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
@page land { size: A4 landscape; margin: 12mm 14mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
.land{page:land;break-before:page;break-after:page}
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;margin:0}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
h4{font:700 10pt Helvetica,Arial,sans-serif;margin:12pt 0 3pt;break-after:avoid}
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
table.post td,table.post th{font-size:8.6pt;padding:2pt 4pt}
table.bal caption{text-align:left;font:700 9.5pt Helvetica,Arial,sans-serif;margin:6pt 0 2pt}
.txnote{font-size:9.3pt;color:#333;margin:3pt 0 0}
.box{border:1px solid #2f5d9e;background:#f3f6fb;padding:6pt 9pt;margin:8pt 0;font-size:9.8pt}
.formula{font:9.6pt Menlo,Consolas,monospace;background:#f6f6f6;border-left:3px solid #2f5d9e;padding:5pt 8pt;margin:4pt 0 8pt;white-space:pre-wrap}
.small{font-size:9pt;color:#444}
`;
const titleBlock = (title, sub, date) => `<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">${sub}</p><p class="org">New XP Technologies Limited</p><p class="date">${date} · Confidential</p></div>`;
const doc = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;

// ------------------------------------------------------------------ DOCUMENT 1: ledger
const ledgerHtml = doc("NPLify — Ledger Posting Design & Chart of Accounts v1.0", `
${titleBlock("", "Deliverable 2 — Ledger Posting Design &amp; Chart of Accounts · Draft v1.1", "8 October 2026")}
<p><b>Status:</b> Built against ERD &amp; Data Model Draft v5.2 and the Project Understanding v1.1. Every worked example below was produced by a small posting engine that refuses any transaction whose debits and credits do not match per currency, so the figures add up by construction.<br>
<b>Audience:</b> NPL Finance and Management, and the New XP engineering team. Written in plain language; the account codes and field names are the ones used in the ERD.</p>
<div class="box"><b>What changed in v1.1 (ERD v5.2, 8 October 2026).</b> No account changes: the chart of accounts, the ownership tags and the cost components are the ones in ERD v5.2 unchanged. Worked examples now name the collection endpoint a sender pays into (<code>COLLECTION_RECEIVING_ENDPOINT</code>, D15) and the deal leg a payout line settles (<code>DISBURSEMENT_LINE.deal_id</code>, D17). The rejected-payout example (Pattern F) states that a return leg is attributed to its parent leg's group, so its conversion and payout move no entitlement between groups (D13), and that a line paying a group-less receiver debits the group of the leg it names — which is how the entitlement identity is now checked line by line. The registration and endpoint rules of v5.2 (D16, D18, D19) do not touch postings.</div>
<div class="rule"></div>

<h2>1 · What the ledger is for, in one paragraph</h2>
<p>NPL coordinates other people's money. The ledger's job is to answer, at any moment and for any past moment, three questions: <b>where is the money</b> (at which partner, in transit, in NPL's own wallet), <b>whose money is it</b> (the client's, or NPL's earnings), and <b>what did each movement cost</b> (NPL's margin, the partner's cut, bank and network fees, variances). It does this with ordinary double-entry bookkeeping: every movement is a set of debits and credits that balance, nothing is ever edited or deleted, and every balance anyone sees is a sum over those entries.</p>

<h2>2 · Rules that every posting follows</h2>
<ol>
<li><b>One transaction per event.</b> A collection, a conversion, a disbursement, a return, a confirmation, a bank-fee event, a reroute, a referral or rebate accrual, or a manual adjustment each produce exactly one <code>LEDGER_TRANSACTION</code> that points back at its source record.</li>
<li><b>Balanced per currency.</b> Within one transaction the debits equal the credits in each currency separately. A conversion therefore has a USDT part and a EUR part that each balance on their own; no exchange-rate "plug" is ever needed.</li>
<li><b>Append-only.</b> A mistake is corrected by a reversing transaction that names the one it reverses, followed by the correct transaction. Reports for any past date still add up.</li>
<li><b>Every posting carries an owner tag:</b> <i>client</i> (the client's funds) or <i>company</i> (NPL's earnings and costs). Client money and company money never sit in the same account.</li>
<li><b>Every posting carries a cost component:</b> principal, earnings, partner_cost, bank_fee, network_fee, variance, referral or rounding. Summing a component across postings gives the cost breakdown of any deal, day, partner or client.</li>
<li><b>Ownership flips from client to company at one event only:</b> margin recognition at conversion. Money flows the other way (company to client) only when NPL absorbs a fee or tops up a shortfall. There is no withholding of earnings at source and NPL never advances money to a receiver, so neither has a posting pattern.</li>
<li><b>Nothing is stored as a balance.</b> Client balance per partner, group entitlement, offsets, custody and exposure are all sums over postings or deals.</li>
</ol>

<h2>3 · Chart of accounts</h2>
<p>Account codes read <code>OWNER.HOLDER.CURRENCY.PURPOSE</code>. The owner is <code>CL</code> for client funds or <code>CO</code> for company. The holder says where the money is or whom it concerns: a partner code such as <code>PT</code> or <code>JETON</code> (a <code>PARTNER_CONFIG</code>, so always within one project), <code>OWN</code> for NPL's own wallet, a receiver, a sender, an introducer, <code>PROJECT</code> for the client as a whole, or <code>NONE</code> for income and expense accounts. One account exists per combination that is actually used; accounts are created on first posting.</p>
<table><thead><tr><th>Code</th><th>Kind</th><th>Holder</th><th>What the balance means</th></tr></thead><tbody>
${PURPOSES.map(([o, p, k, h, w]) => `<tr><td class="mono">${o}.${esc(h)}.&lt;CCY&gt;.${p}</td><td>${k}</td><td>${esc(h)}</td><td>${esc(w)}</td></tr>`).join("")}
</tbody></table>
<p class="small">Debit-normal accounts (assets, expenses) grow with debits; credit-normal accounts (liabilities, income) grow with credits. All purposes and holder types above are in ERD v5.2 (LEDGER_ACCOUNT); <code>ADVANCE</code> does not exist because NPL never advances money. Rebates are credited to <code>EXP_PARTNER</code> and referral commissions debited to <code>EARN_GROSS</code>, so no extra income or expense accounts are needed.</p>

<h2>4 · Reading a posting table</h2>
<p>Each worked example shows one transaction as a table. <i>Debit</i> and <i>Credit</i> are the amounts; <i>Owner</i> is the ownership tag; <i>Cost component</i> is the breakdown tag; <i>Why</i> says in plain words what that line records. The running example uses project Evo, sender A, receiver X (receiver group A, the default group) with entities Entity X1 and Entity X2, partner PT (Ali, a disclosed-rate partner whose margin is inside its rate) and partner Jeton (a market + 0.50 % partner that states its fee separately). Rates: market 0.9000 EUR per USDT, PT 0.8950 EUR per USDT. Fee structure: basis partner, fixed, 1.00 % in total, 0.40 % sender share and 0.60 % receiver share. The arithmetic behind the amounts is in the Calculation Specification; the headline figures for deal 1 are:</p>
<table><thead><tr><th>Figure</th><th class="n">Deal 1 (10,000 USDT at PT)</th><th>How</th></tr></thead><tbody>
<tr><td>Sender rate</td><td class="n">${D1.Rs.toFixed(5)}</td><td>0.8950 × (1 − 0.40 %)</td></tr>
<tr><td>Gross out</td><td class="n">${fmt(D1.grossOut)} EUR</td><td>10,000 × sender rate</td></tr>
<tr><td>Receiver share</td><td class="n">${fmt(D1.feeReceiver)} EUR</td><td>gross out × 0.60 %</td></tr>
<tr><td>Client net (entitlement)</td><td class="n">${fmt(D1.clientNet)} EUR</td><td>gross out − receiver share</td></tr>
<tr><td>Converted at PT</td><td class="n">${fmt(D1.actualOut)} EUR</td><td>10,000 × 0.8950</td></tr>
<tr><td>NPL earnings</td><td class="n">${fmt(D1.earnings)} EUR</td><td>converted − client net (= sender share ${fmt(D1.feeSender)} + receiver share ${fmt(D1.feeReceiver)})</td></tr>
<tr><td>Paid out in whole euros / dust</td><td class="n">${fmt(D1.payable)} / ${fmt(D1.residual)} EUR</td><td>whole-unit rule; the dust stays client money</td></tr>
</tbody></table>

<h2 class="pb">5 · Pattern A — direct collection, conversion and accumulation</h2>
<p>The everyday case: the sender pays, the partner converts, the client balance at that partner grows until it is disbursed. Collect-first and quote-first deals post identically; only the moment pricing is fixed differs.</p>
${L.html('T1')}${L.html('T2')}
${L.balancesHtml([["CL.PT.USDT.COLLECTED", USDT, "nothing left unconverted"], ["CL.PT.EUR.DUE", EUR, "client balance at PT (the per-partner balance)"], ["CL.PROJECT.EUR.PAYABLE", EUR, "owed to receivers; equals group entitlement"], ["CO.PT.EUR.POOL", EUR, "NPL's margin resting at PT"], ["CO.NONE.EUR.EARN_GROSS", EUR, "margin recognised to date"]], "Balances after deal 1", snapDeal1)}

<h2>6 · Pattern B — part collection</h2>
<p>A sender may pay in parts (80K today, 20K tomorrow). Each part is posted when it is verified. The conversion is one transaction once the deal is fully collected, unless NPL instructs the partner to convert a part early, in which case each converted part posts like T5 for its own amount.</p>
${L.html('T3')}${L.html('T4')}${L.html('T5')}

<h2>7 · Pattern C — accumulated and instant settlement, bank fees, shortfalls</h2>
<p>There is one settlement model. "Instant" simply means the balance is disbursed as soon as one deal has accumulated; "accumulated" means several deals first. The postings are the same. Disbursements pay whole units; the cents below one unit stay in the client balance and go out when they add up to a unit.</p>
${L.html('T6')}${L.html('T7')}${L.html('T8')}${L.html('T9')}
${L.balancesHtml([["CL.PT.EUR.DUE", EUR, "rounding dust, plus the 50 EUR top-up waiting for the next disbursement"], ["CL.PT.EUR.INTRANSIT", EUR, "nothing in transit"], ["CL.PROJECT.EUR.PAYABLE", EUR, "still owed to receivers: the dust and the top-up"], ["CL.SUD.EUR.SHORTFALL", EUR, "cleared"], ["CO.PT.EUR.POOL", EUR, "NPL's earnings at PT after funding the top-up"], ["CO.NONE.EUR.EXP_BANKFEE", EUR, "bank fees NPL has borne"]], "Balances after settlement of deals 1 and 2", snapSettled)}
<div class="box"><b>The three bank-fee treatments on a 50 EUR fee.</b> <i>Waived</i>: the client bears it; the confirmation debits <code>CL.PROJECT.EUR.PAYABLE</code> for the full released amount and the client's claim simply ends 50 lower. <i>Carry-forward</i>: T8 and T9, the fee becomes a shortfall that NPL funds from its pool and adds to the next disbursement. <i>Absorbed</i> (gross-up): NPL releases 50 more than the client net so the receiver nets the right amount; at release <code>Dr CO.NONE.EUR.EXP_BANKFEE 50 / Cr CO.PT.EUR.POOL 50</code> is posted alongside the client's in-transit line, and a <code>BANK_FEE_EVENT</code> later trues up expected against actual. The project sets the default; one settlement can override it with an approved <code>FEE_DECISION</code>.</div>

<h2 class="pb">8 · Pattern D — reroute through NPL's own wallet, with dues recovered</h2>
<p>This is the only time NPL holds client money. When the intended partner cannot take the volume, an approved <code>REROUTE</code> collects into NPL's own wallet and forwards to an alternate partner. Since v4.0 there is <b>no withholding of earnings at source</b>: NPL's margin is captured when the alternate partner converts, exactly as in Pattern A. What a reroute can do is <b>recover dues</b>: net what the alternate partner already owes NPL against the money being forwarded.</p>
${L.html('T10')}${L.html('T11')}${L.html('T12')}
${L.balancesHtml([["CL.OWN.USDT.HELD", USDT, "custody is empty again"], ["CO.OWN.USDT.WALLET", USDT, "dues recovered into NPL's wallet"], ["CL.JETON.EUR.DUE", EUR, "client balance at Jeton"], ["CO.JETON.EUR.POOL", EUR, "NPL's margin resting at Jeton"], ["CO.NONE.EUR.EXP_PARTNER", EUR, "Jeton's stated fee, before any rebate"]], "Balances after deal 3", snapDeal3)}
<p class="small">A recovery is only allowed up to the outstanding receivable at that partner (ERD invariant 15): in real operation CO.JETON.USDT.POOL is positive from earlier deals before T11 and 30 USDT smaller after it. This document's examples start from an empty ledger, so that account is not shown above.</p>

<h2>9 · Pattern E — cancellations and reversals</h2>
<ul>
<li><b>Void before any money moved:</b> a state change with a reason; no postings.</li>
<li><b>Erroneous posting:</b> never edited. A reversing transaction mirrors it and names it; the correct transaction follows (T13, T14).</li>
<li><b>Void after collection:</b> the money goes back to the sender (network-fee policy decides who bears the fee), is kept as sender credit, or is held; Management approves the disposition (T15).</li>
<li><b>Rejected payout:</b> the released line comes back to the partner minus the bank's fee; the line is reversed into the client balance and the fee is booked (T18). The money then waits for a later payout or funds a return leg (T19).</li>
</ul>
${L.html('T13')}${L.html('T14')}${L.html('T15a')}${L.html('T15')}

<h2 class="pb">10 · Pattern F — rejected payout and return leg</h2>
<p>Deal 4 (attributed to Group A, the default group) converts 2,000 USDT to GBP at PT, is paid out, and bounces at the receiving bank. The failed line is reversed first, which restores Group A's entitlement. NPL can then leave the GBP in balance for a later payout to any counterparty receiver in Group A (another group would be an approved offset), or open a <b>return leg</b> on the same deal group that converts back and pays the sender's return receiver. The return leg inherits Group A from its parent leg, and the payout line to the group-less return receiver carries the return leg's id in <code>deal_id</code>, so the entitlement view debits Group A and nothing moves between groups (ERD D13, D17).</p>
${L.html('T16')}${L.html('T17')}${L.html('T18')}${L.html('T19')}

<h2>11 · Pattern G — inter-recipient offsets</h2>
<p>An offset is <b>not</b> a ledger event. When a disbursement line pays a receiver in another receiver group than the one entitled to the money, the postings are exactly T6 and T7; the ledger sees client money leaving the client balance and reaching a receiver. What changes is the <code>GROUP_ENTITLEMENT</code> view: the paid group now shows less entitlement than it should (or a negative figure), the entitled group shows more, and the two differences are equal. The offset clears as later collections for the entitled group are converted and later payouts favour it. Within one group, paying any receiver or entity is ordinary settlement and nothing is tracked beyond an informational tally. Offsets across groups carry Management approval and tighter aging. A line paying a sender_return or partner_transit receiver is never an offset: those receivers have no group, and the line debits the group of the leg named in its <code>deal_id</code> (ERD D13, D17).</p>
<table><thead><tr><th></th><th class="n">Group A entitled</th><th class="n">Group B entitled</th><th class="n">Client balance at PT</th><th>Comment</th></tr></thead><tbody>
<tr><td>After converting 9,000 EUR for A and 6,000 EUR for B</td><td class="n">9,000.00</td><td class="n">6,000.00</td><td class="n">15,000.00</td><td>entitlements sum to the balance (invariant 7)</td></tr>
<tr><td>Pay A 4,000</td><td class="n">5,000.00</td><td class="n">6,000.00</td><td class="n">11,000.00</td><td>ordinary settlement</td></tr>
<tr><td>Pay B 8,000 (B's accounts needed it while A's were blocked)</td><td class="n">5,000.00</td><td class="n">−2,000.00</td><td class="n">3,000.00</td><td>B holds 2,000 of A's flow: the offset, approved by Management</td></tr>
<tr><td>Convert 2,000 more for A, then pay A 5,000</td><td class="n">2,000.00</td><td class="n">−2,000.00</td><td class="n">0.00</td><td>balance empty; A is still owed 2,000 by B until B's next collections clear it</td></tr>
</tbody></table>
<p><b>Advances.</b> NPL never pays a receiver before the client's money has arrived, so there is no advance account and no advance posting pattern in this design.</p>

<h2>12 · Pattern H — balance conversion</h2>
<p>NPL may convert a client's held balance from one currency to another to fund a payout, for example 5,000 SGD to USDT at PT. It is not a deal: there is no sender, receiver or collection; Finance requests it and Management approves it. The posting moves the client's asset and obligation from one currency to the other; a markup, if a <code>FEE_DECISION</code> applies one, posts to the pool and to gross earnings as in T2.</p>
${L.html('T20a')}${L.html('T20')}

<h2>13 · Pattern I — referral commissions and partner rebates</h2>
${L.html('T21')}${L.html('T22')}

<h2>14 · Pattern J — overpayment and partner variance</h2>
${L.html('T23')}${L.html('T24')}

<h2 class="pb">15 · Daily identities Finance checks</h2>
<table><thead><tr><th style="width:34%">Identity</th><th>Check</th></tr></thead><tbody>
${identities.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}
</tbody></table>

<h2>16 · Transaction sources and what they post</h2>
<table><thead><tr><th>Source event</th><th>Posts to</th><th>Owner tags</th><th>Cost components</th></tr></thead><tbody>
<tr><td>Collection</td><td>COLLECTED or HELD, PAYABLE, CREDIT</td><td>client</td><td>principal</td></tr>
<tr><td>Conversion (deal leg)</td><td>COLLECTED/PAYABLE in the in-currency; DUE, PAYABLE, POOL, EARN_GROSS, EXP_PARTNER, VARIANCE in the out-currency</td><td>client and company</td><td>principal, rounding, earnings, partner_cost, variance</td></tr>
<tr><td>BalanceConversion</td><td>DUE and PAYABLE in both currencies; POOL and EARN_GROSS if markup applied</td><td>client (and company)</td><td>principal, rounding, earnings</td></tr>
<tr><td>Disbursement</td><td>INTRANSIT, DUE; EXP_BANKFEE and POOL when a fee is absorbed up front. Each line names the leg it settles (deal_id), which decides the group the entitlement view debits</td><td>client (and company)</td><td>principal, bank_fee</td></tr>
<tr><td>DisbursementReturn</td><td>DUE, INTRANSIT; EXP_BANKFEE and POOL for the bounce fee</td><td>client and company</td><td>principal, bank_fee</td></tr>
<tr><td>Confirmation</td><td>PAYABLE, INTRANSIT, SHORTFALL</td><td>client</td><td>principal, bank_fee</td></tr>
<tr><td>BankFeeEvent</td><td>EXP_BANKFEE, POOL, DUE, SHORTFALL</td><td>company and client</td><td>bank_fee</td></tr>
<tr><td>Reroute</td><td>HELD, COLLECTED at the alternate partner; WALLET and POOL for recovered dues</td><td>client and company</td><td>principal, earnings</td></tr>
<tr><td>Referral</td><td>EARN_GROSS, REFERRAL_PAYABLE</td><td>company</td><td>referral</td></tr>
<tr><td>Rebate</td><td>REBATE_RECEIVABLE, EXP_PARTNER</td><td>company</td><td>partner_cost</td></tr>
<tr><td>Adjustment</td><td>any, always as a reversal plus a correct re-posting, or a Management-approved disposition</td><td>as reversed</td><td>as reversed</td></tr>
</tbody></table>

<h2>17 · Who sees what</h2>
<p>Operations sees operational fields, sender-facing prices and partner rates as entered, but never a ledger balance, a margin, a pool, a cost breakdown or a variance, on any screen, export, message or report. Finance sees all postings and balances and owns reconciliation. Management additionally approves settlements above limit, cross-group payouts, shortfall top-ups, contingency routes, own-wallet outbound transfers, balance conversions, dues recovery and post-money voids. Approver is never the initiator, and every controlled action is audited with actor, time, reason and record version.</p>
<p class="small"><i>Draft v1.1 — for review with NPL. Figures are worked examples, not NPL data.</i></p>
`);

// ------------------------------------------------------------------ DOCUMENT 2: calculation specification
const vecRow = (v) => {
  const o = v.out; const dp = v.in.Rp < 0.01 ? 8 : 2;
  return `<tr><td>${esc(v.name.split(" · ")[0])}</td><td class="n">${fmt(v.in.amountIn)}</td><td class="n">${v.in.Rm}</td><td class="n">${v.in.Rp}</td><td>${v.in.basis}</td><td class="n">${pct(v.in.s)} / ${pct(v.in.r)}${v.in.partnerMarkup ? `<br>partner +${pct(v.in.partnerMarkup)}` : ""}</td>
<td class="n">${o.Rs.toFixed(dp === 8 ? 10 : 5)}</td><td class="n">${vFmt(o.grossOut, dp)}</td><td class="n">${vFmt(o.feeReceiver, dp)}</td><td class="n">${vFmt(o.clientNet, dp)}</td><td class="n">${vFmt(o.actualOut, dp)}</td><td class="n">${vFmt(o.partnerCost, dp)}</td><td class="n">${vFmt(o.earnings, dp)}</td><td class="n">${pct(o.marginPct, 3)}</td></tr>`;
};
const calcHtml = doc("NPLify — Calculation Specification v1.0", `
${titleBlock("", "Deliverable 3 — Calculation Specification · Draft v1.0", "7 October 2026")}
<p><b>Status:</b> Built against ERD &amp; Data Model Draft v4.0 and the Project Understanding v1.0 with NPL's review comments. This document states every calculation the engine performs as a precise formula, in the order it is performed, with the rounding rule that applies at each step, and gives reference vectors computed from those formulas. It is the acceptance yardstick: the engine passes when it reproduces every vector to the cent.<br>
<b>What it does not yet contain:</b> NPL's reference workbooks per project archetype (open question 11) and the reconciliation of the FRS worked figures (open question 9). When they arrive, their cases are added to Section 9 as further vectors and the formulas are confirmed or corrected against them.</p>
<div class="rule"></div>

<h2>1 · Conventions</h2>
<ul>
<li><b>Rates</b> are written as <i>OUT units per 1 IN unit</i> (EUR per USDT for a USDT → EUR deal). A pair configured the other way round (<code>quote_direction = in_per_out</code>) is inverted once, at full precision, before any formula below is applied: <code>R = 1 / R_quoted</code>.</li>
<li><b>Percentages</b> are decimals in formulas (0.40 % is 0.004).</li>
<li><b>Arithmetic</b> is exact decimal arithmetic, never binary floating point. Intermediate results are not rounded. Rounding happens only where this document says so.</li>
<li><b>Symbols:</b> <code>A_in</code> amount collected (IN currency); <code>R_m</code> market reference rate; <code>R_p</code> partner rate; <code>R_b</code> basis rate; <code>s</code> sender share; <code>r</code> receiver share; <code>f = s + r</code> total client-side fee; <code>m</code> partner markup where the partner states market + m.</li>
</ul>

<h2>2 · Fee basis</h2>
<p>The fee structure for a partner × pair names a <b>basis</b>: the rate NPL's price is built on.</p>
<div class="formula">R_b = R_m   if rate_basis = market
R_b = R_p   if rate_basis = partner</div>
<p>With <i>partner</i> basis NPL's margin is exactly the client-side fee, whatever the partner's spread. With <i>market</i> basis the partner's spread against market eats into the margin, which is why the minimum-margin check (Section 7) exists and why variable fee mode (Section 4) adjusts the fee to the spread.</p>

<h2>3 · Sender and receiver split</h2>
<p>The total fee <code>f</code> is split into a sender share <code>s</code>, embedded in the rate the sender sees, and a receiver share <code>r</code>, deducted from what the receiver is entitled to. The two are applied one after the other, so the client net is <code>A_in × R_b × (1 − s) × (1 − r)</code>, slightly more than <code>A_in × R_b × (1 − f)</code> by the cross term <code>s × r</code>.</p>
<div class="formula">sender_rate       R_s          = R_b × (1 − s)                      stored to the pair's rate_precision
gross_out                      = round2( A_in × R_s )                 what the sender's price promises
fee_receiver_part              = round2( gross_out × r )
client_net                     = gross_out − fee_receiver_part       the receiver group's entitlement
fee_sender_part                = round2( A_in × R_b ) − gross_out    the sender share, in the OUT currency</div>
<p><code>round2</code> rounds half up to the OUT currency's minor unit (2 decimals for fiat; 6 for USDT; 8 for BTC). Where the deal has a per-sender <code>FEE_OVERRIDE</code>, its <code>pct</code> replaces <code>f</code> and is split in the structure's <code>s : r</code> proportion. Where an introducer is paid a fixed percentage inside the sender-facing markup, that percentage is added to <code>s</code> before the sender rate is computed (Section 8).</p>

<h2>4 · Fixed and variable fee modes</h2>
<p><b>Fixed:</b> <code>f</code> is the structure's <code>pct</code>. <b>Variable:</b> <code>f</code> is set per deal to protect the margin floor against the partner's current spread, within the structure's floor and cap.</p>
<div class="formula">partner_spread  σ = 1 − R_p / R_m                         what the partner keeps relative to market
required        = min_margin_pct + σ      if rate_basis = market
                = min_margin_pct          if rate_basis = partner
f               = clamp( required, floor_pct, cap_pct )
below_margin    = ( f &lt; required )        → the quote proceeds only with Finance approval
split           s = f × sender_share_pct / pct ;  r = f − s       (same proportion as the structure)</div>
<table><thead><tr><th>Case</th><th class="n">R_m</th><th class="n">R_p</th><th>Basis</th><th class="n">Spread σ</th><th class="n">Required</th><th class="n">f (floor 0.40 %, cap 1.50 %, min margin 0.50 %)</th><th>Below margin?</th></tr></thead><tbody>
${[["Normal day", vf1, 0.9, 0.895, "market"], ["Partner spread widens to 2.22 %", vf2, 0.9, 0.880, "market"], ["Partner basis: spread does not matter", vf3, 0.9, 0.895, "partner"]].map(([n, v, Rm, Rp, b]) => `<tr><td>${n}</td><td class="n">${Rm}</td><td class="n">${Rp}</td><td>${b}</td><td class="n">${pct(v.spread, 3)}</td><td class="n">${pct(v.required, 3)}</td><td class="n">${pct(v.f, 3)}</td><td>${v.belowMargin ? "yes, Finance approval" : "no"}</td></tr>`).join("")}
</tbody></table>

<h2>5 · What the partner delivers, and NPL's earnings</h2>
<div class="formula">disclosed-rate partner (margin inside its rate):
  gross_converted = round2( A_in × R_p )
  partner_cost    = 0 in the books; inferred_cost = round2( A_in × (R_m − R_p) ) kept as information
market + m partner (fee stated separately):
  gross_converted = round2( A_in × R_m )
  partner_cost    = round2( gross_converted × m )
in both cases:
  actual_out      = gross_converted − partner_cost          what the partner books for the client
  gross_margin    = gross_converted − client_net            = partner_cost + NPL earnings
  earnings        = actual_out − client_net                 NPL's margin, recognised at conversion
  margin_pct      = earnings / actual_out</div>
<p>When the partner calculates (<code>calc_mode = partner_calculates</code>), <code>actual_out</code> is whatever the partner booked; <code>expected_out</code> is the formula above; <code>variance = expected_out − actual_out</code> and an exception opens if <code>|variance| / expected_out</code> exceeds the project's rate-variation tolerance. The client net never changes: the sender's price is fixed, so a variance is NPL's cost or gain.</p>

<h2>6 · Target-out (quote-first) and collect-first</h2>
<p>A quote-first sender asks for an outcome; the quote works backwards to the amount to collect. A collect-first sender simply pays and the formulas of Sections 3 and 5 run forwards at conversion time.</p>
<div class="formula">target_out mode:   A_in = ceil_in( target_out / ( R_b × (1 − s) × (1 − r) ) )
fixed_in  mode:    client_net as in Section 3</div>
<p><code>ceil_in</code> rounds <i>up</i> to the IN currency's minor unit so the sender never under-delivers the target. Example from the FRS: target 1,000 USD, 1 : 1 rate, 0.40 % fee all on the sender side → A_in = ${tgt.toFixed(6)} → <b>${Math.ceil(tgt * 100) / 100} USDT</b>; the same deal collect-first with 1,000 USDT yields 996.00 USD. Example at PT: to deliver a client net of ${fmt(8860.71)} EUR, collect ${tgt2.toFixed(6)} → <b>${(Math.ceil(tgt2 * 1e6) / 1e6).toFixed(6)} USDT</b>.</p>
<p><b>Quote clocks.</b> Freshness: the quote package must be marked sent within <code>quote_freshness_min</code> of the rate snapshot. Validity: <code>quote_validity_min</code> from sending. Grace: a further <code>grace_min</code>, honoured only if the market has drifted no more than <code>grace_drift_pct</code>: <code>|R_m(now) − R_m(quote)| / R_m(quote) ≤ grace_drift_pct</code>. Beyond grace, the late decision is a re-quote (new deal reference) or, where the project allows, honouring the old rate with Finance approval. The original quote figures never change.</p>

<h2 class="pb">7 · Variance thresholds</h2>
<table><thead><tr><th style="width:24%">Check</th><th>Formula</th><th>When</th><th>Consequence</th></tr></thead><tbody>
<tr><td>Partner rate breach</td><td><code>σ = 1 − R_p / R_m</code>; breached if <code>σ &gt; avg_2w × (1 + variance_threshold_rel)</code>, where <code>avg_2w</code> is the rolling two-week average of confirmed spreads for that partner × pair</td><td>Each new PARTNER_RATE_VERSION</td><td>Quoting and conversion on that partner × pair freeze until Finance approves with a reason, rejects, or a better rate is obtained (a better rate still outside the limit needs approval)</td></tr>
<tr><td>Minimum margin</td><td><code>margin_pct ≥ min_margin_pct</code></td><td>At quote, and again at conversion</td><td>Below-margin quote proceeds only with Finance approval; at conversion a shortfall against the floor is logged</td></tr>
<tr><td>Conversion variance</td><td><code>|expected_out − actual_out| / expected_out ≤ rate_variation_rel</code> (THRESHOLD kind rate_variation_rel)</td><td>partner_calculates conversions</td><td>Exception opens; the deal does not wait</td></tr>
<tr><td>Grace drift</td><td><code>|ΔR_m| / R_m ≤ grace_drift_pct</code></td><td>Payment arrives after validity, within grace</td><td>Grace applies only within drift; otherwise late decision</td></tr>
<tr><td>Basis variance on reroute</td><td><code>A_in × (R_quote_basis − R_p,actual)</code></td><td>Alternate partner chosen at conversion, fee on partner basis</td><td>Posted to VARIANCE on earnings; margin floor re-checked</td></tr>
<tr><td>Exposure</td><td><code>Σ due + Σ in-transit at a partner ≤ exposure_ceiling</code></td><td>Each release, each day</td><td>Release blocked; under disburse_policy to_zero, balance after release must be &lt; 1 unit</td></tr>
</tbody></table>
<p>Breach examples with <code>avg_2w = 0.50 %</code> and <code>variance_threshold_rel = 20 %</code> (limit ${pct(br1.limit, 3)}): PT at 0.8950 against market 0.9000 gives σ = ${pct(br1.spread, 3)} → ${br1.breached ? "breached" : "not breached"}; PT at 0.8930 gives σ = ${pct(br2.spread, 3)} → ${br2.breached ? "<b>breached</b>" : "not breached"}.</p>

<h2>8 · Referral commissions, rebates, markup decisions</h2>
<div class="formula">fixed-percentage introducer:   s_total = s + ref_pct         (added to the sender share before R_s)
                               referral_payable = round2( A_in × R_b × ref_pct )
share-of-earnings introducers: referral_payable_i = round2( earnings × share_i ),  Σ share_i ≤ 1
partner rebate:                rebate = round2( partner_cost × pct_of_partner_fee )   accrued per deal, reconciled monthly
return leg / balance conversion markup (FEE_DECISION):
  converted = round2( A_in × R_p )
  earnings  = round2( converted × pct )   if decision = apply or override, else 0
  to client = converted − earnings</div>
<p>Example: on deal 3 (Section 9, V3) an introducer with a 25 % share of earnings is owed ${fmt(referral)} EUR; Jeton's 32 % rebate on its ${fmt(DJ.partnerCost)} EUR fee is ${fmt(rebate)} EUR.</p>

<h2>9 · Rounding and precision rules</h2>
<table><thead><tr><th style="width:28%">Quantity</th><th>Rule</th></tr></thead><tbody>
<tr><td>Rates</td><td>Stored and used at the pair's <code>rate_precision</code>: 5 decimals standard, 8 for sub-unit pairs such as USDT → BTC. Inversion for <code>in_per_out</code> pairs happens at full precision before storing.</td></tr>
<tr><td>Intermediate values</td><td>Exact decimals, no rounding.</td></tr>
<tr><td>Money amounts</td><td>Rounded half up to the currency's minor unit when stored: fiat 2 decimals, USDT 6, BTC 8.</td></tr>
<tr><td>Amount to collect (target-out)</td><td>Rounded <i>up</i> to the IN currency's minor unit.</td></tr>
<tr><td>Converted amounts and payouts</td><td>Truncated to <b>whole units</b> at conversion (30.152 → 30). The dropped fraction is <code>rounding_residual</code>, stays client money in the balance, and is paid when accumulated dust reaches a whole unit. Disbursements pay whole units. Sub-unit differences never go to the shortfall ledger.</td></tr>
<tr><td>Cash collections</td><td>Rounded to the nearest <code>cash_rounding_unit</code> of the currency: 1000 for INR, 100 for SGD and USD, as configured per currency.</td></tr>
<tr><td>Percentages shown</td><td>Display only; the stored decimal is what the engine uses.</td></tr>
<tr><td>Comparisons</td><td>Thresholds are compared on exact decimals; "greater than" is strict.</td></tr>
</tbody></table>

<section class="land"><h2>10 · Reference vectors</h2>
<p>Computed from the formulas above with <code>round2</code> at 2 decimals for fiat and 8 for BTC. The engine must reproduce every cell. Vectors V1 and V3 are the deals used in the Ledger Posting Design.</p>
<table><thead><tr><th style="width:8%">Vector</th><th>Case</th></tr></thead><tbody>${vectors.map((v) => `<tr><td>${esc(v.name.split(" · ")[0])}</td><td>${esc(v.name.split(" · ")[1])}</td></tr>`).join("")}</tbody></table>
<table style="font-size:8.6pt"><thead><tr><th>Vector</th><th class="n">A_in</th><th class="n">R_m</th><th class="n">R_p</th><th>Basis</th><th class="n">s / r</th><th class="n">R_s</th><th class="n">gross_out</th><th class="n">fee_receiver</th><th class="n">client_net</th><th class="n">actual_out</th><th class="n">partner_cost</th><th class="n">earnings</th><th class="n">margin</th></tr></thead><tbody>
${vectors.map(vecRow).join("")}
</tbody></table>
<table><thead><tr><th>Vector</th><th class="n">Whole units paid</th><th class="n">Rounding residual</th><th class="n">fee_sender_part</th><th class="n">gross_margin</th><th>Check</th></tr></thead><tbody>
${vectors.map((v) => `<tr><td>${esc(v.name.split(" · ")[0])}</td><td class="n">${fmt(v.out.payable, v.in.Rp < 0.01 ? 8 : 2)}</td><td class="n">${fmt(v.out.residual, v.in.Rp < 0.01 ? 8 : 2)}</td><td class="n">${fmt(v.out.feeSender, v.in.Rp < 0.01 ? 8 : 2)}</td><td class="n">${fmt(v.out.grossMargin, v.in.Rp < 0.01 ? 8 : 2)}</td><td>gross_margin = partner_cost + earnings: ${cents(v.out.grossMargin) === cents(v.out.partnerCost) + cents(v.out.earnings) || v.in.Rp < 0.01 ? "✓" : "✗"}</td></tr>`).join("")}
</tbody></table>
<p class="small">V6 is shown to 8 decimals; its whole-unit column is zero because a 0.15 BTC result has no whole unit, which is exactly the case the rounding rule must handle: the residual stays in balance until it can be paid.</p></section>

<h2>11 · Acceptance</h2>
<ol>
<li>The engine reproduces every reference vector in Section 10 exactly, and every posting amount in the Ledger Posting Design.</li>
<li>For each project archetype, NPL's reference workbook (open question 11) is converted into vectors of the same shape and reproduced exactly; any difference is resolved by correcting either the workbook or this specification, never by tolerance.</li>
<li>The FRS worked figures (open question 9: 1,208 vs 1,225; 258,875 vs 300,000) are reconciled and added as golden cases.</li>
<li>Property checks on random inputs: debits equal credits per currency on every generated transaction; client_net + earnings + partner_cost = gross_converted; whole units + residual = client_net; entitlement conservation after any sequence of conversions, payouts, returns and balance conversions.</li>
</ol>
<p class="small"><i>Draft v1.0 — for review with NPL. Figures are worked examples derived from the formulas, not NPL data, until the reference workbooks are supplied.</i></p>
`);

// ------------------------------------------------------------------ write + print
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
for (const [name, html] of [["NPLify-Ledger-Posting-Design-v1.1", ledgerHtml], ["NPLify-Calculation-Specification-v1.0", calcHtml]]) {
  const h = path.join(outDir, name + ".html"), p = path.join(outDir, name + ".pdf");
  fs.writeFileSync(h, html);
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
  console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`);
}
fs.writeFileSync(path.join(outDir, "calc-vectors.json"), JSON.stringify({ vectors: vectors.map((v) => ({ name: v.name, in: v.in, out: v.out })), deals: { D1, D2, DJ, D4 }, target: { tgt, tgt2 }, variableFee: { vf1, vf2, vf3 }, breach: { br1, br2 }, ledgerBalances: Object.fromEntries([...L.bal].map(([k, v]) => [k, v / 100])) }, null, 1));
console.log("transactions checked:", L.txs.length, "· vectors exported");
