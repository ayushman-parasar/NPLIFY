// Build docs/NPLify-Lifecycle-and-Approvals-v1.0.pdf: transaction state machines and the
// approval (maker-checker) workflows, from the agreed model. node scripts/build-lifecycle-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "docs");
fs.mkdirSync(outDir, { recursive: true });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ------------------------------------------------------------------ state-chart drawing
// nodes: {id, label, x, y, w?, h?, kind?: 'start'|'end'|'exception'|'note'}; edges: {from, to, label?, via?:[[x,y]...], side?}
function chart({ w, h, nodes, edges, title }) {
  const N = Object.fromEntries(nodes.map((n) => [n.id, { w: 118, h: 34, kind: "state", ...n }]));
  const fill = { state: "#fff", end: "#e8eef7", exception: "#fdf1ea", start: "#fff", note: "none" };
  const stroke = { state: "#2f5d9e", end: "#2f5d9e", exception: "#b7651a", start: "#2f5d9e", note: "#999" };
  const parts = [], labels = [];
  const anchor = (n, tx, ty) => { // point on node border towards (tx,ty)
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    const s = Math.min(n.w / 2 / Math.abs(dx || 1e-9), n.h / 2 / Math.abs(dy || 1e-9));
    return [cx + dx * s, cy + dy * s];
  };
  for (const e of edges) {
    const a = N[e.from], b = N[e.to];
    if (!a || !b) throw new Error(`edge ${e.from}->${e.to}`);
    const pts = [];
    const via = e.via ?? [];
    const firstT = via[0] ?? [b.x + b.w / 2, b.y + b.h / 2];
    const lastT = via.length ? via[via.length - 1] : [a.x + a.w / 2, a.y + a.h / 2];
    pts.push(anchor(a, ...firstT));
    for (const v of via) pts.push(v);
    pts.push(anchor(b, ...lastT));
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
    const col = e.kind === "exception" ? "#b7651a" : e.kind === "reject" ? "#a33" : "#2f5d9e";
    parts.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="1.1"${e.kind === "reject" ? ' stroke-dasharray="4 2.5"' : ""} marker-end="url(#${e.kind === "exception" ? "arrE" : e.kind === "reject" ? "arrR" : "arr"})"/>`);
    if (e.label) {
      const mi = Math.floor((pts.length - 1) / 2), p1 = pts[mi], p2 = pts[mi + 1];
      let mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
      const horizontal = pts.length === 2 && Math.abs(p1[1] - p2[1]) < 1 && Math.abs(a.y - b.y) < 1;
      if (horizontal) { mx = (a.x + a.w / 2 + b.x + b.w / 2) / 2; my = a.y - 4; }
      if (e.lx != null) mx = e.lx; if (e.ly != null) my = e.ly;
      const lines = e.label.split("\n");
      const lw = Math.max(...lines.map((l) => l.length)) * 4.3 + 6, lh = lines.length * 9.5 + 3;
      labels.push(`<rect x="${mx - lw / 2}" y="${my - lh + 2}" width="${lw}" height="${lh}" fill="#fff" fill-opacity="0.95"/>`);
      lines.forEach((l, i) => labels.push(`<text x="${mx}" y="${my - lh + 11 + i * 9.5}" text-anchor="middle" class="el" fill="${col}">${esc(l)}</text>`));
    }
  }
  for (const n of Object.values(N)) {
    if (n.kind === "note") { parts.push(`<text x="${n.x}" y="${n.y}" class="note">${esc(n.label)}</text>`); continue; }
    parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.kind === "end" ? 17 : 6}" fill="${fill[n.kind]}" stroke="${stroke[n.kind]}" stroke-width="${n.kind === "start" ? 2 : 1.2}"/>`);
    const ls = n.label.split("\n");
    ls.forEach((l, i) => parts.push(`<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 3.5 - (ls.length - 1) * 5 + i * 10.5}" text-anchor="middle" class="st">${esc(l)}</text>`));
  }
  return `<figure class="chart"><svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,1 L9,5 L0,9 z" fill="#2f5d9e"/></marker>
<marker id="arrE" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,1 L9,5 L0,9 z" fill="#b7651a"/></marker>
<marker id="arrR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,1 L9,5 L0,9 z" fill="#a33"/></marker></defs>
<style>.st{font:600 9.5px Helvetica,Arial,sans-serif;fill:#111}.el{font:8.2px Helvetica,Arial,sans-serif}.note{font:italic 8.6px Helvetica,Arial,sans-serif;fill:#555}</style>
${parts.join("\n")}
${labels.join("\n")}</svg><figcaption>${esc(title)}</figcaption></figure>`;
}

// ------------------------------------------------------------------ Diagram 1: deal leg lifecycle
const r1 = 44, r2 = 160, r3 = 290, r4 = 410;
const X = [20, 168, 316, 464, 612];
const dealChart = chart({ w: 760, h: 480, title: "Figure 1 — Deal leg lifecycle. Blue: normal path. Orange: exceptions. Rounded: end states. Collect-first and return legs enter at Collected; estimate-first enters at Collecting.", nodes: [
  { id: "inq", label: "Inquiry", x: X[0], y: r1, kind: "start" }, { id: "quo", label: "Quoted", x: X[1], y: r1 }, { id: "sent", label: "Sent", x: X[2], y: r1 }, { id: "acc", label: "Accepted", x: X[3], y: r1 }, { id: "colg", label: "Collecting", x: X[4], y: r1 },
  { id: "cold", label: "Collected", x: X[4], y: r2 }, { id: "cvg", label: "Converting", x: X[3], y: r2 }, { id: "cvd", label: "Converted", x: X[2], y: r2 }, { id: "stl", label: "Settled", x: X[1], y: r2, kind: "end" },
  { id: "grace", label: "Expired /\nin grace", x: X[2], y: r3, kind: "exception" }, { id: "req", label: "Requoted\n(new deal group)", x: X[1], y: r3, kind: "end" }, { id: "void", label: "Voided\n(no money moved)", x: X[0], y: r3, kind: "end" },
  { id: "vam", label: "Voided after\ncollection", x: X[4], y: r3, kind: "exception" }, { id: "disp", label: "Refunded / credited\n/ held", x: X[4], y: r4, kind: "end" },
  { id: "rr", label: "Rerouted", x: X[3], y: r3, kind: "exception" },
  { id: "n1", label: "collect-first and return legs are born at Collected", x: 20, y: r3 + 62, kind: "note" }, { id: "n2", label: "estimate-first legs enter Collecting with an indicative figure", x: 20, y: r3 + 76, kind: "note" }, { id: "n3", label: "quote fields are write-once after priced_at (invariant 5)", x: 20, y: r3 + 90, kind: "note" },
], edges: [
  { from: "inq", to: "quo", label: "price\n(Ops; Finance if below margin)" }, { from: "quo", to: "sent", label: "package sent\nwithin freshness" }, { from: "sent", to: "acc", label: "sender accepts\nwithin validity" }, { from: "acc", to: "colg", label: "destination\napproved" },
  { from: "colg", to: "cold", label: "all parts verified", lx: 700, ly: 112 }, { from: "cold", to: "cvg", label: "instruct partner" }, { from: "cvg", to: "cvd", label: "partner books;\nmargin recognised" }, { from: "cvd", to: "stl", label: "client net paid\nand confirmed" },
  { from: "acc", to: "grace", label: "validity lapses", kind: "exception", via: [[X[3] + 59, r3 + 17]], lx: 523, ly: 248 }, { from: "grace", to: "req", label: "late decision:\nre-quote", kind: "exception" }, { from: "grace", to: "cold", label: "late decision: honour\n(Finance approval, drift ≤ limit)", kind: "exception", via: [[X[2] + 59, r2 + 60], [X[4] + 30, r2 + 60]], lx: 420, ly: 244 },
  { from: "inq", to: "void", label: "void before money\n(Ops, Finance)", kind: "exception" },
  { from: "cold", to: "vam", label: "void after money", kind: "exception" }, { from: "vam", to: "disp", label: "Management approves\ndisposition", kind: "exception" },
  { from: "cvg", to: "rr", label: "partner unavailable", kind: "exception" }, { from: "rr", to: "cold", label: "alternate partner\n(Finance approval)", kind: "exception", via: [[X[4] - 20, r3 + 17], [X[4] - 20, r2 + 17]], lx: 592, ly: 262 },
] });

// ------------------------------------------------------------------ Diagram 2: disbursement, lines, confirmation
const disbChart = chart({ w: 760, h: 350, title: "Figure 2 — Settlement: a disbursement and its lines. One disbursement completes when every line is confirmed or returned.", nodes: [
  { id: "prep", label: "Prepared\n(Ops)", x: 20, y: 30, kind: "start" }, { id: "appr", label: "Approved\n(Finance)", x: 168, y: 30 }, { id: "rel", label: "Released\nby partner", x: 316, y: 30 }, { id: "done", label: "Completed", x: 612, y: 30, kind: "end" },
  { id: "rej", label: "Rejected →\nback to Ops", x: 168, y: 140, kind: "exception" },
  { id: "lsent", label: "Line: Sent\n(in transit)", x: 316, y: 140 }, { id: "lconf", label: "Line: Confirmed\nfull", x: 464, y: 140, kind: "end" }, { id: "lshort", label: "Line: Confirmed\nshort", x: 464, y: 240, kind: "exception" }, { id: "sf", label: "Shortfall open →\ntopped up next\nsettlement", x: 612, y: 240, kind: "end", h: 44 }, { id: "lret", label: "Line: Returned\n(back to balance)", x: 316, y: 240, kind: "exception" },
  { id: "n1", label: "Management approves when: above settlement limit · third same-day slot · payout to another receiver group · only one Finance user on shift (countersign)", x: 20, y: 340, kind: "note" },
], edges: [
  { from: "prep", to: "appr", label: "approve" }, { from: "appr", to: "rel", label: "partner executes" }, { from: "appr", to: "rej", label: "reject with reason", kind: "reject" }, { from: "rej", to: "prep", label: "re-prepare", kind: "reject", via: [[79, 157]] },
  { from: "rel", to: "lsent", label: "each line" }, { from: "lsent", to: "lconf", label: "receiver confirms" }, { from: "lsent", to: "lshort", label: "bank fee deducted", kind: "exception" }, { from: "lshort", to: "sf", label: "carry-forward\n(Management)", kind: "exception" },
  { from: "lsent", to: "lret", label: "bank rejects", kind: "exception" }, { from: "lconf", to: "done", label: "all lines closed" }, { from: "lret", to: "done", label: "reversed; funds stay in balance\nor fund a return leg", kind: "exception", via: [[375, 302], [671, 302]], lx: 530, ly: 298 },
] });

// ------------------------------------------------------------------ Diagram 3: partner rate version
const rateChart = chart({ w: 760, h: 195, title: "Figure 3 — Partner rate version. A breach freezes quoting and conversion on that partner × pair; there is no skip path.", nodes: [
  { id: "act", label: "Active\n(new version)", x: 20, y: 30, kind: "start" }, { id: "use", label: "Usable", x: 316, y: 30, kind: "end" }, { id: "br", label: "Breached\n(pair frozen)", x: 168, y: 110, kind: "exception" }, { id: "ap", label: "Approved\n(Finance, reason)", x: 464, y: 110, kind: "end" }, { id: "rj", label: "Rejected", x: 612, y: 110, kind: "end" }, { id: "exp", label: "Expired", x: 612, y: 30, kind: "end" },
], edges: [
  { from: "act", to: "use", label: "spread within\navg_2w × (1 + threshold)" }, { from: "act", to: "br", label: "spread above limit", kind: "exception" }, { from: "br", to: "ap", label: "Finance approves\nwith reason", kind: "exception" }, { from: "br", to: "rj", label: "rejected, or better\nrate requested", kind: "reject", via: [[400, 172], [671, 172]], lx: 540, ly: 168 }, { from: "use", to: "exp", label: "expires_at" }, { from: "ap", to: "use", label: "quoting resumes", via: [[523, 100], [375, 100]], lx: 450, ly: 96 },
] });

// ------------------------------------------------------------------ Diagram 4: reroute
const rerouteChart = chart({ w: 760, h: 180, title: "Figure 4 — Reroute. The only time NPL holds client money; every resting balance carries deal, reason and age.", nodes: [
  { id: "req", label: "Requested\n(Ops, trigger)", x: 20, y: 30, kind: "start" }, { id: "appr", label: "Approved\n(Finance)", x: 168, y: 30 }, { id: "cust", label: "In custody\n(own wallet)", x: 316, y: 30 }, { id: "fwd", label: "Forwarded to\nalternate partner", x: 464, y: 30 }, { id: "done", label: "Completed", x: 612, y: 30, kind: "end" },
  { id: "rej", label: "Rejected →\nroute unchanged", x: 168, y: 120, kind: "end" }, { id: "rec", label: "Dues recovered\n(Management)", x: 464, y: 120, kind: "exception" },
], edges: [
  { from: "req", to: "appr", label: "reason recorded" }, { from: "appr", to: "rej", label: "reject", kind: "reject" }, { from: "appr", to: "cust", label: "collection lands\nin own wallet" }, { from: "cust", to: "fwd", label: "outbound: Finance +\nManagement, signers" }, { from: "fwd", to: "done", label: "alternate partner\nconverts (margin\ncaptured there)" }, { from: "fwd", to: "rec", label: "forward_and_recover_dues", kind: "exception" }, { from: "rec", to: "done", label: "receivable ↓, wallet ↑", kind: "exception", via: [[671, 137]] },
] });

// ------------------------------------------------------------------ Diagram 5: approval record
const approvalChart = chart({ w: 760, h: 170, title: "Figure 5 — An APPROVAL record. Approver ≠ initiator is enforced at the endpoint; a rejection never deletes anything.", nodes: [
  { id: "rq", label: "Requested\n(initiator)", x: 20, y: 30, kind: "start" }, { id: "ap", label: "Approved", x: 316, y: 30, kind: "end" }, { id: "es", label: "Escalated to\nManagement", x: 168, y: 110, kind: "exception" }, { id: "rj", label: "Rejected\n(reason)", x: 464, y: 110, kind: "end" }, { id: "ex", label: "Executed", x: 612, y: 30, kind: "end" },
], edges: [
  { from: "rq", to: "ap", label: "approving role,\ndifferent user" }, { from: "rq", to: "es", label: "limit or rule\nrequires Management", kind: "exception" }, { from: "es", to: "ap", label: "Management approves", kind: "exception" }, { from: "es", to: "rj", label: "Management rejects", kind: "reject" }, { from: "rq", to: "rj", label: "approver rejects", kind: "reject", via: [[79, 127]] }, { from: "ap", to: "ex", label: "action runs;\naudit written" },
] });

// ------------------------------------------------------------------ controlled actions matrix
const ACTIONS = [
  ["Quote a deal (price, fee, partner × pair)", "Operations", "Finance", "Below-margin quote: Finance approval mandatory before sending", "Returns to Ops with reason; the quote package is not sent; Ops re-prices as a new quote"],
  ["Honour an expired quote (late decision)", "Operations", "Finance", "Project policy must allow honouring; market drift within grace_drift_pct", "Re-quote at today's rate with a new deal reference; the original stamp is kept"],
  ["Enter a manual rate (reference feed outage)", "Operations", "Finance", "Evidence attached (both feeds down)", "No rate; quoting waits for the feed or a new manual entry"],
  ["Confirm a partner rate version", "Operations (enters)", "Finance (confirms)", "Breached version: Finance approval with recorded reason, or rejection; no skip path", "Pair stays frozen; Ops may request a better rate from the partner, which is a new version"],
  ["Verify a collection (hash / slip / receipt)", "Operations", "— (audited; Finance reviews in reconciliation)", "Underpayment left open beyond policy: Finance decides wait or void", "Collection stays unverified; funds are not attributed"],
  ["Instruct a conversion", "Operations", "Finance", "Variance beyond tolerance opens an exception that Finance resolves", "Conversion not instructed; deal stays Collected"],
  ["Resolve a conversion variance exception", "Finance", "Finance (second user)", "Variance above the project's exception limit → Management", "Exception stays open; the deal is already converted and does not wait"],
  ["Prepare and release a disbursement", "Operations", "Finance", "Above settlement limit; third same-day slot; payout to a receiver in another group (offset); only one Finance user on shift → Management countersigns", "Back to Prepared with reason; lines can be changed and re-submitted"],
  ["Override the bank-fee treatment on one settlement", "Operations", "Finance", "—", "Project default applies"],
  ["Top up a shortfall from the pool", "Finance", "Management", "Always Management (company money becomes client money)", "Shortfall stays open; receiver remains short"],
  ["Pay a receiver in another receiver group (offset)", "Operations", "Finance", "Always Management, with tighter aging on the resulting offset", "Lines must stay within the entitled group"],
  ["Request a reroute", "Operations", "Finance", "Contingency route set (applicable_for_reroute) is configuration: Management", "Deal stays on its route; if the partner is unavailable the deal waits or is voided"],
  ["Outbound transfer from NPL's own wallet", "Finance", "Management (dual approval)", "Always; executed by NPL signers outside the platform (hardware or multisig)", "Funds stay in custody; aging continues to be reported"],
  ["Recover dues on a reroute (net against forwarded funds)", "Finance", "Management", "Always; amount ≤ outstanding receivable at that partner; partner's agreement recorded", "Forward the full amount"],
  ["Balance conversion (client balance to another currency)", "Finance", "Management", "Always; any excess over the served group's entitlement is an offset and needs the offset approval too", "Balance stays in its currency"],
  ["Open a return leg after a rejected payout", "Operations", "Finance", "Destination other than the sender's own return receiver → Management with reason; markup apply / waive is a FEE_DECISION approved by Finance", "Returned funds stay in balance for later payouts"],
  ["Override the network-fee policy on a refund", "Operations", "Finance", "—", "Project default applies"],
  ["Void a deal before money moved", "Operations", "Finance", "—", "Deal continues"],
  ["Void a deal after collection (refund / sender credit / hold)", "Operations", "Management", "Always", "Deal continues; funds stay attributed"],
  ["Record a partner's destination approval (SETTLEMENT_REGISTRATION)", "Operations", "Finance", "—", "Registration stays pending_partner; quote-first deals for it cannot leave Inquiry"],
  ["Change thresholds, fee structures, partner configuration, rates sources", "Finance", "Management", "Always; all versioned", "Current version stays in force"],
  ["Create, change or remove a user or role", "Management", "Management (second user)", "Always", "No change"],
  ["Ledger adjustment (reversal and re-posting)", "Finance", "Management", "Always; the reversal names the transaction it reverses", "Books unchanged; the discrepancy stays on the exception list"],
];

const STATES = [
  ["DEAL_GROUP", "Inquiry → Quoted → Sent → Accepted → Collecting → Collected → Converting → Converted → Settled; Expired / in grace; Requoted; Voided; Voided after collection → Refunded / Credited / Held", "The group's state follows its legs: Settled when every forward leg is settled and no return leg is open."],
  ["DEAL (leg)", "As Figure 1. A collect-first or return leg is born at Collected; an estimate-first leg enters Collecting; a leg 2 of a route is born at Collected when leg 1 pays the transit receiver", "leg_type and funding_source decide the entry point. Pricing fields are write-once after priced_at."],
  ["COLLECTION", "Pending → Received → Verified; Rejected", "Parts post as verified. Overpayment creates SENDER_CREDIT; underpayment waits or is voided."],
  ["CONVERSION", "Expected → Booked → Approved; Variance exception (Booked, beyond tolerance) → Resolved", "The booked figure is what the partner did; the exception is resolved by Finance; the deal does not wait."],
  ["BALANCE_CONVERSION", "Requested (Finance) → Approved (Management) → Booked; Rejected", "Owns exactly one CONVERSION; entitlement re-attributed to the served group on booking."],
  ["REROUTE", "Requested → Approved → In custody → Forwarded → Completed; Rejected", "Phase pre_collection or post_collection; outcome via_own_wallet or refund_sender."],
  ["DISBURSEMENT", "Prepared → Approved → Released → Completed; Rejected (back to Prepared)", "Completed when every line is confirmed or returned."],
  ["DISBURSEMENT_LINE (outcome)", "sent → confirmed; sent → returned", "A returned line is reversed into the balance before anything else happens."],
  ["CONFIRMATION (result)", "full | short", "Short opens a SHORTFALL unless the treatment is waived."],
  ["SHORTFALL", "open → topped_up", "Top-up funded from the pool, Management approval, paid with the next disbursement."],
  ["BANK_FEE_EVENT", "open → applied", "Applied to the disbursement that carried the true-up."],
  ["DISBURSEMENT_RETURN", "recorded (terminal)", "Fund a return leg or stay in balance."],
  ["RATE_COMPARISON", "open → closed", "One per partner × pair × date; closed at end of day."],
  ["PARTNER_RATE_VERSION", "active → usable → expired; active → breached → approved → usable, or rejected", "Never overwritten; each conversion names its version."],
  ["SETTLEMENT_REGISTRATION (approval_status)", "pending_partner → approved → suspended → approved", "A quote-first deal leaves Inquiry only if the entitled group has an approved registration with the chosen partner."],
  ["FEE_DECISION", "proposed → approved → applied; rejected", "One subject (deal leg, disbursement or balance conversion); standing rules are unaffected."],
  ["SENDER_CREDIT", "open → applied", "Applied to a later deal or refunded (a void disposition)."],
  ["EARNINGS_RECEIVABLE", "outstanding → recovered", "Recovered on the partner's fee cycle or by netting on a reroute."],
  ["REFERRAL_ACCRUAL", "accrued → paid", "Paid from NPL's earnings."],
  ["PARTNER_REBATE_ACCRUAL", "expected → reconciled → received", "Monthly against the partner's statement."],
  ["APPROVAL", "requested → approved | rejected; requested → escalated → approved | rejected", "As Figure 5."],
];

const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
@page land { size: A4 landscape; margin: 12mm 14mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
.land{page:land;break-before:page;break-after:page}
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;margin:0}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
p{margin:0 0 7pt} ul,ol{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 4pt}
code,.mono{font:8.8pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;margin:4pt 0 10pt;font-size:9.2pt}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt;vertical-align:bottom}
td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top}
tr{break-inside:avoid}
.title{text-align:center;margin-top:40mm}
.title .sub{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 10pt}
.title .org{margin:0 0 2pt} .title .date{margin:0 0 16pt}
.rule{border-top:2px solid #222;border-bottom:1px solid #222;height:2px;margin:10pt 0 14pt}
.pb{break-before:page}
figure.chart{margin:8pt 0 12pt;break-inside:avoid} figure.chart svg{display:block;max-width:100%}
figcaption{font:italic 9.5pt Georgia,serif;margin-top:3pt}
.box{border:1px solid #2f5d9e;background:#f3f6fb;padding:6pt 9pt;margin:8pt 0;font-size:9.8pt}
.small{font-size:9pt;color:#444}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Transaction Lifecycle &amp; Approval State Machines v1.0</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Deliverable 4 — Transaction Lifecycle &amp; Approval State Machines · Draft v1.0</p><p class="org">New XP Technologies Limited</p><p class="date">7 October 2026 · Confidential</p></div>
<p><b>Status:</b> Built against ERD &amp; Data Model Draft v4.0, the Ledger Posting Design v1.0 and the Project Understanding v1.0 with NPL's review comments. It defines the states a transaction passes through from quote to settlement, the events that move it between states, and for every controlled action who initiates it, who approves it, when it escalates to Management and what happens on rejection.<br>
<b>Audience:</b> NPL Operations, Finance and Management, and the New XP engineering team. Figures show the normal path in blue, exceptions in orange, rejections dashed in red, and end states as rounded boxes.</p>
<div class="rule"></div>

<h2>1 · Three roles, one principle</h2>
<p>Every controlled action is <b>maker-checker</b>: one person initiates, a different person in the approving role approves, and the system refuses an approval by the initiator. Visibility is cumulative: Operations sees the least, Finance sees everything Operations sees plus the economics, Management sees everything.</p>
<table><thead><tr><th style="width:16%">Role</th><th>Does</th><th>Sees</th><th>Never sees</th></tr></thead><tbody>
<tr><td>Operations</td><td>Quotes, verifies collections, instructs conversions, prepares disbursements, requests reroutes, records partner approvals</td><td>Operational fields, sender-facing prices, partner rates as entered, deal states</td><td>Reference rate at capture, spread, margin, pool, cost breakdown, ledger balances, variances, earnings — on any screen, export, message or report</td></tr>
<tr><td>Finance</td><td>Approves what Operations initiates (quotes, rates, conversions, settlements, exceptions); resolves variance exceptions; owns reconciliation and the Finance Log; proposes configuration</td><td>Everything Operations sees plus all economics, postings and balances</td><td>—</td></tr>
<tr><td>Management</td><td>Approves escalations and the heavier actions listed in Section 4; approves configuration and user changes; countersigns releases when only one Finance user is on shift</td><td>Everything</td><td>—</td></tr>
</tbody></table>
<div class="box"><b>Where the Understanding document says two things.</b> Section 7.1 says a reroute is "Ops requests, Finance approves"; Section 9 lists "contingency routes" among Management's approvals. Both are kept: Finance approves the individual reroute; Management approves the <i>set</i> of alternate partners a project may reroute to (<code>PARTNER_CONFIG.applicable_for_reroute</code>, which is configuration) and, together with Finance, every outbound transfer from NPL's own wallet.</div>

<h2>2 · The deal: Quote → Collect → Convert → Settle</h2>
<p>A deal is a group of one or more legs. A quote-first leg walks the whole top row of Figure 1; a collect-first leg is born at Collected because the money arrived before any quote; an estimate-first leg enters Collecting with an indicative figure and is priced at conversion; a return leg is born at Collected, funded by the returned payout. Pricing fields are stamped once and never recomputed.</p>
${dealChart}
<h3>Transitions</h3>
<table><thead><tr><th style="width:14%">From</th><th style="width:14%">To</th><th>Event</th><th>Guard</th><th style="width:16%">Who</th></tr></thead><tbody>
<tr><td>Inquiry</td><td>Quoted</td><td>Price computed: partner × pair chosen, fee structure applied, rate snapshot taken, day's rate comparison created if missing</td><td>Partner rate version usable (not breached); margin ≥ floor, else Finance approval; an approved destination registration exists for the entitled group with that partner (invariant 8)</td><td>Ops; Finance if below margin</td></tr>
<tr><td>Quoted</td><td>Sent</td><td>Quote package marked sent</td><td>Within quote_freshness_min of the snapshot; otherwise re-price</td><td>Ops</td></tr>
<tr><td>Sent</td><td>Accepted</td><td>Sender accepts</td><td>Within quote_validity_min</td><td>Ops records</td></tr>
<tr><td>Sent / Accepted</td><td>Expired / in grace</td><td>Validity lapses</td><td>Grace applies for grace_min only if market drift ≤ grace_drift_pct</td><td>System</td></tr>
<tr><td>Expired / in grace</td><td>Requoted</td><td>Late decision: re-quote</td><td>New deal group reference; the original stamp is kept</td><td>Ops</td></tr>
<tr><td>Expired / in grace</td><td>Collected</td><td>Late decision: honour the old rate</td><td>Project late_collection_policy allows it; recorded Finance approval</td><td>Finance</td></tr>
<tr><td>Accepted</td><td>Collecting</td><td>Instructions issued (wallet, bank-in details or cash instructions)</td><td>—</td><td>Ops</td></tr>
<tr><td>Collecting</td><td>Collected</td><td>All parts verified (hash / slip / receipt)</td><td>Collected amount matches; overpayment → sender credit; underpayment → wait or void</td><td>Ops verifies</td></tr>
<tr><td>Collected</td><td>Converting</td><td>Conversion instructed to the partner</td><td>Rate version still usable; receiver fee taken at conversion</td><td>Ops; Finance approves</td></tr>
<tr><td>Converting</td><td>Converted</td><td>Partner books; actual_out recorded; margin recognised; whole-unit truncation applied</td><td>Variance within tolerance, else an exception opens (the deal does not wait)</td><td>System; Finance on exception</td></tr>
<tr><td>Converted</td><td>Settled</td><td>Every euro of client net paid out and confirmed (whole units; dust carried)</td><td>Disbursement lifecycle, Figure 2</td><td>—</td></tr>
<tr><td>Inquiry … Collecting</td><td>Voided</td><td>Void before money moved</td><td>Reason recorded; no postings</td><td>Ops; Finance</td></tr>
<tr><td>Collected / Converted</td><td>Voided after collection</td><td>Void after money moved</td><td>Disposition: refund (network-fee policy), sender credit, or hold</td><td>Ops; Management</td></tr>
<tr><td>Converting / Collected</td><td>Rerouted → Collected at the alternate partner</td><td>Partner unavailable, limit reached, holiday, compliance hold</td><td>Approved REROUTE; alternate partner in the applicable set</td><td>Ops; Finance</td></tr>
</tbody></table>

<h2 class="pb">3 · Settlement, rates, reroute and approval records</h2>
${disbChart}
${rateChart}
${rerouteChart}
${approvalChart}

<section class="land"><h2>4 · Controlled actions: who initiates, who approves, what rejection means</h2>
<p>The approving role is always a different user from the initiator. "Escalates to Management when" lists the conditions that add a Management approval on top of, not instead of, the approving role's.</p>
<table style="font-size:8.6pt"><thead><tr><th style="width:21%">Controlled action</th><th style="width:9%">Initiates</th><th style="width:11%">Approves</th><th style="width:29%">Escalates to Management when</th><th>On rejection</th></tr></thead><tbody>
${ACTIONS.map((a) => `<tr>${a.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}
</tbody></table>
</section>

<h2>5 · Rejection handling, the same way everywhere</h2>
<ol>
<li><b>Nothing is deleted.</b> The request, the rejection and its reason stay on the APPROVAL record and in the audit log. A re-submission is a new approval request that points at the rejected one.</li>
<li><b>The record returns to the initiator's last safe state.</b> A rejected quote is not sent; a rejected disbursement goes back to Prepared; a rejected reroute leaves the route unchanged; a rejected balance conversion leaves the balance in its currency.</li>
<li><b>Money that already moved is never rolled back by a rejection.</b> A conversion the partner has booked stands; a variance exception is resolved by a decision and, if needed, a reversing ledger entry, not by editing the conversion.</li>
<li><b>A rejection reason is mandatory</b> and is visible to the initiator; derived-economics fields are stripped from the reason shown to Operations.</li>
<li><b>Frozen states need a decision, not time.</b> A breached rate version, an open variance exception, an open offset and custody in NPL's wallet all stay on the daily exception list until a role with authority acts.</li>
<li><b>Escalation never skips a level.</b> Management approves in addition to Finance; when only one Finance user is on shift, Management's countersignature stands in for the second Finance user.</li>
</ol>

<h2>6 · State tables by entity</h2>
<table><thead><tr><th style="width:22%">Entity</th><th>States and transitions</th><th style="width:34%">Notes</th></tr></thead><tbody>
${STATES.map((s) => `<tr><td class="mono">${esc(s[0])}</td><td>${esc(s[1])}</td><td>${esc(s[2])}</td></tr>`).join("")}
</tbody></table>

<h2>7 · Aging and the daily exception list</h2>
<p>Four things age and are reported daily with deal, reason and hours since the event: client money in NPL's own wallet (custody), open offsets across receiver groups, open shortfalls, and open variance exceptions. Breached rate versions and frozen partner × pairs appear on the same list. Time limits for each are project configuration (THRESHOLD) and are not fixed by this document.</p>
<p class="small"><i>Draft v1.0 — for review with NPL. State names are the proposal for the state columns the ERD leaves as free text; once agreed they become the enumerations of those columns.</i></p>
</body></html>`;

const h = path.join(outDir, "NPLify-Lifecycle-and-Approvals-v1.0.html"), p = path.join(outDir, "NPLify-Lifecycle-and-Approvals-v1.0.pdf");
fs.writeFileSync(h, html);
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "actions:", ACTIONS.length, "state rows:", STATES.length);
