// Build docs/NPLify-Calculation-Specification-v<ERD>.{html,pdf}: every calculation the engine performs, in order,
// with the rounding rule at each step, and acceptance vectors — the ledger's worked deals (consistent by
// construction with the Ledger Posting Design) and NPL's own figures from the fee table, recomputed and compared.
// Imports the pricing function the ledger uses, so the two documents cannot disagree.   node scripts/build-calc-spec.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { clientFacing } from "./client-facing.mjs";
import { fileURLToPath } from "node:url";
import * as M from "./build-ledger-doc.mjs";

const { price, roundUpN, fmt, pct, esc, r2, EX, JET, D1, DJ, DT, D4, DS, DR, DM, DN_J, DN_A, offsetEur, offsetUsdt, retainUsdt, convertUsdt, eurOut, RESALE_INV, VENDOR_INV, marginEur, Rq, Rd2, paid1, paid2, fx2, fx3, inst1Eur, inst2Eur, thbIn, thbExact, surplus, targetOut, RmT, RpT, shares, lossAmt, bounce, squareUsdt } = M;
const here = path.dirname(fileURLToPath(import.meta.url));
const REVIEW = !!process.env.NPLIFY_REVIEW;                                   // round-2 review draft: yellow = new, red strike = goes
const outDir = process.env.NPLIFY_OUT || path.join(path.resolve(here, ".."), "docs");
const mk = (t) => (REVIEW ? `<mark class="rev">${t}</mark>` : t);
const dl = (t) => (REVIEW ? `<del class="rev">${t}</del> ` : "");
const VERSION = JSON.parse(fs.readFileSync(path.join(path.resolve(here, ".."), "data/erd.v5.json"), "utf8")).version, DATE = "22 October 2026";
const code = (s) => `<code>${esc(s)}</code>`;
const F = (s) => `<div class="formula">${esc(s)}</div>`;
const FR = (s) => `<div class="formula">${s}</div>`;                              // formula from pre-escaped parts (review marks inside)
const rdN = (x, n) => Math.round(x * 10 ** n + 1e-9) / 10 ** n;
const n = (x, dp = 2) => x.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
// a plain table from rows of strings (first row the header); numeric columns right-aligned
const T = (rows, numCols = [], cls = "") => `<table${cls ? ` class="${cls}"` : ""}><thead><tr>${rows[0].map((c, i) => `<th${numCols.includes(i) ? ' class="n"' : ""}>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c, i) => `<td${numCols.includes(i) ? ' class="n"' : ""}>${Array.isArray(c) ? c[0] : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;   // a cell given as [html] is inserted raw

// ------------------------------------------------------------------ acceptance vectors from NPL's own fee-table figures (FEE_PRACTICE)
// Each row: what NPL's sheet shows, what the formulas of this document give, and whether they agree.
// Rows are numbered B1 to B24 in the order printed (§19b); the numbers are frozen, a new case takes B25.
const NPL = [];
const dpOf = (x) => (Number.isInteger(x) ? 0 : (String(x).split(".")[1] || "").length);
const add = (name, inputs, computed, shown, note = "") => NPL.push({ id: "B" + (NPL.length + 1), name, inputs, computed: n(computed, dpOf(shown)), shown: n(shown, dpOf(shown)), ok: Math.abs(computed - shown) < 0.5 + 1e-9, note });
// two figures in one row (sender side / receiver side), each compared on its own
const add2 = (name, inputs, computed, shown, dp, note = "") => NPL.push({ id: "B" + (NPL.length + 1), name, inputs, computed: computed.map((c) => n(c, dp)).join(" / "), shown: shown.map((s) => n(s, dpOf(s))).join(" / "), ok: computed.every((c, i) => Math.abs(c - shown[i]) < 0.5 + 1e-9), note });
// 1. Evo USDT → EUR, 1.4 % sender on market, fixed_in (sender side)
{ const Rm = 0.888977323, a = 29325, s = 0.014; const Rs = Rm * (1 - s); add("Evo sender: 29,325 USDT at market 0.888977323, sender pays 1.40 %", "fixed_in; sender rate = market × (1 − 1.40 %) = " + Rs.toFixed(12), rdN(a * Rs, 2), 25704, "NPL's sheet prints the sender rate 0.876531640478 and EUR 25,704 (rounded to the unit)"); }
// 1b. the receiver's part on the principal (NPL's corrected sheet of 21 October: (29,325 − 2 %) × 0.888977323 = 25,548)
{ const Rm = 0.888977323, a = 29325; add("Evo receiver: the same deal, receiver pays 0.60 %", "fee parts on the principal: 29,325 × 0.888977323 × (1 − 1.40 % − 0.60 %)", rdN(a * Rm * (1 - 0.02), 2), 25548, "corrected sheet of 21 October: (29,325 − 2 %) × 0.888977323 = 25,548; the 8 October sheet read 25,550 (receiver part taken on the gross out)"); }
// 2. Evo selected senders, EUR → USDT quoted in_per_out, target 50,000 EUR, 1 % markup
{ const Rin = 1 / 0.8652, t = 50000, s = 0.01; add("Evo selected senders: EUR 50,000 target, market 1 ÷ 0.8652 USDT per EUR, sender pays 1.00 %", "target_out; amount_in = target × (1 + 1.00 %) × market in_per_out = 50,000 × 1.01 × " + Rin.toFixed(12), rdN(t * (1 + s) * Rin, 0), 58368, "NPL prints the final rate 1.16736014794267 = market × 1.01"); }
// 3. BF-Raeen via Jeton: 200,000 USDT, 1 % on market
add("BF-Raeen via Jeton: 200,000 USDT at 0.8610999, fee 1 %", "fixed_in; 200,000 × 0.8610999 × (1 − 1 %)", rdN(200000 * 0.8610999 * 0.99, 0), 170498);
// 4. BF-Raeen via Ali: 300,000 USDT, 1 % on the (recomputed) rate
add("BF-Raeen via Ali: 300,000 USDT at 0.864189, fee 1 %", "fixed_in; 300,000 × 0.864189 × (1 − 1 %)", rdN(300000 * 0.864189 * 0.99, 0), 256664, "the printed rate is recomputed so the sender-facing fee reads 1 %");
// 5. Raeen sub-account via Aquanow: 50,000 USDT, 4 % on market
add("Raeen sub-account: 50,000 USDT at 0.8650036, fee 4 %", "fixed_in; 50,000 × 0.8650036 × (1 − 4 %)", rdN(50000 * 0.8650036 * 0.96, 2), 41520.17);
// 6. GDC: USD 84,482 target + 2.5 % → USDT, rate 1
add("GDC: USD 84,482 target, fee 2.5 %, converted at a rate of 1 USDT per USD", "target_out; 84,482 × (1 + 2.5 %) ÷ 1.0000", rdN(84482 * 1.025, 0), 86594, "the sheet's figure implies a rate of exactly 1");
add("GDC above USD 500,000 a month: tier 2.25 %", "target_out; 84,482 × (1 + 2.25 %)", rdN(84482 * 1.0225, 0), 86383, "FEE_TIER chosen from PROJECT_MONTH_VOLUME");
// 7. 27 Group reseller: THB 17,000,000 fixed_in at 0.0259463782412186 EUR per THB, 2 %
add("27 Group (reseller): THB 17,000,000 at 0.0259463782412186 EUR per THB, fee 2 %", "fixed_in; sender rate = 0.0259463782412186 × 0.98 = 0.02542745; 17,000,000 × 0.02542745", rdN(17000000 * 0.0259463782412186 * 0.98, 2), 432266.66, "NPL rounds the EUR to the unit: 432,267");
add("27 Group: the same THB at Ali, agent rate 1 ÷ 33.83 USDT per THB", "what the partner delivers: 17,000,000 ÷ 33.83", rdN(17000000 / 33.83, 0), 502513, "agent fee 0.64 % inside the rate against market 1 ÷ 33.613");
add("27 Group balance clearance: EUR 329,408 target, market 38.13570206 THB per EUR, fee 2 %", "target_out; 329,408 × 1.02 × 38.13570206", rdN(329408 * 1.02 * 38.13570206, 2), 12813449.45, "then cash-rounded by NPL to THB 12,813,000 (nearest 1,000; the pair's cash_rounding)");
// 8. Bala reseller: EUR 2,220 target, 2 %, USDT per EUR 1 ÷ 0.8716, round-up to the unit
{ const Rin = 1 / 0.8716; add("Bala (reseller): EUR 2,220 target, market 1 ÷ 0.8716, fee 2 %", "target_out; 2,220 × 1.02 × " + Rin.toFixed(12), rdN(2220 * 1.02 * Rin, 2), 2597.98, "then rounded up to USDT 2,600 (USDT paid by reseller customers rounded up)"); }
// 9. 66 Group reseller: EUR 239,149 target, 1.5 %
{ const Rin = 1 / 0.8796; add("66 Group (reseller): EUR 239,149 target, market 1 ÷ 0.8796, fee 1.5 %", "target_out; 239,149 × 1.015 × " + Rin.toFixed(12), rdN(239149 * 1.015 * Rin, 2), 275962.07, "rounded to USDT 275,962"); }
// 10. TripleSeven: EUR 4,097, 1.5 %
{ const Rin = 1 / 0.8598; add("TripleSeven/GZ (reseller): EUR 4,097 target, market 1 ÷ 0.8598, fee 1.5 %", "target_out; 4,097 × 1.015 × " + Rin.toFixed(12), rdN(4097 * 1.015 * Rin, 0), 4837); }
// 11. Alpha Plus: EUR 2,939, 1.5 %
{ const Rin = 1 / 0.8712; add("Alpha Plus (reseller): EUR 2,939 target, market 1 ÷ 0.8712, fee 1.5 %", "target_out; 2,939 × 1.015 × " + Rin.toFixed(12), rdN(2939 * 1.015 * Rin, 2), 3424.11, "rounded to USDT 3,424"); }
// 12. Fair: EUR 1,079, 0.75 %
{ const Rin = 1 / 0.8642; add("Fair (reseller): EUR 1,079 target, market 1 ÷ 0.8642, fee 0.75 %", "target_out; 1,079 × 1.0075 × " + Rin.toFixed(12), rdN(1079 * 1.0075 * Rin, 2), 1257.92, "rounded to USDT 1,258"); }
// 13. D28 direction: Ali quotes 1.1738 EUR→USDT style for 0.851934
add("rate direction: Ali quotes 1.1738 (USDT per EUR) on a USDT → EUR pair", "normalised rate = 1 ÷ 1.1738 at the pair's precision (6)", rdN(1 / 1.1738, 6), 0.851934, "a direction slip freezes the pair instead of pricing a deal");
// B18 to B23, added 21 October 2026: the receiver side of the Evo selected-senders deal from NPL's corrected sheet, and the five
// figures NPL supplied for the cases its sheet had no line for (L10 to L13 and L3 of §18), each worked on NPL's own sheet convention.
add("Evo selected senders, receiver side: EUR 50,000 target, receiver pays 0.60 %", "receiver's part on the target: 50,000 × (1 − 0.60 %)", rdN(50000 * (1 - 0.006), 0), 49700, "the receiver line of B3; corrected sheet of 21 October");
add2("Part collection: 5,000 USDT → EUR at Ali, received as 4,000 + 1,000, priced once on the whole amount", "fixed_in; gross out 5,000 × 0.9000 × (1 − 1.4 %); client net 5,000 × 0.9000 × (1 − 2 %)", [rdN(5000 * 0.9 * 0.986, 2), rdN(5000 * 0.9 * 0.98, 2)], [4437, 4410], 2, "NPL's figure of 21 October, sender side / receiver side; nothing posts on the parts (L10)");
add2("Eight-decimal asset: 0.12345678 BTC → EUR at Ali, market 60,000, Ali 59,400", "fixed_in; gross out 0.12345678 × 60,000 × (1 − 1.4 %); client net 0.12345678 × 60,000 × (1 − 2 %)", [rdN(0.12345678 * 60000 * 0.986, 2), rdN(0.12345678 * 60000 * 0.98, 2)], [7304, 7259], 2, "NPL's figure of 21 October, rounded to the unit (L11)");
add("Tier reached exactly: GDC, month-to-date USD 450,000, USD 50,000 target out", "target_out; 50,000 × (1 + 2.5 %), tier 1 on the whole deal", rdN(50000 * 1.025, 0), 51250, "NPL's figure of 21 October; the next deal of any size is tier 2 (L12)");
add("Tier crossed inside one deal: GDC, month-to-date USD 490,000, USD 20,000 target out", "target_out; 10,000 × (1 + 2.5 %) + 10,000 × (1 + 2.25 %)", rdN(10000 * 1.025 + 10000 * 1.0225, 0), 20475, "NPL's figure of 21 October, the two-portion split confirmed (L13)");
add("Same-currency: 5,000 EUR → EUR at rate 1, Evo 2.8 % split 1.4 / 1.4", "fixed_in at rate 1; client net 5,000 × (1 − 2.8 %)", rdN(5000 * (1 - 0.028), 0), 4860, "NPL's figure of 21 October (L3)");
// B24, added 27 October 2026 (round 2 of the review): NPL confirmed the figures of L14, the opening-volume case of §5a.
add("Opening tier volume: GDC opens on day 20 at USD 480,000 month-to-date, USD 40,000 target out", "target_out; 20,000 × (1 + 2.5 %) + 20,000 × (1 + 2.25 %); counter afterwards 480,000 + 40,950", rdN(20000 * 1.025 + 20000 * 1.0225, 2), 40950, "NPL's figure of 27 October 2026: amount in 40,950.00, markup 950.00, counter 520,950.00 (L14)");
NPL[NPL.length - 1].rv = true;
if (NPL.length !== 24) throw new Error("vector B numbering is frozen at B1 to B24; got " + NPL.length);

// ------------------------------------------------------------------ L10 to L13: the cases added in the design review (a part collection, an eight-decimal asset, two deals on a tier boundary)
const D10 = price({ amountIn: 5000, Rm: EX.Rm, Rp: EX.Rp, basis: "market", s: EX.s, r: EX.r });            // deal 2 collected as 4,000 + 1,000, priced once on the whole
const D11 = (() => {                                                                                           // BTC at 8 decimals; EUR amounts 2 dp; every part on the principal (§3)
  const amountIn = 0.12345678, Rm = 60000, Rp = 59400, s = EX.s, r = EX.r, Rs = Rm * (1 - s);
  const principal = r2(amountIn * Rm), feeSender = r2(principal * s), feeReceiver = r2(principal * r), grossOut = r2(amountIn * Rs), clientNet = r2(principal * (1 - s - r));
  const actualOut = r2(amountIn * Rp), earnings = r2(actualOut - clientNet);
  return { amountIn, Rs, grossOut, feeSender, feeReceiver, clientNet, actualOut, partnerCost: 0, earnings, payable: clientNet, residual: 0, principal };
})();
const D12 = price({ targetOut: 50000, Rm: 1, Rp: 1, basis: "market", s: 0.025, r: 0 });                       // GDC at a rate of 1, tier 1 on the whole deal
const D13 = (() => {                                                                                           // GDC: two DEAL_FEE_TIER portions, 10,000 at 2.5 % and 10,000 at 2.25 %
  const portions = [[10000, 0.025], [10000, 0.0225]], targetOut = 20000;
  const amountIn = r2(portions.reduce((a, [t, s]) => a + t * (1 + s), 0)), feeSender = r2(amountIn - targetOut), Rs = targetOut / amountIn;
  return { amountIn, Rs, grossOut: targetOut, feeSender, feeReceiver: 0, clientNet: targetOut, actualOut: amountIn, partnerCost: 0, earnings: feeSender, payable: targetOut, residual: 0, blended: feeSender / targetOut };
})();
// ------------------------------------------------------------------ L14: round 2 of the review (07.1) — the opening volume in the counter, a deal straddling the threshold on the opening day
const OPEN14 = 480000;                                                                                         // GDC's month-to-date on the opening day (OPENING_ENTRY month_volume)
const D14 = (() => {                                                                                           // 20,000 at 2.5 % (up to the 500,000 threshold) and 20,000 at 2.25 %
  const portions = [[20000, 0.025], [20000, 0.0225]], targetOut = 40000;
  const amountIn = r2(portions.reduce((a, [t, s]) => a + t * (1 + s), 0)), feeSender = r2(amountIn - targetOut), Rs = targetOut / amountIn;
  return { amountIn, Rs, grossOut: targetOut, feeSender, feeReceiver: 0, clientNet: targetOut, actualOut: amountIn, partnerCost: 0, earnings: feeSender, payable: targetOut, residual: 0, blended: feeSender / targetOut, counterAfter: r2(OPEN14 + amountIn) };
})();

// ------------------------------------------------------------------ vectors from the ledger's worked deals (identical figures to the Ledger Posting Design)
const LV = [
  ["L1", "Deal 1 — Evo, 10,000 USDT → EUR at Ali (fee_in_rate), market 0.9000, Ali 0.8910, sender 1.4 % + receiver 0.6 % on market", D1, "USDT", "EUR"],
  ["L2", "Deal 3 — 10,000 USDT → EUR at Jeton (fee_on_market 1.25 %), same fee", DJ, "USDT", "EUR"],
  ["L3", "Same-currency 5,000 EUR → EUR at rate 1, Evo EUR → EUR 2.8 % split 1.4 / 1.4", DS, "EUR", "EUR"],
  ["L4", "3,000 USDT → THB cash at Ali (market 32.60, Ali 32.27), round_up_n 1,000", DT, "USDT", "THB"],
  ["L5", "2,000 USDT → GBP at Ali (market 0.7800, Ali 0.7722)", D4, "USDT", "GBP"],
  ["L6", "Raeen sub-account: 10,000 USDT → EUR at Aquanow (fee_on_market 0.80 %), sender 4 % on market, receiver 0", DR, "USDT", "EUR"],
  ["L7", "NPL-GR: target 10,852.09 USDT (= 9,450 EUR at 0.8708) collected in THB cash at Ali, 2 % markup on the target, cash round-up 1,000; Ali 1 ÷ 32.83 vs market 1 ÷ 32.50", DM, "THB", "USDT"],
  ["L8", "Pattern N: 300,000 USDT → EUR at Jeton (1.25 %)", DN_J, "USDT", "EUR"],
  ["L9", "Pattern N: 100,000 USDT → EUR at Ali", DN_A, "USDT", "EUR"],
  ["L10", "Part collection: deal 2, 5,000 USDT → EUR at Ali collected as 4,000 + 1,000 (T4 to T6); priced once on the whole amount, nothing posts on the parts", D10, "USDT", "EUR"],
  ["L11", "Eight-decimal asset: 0.12345678 BTC → EUR at Ali, market 60,000.00000000 EUR per BTC, Ali 59,400.00000000 (1 % inside), sender 1.4 % + receiver 0.6 %; rate_precision 8, amounts 2 dp", D11, "BTC", "EUR", 8],
  ["L12", "Tier boundary, exactly reached: GDC, month-to-date USD 450,000.00, target_out USD 50,000.00 at rate 1; the deal ends the month-to-date at exactly 500,000.00, so the whole deal is tier 1 (2.5 %) and the next deal, of any size, is tier 2", D12, "USDT", "USD"],
  ["L13", `Tier boundary, crossed: GDC, month-to-date USD 490,000.00, target_out USD 20,000.00; 10,000.00 at 2.5 % and 10,000.00 at 2.25 % (two DEAL_FEE_TIER portions, blended ${(D13.blended * 100).toFixed(3)} %)`, D13, "USDT", "USD"],
  ["L14", `Opening volume in the counter: GDC opens on day 20 with USD ${n(OPEN14)} month-to-date (opening line), target_out USD 40,000.00 at rate 1; 20,000.00 at 2.5 % and 20,000.00 at 2.25 % (blended ${(D14.blended * 100).toFixed(3)} %); counter afterwards ${n(D14.counterAfter)}`, D14, "USDT", "USD", 6, true],
];
const lvRow = ([id, name, D, cin, cout, rateDp = 6, rv = false]) => `<tr><td>${rv ? mk(id) : id}</td><td>${rv ? mk(esc(name)) : esc(name)}</td><td class="n">${cin === "BTC" ? D.amountIn.toFixed(8) : fmt(D.amountIn, cin)} ${cin}</td><td class="n">${n(D.Rs, rateDp)}</td><td class="n">${fmt(D.grossOut, cout)}</td><td class="n">${fmt(D.feeSender, cout)}</td><td class="n">${fmt(D.feeReceiver, cout)}</td><td class="n">${fmt(D.clientNet, cout)}</td><td class="n">${fmt(D.actualOut, cout)}</td><td class="n">${fmt(D.partnerCost, cout)}</td><td class="n">${fmt(D.earnings, cout)}</td><td class="n">${fmt(D.payable, cout)}</td><td class="n">${fmt(D.residual, cout)}</td></tr>`;

// ------------------------------------------------------------------ worked arithmetic blocks (numbers from the same objects the ledger posts)
const W = {
  fixedIn: [`10,000 USDT × market 0.9000 = 9,000.00 EUR (the principal at the basis rate)`, `sender part = 9,000 × 1.40 % = ${n(D1.feeSender)}; receiver part = 9,000 × 0.60 % = ${n(D1.feeReceiver)}`, `sender rate = 0.9000 × (1 − 1.40 %) = ${D1.Rs.toFixed(5)}; gross out = 10,000 × ${D1.Rs.toFixed(5)} = ${n(D1.grossOut)}`, `client net = 9,000 × (1 − 2.00 %) = ${n(D1.clientNet)} = gross out − receiver part`],
  delivered: [`Ali (fee_in_rate) converts at 0.8910: delivered = 10,000 × 0.8910 = ${n(D1.actualOut)}; NPL earnings = ${n(D1.actualOut)} − ${n(D1.clientNet)} = ${n(D1.earnings)}; Ali's inferred cost = 10,000 × (0.9000 − 0.8910) = ${n(D1.inferredPartnerCost)}, information only`, `Jeton (fee_on_market ${pct(JET)}) converts at market: ${n(DJ.grossConverted)}; partner cost = ${n(DJ.grossConverted)} × ${pct(JET)} = ${n(DJ.partnerCost)}; delivered ${n(DJ.actualOut)}; fee charged ${n(DJ.grossMargin)} (EARN_GROSS); NPL earnings = ${n(DJ.actualOut)} − ${n(DJ.clientNet)} = ${n(DJ.earnings)}`],
  target: [`NPL-GR: invoice 9,450 EUR ÷ 0.8708 = ${n(targetOut)} USDT to deliver`, `amount_in (exact) = ${n(targetOut)} × (1 + 2 %) × 32.50 THB per USDT = ${n(thbExact)} THB; collected as cash, rounded up to the 1,000 = ${n(thbIn, 0)} THB`, `client net = ${n(thbIn, 0)} ÷ 32.50 × (1 − 2 %)… no: in target mode the fee is on the target, so client net = target + the cash-rounding surplus = ${n(DM.clientNet)} USDT (${n(surplus)} surplus); sender part = amount_in × market − client net = ${n(DM.feeSender)}`, `Ali converts at 1 ÷ 32.83: delivered ${n(DM.actualOut)}; NPL earnings = ${n(DM.actualOut)} − ${n(DM.clientNet)} = ${n(DM.earnings)} = the 2 % markup less Ali's 1 %`],
  cash: [`THB payout in cash: client net ${fmt(DT.clientNet, "THB")} THB, cash_rounding round_up_n 1,000 → ${fmt(DT.payable, "THB")}; residual = ${fmt(DT.clientNet, "THB")} − ${fmt(DT.payable, "THB")} = ${fmt(DT.residual, "THB")} (negative: NPL's cost, EXP_ROUNDING); NPL's pool gets ${fmt(DT.earnings, "THB")} ${fmt(DT.residual, "THB")} = ${fmt(DT.earnings + DT.residual, "THB")}`],
  share: [`Raeen sub-account at Aquanow: 10,000 × 0.9000 = 9,000; sender pays 4 % = ${n(DR.feeSender)}; client net ${n(DR.clientNet)}; Aquanow 0.80 % of 9,000 = ${n(DR.partnerCost)}; delivered ${n(DR.actualOut)}`, `share base = fee parts ${n(DR.grossMargin)} − partner cost ${n(DR.partnerCost)} = ${n(M.shareBase)}; Raeen 50 % = ${n(M.raeenShare)}; NPL remainder ${n(M.nplRemainder)}; the 0.3 % rebate (${n(M.rebateAqn)} USDT) is outside the base`],
  variance: [`partner_calculates: 3,000 USDT expected at 0.8910 = ${n(M.V1.expected)}, booked at 0.8905 = ${n(M.V1.actual)}; variance = ${n(M.V1.variance)} → VAR_CONVERSION; client net ${n(M.V1.priced.clientNet)} unchanged`, `cutoff timing: locked 0.8910, converted next day at 0.8890 → ${n(M.V2.variance)} → VAR_CUTOFF`, `honoured expired rate: 0.8910 honoured, Ali at 0.8860 → ${n(M.V3.variance)} → VAR_RATE_HONOUR`],
  fx: [`invoice_rate = ${(1 / Rq).toFixed(6)} USDT per EUR (0.8708 the other way); instalment 1: 3,000 EUR × ${(1 / Rq).toFixed(6)} = ${n(paid1)} USDT paid at the same rate it was reserved at; true-up 0`, `instalment 2: discharge_rate ${(1 / Rd2).toFixed(6)}; paid 6,000 × ${(1 / Rd2).toFixed(6)} = ${n(paid2)}; reserved 6,000 × ${(1 / Rq).toFixed(6)} = ${n(paid2 + fx2)}; true-up = ${n(fx2)} USDT gain → VAR_FX_TIMING (a debit when the rate moves against NPL)`, `margin line: 450 EUR × ${(1 / Rd2).toFixed(6)} = ${n(450 / Rd2)}; reserved 450 × ${(1 / Rq).toFixed(6)} = ${n(450 / Rq)}; true-up ${n(fx3)}`],
  offset: [`NPL's margin at Jeton (EUR) ${n(offsetEur)} ÷ Ali's rate of the day 0.8910 = ${n(offsetUsdt)} USDT taken from the client's unconverted balance at Ali`, `Ali deal margin ${n(DN_A.earnings)} EUR ÷ 0.8910 = ${n(retainUsdt)} USDT retained (residual_in)`, `Ali converts 100,000 − ${n(offsetUsdt)} − ${n(retainUsdt)} = ${n(convertUsdt)} USDT × 0.8910 = ${n(eurOut)} EUR = client net ${n(DN_A.clientNet)} − ${n(offsetEur)} already delivered at Jeton`],
  square: [`bounce fee 15.00 GBP absorbed with no GBP pool at Ali → pool −15.00; squared at the next conversion: 15.00 ÷ 0.7722 = ${n(squareUsdt)} USDT of NPL's own converted alongside the client's`],
  loss: [`loss ${n(lossAmt)} USDT → EXP_LOSS; split partner ${n(shares.partner)} + sender ${n(shares.sender)} + client ${n(shares.client)} + NPL ${n(shares.npl)} = ${n(lossAmt)}; EXP_LOSS after recoveries = ${n(shares.npl)}`],
};
const list = (rows) => `<ul class="nums">${rows.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;

const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
@page land { size: A4 landscape; margin: 12mm 14mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
.land{page:land;break-before:page}
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;margin:0}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
p{margin:0 0 7pt} ul,ol{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 4pt}
code{font:8.8pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;margin:4pt 0 10pt;font-size:9.2pt}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt;vertical-align:bottom}
td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr{break-inside:avoid}
.title{text-align:center;margin-top:40mm}
.title .sub{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 10pt}
.rule{border-top:2px solid #222;border-bottom:1px solid #222;height:2px;margin:10pt 0 14pt}
.pb{break-before:page}
.formula{font:8.3pt/1.4 Menlo,Consolas,monospace;background:#f6f6f6;border-left:3px solid #2f5d9e;padding:5pt 8pt;margin:4pt 0 8pt;white-space:pre-wrap}
.box{border:1px solid #2f5d9e;background:#f3f6fb;padding:6pt 9pt;margin:8pt 0;font-size:9.8pt}
ul.nums{font-size:9.3pt;font-variant-numeric:tabular-nums;background:#fbfbf6;border:1px solid #e0dcc8;padding:5pt 9pt 5pt 22pt;margin:2pt 0 10pt}
.small{font-size:9pt;color:#444}
table.vec td,table.vec th{font-size:8.2pt;padding:2pt 3pt}
.ok{color:#1a7f37;font-weight:700} .chk{color:#8a4b00;font-weight:700}
mark.rev{background:#ffe58a;color:inherit;padding:0 1px} del.rev{color:#b00020;text-decoration:line-through} .rev-note{background:#ffe58a;padding:3pt 6pt;font-size:9pt;margin:0 0 8pt}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Calculation Specification v${VERSION}</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Calculation Specification · Draft v${VERSION}</p><p>New XP Technologies Limited</p><p>${DATE} · Confidential</p><p class="small" style="margin-top:14pt">Numbered with the ERD edition it is built against.</p></div>
<div class="rule"></div>
${REVIEW ? `<p class="rev-note">Round-2 review draft, 27 October 2026 (findings 07.1 and 07.2 of the v6.0 design review). Yellow = added or replaced text; red strike = text that goes. The client version is the same document without the marks.</p>` : ""}
<h2>How to read this pack</h2>
<p>Four map pages are now part of the pack as documents of their own, and are the place to start: the Top-Down Map (from the business, through the data model and the deal states, to the scenarios and the reading order), the Deal Flow on one page (Quote, Collect, Convert, Settle, with the roles and the money path), the Workflow Tree (8 classes, 27 sub-classes, 92 procedures, each naming who initiates, who approves, the codes it is written under and the records it touches) and the Workflow Tree on one page. Read them in that order, then this document. Every worked transaction (T), acceptance vector (L, B), walkthrough (W, X), flow (F) and procedure (C, A, D) has one identifier, listed in the Reading Companion's identifier register; the Test Strategy &amp; Coverage document says which test proves each procedure.</p>

<h2>1 · Conventions</h2>
<ul>
<li><b>Rates</b> are stored normalised to the pair's ${code("quote_direction")} (out units per 1 in unit unless the pair says in_per_out) at ${code("CURRENCY_PAIR.rate_precision")}. A partner's rate is stored as quoted (${code("PARTNER_RATE_VERSION.quoted_rate")}, ${code("quoted_direction")}) and the normalised ${code("rate")} is derived: equal to the quote when the directions agree, 1 ÷ quote at the pair's precision when they differ (D28).</li>
<li><b>Amounts</b> are exact decimals; fiat and USDT amounts are computed to 2 decimals (BTC-like assets to 8) with round half up, then rounded as the pair's option says (§9). Every intermediate figure in this document is computed, not typed.</li>
<li><b>Percentages</b> are stored as fractions (1.4 % = 0.014). ${code("sender_pays_pct")} + ${code("receiver_pays_pct")} = ${code("FEE_STRUCTURE.pct")}.</li>
<li><b>Precision of a check</b>: an acceptance vector matches when the computed figure and NPL's figure agree to the cent, or to the unit where NPL's sheet rounds to the unit.</li>
</ul>

<h2>2 · Rate basis, derived rates and the breach check</h2>
<p>${code("FEE_STRUCTURE.rate_basis")} says which rate the sender is priced on: <b>market</b> (the fee is disclosed; the partner's cost comes out of NPL's fee parts — Evo, the reseller projects) or <b>agent_rate</b> (a calculated rate, breakdown not disclosed; NPL keeps the whole fee and the partner's cost sits on top — BF via Ali, D22). The partner's own pricing is ${code("PARTNER_PAIR.partner_pricing")}: <b>fee_in_rate</b> (its cost is inside its rate, never posted; Ali, assumed 1 %) or <b>fee_on_market</b> (it converts at market and states ${code("partner_fee_pct")} separately; Jeton 1.25 %, Aquanow 0.80 %).</p>
${F(`basis_rate     = market_rate                        if rate_basis = market
               = partner_rate_version.rate         if rate_basis = agent_rate
rate           = quoted_rate                        if quoted_direction = pair.quote_direction
               = round(1 ÷ quoted_rate, rate_precision)   otherwise                      (D28)
spread         = 1 − partner_rate ÷ market_rate      (what the partner keeps against market, fee_in_rate)
breach         = spread > avg_2w_spread × (1 + variance_threshold_rel)   → the pair freezes until Finance decides`)}

<h2>2a · When the breach check cannot be trusted</h2>
<p>The breach check of Section 2 compares today's spread with the average spread of the previous two weeks. Three situations make that comparison unreliable; each has its own rule. The three values the rules use are project thresholds set by NPL Finance (THRESHOLD kinds ${code("rate_min_observations")}, ${code("rate_fallback_spread_abs")} and ${code("rate_abs_tolerance")}); the figures below are illustrative. Stale rates, the freeze on a breached pair and the use of confirmed versions only are unchanged.</p>
${T([["Situation", "Rule", "What the system does"],
  ["Too little history", "With fewer than rate_min_observations confirmed rate versions in the two-week window (a new partner, a new pair, a long holiday), the two-week average is not used.", "The spread is compared with the Management-approved fallback threshold instead: breach = spread > rate_fallback_spread_abs. Finance confirms the version with a reason; the pair is not frozen merely for lack of history."],
  ["Unusable baseline", "When avg_2w_spread is zero or negative (the partner has been pricing at or better than market), the percentage formula has no meaning.", ["The percentage formula is not run. The fallback threshold applies as above, and the version is flagged for Finance to confirm" + mk(" (the guard of the next row applies: the version is not usable until confirmed)") + "."]],
  ["Unusual rate, favourable or not", "A spread outside an absolute tolerance around the two-week average, in either direction: spread < avg_2w_spread − rate_abs_tolerance or spread > avg_2w_spread + rate_abs_tolerance.", [dl("The version is flagged for Finance to verify, not rejected and not frozen: an unusually favourable rate is checked (direction slip, wrong pair, stale partner) before it is used.") + mk("The version is flagged, not rejected: it enters the state <i>flagged</i> and cannot price a quote or instruct a conversion until Finance confirms it with a reason, or rejects it. The pair itself is not frozen: the last usable version keeps serving until it expires, and a corrected version may be entered. An unusually favourable rate is checked (direction slip, wrong pair, stale partner) before it is used, not after.") + " The existing breach rule still applies on top for an unfavourable spread."]]])}
${FR(esc(`observations = count of confirmed PARTNER_RATE_VERSION rows for the partner × pair in the last 14 days
if observations < rate_min_observations or avg_2w_spread ≤ 0:
    breach = spread > rate_fallback_spread_abs            (fallback; no percentage formula)
else:
    breach = spread > avg_2w_spread × (1 + variance_threshold_rel)   (Section 2, unchanged)
flag_for_verification = |spread − avg_2w_spread| > rate_abs_tolerance   (either direction; `) + dl("Finance confirms, nothing freezes") + mk("the version waits as flagged, unusable; the pair does not freeze") + ")")}
<div class="box">Typical Ali spread 1.00 %, variance_threshold_rel 20 %: a spread above 1.20 % breaches as today. New partner with four confirmed versions and rate_min_observations 10: the average is ignored and a spread above the fallback 1.50 % breaches. A day on which Ali quotes 0.30 % below market (spread −0.30 %) with rate_abs_tolerance 0.50 %: no breach, but the version is flagged and ${dl("Finance verifies the direction and the pair before it is used.")}${mk("no quote or conversion can use it until Finance has confirmed the direction and the pair; a quote attempted meanwhile is refused and the refusal is logged.")} The ${dl("three")}${mk("four")} rules are tested in Phase 1 (M1) with one case each${mk(" (the fourth: a quote and a conversion attempted against a flagged version, Test Strategy V-RB4)")}.</div>
<p>${mk("<b>A flagged version is a guard, not a warning.</b> The states of a version are those of the Lifecycle &amp; Approvals document (Figure 3) with one state added: a new version becomes usable, breached (the pair frozen) or <i>flagged</i>; a flagged version becomes usable when Finance confirms it with a reason (confirmed_by, approval_reason), or is rejected, and one that expires unconfirmed is simply expired. Only a usable version prices a quote or instructs a conversion: the engine refuses a quote and a conversion that would use a flagged version, tells the user that the version awaits Finance, and writes the refusal to AUDIT_LOG (record PARTNER_RATE_VERSION, action quote_refused or conversion_refused, with the user and the version). Operations cannot issue the quote first and have Finance check afterwards; there is no monitored-use policy. The acceptance test attempts a quote and a conversion while the flag awaits review: both are refused and the audit record exists; after Finance confirms, the same quote prices on the confirmed version.")}</p>

<h2>3 · Fee parts on the principal</h2>
<p>The sender's part and the receiver's part are each a percentage of the <b>principal at the basis rate</b>. They are never compounded on each other (300,000 USDT × 0.9000 − 2 % = 264,600).</p>
${F(`principal          = amount_in × basis_rate                                   (fixed_in)
fee_sender_part    = principal × sender_pays_pct
fee_receiver_part  = principal × receiver_pays_pct
sender_rate        = basis_rate × (1 − sender_pays_pct)                     (the rate the sender is given)
gross_out          = amount_in × sender_rate              = principal − fee_sender_part
client_net         = gross_out − fee_receiver_part        = principal × (1 − sender_pays_pct − receiver_pays_pct)`)}
${list(W.fixedIn)}
<div class="box"><b>Confirmed rule (NPL, 11 October).</b> Both parts are on the principal. NPL's fee sheet for Evo prints the receiver side as "EUR 25,704 − 0.6 % = 25,550", which takes the receiver's part from the gross out; on the principal it is 25,547.88, a difference of 0.6 % × 1.4 % of the principal (about 0.008 %). The sheet's receiver line is to be brought in line with the rule; the engine follows the rule.</div>

<h2>4 · Fixed and variable fee modes; the minimum-margin check</h2>
<p>In <b>fixed</b> mode ${code("pct")} is applied as above. In <b>variable</b> mode the fee is whatever leaves NPL its minimum margin after the partner's cost, within a floor and a cap: this is the check that decides whether 2 % is enough when the agent rate is high.</p>
${F(`required_pct   = min_margin_pct + spread            if rate_basis = market   (the partner's cost comes out of the fee)
               = min_margin_pct                     if rate_basis = agent_rate
fee_pct        = min(max_markup_pct, max(min_markup_pct, required_pct))
below_margin   = fee_pct < required_pct             → warn, never refuse a quote; Finance may ask the partner for a better rate or
                                                      recommend a fee above the cap (raise_fee_cap, Management approves, D41)`)}

<h2>4a · Who may send a quote, by margin</h2>
<p>The rules of Section 4 and of the Lifecycle &amp; Approvals document (section 5, price_quote) in one table.</p>
${T([["Situation at pricing", "Test", "Who sends or approves"],
  ["Margin at or above the floor", "fee_pct ≥ required_pct", "Operations sends the quote; no approval."],
  ["Below the floor", "fee_pct < required_pct (below_margin): the warning becomes a blocker at the send step", "Finance approves before the package is sent; Finance may instead ask the partner for a better rate."],
  ["Negative margin", "fee_pct after the cap leaves earnings < 0 (required_pct > max_markup_pct + the partner's cost)", "Finance approves and Management is added (escalation); the quote is not sent without both."],
  ["Fee above the cap", "the fee needed exceeds max_markup_pct", "Management approves a raise_fee_cap after Finance recommends it (FEE_DECISION); otherwise the cap stands."]])}

<h2>5 · Fee tiers by monthly volume (D21)</h2>
${F(`tier           = the FEE_TIER of the structure with the highest min_monthly_volume ≤ PROJECT_MONTH_VOLUME at quote
portion_1      = max(0, threshold_of_next_tier − PROJECT_MONTH_VOLUME)   capped at amount_in, priced at tier.pct
portion_2      = amount_in − portion_1                                     priced at next_tier.pct
fee_parts      = Σ portions × basis_rate × pct (sender and receiver parts in the structure's proportion)   — the blended sum`)}
<p>GDC: 2.5 % up to USD 500,000 a month, 2.25 % above; a leg that takes the month past the threshold is split into two DEAL_FEE_TIER portions.</p>

<h2>5a · The month-volume counter and what a void does to it</h2>
${FR(esc(`PROJECT_MONTH_VOLUME(project, month, ccy) = `) + mk(esc(`opening_volume(project, month, ccy)
                                          + `)) + esc(`Σ amount_in × basis_rate of forward legs priced in the calendar month`) + mk(esc(` from the opening date`)) + esc(`,
                                            in FEE_TIER.volume_currency, excluding legs voided before or after money moved
`) + mk(esc(`opening_volume = the approved OPENING_ENTRY of kind month_volume for the project, the opening month and the currency
                 (Cutover Approach §4: the month-to-date Σ amount_in × basis_rate of the deals priced before the opening date),
                 less the volume of any of those deals voided after the opening date; zero in every later month
`)) + esc(`tier at quote = the tier with the highest min_monthly_volume ≤ PROJECT_MONTH_VOLUME at the moment of pricing`))}
<p>A void lowers the counter for every quote priced after it; it never re-prices a leg already priced (pricing fields are write-once), so a leg that was split across two tiers keeps its split even if an earlier deal in the month is later voided. A return leg and a balance conversion do not count. Two quotes priced at the same moment read the counter under the lock on the month-volume row, so they are ordered and the second sees the first (the one-line database rule of Phase 1, M0 and M3); this is tested with real GDC data rather than designed for every edge case now. A backdated correction is a new leg priced today and counts in today's month.</p>
<p>${mk("<b>The opening volume.</b> A project that opens in the middle of a month carries its month-to-date volume into the counter as the opening line (OPENING_ENTRY of kind month_volume: one figure per project, month and volume currency, taken from the sheet, verified by Finance against the deals it sums and approved by Management like every other opening entry; it is a counter, not a posting). Tier evaluation reads the counter and never asks where its volume came from: with GDC at USD 480,000.00 on an opening day 20, the next target_out of USD 40,000.00 is split at the USD 500,000.00 threshold into 20,000.00 at 2.5 % and 20,000.00 at 2.25 % (L14), and the counter stands at 520,950.00 afterwards. Three rules keep the opening line honest. (1) The system's own legs count only from the opening date: an in-flight deal entered in its current state keeps its original priced_at, before the opening date, so its volume is inside the opening line and is never added a second time. (2) A void after the opening date of a deal whose volume is in the opening line lowers the counter by that deal's volume, exactly as a void of a system-priced leg does; the opening line itself is never edited, the void is what the counter reads. (3) In turnover reporting the opening month shows the opening line as one figure, volume before the opening date from the sheet, beside the system's legs priced from the opening date; the in-flight deals are reported under that line and not as system turnover, and from the following month the opening line is in no figure at all. A project opened on the first of a month has an opening volume of zero.")}</p>

<h2>6 · Amount modes: fixed_in and target_out</h2>
<p>A collect-first deal prices what arrived (<b>fixed_in</b>, §3). A quote-first deal for a given out amount (<b>target_out</b>: an invoice, a GDC USD amount, a reseller's EUR) applies the fee as a markup on the target, which is how NPL's sheets print it (EUR 50,000 × 1.01 ÷ rate; USD 84,482 + 2.5 %).</p>
${F(`amount_in      = target_out × (1 + sender_pays_pct) ÷ basis_rate          (then cash-rounded if collected in cash, §9)
sender_rate    = basis_rate ÷ (1 + sender_pays_pct)                        (printed as target ÷ amount_in)
client_net     = target_out × (1 − receiver_pays_pct) + cash_rounding_surplus
fee_sender_part = amount_in × basis_rate − (target_out + cash_rounding_surplus)`)}
<p class="small">Note: × (1 + s) and ÷ (1 − s) differ by s² (0.01 % at a 1 % fee). NPL's convention, × (1 + s), is adopted; the fixed_in formula keeps × (1 − s). The cash-rounding surplus is the client's (in NPL-GR, NPL-GR's).</p>
${list(W.target)}

<h2>7 · Customer-facing figures (D22)</h2>
${F(`customer_facing_fee_pct  = sender_pays_pct + receiver_pays_pct        if customer_facing_fee_basis = actual
                         = sender_pays_pct on the agent rate          if sender_pays_on_agent_rate
                         = FEE_STRUCTURE.customer_facing_fee_pct      if fixed   (BF via Ali prints 1 %)
customer_facing_rate     = sender_rate ÷ (1 − customer_facing_fee_pct)   — the "market rate" the quote prints, derived, never typed`)}

<h2>8 · What the partner delivers, and NPL's earnings</h2>
${F(`fee_in_rate:    delivered = amount_in × partner_rate;           partner_cost (inferred) = amount_in × (market − partner_rate), information only
fee_on_market:  converted = amount_in × market_rate;  partner_cost = converted × partner_fee_pct;  delivered = converted − partner_cost
earnings        = delivered − client_net                      (NPL's margin: EARN_GROSS − EXP_PARTNER)
EARN_GROSS      = converted − client_net                       (fee_on_market: the full fee parts, the partner's cost booked apart as EXP_PARTNER;
                                                                fee_in_rate: the fee parts less the partner's hidden cost — equal to earnings)
retained_in     = earnings_in_out_currency ÷ partner_rate      when the margin is kept in the collection currency (CONVERSION.residual_in, D46)
converted_in    = amount_in − retained_in − offset_in          (what the partner actually converts, §13)`)}
${list(W.delivered)}

<h2>9 · Rounding and precision (D25, D46)</h2>
${F(`payout:   amount_rounding = exact | truncate_unit | nearest_unit | round_up_unit | nearest_n | round_up_n (rounding_unit)
          payable  = round(client_net, option);   residual = client_net − payable   (signed)
          residual > 0 → stays client money in DUE;  residual < 0 → NPL's cost, EXP_ROUNDING, out of its margin
cash in:  cash_rounding = truncate_n | nearest_n | round_up_n (cash_rounding_unit: AED 100, USD cash 10, THB 1,000)   — the collection side;
          a cash payout rounds by the pair's amount_rounding (round_up_n 1,000 for THB hand-overs)
          amount_in = round(exact amount_in, option);   surplus = (amount_in − exact) × basis_rate × (1 − fee)   → the client's
rates:    rate_precision per pair (6 for EUR/USDT, 8 for BTC);   intermediate amounts 2 dp (8 for BTC), round half up`)}
<p>Bank transfers go out exact, cents included; rounding to a unit applies where the pair says so, in practice to cash hand-overs (NPL, 11 October). USDT paid by reseller customers is rounded up.</p>
${list(W.cash)}

<h2>10 · Same-currency pairs (D33)</h2>
${F(`basis_rate = partner_rate = 1;   fee parts and client_net as in §3;   earnings = fee_sender_part + fee_receiver_part`)}
<p>Evo EUR → EUR: 2.8 %, sender 1.4 % and receiver 1.4 %: 5,000 EUR → client net ${n(DS.clientNet)}, NPL ${n(DS.earnings)}.</p>

<h2>11 · Markup shares and rebates (D26, D27, D46)</h2>
${F(`share base (share_of_net_markup) = fee_sender_part + fee_receiver_part − partner_cost      (rebates never in the base)
share_i        = base × pct_i;   Σ pct_i ≤ 100 %;   accrued and posted with the conversion
  npl_pays:      SHARE_PAYABLE to the party, off EARN_GROSS
  party_retains: the party holds the funds; NPL's remainder = base − Σ shares → SHARE_RECEIVABLE
share_of_earnings: share = earnings × pct;   fixed_pct: priced into the sender rate
rebate         = amount_in × pct                 (basis pct_of_amount, the only basis; Jeton 0.4 %, Aquanow 0.3 %, Novi 0.3 %), in PARTNER_REBATE_RULE.payout_currency
               accrued with the conversion → REBATE_RECEIVABLE / EARN_REBATE; the statement clears it, a difference trues up EARN_REBATE`)}
${list(W.share)}

<h2>12 · Variances, by cause (D29, D45, D46)</h2>
${F(`expected_out   = converted_in × partner_rate_version.rate           (as priced)
actual_out     = what the partner booked (partner_calculates) or expected_out (npl_calculates)
variance       = expected_out − actual_out                          (+ = NPL received less than priced)
client_net     unchanged (write-once);  pool = actual_out − client_net;  the variance posts to
  VAR_CONVERSION   partner_calculates differences and basis variance on a reroute
  VAR_CUTOFF       rate stamped at lock vs rate used after the partner's cutoff (conversion_due_date)
  VAR_RATE_HONOUR  an expired quote's rate honoured by override vs the day's rate
  VAR_FX_TIMING    an obligation priced on one day and discharged on another (§14)`)}
${list(W.variance)}

<h2>13 · Earnings retained in the collection currency and offset between partners (D46)</h2>
${F(`retained_in    = earnings ÷ partner_rate                        (this deal's margin kept unconverted, residual_in)
offset_to      = from_amount ÷ to_partner_rate_of_day          (EARNINGS_OFFSET: NPL's margin at the from-partner, in USDT at the to-partner)
converted_in   = amount_in − retained_in − offset_to
client_out     = converted_in × partner_rate                    = client_net − from_amount already delivered at the from-partner
neutral for the client: Σ client entitlement unchanged; NPL's EARN_GROSS for the deal is recognised in the collection currency`)}
${list(W.offset)}

<h2>14 · Invoices paid in instalments and the forex true-up (D24, D46)</h2>
${F(`reserved_i     = obligation_discharged_i × DEAL_GROUP.invoice_rate   (payout currency per invoice currency at pricing: the stored base)
paid_i         = obligation_discharged_i × SETTLEMENT_LINE.discharge_rate_i   (same direction, at payment)
true_up_i      = reserved_i − paid_i                              (+ gain, − loss) → VAR_FX_TIMING against NPL's pool
INVOICE_BALANCE = vendor invoice: amount − Σ obligation_discharged over released lines not returned;  resale invoice: amount − Σ DEAL_GROUP.invoice_amount collected`)}
${list(W.fx)}

<h2>15 · The reseller project (NPL-GR)</h2>
${F(`reseller_margin   = resale_invoice − its vendor_invoice (INVOICE.vendor_invoice_id)   (EUR; fixed when the two invoices are posted)
target_out        = resale_invoice ÷ pricing_rate                            (USDT to deliver)
amount_in         = target_out × (1 + remittance_markup) ÷ market_rate       (§6; cash-rounded if THB cash)
remittance_margin = earnings (§8) + Σ true_up_i (§14) − fees                 (NPL's example: 2 % − 1 % Ali − 0.1 % forex = 0.9 %…1.2 %)
NPL_PROFIT        = Σ remittance_margin + Σ reseller_margin                  (per currency; one figure through REPORTING_VALUE)`)}

<h2>16 · Pools, squaring, loss splits, balance conversion, returns, network fees</h2>
${F(`squaring       : pool_ccy < 0 after an absorbed fee → next conversion includes (−pool_ccy ÷ partner_rate) of NPL's own USDT
loss split     : sender_share + npl_share + partner_share + client_share = LOSS_EVENT.amount ≤ amount verified or released;  one LOSS_RECOVERY posting per share (T41a–c)
balance conv.  : out = amount × partner_rate (no fee unless a FEE_DECISION applies §3); rounding as the pair says
return leg     : out = returned_amount × partner_rate; markup only by FEE_DECISION; the first conversion's margin stays earned
bank fee       : treatment waived (client bears) | carry_forward (SHORTFALL, topped up) | absorbed or covered (NPL, out of the pool)
network fee    : USDT; zero and unposted when none applies; absorbed by NPL or charged back to the sender per project policy`)}
${list(W.square.concat(W.loss))}

<h2>17 · Reporting values (D43)</h2>
${F(`REPORTING_VALUE(figure, ccy, as_of) = figure × latest market_rate(platform pair ccy → reporting_currency), with the rate, its time and a stale flag
never posted, quoted or settled; the only control reading it is a ceiling stated in the reporting currency`)}

<section class="land"><h2>18 · Acceptance vectors A — the ledger's worked deals</h2>
<p>Produced by the pricing function the Ledger Posting Design v${VERSION} imports; the posting tables there show the same figures line by line. Rates: market 0.9000 EUR per USDT, Ali 0.8910; Evo sender 1.4 %, receiver 0.6 % (L3: 1.4 / 1.4; L6: 4 % / 0; L7: 2 % markup on the target, receiver 0). L10 to L13 are the cases added in the design review: a part collection, an eight-decimal asset and two deals on a tier boundary; figures to the cent, BTC amounts to eight decimals.${mk(" L14 is the case added in round 2 of the review: a deal priced on the opening day that straddles the tier threshold, with the opening volume in the counter (§5a).")}</p>
<table class="vec"><thead><tr><th>#</th><th>Case</th><th class="n">amount_in</th><th class="n">sender rate</th><th class="n">gross out</th><th class="n">sender part</th><th class="n">receiver part</th><th class="n">client net</th><th class="n">delivered</th><th class="n">partner cost</th><th class="n">NPL earnings</th><th class="n">payable</th><th class="n">residual</th></tr></thead><tbody>
${LV.map(lvRow).join("")}
</tbody></table>
<p class="small">L4's payable is the cash hand-over rounded up to 1,000 THB (residual negative, NPL's cost). L7's client net includes the ${n(surplus)} USDT cash-rounding surplus. Variances, offsets and the forex true-ups are in §12–§14 with their figures.</p>
<p class="small">L11: principal 0.12345678 × 60,000 = ${n(D11.principal)}; sender part 1.4 % = ${n(D11.feeSender)}, receiver part 0.6 % = ${n(D11.feeReceiver)}, client net ${n(D11.principal)} × 0.98 = ${n(D11.clientNet)} = gross out ${n(D11.grossOut)} − ${n(D11.feeReceiver)}; delivered 0.12345678 × 59,400 = ${n(D11.actualOut)}; earnings ${n(D11.earnings)}. L12 and L13: GDC converts at a rate of 1 and the partner's cost is inside it, so delivered = amount_in and NPL's earnings are the markup; the sender rate is printed as target ÷ amount_in. NPL supplied its own figures for these four cases on 21 October 2026; they are vectors B19 to B22 (§19) and all four match.${mk(` L14: opening line ${n(OPEN14)} + target 40,000.00: portions 20,000.00 at 2.5 % and 20,000.00 at 2.25 %, amount_in ${n(D14.amountIn)}, markup ${n(D14.feeSender)} (blended ${(D14.blended * 100).toFixed(3)} %); counter afterwards ${n(D14.counterAfter)} = ${n(OPEN14)} + ${n(D14.amountIn)}. NPL confirmed these figures on 27 October 2026; they are vector B24 (§19) and it matches.`)}</p>

<h2>19 · Acceptance vectors B — NPL's own figures, recomputed</h2>
<p>Each row takes the inputs NPL's fee sheet shows, applies this document's formulas, and compares with the figure the sheet prints. "matches" means to the cent, or to the unit where the sheet rounds. Rows are numbered B1 to ${dl("B23")}${mk("B24")} (19b). B2 is compared with NPL's corrected sheet of 21 October 2026; B18 to B23 were added on 21 October: the receiver side of the Evo selected-senders deal from the corrected sheet, and the five figures NPL supplied for the cases its sheet had no line for.${mk(" B24 was added on 27 October 2026 in round 2 of the review: NPL's figure for the opening-volume case L14.")}</p>
<table class="vec"><thead><tr><th>Id</th><th>Case</th><th>Formula applied</th><th class="n">Computed</th><th class="n">NPL's sheet</th><th>Result</th><th>Note</th></tr></thead><tbody>
${NPL.map((v) => { const M = (t) => (v.rv ? mk(t) : t); return `<tr><td>${M(v.id)}</td><td>${M(esc(v.name))}</td><td>${M(esc(v.inputs))}</td><td class="n">${M(v.computed)}</td><td class="n">${M(v.shown)}</td><td>${M(v.ok ? '<span class="ok">matches</span>' : '<span class="chk">sheet differs</span>')}</td><td>${M(esc(v.note))}</td></tr>`; }).join("")}
</tbody></table>
<p class="small">${NPL.filter((v) => v.ok).length} of ${NPL.length} match.</p>
</section>

<h2 class="pb">19a · Machine-readable vectors and the regression gate</h2>
<p>Vector sets A (L1 to ${dl("L13")}${mk("L14")}) and B (B1 to ${dl("B23")}${mk("B24")}, numbered as in the Reading Companion's identifier appendix) are published with this document as one machine-readable file (${code("vectors-v5.9.csv")}: one row per vector with every input and every expected figure), which is the file the automated tests read. Every release runs the full vector set together with the ledger fixtures (the 61 worked transactions), the state-machine tests and the visibility tests; a failing exact test blocks the release. The gate is stated in the Test Strategy &amp; Coverage document and continues under the support bundle after go-live; the first automated runs are in Phase 1 (M4).</p>

<h2>19b · Identifiers of the vector B rows</h2>
<p>The rows of Section 19 are numbered B1 to ${dl("B23")}${mk("B24")} in the order printed, so that the test suite, the Reading Companion's identifier register and NPL's sheet can refer to one row by one name. The numbers are frozen: a row is never renumbered and a number is never reused; a new case takes the next number (${dl("B24")}${mk("B25")}).</p>

<h2>19c · Which cases the two vector sets cover</h2>
<p>A vector is one worked deal: its inputs (amount, rates, fee parts) and the figure the system must produce. Set A (L1 to ${dl("L13")}${mk("L14")}, Section 18 and 18a) are examples New XP wrote and worked through the pricing formula by hand; they prove the formula does what this specification says, not that NPL agrees with the result. Set B (B1 to ${dl("B23")}${mk("B24")}, Section 19) are NPL's own numbers: each row takes a line from NPL's fee sheet of 8 October (corrected 21 October) or a figure NPL supplied on 21 October${mk(" or 27 October")} for the cases the sheet had no line for, recomputes it with the formula and shows whether the two agree. A matching B row means the system reproduces what NPL charges today, which is the acceptance test NPL cares about; a matching A row means the system matches our reading of the rules.</p>
<p>The table below puts the two sets side by side, by case, so that one page answers what is covered by NPL's own figure and what is not.</p>
${T([["Case", "Vector A", "Vector B", "Status"],
  ["Fixed amount in, partner fee inside the rate, sender and receiver parts", "L1, L5, L9", "B1, B2, B5", "covered (B2 on the corrected sheet of 21 October, 19a)"],
  ["Fixed amount in, partner fee on the market price (Jeton, Aquanow)", "L2, L8", "B4", "covered"],
  ["Sub-account with a markup share and a partner rebate", "L6", "B6", "covered"],
  ["Target amount out, markup on the target; sender and receiver sides", "L7", "B3, B18, B12 to B16", "covered"],
  ["Cash delivery rounded up to the note", "L4", "B11", "covered"],
  ["Agent rate: the partner's fee inside the rate it quotes", "L7", "B10", "covered"],
  ["Reseller deal priced from a fixed amount in", "—", "B9", "covered by NPL's figure; no hand-worked example needed"],
  ["Monthly tier: tier 1 and tier 2 (GDC)", "L12, L13", "B7, B8", "covered"],
  ["Rate direction: a pair quoted the other way round", "—", "B17", "covered by NPL's figure"],
  ["Same-currency deal at rate 1 (Evo EUR → EUR)", "L3", "B23", "covered"],
  ["Deal collected in parts, priced once on the whole", "L10", "B19", "covered"],
  ["Asset quoted to eight decimals (BTC)", "L11", "B20", "covered"],
  ["Monthly tier reached exactly on the deal", "L12", "B21", "covered"],
  ["Monthly tier crossed inside one deal, two portions", "L13", "B22", "covered (NPL confirms the two-portion split)"],
  [[mk("Opening tier volume: a deal straddling the threshold on the opening day (§5a)")], [mk("L14")], [mk("B24")], [mk("covered: NPL's figure of 27 October 2026 matches")]]])}
<p>Every case now has a B row${mk(", L14 included: NPL confirmed its figures on 27 October 2026 and they are B24")}. NPL supplied the figures for the five cases its sheet had no line for on 21 October 2026, each worked on its own sheet convention (sender side and receiver side, rounded to the unit); all five agree with the formula and are frozen as B19 to B23 under the rule of 19b. A new case takes ${dl("B24")}${mk("B25")}.</p>

<h2 class="pb">20 · Acceptance</h2>
<ol>
<li>The engine reproduces every vector of §18 and §19 exactly (to the cent, or to the unit where the sheet rounds), and every posting amount of the Ledger Posting Design v${VERSION}.</li>
<li>Fee parts are computed on the principal (§3) and never compounded; a target-out quote applies the fee as a markup on the target (§6).</li>
<li>Every rounding step uses the pair's configured option and records the signed residual with its owner (§9).</li>
<li>Variances are posted to the account of their cause (§12); the forex true-up of each instalment is posted per line (§14); an earnings offset leaves every client entitlement unchanged (§13).</li>
<li>NPL_PROFIT returns remittance earnings, reseller earnings and their sum, per currency, and the same figures through REPORTING_VALUE (§15, §17).</li>
</ol>
<p class="small"><i>Draft v${VERSION} — for review with NPL. Vectors A are worked examples; vectors B are NPL's figures from the fee table of 8 October 2026.</i></p>
</body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const name = REVIEW ? "NPLify-Calculation-Specification-review" : `NPLify-Calculation-Specification-v${VERSION}`;
const h = path.join(outDir, name + ".html"), p = path.join(outDir, name + ".pdf");
fs.writeFileSync(h, clientFacing(html));
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
fs.writeFileSync(path.join(outDir, "calc-vectors.json"), JSON.stringify({ version: VERSION, ledger: Object.fromEntries(LV.map(([id, name, D, cin, cout]) => [id, { name, in: cin, out: cout, ...D }])), npl: NPL }, null, 1));
if (!REVIEW) {                                                                   // the published vector file gains L14 (round 2) if it lacks it
  const csvPath = path.join(outDir, "vectors-v5.9.csv");
  if (fs.existsSync(csvPath) && !fs.readFileSync(csvPath, "utf8").includes("\nL14,")) {
    const row = `L14,A,"Opening volume in the counter: GDC opens on day 20 with USD 480,000 month-to-date (opening line), target_out USD 40,000 at rate 1; 20,000 at 2.5 % and 20,000 at 2.25 % (blended 2.375 %)",${D14.amountIn.toFixed(2)},USDT,target_out,market,1,1,fee_in_rate,,0.02375,0,${D14.Rs.toFixed(6)},${D14.grossOut.toFixed(2)},${D14.feeSender.toFixed(2)},0.00,${D14.clientNet.toFixed(2)},${D14.actualOut.toFixed(2)},0.00,${D14.earnings.toFixed(2)},${D14.payable.toFixed(2)},0.00,,worked example (round 2),"opening line 480,000.00; counter afterwards ${D14.counterAfter.toFixed(2)}; two DEAL_FEE_TIER portions"\n`;
    const lines = fs.readFileSync(csvPath, "utf8").split("\n");
    const i = lines.findIndex((l) => l.startsWith("L13,"));
    lines.splice(i + 1, 0, row.trimEnd());
    fs.writeFileSync(csvPath, lines.join("\n"));
  }
  if (fs.existsSync(csvPath) && !fs.readFileSync(csvPath, "utf8").includes("\nB24,")) {   // B24 (27 October 2026): NPL's figure for L14
    const row = `B24,B,"Opening tier volume: GDC opens on day 20 at USD 480,000 month-to-date, USD 40,000 target out",${D14.amountIn.toFixed(2)},USDT,target_out,market,1,1,fee_in_rate,,0.02375,0,${D14.Rs.toFixed(6)},${D14.grossOut.toFixed(2)},${D14.feeSender.toFixed(2)},0.00,${D14.clientNet.toFixed(2)},${D14.actualOut.toFixed(2)},0.00,${D14.earnings.toFixed(2)},${D14.payable.toFixed(2)},0.00,40950,matches,"NPL figure 27 Oct: amount in 40,950; markup 950; counter 520,950; the case of L14"`;
    const lines = fs.readFileSync(csvPath, "utf8").split("\n");
    const i = lines.findIndex((l) => l.startsWith("B23,"));
    lines.splice(i + 1, 0, row);
    fs.writeFileSync(csvPath, lines.join("\n"));
  }
}
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "· NPL vectors matching:", NPL.filter((v) => v.ok).length, "/", NPL.length);
