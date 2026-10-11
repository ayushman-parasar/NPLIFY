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
const outDir = path.join(path.resolve(here, ".."), "docs");
const VERSION = M.ERD_VERSION, DATE = "11 October 2026";
const code = (s) => `<code>${esc(s)}</code>`;
const F = (s) => `<div class="formula">${esc(s)}</div>`;
const rdN = (x, n) => Math.round(x * 10 ** n + 1e-9) / 10 ** n;
const n = (x, dp = 2) => x.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });

// ------------------------------------------------------------------ acceptance vectors from NPL's own fee-table figures (FEE_PRACTICE)
// Each row: what NPL's sheet shows, what the formulas of this document give, and whether they agree.
const NPL = [];
const add = (name, inputs, computed, shown, note = "") => NPL.push({ name, inputs, computed, shown, ok: Math.abs(computed - shown) < 0.5 + 1e-9, note });
// 1. Evo USDT → EUR, 1.4 % sender on market, fixed_in (sender side)
{ const Rm = 0.888977323, a = 29325, s = 0.014; const Rs = Rm * (1 - s); add("Evo sender: 29,325 USDT at market 0.888977323, sender pays 1.40 %", "fixed_in; sender rate = market × (1 − 1.40 %) = " + Rs.toFixed(12), rdN(a * Rs, 2), 25704, "NPL's sheet prints the sender rate 0.876531640478 and EUR 25,704 (rounded to the unit)"); }
// 1b. the receiver's part on the principal (NPL's sheet compounds it on the EUR: 25,704 − 0.6 % = 25,550)
{ const Rm = 0.888977323, a = 29325; add("Evo receiver: the same deal, receiver pays 0.60 %", "fee parts on the principal: 29,325 × 0.888977323 × (1 − 1.40 % − 0.60 %)", rdN(a * Rm * (1 - 0.02), 2), 25550, "NPL's sheet applies 0.60 % to the EUR 25,704 (25,550); on the principal, the confirmed rule, it is 25,547.88 — the sheet's line is the one to correct (see §3)"); }
// 2. Evo selected senders, EUR → USDT quoted in_per_out, target 50,000 EUR, 1 % markup
{ const Rin = 1 / 0.8652, t = 50000, s = 0.01; add("Evo selected senders: EUR 50,000 target, market 1 ÷ 0.8652 USDT per EUR, sender pays 1.00 %", "target_out; amount_in = target × (1 + 1.00 %) × market in_per_out = 50,000 × 1.01 × " + Rin.toFixed(12), rdN(t * (1 + s) * Rin, 0), 58368, "NPL prints the final rate 1.16736014794267 = market × 1.01"); }
// 3. BF-Raeen via Jeton: 200,000 USDT, 1 % on market
add("BF-Raeen via Jeton: 200,000 USDT at 0.8610999, fee 1 %", "fixed_in; 200,000 × 0.8610999 × (1 − 1 %)", rdN(200000 * 0.8610999 * 0.99, 0), 170498);
// 4. BF-Raeen via Ali: 300,000 USDT, 1 % on the (recomputed) rate
add("BF-Raeen via Ali: 300,000 USDT at 0.864189, fee 1 %", "fixed_in; 300,000 × 0.864189 × (1 − 1 %)", rdN(300000 * 0.864189 * 0.99, 0), 256664, "the printed rate is recomputed so the sender-facing fee reads 1 % (D22)");
// 5. Raeen sub-account via Aquanow: 50,000 USDT, 4 % on market
add("Raeen sub-account: 50,000 USDT at 0.8650036, fee 4 %", "fixed_in; 50,000 × 0.8650036 × (1 − 4 %)", rdN(50000 * 0.8650036 * 0.96, 2), 41520.17);
// 6. GDC: USD 84,482 target + 2.5 % → USDT, rate 1
add("GDC: USD 84,482 target, fee 2.5 %, converted at a rate of 1 USDT per USD", "target_out; 84,482 × (1 + 2.5 %) ÷ 1.0000", rdN(84482 * 1.025, 0), 86594, "the sheet's figure implies a rate of exactly 1");
add("GDC above USD 500,000 a month: tier 2.25 %", "target_out; 84,482 × (1 + 2.25 %)", rdN(84482 * 1.0225, 0), 86383, "FEE_TIER chosen from PROJECT_MONTH_VOLUME (D21)");
// 7. 27 Group reseller: THB 17,000,000 fixed_in at 0.0259463782412186 EUR per THB, 2 %
add("27 Group (reseller): THB 17,000,000 at 0.0259463782412186 EUR per THB, fee 2 %", "fixed_in; sender rate = 0.0259463782412186 × 0.98 = 0.02542745; 17,000,000 × 0.02542745", rdN(17000000 * 0.0259463782412186 * 0.98, 2), 432266.66, "NPL rounds the EUR to the unit: 432,267");
add("27 Group: the same THB at Ali, agent rate 1 ÷ 33.83 USDT per THB", "what the partner delivers: 17,000,000 ÷ 33.83", rdN(17000000 / 33.83, 0), 502513, "agent fee 0.64 % inside the rate against market 1 ÷ 33.613");
add("27 Group balance clearance: EUR 329,408 target, market 38.13570206 THB per EUR, fee 2 %", "target_out; 329,408 × 1.02 × 38.13570206", rdN(329408 * 1.02 * 38.13570206, 2), 12813449.45, "then cash-rounded by NPL to THB 12,813,000 (nearest 1,000; the pair's cash_rounding)");
// 8. Bala reseller: EUR 2,220 target, 2 %, USDT per EUR 1 ÷ 0.8716, round-up to the unit
{ const Rin = 1 / 0.8716; add("Bala (reseller): EUR 2,220 target, market 1 ÷ 0.8716, fee 2 %", "target_out; 2,220 × 1.02 × " + Rin.toFixed(12), rdN(2220 * 1.02 * Rin, 2), 2597.98, "then rounded up to USDT 2,600 (D25: USDT paid by reseller customers rounded up)"); }
// 9. 66 Group reseller: EUR 239,149 target, 1.5 %
{ const Rin = 1 / 0.8796; add("66 Group (reseller): EUR 239,149 target, market 1 ÷ 0.8796, fee 1.5 %", "target_out; 239,149 × 1.015 × " + Rin.toFixed(12), rdN(239149 * 1.015 * Rin, 2), 275962.07, "rounded to USDT 275,962"); }
// 10. TripleSeven: EUR 4,097, 1.5 %
{ const Rin = 1 / 0.8598; add("TripleSeven/GZ (reseller): EUR 4,097 target, market 1 ÷ 0.8598, fee 1.5 %", "target_out; 4,097 × 1.015 × " + Rin.toFixed(12), rdN(4097 * 1.015 * Rin, 0), 4837); }
// 11. Alpha Plus: EUR 2,939, 1.5 %
{ const Rin = 1 / 0.8712; add("Alpha Plus (reseller): EUR 2,939 target, market 1 ÷ 0.8712, fee 1.5 %", "target_out; 2,939 × 1.015 × " + Rin.toFixed(12), rdN(2939 * 1.015 * Rin, 2), 3424.11, "rounded to USDT 3,424"); }
// 12. Fair: EUR 1,079, 0.75 %
{ const Rin = 1 / 0.8642; add("Fair (reseller): EUR 1,079 target, market 1 ÷ 0.8642, fee 0.75 %", "target_out; 1,079 × 1.0075 × " + Rin.toFixed(12), rdN(1079 * 1.0075 * Rin, 2), 1257.92, "rounded to USDT 1,258"); }
// 13. D28 direction: Ali quotes 1.1738 EUR→USDT style for 0.851934
add("D28 rate direction: Ali quotes 1.1738 (USDT per EUR) on a USDT → EUR pair", "normalised rate = 1 ÷ 1.1738 at the pair's precision (6)", rdN(1 / 1.1738, 6), 0.851934, "a direction slip freezes the pair instead of pricing a deal");

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
];
const lvRow = ([id, name, D, cin, cout]) => `<tr><td>${id}</td><td>${esc(name)}</td><td class="n">${fmt(D.amountIn, cin)} ${cin}</td><td class="n">${D.Rs.toFixed(6)}</td><td class="n">${fmt(D.grossOut, cout)}</td><td class="n">${fmt(D.feeSender, cout)}</td><td class="n">${fmt(D.feeReceiver, cout)}</td><td class="n">${fmt(D.clientNet, cout)}</td><td class="n">${fmt(D.actualOut, cout)}</td><td class="n">${fmt(D.partnerCost, cout)}</td><td class="n">${fmt(D.earnings, cout)}</td><td class="n">${fmt(D.payable, cout)}</td><td class="n">${fmt(D.residual, cout)}</td></tr>`;

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
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Calculation Specification v${VERSION}</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Calculation Specification · Draft v${VERSION}</p><p>New XP Technologies Limited</p><p>${DATE} · Confidential</p><p class="small" style="margin-top:14pt">Numbered with the ERD edition it is built against.</p></div>
<div class="rule"></div>

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

<h2>5 · Fee tiers by monthly volume (D21)</h2>
${F(`tier           = the FEE_TIER of the structure with the highest min_monthly_volume ≤ PROJECT_MONTH_VOLUME at quote
portion_1      = max(0, threshold_of_next_tier − PROJECT_MONTH_VOLUME)   capped at amount_in, priced at tier.pct
portion_2      = amount_in − portion_1                                     priced at next_tier.pct
fee_parts      = Σ portions × basis_rate × pct (sender and receiver parts in the structure's proportion)   — the blended sum`)}
<p>GDC: 2.5 % up to USD 500,000 a month, 2.25 % above; a leg that takes the month past the threshold is split into two DEAL_FEE_TIER portions.</p>

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
<p>Produced by the pricing function the Ledger Posting Design v${VERSION} imports; the posting tables there show the same figures line by line. Rates: market 0.9000 EUR per USDT, Ali 0.8910; Evo sender 1.4 %, receiver 0.6 % (L3: 1.4 / 1.4; L6: 4 % / 0; L7: 2 % markup on the target, receiver 0).</p>
<table class="vec"><thead><tr><th>#</th><th>Case</th><th class="n">amount_in</th><th class="n">sender rate</th><th class="n">gross out</th><th class="n">sender part</th><th class="n">receiver part</th><th class="n">client net</th><th class="n">delivered</th><th class="n">partner cost</th><th class="n">NPL earnings</th><th class="n">payable</th><th class="n">residual</th></tr></thead><tbody>
${LV.map(lvRow).join("")}
</tbody></table>
<p class="small">L4's payable is the cash hand-over rounded up to 1,000 THB (residual negative, NPL's cost). L7's client net includes the ${n(surplus)} USDT cash-rounding surplus. Variances, offsets and the forex true-ups are in §12–§14 with their figures.</p>

<h2>19 · Acceptance vectors B — NPL's own figures, recomputed</h2>
<p>Each row takes the inputs NPL's fee sheet shows, applies this document's formulas, and compares with the figure the sheet prints. "matches" means to the cent, or to the unit where the sheet rounds.</p>
<table class="vec"><thead><tr><th>Case</th><th>Formula applied</th><th class="n">Computed</th><th class="n">NPL's sheet</th><th>Result</th><th>Note</th></tr></thead><tbody>
${NPL.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.inputs)}</td><td class="n">${n(v.computed, Number.isInteger(v.shown) ? 0 : (String(v.shown).split(".")[1] || "").length)}</td><td class="n">${n(v.shown, Number.isInteger(v.shown) ? 0 : (String(v.shown).split(".")[1] || "").length)}</td><td>${v.ok ? '<span class="ok">matches</span>' : '<span class="chk">sheet differs</span>'}</td><td>${esc(v.note)}</td></tr>`).join("")}
</tbody></table>
<p class="small">${NPL.filter((v) => v.ok).length} of ${NPL.length} match; the one marked "sheet differs" is the receiver line of NPL's sheet, which compounds the receiver's part on the gross out; the confirmed rule (§3) puts it on the principal.</p>
</section>

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
const name = `NPLify-Calculation-Specification-v${VERSION}`;
const h = path.join(outDir, name + ".html"), p = path.join(outDir, name + ".pdf");
fs.writeFileSync(h, clientFacing(html));
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
fs.writeFileSync(path.join(outDir, "calc-vectors.json"), JSON.stringify({ version: VERSION, ledger: Object.fromEntries(LV.map(([id, name, D, cin, cout]) => [id, { name, in: cin, out: cout, ...D }])), npl: NPL }, null, 1));
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "· NPL vectors matching:", NPL.filter((v) => v.ok).length, "/", NPL.length);
