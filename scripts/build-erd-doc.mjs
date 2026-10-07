// Build the client-facing ERD document (HTML + PDF) from data/erd.v5.json.
//   node scripts/build-erd-doc.mjs            -> docs/NPLify-P0-ERD-v4.0.html and .pdf
// The PDF is printed with headless Chrome; each diagram is scaled to fit one landscape page.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));
const outDir = path.join(root, "docs");
fs.mkdirSync(outDir, { recursive: true });

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ------------------------------------------------------------------ diagrams
// Each diagram lists its full entities per column; `stubs` are grey references to entities drawn elsewhere.
const DIAGRAMS = [
  { id: "1a", title: "Configuration — project, parties and receiver groups", cols: [
      ["PROJECT", "INTRODUCER", "RATE_SOURCE"],
      ["SENDER", "RECEIVER_GROUP", "OWN_WALLET", "THRESHOLD", "CURRENCY_PAIR"],
      ["COLLECTION_SENDING_ENTITY", "SENDER_RECEIVER_ALLOW", "RECEIVER", "PAIR_RATE_SOURCE", "REFERRAL_RULE"],
      ["RECEIVING_ENTITY", "RECEIVING_ENTITY_ACCOUNT", "~PARTNER_CONFIG", "~PARTNER_PAIR", "~SETTLEMENT_REGISTRATION"]] },
  { id: "1b", title: "Configuration — partner configuration block", cols: [
      ["PARTNER", "~PROJECT", "~CURRENCY_PAIR", "~SENDER", "~RECEIVING_ENTITY_ACCOUNT"],
      ["PARTNER_CONFIG"],
      ["PARTNER_PAIR", "FACILITATING_ENTITY", "COLLECTION_RECEIVING_ENTITY", "SETTLEMENT_SENDING_ENTITY", "SETTLEMENT_RAIL", "SETTLEMENT_REGISTRATION", "PARTNER_REBATE_RULE"],
      ["FEE_STRUCTURE", "FEE_OVERRIDE", "WALLET"]] },
  { id: "2", title: "Rates", cols: [
      ["~RATE_SOURCE", "~CURRENCY_PAIR", "~PARTNER_PAIR"],
      ["MARKET_RATE", "RATE_COMPARISON"],
      ["PARTNER_RATE_VERSION"],
      ["~DEAL", "~CONVERSION", "~BALANCE_CONVERSION"]] },
  { id: "3a", title: "Deal lifecycle — deal group, legs, collection, conversion, reroute, balance conversion", cols: [
      ["~PROJECT", "~SENDER", "~RECEIVER_GROUP", "~PARTNER_PAIR", "~FACILITATING_ENTITY", "~FEE_STRUCTURE", "~MARKET_RATE", "~PARTNER_RATE_VERSION"],
      ["DEAL_GROUP", "DEAL"],
      ["COLLECTION", "CONVERSION", "REROUTE", "SENDER_CREDIT", "EARNINGS_RECEIVABLE"],
      ["BALANCE_CONVERSION", "ENTITLEMENT_REATTRIBUTION", "~OWN_WALLET", "~PARTNER_CONFIG", "~COLLECTION_SENDING_ENTITY", "~DISBURSEMENT_RETURN"]] },
  { id: "3b", title: "Disbursement, return, confirmation, fees, referrals and rebates", cols: [
      ["~PROJECT", "~PARTNER_CONFIG", "~SETTLEMENT_SENDING_ENTITY", "~SETTLEMENT_RAIL", "~SETTLEMENT_REGISTRATION", "~RECEIVER", "~DEAL", "~BALANCE_CONVERSION", "~REFERRAL_RULE", "~PARTNER_REBATE_RULE"],
      ["DISBURSEMENT", "FEE_DECISION", "REFERRAL_ACCRUAL", "PARTNER_REBATE_ACCRUAL"],
      ["DISBURSEMENT_LINE", "BANK_FEE_EVENT"],
      ["DISBURSEMENT_RETURN", "CONFIRMATION", "SHORTFALL"]] },
  { id: "4", title: "Ledger & controls", cols: [
      ["~COLLECTION", "~CONVERSION", "~BALANCE_CONVERSION", "~DISBURSEMENT", "~DISBURSEMENT_RETURN", "~CONFIRMATION", "~BANK_FEE_EVENT", "~REROUTE", "~REFERRAL_ACCRUAL", "~PARTNER_REBATE_ACCRUAL"],
      ["LEDGER_TRANSACTION", "LEDGER_POSTING"],
      ["LEDGER_ACCOUNT", "~PARTNER_CONFIG", "~OWN_WALLET", "~RECEIVER", "~SENDER", "~INTRODUCER"],
      ["USER", "APPROVAL", "AUDIT_LOG", "RECORD_LOCK"]] },
];
const homeOf = {};
for (const dg of DIAGRAMS) for (const col of dg.cols) for (const n of col) if (!n.startsWith("~")) homeOf[n] = dg.id;

const W = 168, PITCH = 236, HEAD = 15, ROW = 9.2, PAD = 3, VGAP = 22, STUB_H = 26;
const COLOR = { config: "#2f5d9e", rates: "#0f7c74", deal: "#b7651a", settle: "#7a3fa0", ledger: "#2f7d3c", view: "#6b7280" };

function diagramSvg(dg) {
  const nodes = {};
  dg.cols.forEach((col, ci) => {
    let y = 0;
    for (const raw of col) {
      const stub = raw.startsWith("~"), name = stub ? raw.slice(1) : raw, e = D.E[name];
      if (!e) throw new Error("unknown entity " + name);
      const h = stub ? STUB_H : HEAD + e.f.length * ROW + PAD;
      nodes[name] = { name, stub, x: ci * PITCH, y, w: W, h, e };
      y += h + VGAP;
    }
  });
  // centre each column vertically against the tallest column
  const colHeights = dg.cols.map((col) => col.reduce((s, raw) => s + nodes[raw.replace("~", "")].h + VGAP, -VGAP));
  const maxH = Math.max(...colHeights);
  dg.cols.forEach((col, ci) => { const off = (maxH - colHeights[ci]) / 2; for (const raw of col) nodes[raw.replace("~", "")].y += off; });

  const rels = D.R.filter((r) => nodes[r[0]] && nodes[r[1]] && r[2] !== "actor" && r[2] !== "view" && !(nodes[r[0]].stub && nodes[r[1]].stub));
  const parts = [];
  const border = (n, tx, ty) => { // point on n's border towards (tx,ty)
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = tx - cx, dy = ty - cy;
    if (dx === 0 && dy === 0) return [cx, cy];
    const sx = n.w / 2 / Math.abs(dx || 1e-9), sy = n.h / 2 / Math.abs(dy || 1e-9), s = Math.min(sx, sy);
    return [cx + dx * s, cy + dy * s];
  };
  const cardOf = (c) => { const m = c.split(":").map((s) => s.trim()); return [m[0] || "", (m[1] || "").replace(/^n$/, "many")]; };
  // edges first (under the boxes)
  for (const r of rels) {
    const a = nodes[r[0]], b = nodes[r[1]];
    const kind = r[2];
    const dash = kind === "poly" ? ' stroke-dasharray="3 2"' : "";
    const sw = kind === "owns" ? 1.1 : 0.7;
    const color = kind === "owns" ? "#1f3f73" : kind === "poly" ? "#b23a6e" : "#777";
    const [sc, tc] = cardOf(r[5]);
    if (a === b) { // self reference loop
      const x = a.x + a.w, y = a.y + 10;
      parts.push(`<path d="M${x},${y} C${x + 40},${y - 14} ${x + 40},${y + 22} ${x},${y + 14}" fill="none" stroke="${color}" stroke-width="${sw}" marker-end="url(#arr)"/>`);
      parts.push(`<text x="${x + 24}" y="${y + 2}" class="lbl">${esc(r[4])}</text>`);
      continue;
    }
    const ac = [a.x + a.w / 2, a.y + a.h / 2], bc = [b.x + b.w / 2, b.y + b.h / 2];
    let p1 = border(a, ...bc), p2 = border(b, ...ac), d, mid;
    if (a.x === b.x) { // same column: bulge to the right
      p1 = [a.x + a.w, a.y + a.h / 2]; p2 = [b.x + b.w, b.y + b.h / 2];
      const k = 70; d = `M${p1[0]},${p1[1]} C${p1[0] + k},${p1[1]} ${p2[0] + k},${p2[1]} ${p2[0]},${p2[1]}`;
      mid = [p1[0] + k * 0.75, (p1[1] + p2[1]) / 2];
    } else {
      d = `M${p1[0]},${p1[1]} L${p2[0]},${p2[1]}`; mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    }
    parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}"${dash} marker-end="url(#arr${kind === "poly" ? "p" : kind === "owns" ? "o" : ""})"/>`);
    const lw = r[4].length * 3.3 + 4;
    parts.push(`<rect x="${mid[0] - lw / 2}" y="${mid[1] - 7.5}" width="${lw}" height="8.5" fill="#fff" fill-opacity="0.92"/>`);
    parts.push(`<text x="${mid[0]}" y="${mid[1] - 1}" text-anchor="middle" class="lbl">${esc(r[4])}</text>`);
    const t1 = [p1[0] + (p2[0] - p1[0]) * 0.07, p1[1] + (p2[1] - p1[1]) * 0.07 - 1.5];
    const t2 = [p2[0] - (p2[0] - p1[0]) * 0.1, p2[1] - (p2[1] - p1[1]) * 0.1 - 1.5];
    if (sc) parts.push(`<text x="${t1[0]}" y="${t1[1]}" text-anchor="middle" class="card">${esc(sc)}</text>`);
    if (tc) parts.push(`<text x="${t2[0]}" y="${t2[1]}" text-anchor="middle" class="card">${esc(tc)}</text>`);
  }
  // boxes
  for (const n of Object.values(nodes)) {
    const c = n.stub ? "#9aa3af" : COLOR[n.e.d];
    parts.push(`<g><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="#fff" stroke="${n.stub ? "#9aa3af" : "#333"}" stroke-width="0.6"${n.stub ? ' stroke-dasharray="2 1.5"' : ""}/>`);
    parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${HEAD}" fill="${c}"/>`);
    parts.push(`<text x="${n.x + n.w / 2}" y="${n.y + 10.5}" text-anchor="middle" class="name">${esc(n.name)}</text>`);
    if (n.stub) {
      parts.push(`<text x="${n.x + n.w / 2}" y="${n.y + HEAD + 8}" text-anchor="middle" class="stubnote">defined in Diagram ${homeOf[n.name]}</text>`);
    } else {
      n.e.f.forEach((f, i) => {
        const y = n.y + HEAD + (i + 1) * ROW - 2.2;
        if (i) parts.push(`<line x1="${n.x}" y1="${n.y + HEAD + i * ROW}" x2="${n.x + n.w}" y2="${n.y + HEAD + i * ROW}" stroke="#ddd" stroke-width="0.4"/>`);
        parts.push(`<text x="${n.x + 4}" y="${y}" class="row"><tspan class="ty">${esc(f[1])}</tspan> ${esc(f[0])}${f[2] ? ` <tspan class="key">${esc(f[2])}</tspan>` : ""}</text>`);
      });
    }
    parts.push(`</g>`);
  }
  const allX = Object.values(nodes).map((n) => n.x + n.w), m = 30;
  const vw = Math.max(...allX) + m + 40, vh = maxH + m * 2;
  const PAGE_ASPECT = 273 / 178; const wide = (vw + m) / vh >= PAGE_ASPECT;
  return `<svg viewBox="${-m} ${-m} ${vw + m} ${vh}" ${wide ? 'width="100%"' : 'height="100%"'} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram ${dg.id} — ${esc(dg.title)}">
<defs>
 <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="#777" stroke-width="1.2"/></marker>
 <marker id="arro" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,1 L9,5 L0,9 z" fill="#1f3f73"/></marker>
 <marker id="arrp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="#b23a6e" stroke-width="1.2"/></marker>
</defs>
<style>
 .name{font:700 8px Helvetica,Arial,sans-serif;fill:#fff}
 .row{font:6.6px Menlo,Consolas,monospace;fill:#111}
 .ty{fill:#777} .key{font-weight:700;fill:#1f4e8c}
 .lbl{font:6.2px Helvetica,Arial,sans-serif;fill:#333}
 .card{font:6px Helvetica,Arial,sans-serif;fill:#555}
 .stubnote{font:italic 6.2px Helvetica,Arial,sans-serif;fill:#6b7280}
</style>
${parts.join("\n")}
</svg>`;
}

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
const newEnts = Object.keys(D.E).filter((n) => D.E[n].v === "new" && D.E[n].d !== "view");
const changedEnts = Object.keys(D.E).filter((n) => D.E[n].v === "changed" && D.E[n].d !== "view");

const notes = {
  config: [
    "A <b>Project</b> (= client) owns its configuration. Receivers sit in <b>receiver groups</b>: every project has one default group and every receiver belongs to exactly one group. Entitlement is tracked per group, so payouts within a group are ordinary settlement and only payouts across groups are offsets; a project with a single group never has an offset.",
    "A <b>Receiver</b> has a kind: <code>counterparty</code> for a client receiver; <code>sender_return</code> stands for a sender so refunds use the ordinary payout path and the partner's destination approval; <code>partner_transit</code> stands for a partner's collection endpoint so the hop of a two-leg route is an ordinary payout. <code>sender_return</code> receivers live in the project's return group and never appear on forward deals or allow lists.",
    "A receiving entity holds one or more <b>accounts</b>, each with a currency and rail (EUR via SWIFT and EUR via SEPA are two accounts). Registrations and payout lines point at the account.",
    "Fees are per partner × pair (<code>FEE_STRUCTURE</code> under <code>PARTNER_PAIR</code>), so choosing the partner is part of pricing. <code>PARTNER.disclosure_style</code> records whether the partner's markup is visible; <code>partner_markup_pct</code> is known only for market_plus partners.",
    "Three collection-endpoint kinds by method: crypto-in → <code>WALLET</code>; bank-in → <code>COLLECTION_RECEIVING_ENTITY</code>; cash-in → no record (instructions on the deal). Cash collections round to the nearest 100 / 500 / 1000 units by currency (<code>CURRENCY_PAIR.cash_rounding_unit</code>).",
    "Destination approval is per partner: <code>SETTLEMENT_REGISTRATION</code> is an account of the project's receiving entity as registered with this partner. <code>SETTLEMENT_SENDING_ENTITY</code> is the narrative on an outgoing transfer; <code>SETTLEMENT_RAIL</code> is the bank/EMI that executes it; neither holds money. <code>COLLECTION_SENDING_ENTITY</code> is provenance only and never a payout destination.",
    "<code>OWN_WALLET</code> exists for rerouting and pass-through (AQN-LT-Sub is an own wallet at Aquanow); <code>PARTNER_CONFIG.applicable_for_reroute</code> defines the alternate-partner set. <code>INTRODUCER</code> / <code>REFERRAL_RULE</code> record referral commissions NPL pays; <code>PARTNER_REBATE_RULE</code> records rebates a partner pays NPL.",
  ],
  rates: [
    "The rate comparison for the day is created lazily by the first deal that needs it, one per partner × pair × date, and reused by every deal that day. A partner may give a new rate during the day, so one date can hold several versions. Rolling averages are built from confirmed versions only.",
    "A version is breached when spread &gt; avg_2w × (1 + variance_threshold_rel); quoting and conversion on that partner × pair freeze until Finance approves with a reason, rejects, or asks for a better rate. Versions are never overwritten; every deal leg, conversion and balance conversion references its exact version.",
    "Cross-source slippage is a query over <code>MARKET_RATE</code> across sources for the same pair and window.",
  ],
  deal: [
    "<b>Every deal belongs to a deal group.</b> <code>DEAL_GROUP</code> is the client-facing instruction: the pair as the sender sees it, the sender rate, fee, reference and entry mode. A plain single-partner deal is a group of one leg; a route that needs two partners (INR → USDT at Ali, USDT → EUR at Jeton) has two forward legs; a rejected payout is unwound with a return leg.",
    "<b>Legs.</b> <code>leg_type</code> forward or return; <code>funding_source</code> collection, prior_leg (leg 2 of a route, no collection) or returned_disbursement (a return leg). Priced once and partner fixed at quote hold per leg. Attribution is to the receiver group; the receiver is optional until settlement.",
    "Two entry modes as before: collect-first legs are born in state Collected with priced_at = conversion time; quote-first legs carry sent / valid / grace timestamps and a late decision. An estimate-first mode gives an indicative figure and prices at conversion.",
    "<b>Conversion has exactly one owner</b>: a deal leg or a <code>BALANCE_CONVERSION</code>. The receiver-side fee is taken at conversion. Amounts are truncated to whole units at conversion; the dropped fraction (<code>rounding_residual</code>) stays client money in the balance and pays out when it reaches a whole unit. NPL's margin is captured at conversion and is never again at risk from a return or a forward.",
    "<b>Balance conversion</b> is NPL converting a client's held balance (5K SGD → USDT to fund a 15K USDT payout): Finance-initiated, no sender, receiver or collection, same rate machinery, markup by <code>FEE_DECISION</code>. It names the receiver group it serves; <code>ENTITLEMENT_REATTRIBUTION</code> moves that group's entitlement to the new currency, and any excess over the group's entitlement is booked as an approved offset.",
    "<b>Reroute</b> is the only way partner or facilitating entity change after quote. Forwarding is forward_full or forward_and_recover_dues: NPL nets what the alternate partner owes it (<code>EARNINGS_RECEIVABLE</code>) against the funds forwarded, within the outstanding receivable, with the partner's agreement recorded. Post-collection outcome is via the own wallet or a refund to the sender.",
  ],
  settle: [
    "One settlement model: <code>DISBURSEMENT</code> drains one partner's holding into one or many <code>DISBURSEMENT_LINE</code>s, in whole units. Under disburse_policy to_zero the balance after release is less than one unit; under hold_allowed the balance may rest at the partner within the project's exposure cap.",
    "A line's <code>paid_receiver_id</code> may be in another group: that is the offset, created by the same action, with Management approval and tighter aging.",
    "<b>Rejected payout.</b> When the receiving or intermediary bank rejects a transfer, <code>DISBURSEMENT_RETURN</code> records the returned amount, bank fee and reason; the line's outcome becomes returned, a reversing ledger transaction puts the money back into the client's balance and <code>BANK_FEE_EVENT</code> books the bounce fee. The money then stays in balance for later payouts, or funds a return leg that converts back and pays the sender's return receiver.",
    "<b>Fee decisions.</b> <code>FEE_DECISION</code> is a one-off, approved decision on a single subject: markup applied or waived on a return leg or balance conversion, a network-fee override on a refund, a bank-fee treatment override on one settlement. Standing rules stay in <code>FEE_STRUCTURE</code> and <code>FEE_OVERRIDE</code>.",
    "<code>CONFIRMATION</code> is full or short; a short confirmation opens a <code>SHORTFALL</code> topped up by a later disbursement. Rounding differences no longer land here. <code>REFERRAL_ACCRUAL</code> and <code>PARTNER_REBATE_ACCRUAL</code> accrue per deal under their rules; rebates are reconciled monthly against the partner's statement.",
  ],
  ledger: [
    "Client due balances are held as one account per project × partner × currency (CL.&lt;PARTNER&gt;.&lt;CCY&gt;.DUE); group entitlement is a view, not an account. <code>holder_type</code> never includes a settlement rail or narrative entity.",
    "<b>Ownership flips client → company at one event only: margin recognition at conversion.</b> NPL never advances money to a receiver, and withholding on a reroute is not a separate event because the margin is always captured by whichever partner converts.",
    "Recover dues on a reroute posts own-wallet cash against the earnings receivable at the partner: company money on both sides, no income.",
    "New transaction sources: BalanceConversion, DisbursementReturn, Referral, Rebate. New account purposes: REFERRAL_PAYABLE, REBATE_RECEIVABLE; ADVANCE is removed. New cost components: referral, rounding.",
    "<code>APPROVAL</code>, <code>AUDIT_LOG</code> and <code>RECORD_LOCK</code> are modelled once and apply to all master data. Approver ≠ initiator on every approval; Operations never sees derived economics. New approval actions: refund_to_third_party, cross_group_payout, balance_conversion, recover_dues.",
  ],
};

const removed = [
  ["RECEIVER_ENTITLEMENT (view)", "Replaced by GROUP_ENTITLEMENT: entitlement is tracked per receiver group."],
  ["REROUTE.forwarding_policy = withhold_earnings", "Removed: NPL's margin is always captured at conversion."],
  ["LEDGER_ACCOUNT purpose ADVANCE, and the advance approval", "Removed: NPL never advances money to a receiver."],
];

const frsVocab = D.FRS_VOCAB.map(([t, m]) => t === "Receiving Entity" ? [t, "RECEIVING_ENTITY (member of a RECEIVER, which belongs to a RECEIVER_GROUP) with its RECEIVING_ENTITY_ACCOUNTs"] : t === "Settlement" ? [t, "DISBURSEMENT + DISBURSEMENT_LINE + CONFIRMATION (+ DISBURSEMENT_RETURN when rejected)"] : t === "Inter-entity redirection" ? [t, "Offset across receiver groups: DISBURSEMENT_LINE.paid_receiver_id in another group than the entitled one"] : [t, m]);
frsVocab.push(["Double conversion / pass-through", "DEAL_GROUP with two legs (funding_source = prior_leg), hop via a partner_transit RECEIVER"]);
const frsDev = D.FRS_DEV.map(([a, b, c]) => a.startsWith("Strict Client") ? [a, "RECEIVER_GROUP → RECEIVER → RECEIVING_ENTITY → account; SENDER with a group allow-list; FRS project = one default group", "Generalisation per NPL instruction"] : a.startsWith("One settlement per deal") ? [a, "Accumulate → disburse to less than one unit (whole units; rounding dust carried), or hold within the exposure cap where the project allows", "Generalisation"] : a.startsWith("AQN-LT-Sub") ? [a, "OWN_WALLET at Aquanow; pass-through is a two-leg deal group or a reroute via the own wallet", "Resolved (v4.0)"] : [a, b, c]);

// ------------------------------------------------------------------ HTML
const diagramPage = (dg) => `<section class="diagram-page">
<figure>${diagramSvg(dg)}<figcaption>Diagram ${dg.id} — ${esc(dg.title)}</figcaption></figure>
</section>`;

const openOpen = D.OPENQ.filter((q) => q.status !== "answered");
const openDone = D.OPENQ.filter((q) => q.status === "answered");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify · P0 Technical Baseline — ERD & Data Model · Draft v4.0</title>
<style>
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
@page land { size: A4 landscape; margin: 10mm 12mm 10mm 12mm; }
html,body{margin:0;padding:0}
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;max-width:100%}
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
.diagram-page{page:land;break-before:page;break-after:page;height:190mm;display:flex;flex-direction:column}
.diagram-page figure{margin:0;flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-start}
.diagram-page svg{display:block;margin:0 auto;max-width:100%;max-height:100%}
.diagram-page figure > svg{flex:0 1 auto}
.diagram-page figcaption{font:italic 10pt Georgia,serif;margin-top:3mm;flex:0 0 auto}
.small{font-size:9pt;color:#444}
.status{color:#2f5d9e}
</style></head><body>

<div class="title">
<h1>NPLify · P0 Technical Baseline</h1>
<p class="sub">Deliverable 1 — Entity-Relationship Diagram &amp; Data Model · Draft v4.0</p>
<p class="org">New XP Technologies Limited</p>
<p class="date">7 October 2026 · Confidential</p>
</div>
<p><b>Status:</b> Rebuilt from ERD v3.0 (2 October 2026), the <i>NPLify — Project Understanding v1.0</i> with Sud's review comments, and the ERD review of 6–7 October 2026 that traced three operational scenarios (a payout rejected by the receiving bank, a two-leg route across two partners, an ad-hoc conversion of a client balance) against the model. Supersedes v3.0 in full.<br>
<b>Convention:</b> all monetary amounts stored as exact decimals; every table carries <code>created_at</code> / <code>created_by</code>; audit, approvals and locking are modelled once (domain 4) and apply to all master data. Derived figures (client balance, group entitlement, offsets, custody) are <b>views over postings and deals — never stored</b>.</p>
<p>Six diagrams across four domains, one schema: ${Object.keys(D.E).length - views.length} tables and ${views.length} views. Grey dashed boxes in a diagram mark entities defined in another diagram, and name it. Arrows run in the direction of data flow, from the referenced row into the row that stores the foreign key; a filled arrow is composition (the parent owns the child), an open arrow a reference, a dashed line a polymorphic link resolved by a type column plus an id. Section 6 lists what changed since v3.0; Appendix A reconciles the model with the FRS; Appendix B is the data dictionary.</p>
<div class="rule"></div>

<h2>1 · Configuration domain</h2>
<p>A <b>Project</b> (= client) owns its configuration. Partners are global counterparties; how a partner is used <i>in this project</i> is the <b>partner configuration</b> block — fees, vehicles, endpoints, registrations and rebate terms hang off it. Receivers are organised in <b>receiver groups</b>, the unit entitlement is tracked on, and each receiving entity holds one or more <b>accounts</b> with a currency and rail.</p>
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
<table><thead><tr><th style="width:34%">View</th><th>Definition</th></tr></thead><tbody>
${views.map((v) => `<tr><td class="mono">${esc(v)}(${D.E[v].f.map((f) => f[0]).join(", ")})</td><td>${esc(D.E[v].desc)}</td></tr>`).join("")}
</tbody></table>
<h3>Notes</h3><ul>${notes.deal.map((n) => `<li>${n}</li>`).join("")}${notes.settle.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>4 · Ledger &amp; controls domain</h2>
${diagramPage(DIAGRAMS[5])}
<h3>Notes</h3><ul>${notes.ledger.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2 class="pb">5 · Invariants (enforced at write time)</h2>
<ol>${D.INV.map((i) => `<li>${esc(i[1])}</li>`).join("")}</ol>

<h2>6 · What changed from v3.0</h2>
<p>${newEnts.length} new tables, ${changedEnts.length} changed tables, 3 removals and one view replaced. Field-level detail is in Appendix B.</p>
<h3>New tables</h3>
<table><thead><tr><th style="width:30%">Table</th><th>Purpose</th></tr></thead><tbody>
${newEnts.map((n) => `<tr><td class="mono">${esc(n)}</td><td>${esc(D.E[n].desc)}</td></tr>`).join("")}
</tbody></table>
<h3>Changed tables</h3>
<table><thead><tr><th style="width:30%">Table</th><th>Change</th></tr></thead><tbody>
${changedEnts.map((n) => `<tr><td class="mono">${esc(n)}</td><td>${(D.E[n].ch || []).map(esc).join("<br>")}</td></tr>`).join("")}
</tbody></table>
<h3>Removed</h3>
<table><thead><tr><th style="width:40%">Item</th><th>Reason</th></tr></thead><tbody>
${removed.map(([a, b]) => `<tr><td class="mono">${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}
</tbody></table>
<h3>Views</h3>
<table><thead><tr><th style="width:30%">View</th><th>Change</th></tr></thead><tbody>
${views.map((v) => `<tr><td class="mono">${esc(v)}</td><td>${(D.E[v].ch || ["unchanged"]).map(esc).join("<br>")}</td></tr>`).join("")}
</tbody></table>

<h2>7 · Open questions</h2>
<p>${openOpen.length} of the questions carried from the Understanding document remain open; the rest were answered by NPL in the review of the Understanding document or settled in the ERD review of 6–7 October 2026 and are reflected in this draft.</p>
<h3>Still open</h3>
<table><thead><tr><th style="width:6%">#</th><th>Question</th><th style="width:22%">Blocks</th><th style="width:22%">Status</th></tr></thead><tbody>
${openOpen.map((q) => `<tr><td>${D.OPENQ.indexOf(q) + 1}</td><td>${esc(q.q)}</td><td>${esc(q.blocks)}</td><td>${esc(q.a)}</td></tr>`).join("")}
</tbody></table>
<h3>Answered and reflected in v4.0</h3>
<table><thead><tr><th style="width:6%">#</th><th style="width:30%">Question</th><th>Answer</th><th style="width:30%">In the model</th></tr></thead><tbody>
${openDone.map((q) => `<tr><td>${D.OPENQ.indexOf(q) + 1}</td><td>${esc(q.q)}</td><td>${esc(q.a)}</td><td>${esc(q.impl)}</td></tr>`).join("")}
</tbody></table>

<h2 class="pb">Appendix A · FRS reconciliation</h2>
<h3>A.1 Vocabulary</h3>
<table><thead><tr><th style="width:36%">FRS term</th><th>Model entity</th></tr></thead><tbody>
${frsVocab.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="mono">${esc(b)}</td></tr>`).join("")}
</tbody></table>
<h3>A.2 Deviations from the FRS (classified)</h3>
<table><thead><tr><th style="width:28%">FRS statement</th><th>Model</th><th style="width:24%">Classification</th></tr></thead><tbody>
${frsDev.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join("")}
</tbody></table>
<p class="small"><i>Draft v4.0 — for review with NPL. Dependent documents (ledger design, calculation spec, state machines, roles matrix, configuration schema, cutover) to be rebuilt against this version.</i></p>

<h2 class="pb">Appendix B · Data dictionary (field annotations)</h2>
<p class="small">Every table also carries <code>created_at</code> and <code>created_by</code>. Types: int, string, bool, decimal, datetime, date.</p>
<h3>B.1 Configuration</h3>${byDomain("config").map(fieldTable).join("")}
<h3>B.2 Rates</h3>${byDomain("rates").map(fieldTable).join("")}
<h3>B.3 Deal, collection, conversion, reroute, balance conversion</h3>${byDomain("deal").map(fieldTable).join("")}
<h3>B.4 Disbursement, return, confirmation, fees, referrals, rebates</h3>${byDomain("settle").map(fieldTable).join("")}
<h3>B.5 Ledger &amp; controls</h3>${byDomain("ledger").map(fieldTable).join("")}
</body></html>`;

const htmlPath = path.join(outDir, `NPLify-P0-ERD-v${D.version}.html`);
fs.writeFileSync(htmlPath, html);
const pdfPath = path.join(outDir, `NPLify-P0-ERD-v${D.version}.pdf`);
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, "file://" + htmlPath], { stdio: "ignore" });
console.log("wrote", htmlPath, "and", pdfPath, `(${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB)`);
