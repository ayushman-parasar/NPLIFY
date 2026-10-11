// Build docs/NPLify-Lifecycle-and-Approvals-v5.9.{html,pdf}: transaction state machines and the approval
// (maker-checker) workflows, from the agreed model at ERD v5.9 (D1–D46 and the corrections of v5.9).
//   node scripts/build-lifecycle-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ACTIONS } from "./controlled-actions.mjs";
import { clientFacing } from "./client-facing.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));
const outDir = path.join(root, "docs");
fs.mkdirSync(outDir, { recursive: true });
const V = D.version, DATE = "11 October 2026";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const code = (s) => `<code>${esc(s)}</code>`;

// ------------------------------------------------------------------ state-chart drawing
// nodes: {id, label, x, y, w?, h?, kind?: 'start'|'end'|'exception'|'note'}; edges: {from, to, label?, via?:[[x,y]...], kind?}
function chart({ w, h, nodes, edges, title }) {
  const N = Object.fromEntries(nodes.map((n) => [n.id, { w: 118, h: 34, kind: "state", ...n }]));
  const fill = { state: "#fff", end: "#e8eef7", exception: "#fdf1ea", start: "#fff", note: "none" };
  const stroke = { state: "#2f5d9e", end: "#2f5d9e", exception: "#b7651a", start: "#2f5d9e", note: "#999" };
  const parts = [], labels = [];
  const anchor = (n, tx, ty) => {
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

// ------------------------------------------------------------------ Figure 1: deal leg lifecycle
const r1 = 44, r2 = 160, r3 = 290, r4 = 410, r5 = 500;
const X = [20, 168, 316, 464, 612];
const dealChart = chart({ w: 760, h: 600, title: "Figure 1 — Deal leg lifecycle. Blue: normal path. Orange: exceptions. Rounded: end states. Collect-first and return legs enter at Collected; estimate-first enters at Collecting.", nodes: [
  { id: "inq", label: "Inquiry", x: X[0], y: r1, kind: "start" }, { id: "quo", label: "Quoted", x: X[1], y: r1 }, { id: "sent", label: "Sent", x: X[2], y: r1 }, { id: "acc", label: "Accepted", x: X[3], y: r1 }, { id: "colg", label: "Collecting", x: X[4], y: r1 },
  { id: "cold", label: "Collected", x: X[4], y: r2 }, { id: "cvg", label: "Converting", x: X[3], y: r2 }, { id: "cvd", label: "Converted", x: X[2], y: r2 }, { id: "stl", label: "Settled", x: X[1], y: r2, kind: "end" },
  { id: "grace", label: "Expired /\nin grace", x: X[2], y: r3, kind: "exception" }, { id: "req", label: "Requoted\n(new deal group)", x: X[1], y: r3, kind: "end" }, { id: "void", label: "Voided\n(no money moved)", x: X[0], y: r3, kind: "end" },
  { id: "vam", label: "Voided after\ncollection", x: X[4], y: r3, kind: "exception" }, { id: "disp", label: "Refunded / credited\n/ held", x: X[4], y: r4, kind: "end" },
  { id: "rr", label: "Rerouted", x: X[3], y: r3, kind: "exception" },
  { id: "lock", label: "Rate locked, awaiting\nconversion_due_date", x: X[3], y: r4, kind: "exception" },
  { id: "loss", label: "Loss event:\nNPL stands in", x: X[4], y: r5, kind: "exception" },
  { id: "n1", label: "collect-first and return legs are born at Collected; estimate-first legs enter Collecting with an indicative figure", x: 20, y: r4 + 62, kind: "note" },
  { id: "n2", label: "quote fields are write-once after priced_at (invariant 5); validity may be extended any number of times before it ends (Finance; D45)", x: 20, y: r4 + 76, kind: "note" },
  { id: "n3", label: "a crypto part is screened before Collecting (D31); a cash part is verified only after the partner's count (D30)", x: 20, y: r4 + 90, kind: "note" },
  { id: "n4", label: "a bridge collection lands in NPL's wallet and hops to the leg's partner within custody_max_hours (D40)", x: 20, y: r4 + 104, kind: "note" },
  { id: "n5", label: "after a loss the part stays verified — NPL's funds stand in — and is reversed only when Management unwinds the deal (D46, invariant 31)", x: 20, y: r4 + 118, kind: "note" },
], edges: [
  { from: "inq", to: "quo", label: "price\n(Ops; Finance if below margin)" }, { from: "quo", to: "sent", label: "package sent\nwithin freshness" }, { from: "sent", to: "acc", label: "sender accepts\nwithin validity" }, { from: "acc", to: "colg", label: "destination\napproved" },
  { from: "colg", to: "cold", label: "all parts verified", lx: 700, ly: 112 }, { from: "cold", to: "cvg", label: "instruct partner" }, { from: "cvg", to: "cvd", label: "partner books;\nmargin recognised" }, { from: "cvd", to: "stl", label: "client net released;\nlines confirmed" },
  { from: "acc", to: "grace", label: "validity lapses", kind: "exception", via: [[X[3] + 59, r3 + 17]], lx: 523, ly: 248 }, { from: "grace", to: "req", label: "late decision:\nre-quote", kind: "exception" }, { from: "grace", to: "cold", label: "late decision: honour\n(Finance approval, drift ≤ limit)", kind: "exception", via: [[X[2] + 59, r2 + 60], [X[4] + 30, r2 + 60]], lx: 420, ly: 244 },
  { from: "inq", to: "void", label: "void before money\n(Ops, Finance)", kind: "exception" },
  { from: "cold", to: "vam", label: "void after money", kind: "exception" }, { from: "vam", to: "disp", label: "Management approves\ndisposition", kind: "exception" },
  { from: "cvg", to: "rr", label: "partner unavailable", kind: "exception" }, { from: "rr", to: "cold", label: "alternate partner\n(Finance approval)", kind: "exception", via: [[X[4] - 20, r3 + 17], [X[4] - 20, r2 + 17]], lx: 592, ly: 262 },
  { from: "cold", to: "lock", label: "bank-channel pair,\nlocked after the cutoff (D29)", kind: "exception", via: [[598, r3 + 17]], lx: 598, ly: 350 },
  { from: "lock", to: "cvg", label: "converts on the due date;\ndeferred if the rate breaches the margin", kind: "exception", via: [[450, r4 + 17], [450, r2 + 17]], lx: 450, ly: 350 },
  { from: "cold", to: "loss", label: "money lost after\nverification (D32)", kind: "exception", via: [[745, r2 + 17], [745, r5 + 17]], lx: 705, ly: 398 },
  { from: "loss", to: "cold", label: "loss booked to NPL,\nclient made whole;\ndeal continues", kind: "exception", via: [[598, r5 + 17], [598, r4 - 20]], lx: 598, ly: 405 },
] });

// ------------------------------------------------------------------ Figure 2: settlement, lines, confirmation
const settleChart = chart({ w: 760, h: 350, title: "Figure 2 — Settlement: a run and its lines. The promise is discharged when the partner releases the money; a return or a short delivery re-raises it. A run completes when every line is confirmed, short or returned.", nodes: [
  { id: "prep", label: "Prepared\n(Ops)", x: 20, y: 30, kind: "start" }, { id: "appr", label: "Approved\n(Finance)", x: 168, y: 30 }, { id: "rel", label: "Released by partner\n(execution_due_date)", x: 316, y: 30 }, { id: "done", label: "Completed", x: 612, y: 30, kind: "end" },
  { id: "wait", label: "Approved after cutoff:\nnext business day", x: 20, y: 140, kind: "exception" },
  { id: "rej", label: "Rejected →\nback to Ops", x: 168, y: 140, kind: "exception" },
  { id: "lsent", label: "Line: sent\n(promise discharged)", x: 316, y: 140 }, { id: "lconf", label: "Line: confirmed\n(no posting)", x: 464, y: 140, kind: "end" }, { id: "lshort", label: "Line: short\n(promise re-raised)", x: 464, y: 240, kind: "exception" }, { id: "sf", label: "SHORTFALL open →\ntopped up next run", x: 612, y: 240, kind: "end", w: 130 }, { id: "lret", label: "Line: returned\n(promise re-raised)", x: 316, y: 240, kind: "exception" },
  { id: "n1", label: "Management approves when: above settlement limit · third same-day slot · counterparty paid from another group's leg (never a refund or hop line) · only one Finance user on shift (countersign)", x: 20, y: 325, kind: "note" },
  { id: "n2", label: "a hop line (partner_transit) posts nothing on release and only when the far side credits (D40); every released line ends confirmed, short or returned (invariant 40, SETTLEMENT_LINE.outcome)", x: 20, y: 339, kind: "note" },
], edges: [
  { from: "prep", to: "appr", label: "approve" }, { from: "appr", to: "rel", label: "partner executes" }, { from: "appr", to: "rej", label: "reject with reason", kind: "reject" }, { from: "rej", to: "prep", label: "re-prepare", kind: "reject", via: [[150, 120]], lx: 120, ly: 112 },
  { from: "appr", to: "wait", label: "approved after the\npartner's cutoff (D29, D34)", kind: "exception", lx: 120, ly: 100 }, { from: "wait", to: "rel", label: "", kind: "exception" },
  { from: "rel", to: "lsent", label: "each line" }, { from: "lsent", to: "lconf", label: "receiver confirms" }, { from: "lsent", to: "lshort", label: "bank fee deducted", kind: "exception" }, { from: "lshort", to: "sf", label: "carry-forward\n(Management)", kind: "exception" },
  { from: "lsent", to: "lret", label: "bank rejects", kind: "exception" }, { from: "lconf", to: "done", label: "all lines closed" }, { from: "lret", to: "done", label: "funds back in balance\nor fund a return leg", kind: "exception", via: [[375, 302], [671, 302]], lx: 530, ly: 298 },
] });

// ------------------------------------------------------------------ Figure 3: partner rate version
const rateChart = chart({ w: 760, h: 195, title: "Figure 3 — Partner rate version. Stored as quoted, with its direction and, for cash pairs, its city (D28, D30). A breach freezes quoting and conversion on that partner × pair; there is no skip path.", nodes: [
  { id: "act", label: "Active\n(new version)", x: 20, y: 30, kind: "start" }, { id: "use", label: "Usable", x: 316, y: 30, kind: "end" }, { id: "br", label: "Breached\n(pair frozen)", x: 168, y: 110, kind: "exception" }, { id: "ap", label: "Approved\n(Finance, reason)", x: 464, y: 110, kind: "end" }, { id: "rj", label: "Rejected", x: 612, y: 110, kind: "end" }, { id: "exp", label: "Expired", x: 612, y: 30, kind: "end" },
], edges: [
  { from: "act", to: "use", label: "spread within\navg_2w × (1 + threshold)" }, { from: "act", to: "br", label: "spread above limit", kind: "exception" }, { from: "br", to: "ap", label: "Finance approves\nwith reason", kind: "exception" }, { from: "br", to: "rj", label: "rejected, or better\nrate requested", kind: "reject", via: [[400, 172], [671, 172]], lx: 540, ly: 168 }, { from: "use", to: "exp", label: "expires_at" }, { from: "ap", to: "use", label: "quoting resumes", via: [[523, 100], [375, 100]], lx: 450, ly: 96 },
] });

// ------------------------------------------------------------------ Figure 4: reroute and custody
const rerouteChart = chart({ w: 760, h: 180, title: "Figure 4 — Reroute. Client money rests in NPL's own wallet in three cases only — an approved reroute, a bridge collection awaiting its hop, an own-desk leg (invariant 3) — and every resting balance carries deal, reason and age.", nodes: [
  { id: "req", label: "Requested\n(Ops, trigger)", x: 20, y: 30, kind: "start" }, { id: "appr", label: "Approved\n(Finance)", x: 168, y: 30 }, { id: "cust", label: "In custody\n(own wallet)", x: 316, y: 30 }, { id: "fwd", label: "Forwarded to\nalternate partner", x: 464, y: 30 }, { id: "done", label: "Completed", x: 612, y: 30, kind: "end" },
  { id: "rej", label: "Rejected →\nroute unchanged", x: 168, y: 120, kind: "end" }, { id: "rec", label: "Dues recovered\n(Management)", x: 464, y: 120, kind: "exception" },
], edges: [
  { from: "req", to: "appr", label: "reason recorded" }, { from: "appr", to: "rej", label: "reject", kind: "reject" }, { from: "appr", to: "cust", label: "collection lands\nin own wallet" }, { from: "cust", to: "fwd", label: "outbound: Finance +\nManagement, signers" }, { from: "fwd", to: "done", label: "alternate partner\nconverts (margin\ncaptured there)" }, { from: "fwd", to: "rec", label: "forward_and_recover_dues", kind: "exception" }, { from: "rec", to: "done", label: "receivable ↓, wallet ↑", kind: "exception", via: [[671, 137]] },
] });

// ------------------------------------------------------------------ Figure 5: approval record
const approvalChart = chart({ w: 760, h: 170, title: "Figure 5 — An APPROVAL record. The approver's ROLE must hold may_approve for the action in ROLE_RIGHT and differ from the initiator (invariant 9, D44); a rejection never deletes anything.", nodes: [
  { id: "rq", label: "Requested\n(initiator)", x: 20, y: 30, kind: "start" }, { id: "ap", label: "Approved", x: 316, y: 30, kind: "end" }, { id: "es", label: "Escalated to\nManagement", x: 168, y: 110, kind: "exception" }, { id: "rj", label: "Rejected\n(reason)", x: 464, y: 110, kind: "end" }, { id: "ex", label: "Executed", x: 612, y: 30, kind: "end" },
], edges: [
  { from: "rq", to: "ap", label: "approving role,\ndifferent user" }, { from: "rq", to: "es", label: "limit or rule\nrequires Management", kind: "exception" }, { from: "es", to: "ap", label: "Management approves", kind: "exception" }, { from: "es", to: "rj", label: "Management rejects", kind: "reject" }, { from: "rq", to: "rj", label: "approver rejects", kind: "reject", via: [[79, 127]] }, { from: "ap", to: "ex", label: "action runs;\naudit written" },
] });

// ------------------------------------------------------------------ Figure 6: loss event and recoveries (D32, D46, v5.9)
const lossChart = chart({ w: 760, h: 200, title: "Figure 6 — Loss event and recoveries. The whole loss is NPL's first and the client is made whole in the same transaction; each share is then its own LOSS_RECOVERY posting (D46). The collection part stays verified unless Management unwinds the deal.", nodes: [
  { id: "open", label: "Loss recorded (Ops);\nsplit proposed (Finance)", x: 12, y: 30, kind: "start", w: 146 }, { id: "appr", label: "Approved\n(Management)", x: 168, y: 30 }, { id: "post", label: "Posted: loss NPL's,\nclient made whole", x: 316, y: 30 }, { id: "rec", label: "Recovery agreed\n(per share)", x: 464, y: 30 }, { id: "recd", label: "Recovery received", x: 612, y: 30, kind: "end" },
  { id: "unf", label: "Unfunded part:\nMAKEGOOD / LOSS_PAYABLE", x: 316, y: 130, kind: "exception", w: 136 }, { id: "cli", label: "Client share:\nreceived at once", x: 464, y: 130, kind: "end" }, { id: "unw", label: "Deal unwound:\npart reversed", x: 612, y: 130, kind: "exception" },
  { id: "n1", label: "sources: LossEvent for the event, LossRecovery for each share's agreed and received postings (one transaction per state change)", x: 20, y: 192, kind: "note" },
], edges: [
  { from: "open", to: "appr", label: "approve_loss_split" }, { from: "appr", to: "post", label: "EXP_LOSS; pool /\nwallet fund the make-good" }, { from: "post", to: "rec", label: "partner's or sender's\nshare → LOSS_RECEIVABLE" }, { from: "rec", to: "recd", label: "credit or payment\nreceived" },
  { from: "post", to: "unf", label: "pool and wallet cannot\nfund it at once", kind: "exception" }, { from: "unf", to: "post", label: "NPL's funds land", kind: "exception", via: [[300, 147], [300, 60]], lx: 262, ly: 110 },
  { from: "post", to: "cli", label: "partial reversal of\nthe make-good", kind: "exception" }, { from: "post", to: "unw", label: "Management decides\nto unwind (refund)", kind: "reject", via: [[671, 90]], lx: 560, ly: 86 },
] });

// ------------------------------------------------------------------ Figure 7: earnings offset (D46)
const offsetChart = chart({ w: 760, h: 150, title: "Figure 7 — Earnings offset between partners. NPL's converted margin at one partner becomes the client's there; the same value of the client's unconverted money at another becomes NPL's, at the to-partner's rate of the day; the client's entitlement is unchanged (invariant 43).", nodes: [
  { id: "req", label: "Requested\n(Finance)", x: 20, y: 30, kind: "start" }, { id: "appr", label: "Approved\n(Management)", x: 168, y: 30 }, { id: "post", label: "Posted (EarningsOffset):\nFX_RESULT records the swap", x: 316, y: 30, w: 150 }, { id: "recv", label: "EARNINGS_RECEIVABLE rows\nmarked recovered_by_offset_id", x: 520, y: 30, kind: "end", w: 190 },
  { id: "rej", label: "Rejected →\nmargins stay put", x: 168, y: 100, kind: "end" },
], edges: [
  { from: "req", to: "appr", label: "earnings_offset" }, { from: "appr", to: "post", label: "to_amount = from_amount\n÷ to-partner's rate" }, { from: "post", to: "recv", label: "" }, { from: "appr", to: "rej", label: "reject", kind: "reject" },
] });

// ------------------------------------------------------------------ state tables by entity
const STATES = [
  ["DEAL_GROUP", "Inquiry → Quoted → Sent → Accepted → Collecting → Collected → Converting → Converted → Settled; Expired / in grace; Requoted; Voided; Voided after collection → Refunded / Credited / Held", "The group's state follows its legs: Settled when every forward leg is settled and no return leg is open. In NPL-GR the group names the resale invoice it collects and the part of it (invoice_id, invoice_amount, invoice_rate — D46 and amendment)."],
  ["DEAL (leg)", "As Figure 1. A collect-first or return leg is born at Collected; an estimate-first leg enters Collecting; leg 2 of a route is born at Collected when leg 1 pays the transit receiver. On a bank-channel pair a Collected leg carries rate_locked_at, cutoff_at and conversion_due_date and may not convert before the due date (D29)", "leg_type and funding_source decide the entry point. Pricing fields are write-once after priced_at; a leg priced on an expired leg's rate carries rate_reused_from_deal_id and the override that allowed it (D45). A return or hop leg inherits the parent leg's receiver group; cross_group_payout never fires on it (D13)."],
  ["QUOTE_PACKAGE", "issued → superseded (by a re-issue)", "One row per issue of a group's quote; a quote-first leg is Sent only when a package has sent_at; freshness runs from the leg's market snapshot to sent_at, validity from sent_at (D35)."],
  ["QUOTE_VALIDITY_EXTENSION", "requested → approved (Finance; Management past the cutoff or the rate version's expiry)", "Any number per leg before the validity in force ends; each moves DEAL.effective_valid_until and re-issues the package at the same price (D45)."],
  ["WALLET_SCREENING (decision)", "accept | accept_alternate | reject (Finance may override a reject)", "An Operations action before a crypto collection or before a wallet payout; accept_alternate lands only on an elevated-band endpoint (D31)."],
  ["COLLECTION", "pending → verified; reversed (only when Management unwinds a deal after a loss). Cash: token_issued → handed_over → counted → verified", "Parts post as verified; a cash part only after the partner's count (D30). Overpayment creates SENDER_CREDIT; underpayment waits or is voided. After a loss the part stays verified: NPL's funds stand in (D46, invariant 31)."],
  ["CONVERSION", "Expected → Booked → Approved; Variance exception (Booked, beyond tolerance) → Resolved", "The booked figure is what the partner did; the difference posts to VAR_CONVERSION (partner_calculates), VAR_CUTOFF (after the cutoff) or VAR_RATE_HONOUR (an honoured expired rate); the exception is resolved by Finance; the deal does not wait. residual_in keeps the deal's margin unconverted, EARN_GROSS recognised in the collection currency (D46)."],
  ["BALANCE_CONVERSION", "Requested (Finance) → Approved (Management) → Booked; Rejected. A banking-ready balance waits for conversion_due_date (D29)", "Owns exactly one CONVERSION; entitlement re-attributed to the served group on booking."],
  ["REROUTE", "Requested → Approved → In custody → Forwarded → Completed; Rejected", "Phase pre_collection or post_collection; outcome via_own_wallet or refund_sender; forward_full or forward_and_recover_dues."],
  ["EARNINGS_OFFSET", "requested (Finance) → approved (Management) → posted", "Recovers EARNINGS_RECEIVABLE rows at the from-partner; the swap is recorded for NPL in FX_RESULT (D46)."],
  ["SETTLEMENT", "Prepared → Approved → Released → Completed; Rejected (back to Prepared). A bank-rail run approved after the cutoff is released on execution_due_date (D29, D34)", "Completed when every line is confirmed, short or returned."],
  ["SETTLEMENT_LINE (outcome)", "sent → confirmed | short | returned", "The promise is discharged on release; a short confirmation re-raises it for the missing part and a return for what came back (invariant 40). A line paying a group-less receiver carries deal_id (D17) and is never an offset; a hop line posts only when the far side credits (D40). short added v5.9."],
  ["CONFIRMATION (result)", "full | short", "Full posts nothing; short opens a SHORTFALL unless the treatment is waived (D46)."],
  ["SHORTFALL", "open → topped_up", "Top-up funded from the pool, Management approval, paid with the next settlement."],
  ["SETTLEMENT_RETURN", "recorded (terminal)", "Funds a return leg or stays in balance; the bounce fee is a BANK_FEE_EVENT."],
  ["BANK_FEE_EVENT", "open → applied", "Applied to the settlement that carried the true-up; treatment waived / carry_forward / absorbed; a covered fee is a FEE_DECISION (D41)."],
  ["COLLECTION_RECEIVING_ENDPOINT (status)", "inactive → active; active → suspended; a single_use endpoint retires after its one reference (D32)", "A bank endpoint becomes active only with rail set; a wallet may stay without rail, and its rail, when set, equals its network (D18); the network must be one the partner's vehicle offers (D39)."],
  ["RECEIVING_ENTITY_ACCOUNT (usage)", "standing; single_use → retired after the one payout it was reserved for", "D32."],
  ["RATE_COMPARISON", "open → closed", "One per partner × pair × date; closed at end of day."],
  ["PARTNER_RATE_VERSION", "active → usable → expired; active → breached → approved → usable, or rejected", "Never overwritten; each conversion names its version; stored as quoted with direction and, for cash, the city (D28, D30)."],
  ["PARTNER_CUTOFF_OVERRIDE", "recorded (one day or a weekday rule)", "An agreed extension or an early close; the effective cutoff is stamped on the leg at rate lock and on the settlement at approval (D29)."],
  ["DESTINATION_APPROVAL (approval_status)", "pending_partner → approved → suspended → approved", "A quote-first deal leaves Inquiry only if the entitled group has an approved destination with the chosen partner (invariant 8). Payout details follow the account's kind (D16); a wallet account carries its screening (D31)."],
  ["FEE_DECISION", "proposed (Finance recommends) → approved (Finance; Management for a covered bank fee or a markup above the cap) → applied; rejected", "One subject (deal leg, settlement or balance conversion); standing rules are unaffected (D41)."],
  ["SENDER_CREDIT", "open → applied", "Applied to a later deal or refunded (a void disposition); never netted against anything NPL is owed."],
  ["EARNINGS_RECEIVABLE", "outstanding → recovered (recovered_by_deal_id on a reroute, recovered_by_offset_id on an earnings offset)", "Recovered on the partner's fee cycle, by netting on a reroute, or by an earnings offset (D46)."],
  ["MARKUP_SHARE_ACCRUAL", "accrued (with the conversion) → reconciled → settled", "Direction payable (NPL pays) or receivable (the party holds the funds and pays NPL the remainder monthly) (D26, D46)."],
  ["PARTNER_REBATE_ACCRUAL", "expected (with the conversion, in payout_currency) → reconciled → received", "Monthly against the partner's statement, NPLify deals only (D27, D46)."],
  ["INVOICE (NPL-GR)", "open → settled; void. kind vendor: discharged line by line (obligation_discharged on release); kind resale: collected by its deal groups (invoice_amount)", "Posted once each in the invoice currency (RESELL_COST / VENDOR_PAYABLE; RESALE_RECEIVABLE / RESELL_REVENUE); the reseller revenue is intact by construction (D46 and amendment, invariant 44)."],
  ["LOSS_EVENT", "open → approved (Management) → posted", "As Figure 6; pool_funded, wallet_funded and funding_reference record how the make-good was funded (v5.9)."],
  ["LOSS_RECOVERY", "agreed → received (a client share is received at once)", "One row per share; each state change posts one transaction under source LossRecovery (v5.9)."],
  ["APPROVAL", "requested → approved | rejected; requested → escalated → approved | rejected", "As Figure 5; the approver's role holds may_approve for the action (ROLE_RIGHT, D44)."],
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

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Transaction Lifecycle &amp; Approval State Machines v${V}</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Transaction Lifecycle &amp; Approval State Machines · Draft v${V}</p><p class="small">Numbered with the ERD edition it is built against.</p><p class="org">New XP Technologies Limited</p><p class="date">${DATE} · Confidential</p></div>
<div class="rule"></div>

<h2>1 · Three roles, one principle</h2>
<p>Every controlled action is <b>maker-checker</b>: one person initiates, a different person in the approving role approves, and the system refuses an approval by the initiator. Since D44 the rights are configuration, not code: ${code("ROLE")} holds the three roles of today and ${code("ROLE_RIGHT")} says per controlled action which role may initiate, which may approve and which is added on escalation; the approver's role must hold ${code("may_approve")} for the action (invariant 9). Visibility is cumulative: Operations sees the least, Finance sees everything Operations sees plus the economics, Management sees everything.</p>
<table><thead><tr><th style="width:16%">Role</th><th>Does</th><th>Sees</th><th>Never sees</th></tr></thead><tbody>
<tr><td>Operations</td><td>Quotes, screens wallets, verifies collections (cash after the partner's count), instructs conversions, prepares settlements, requests reroutes, records destination approvals, enters partner rates as quoted</td><td>Operational fields, sender-facing prices (including the customer-facing figures the quote prints), partner rates as entered, deal states</td><td>Reference rate at capture, spread, margin, pool, cost breakdown, ledger balances, the four variances, FX_RESULT, loss shares, offsets, earnings, reseller margins — on any screen, export, message or report (ROLE.sees_economics = false)</td></tr>
<tr><td>Finance</td><td>Approves what Operations initiates (quotes, extensions, rates, conversions, settlements, exceptions); resolves variance exceptions; recommends covered fees and fee caps; overrides a screening reject; requests balance conversions, dues recovery, earnings offsets and loss splits; owns reconciliation, the month-end true-ups and ledger adjustments; proposes configuration</td><td>Everything Operations sees plus all economics, postings and balances</td><td>—</td></tr>
<tr><td>Management</td><td>Approves escalations and the heavier actions listed in Section 5 (loss splits, offsets, balance conversions, dues recovery, covered fees and raised caps, own-wallet transfers, post-money voids, own desks); approves configuration, system settings and user changes; countersigns releases when only one Finance user is on shift</td><td>Everything</td><td>—</td></tr>
</tbody></table>


<h2>2 · The deal: Quote → Collect → Convert → Settle</h2>
<p>A deal is a group of one or more legs. A quote-first leg walks the whole top row of Figure 1; a collect-first leg is born at Collected because the money arrived before any quote; an estimate-first leg enters Collecting with an indicative figure and is priced at conversion; a return leg is born at Collected, funded by the returned payout and attributed to its parent leg's group. Pricing fields are stamped once and never recomputed. Fee parts are percentages of the principal at the basis rate and never compound (invariant 42); a target-out quote applies the fee as a markup on the target (D46 amendment).</p>
${dealChart}
<h3>Transitions</h3>
<table><thead><tr><th style="width:14%">From</th><th style="width:14%">To</th><th>Event</th><th>Guard</th><th style="width:16%">Who</th></tr></thead><tbody>
<tr><td>Inquiry</td><td>Quoted</td><td>Price computed: partner × pair chosen, fee structure and tier applied (D20, D21), rate snapshot taken, day's rate comparison created if missing; the customer-facing fee and rate derived (D22)</td><td>Partner rate version usable (not breached); margin ≥ floor, else Finance approval; an approved destination exists for the entitled group with that partner (invariant 8); the method is one the partner offers (invariant 36)</td><td>Ops; Finance if below margin</td></tr>
<tr><td>Quoted</td><td>Sent</td><td>Quote package issued and marked sent (QUOTE_PACKAGE, template sender-facing only — D35, D36)</td><td>Within quote_freshness_min of the snapshot; otherwise re-price</td><td>Ops</td></tr>
<tr><td>Sent</td><td>Accepted</td><td>Sender accepts</td><td>Within the validity in force (effective_valid_until)</td><td>Ops records</td></tr>
<tr><td>Sent / Accepted</td><td>Sent / Accepted (validity extended)</td><td>QUOTE_VALIDITY_EXTENSION: the package re-issued at the same price with a later validity</td><td>Before the validity in force ends; any number of times; Finance approves, Management added when the new validity passes the partner's cutoff or the rate version's expiry (D45)</td><td>Ops requests; Finance</td></tr>
<tr><td>Sent / Accepted</td><td>Expired / in grace</td><td>Validity lapses</td><td>Grace applies for grace_min only if market drift ≤ grace_drift_pct</td><td>System</td></tr>
<tr><td>Expired / in grace</td><td>Requoted</td><td>Late decision: re-quote, a new deal group; at the sender's request the new leg may be priced on the expired leg's rate by an approved override (honour_expired_rate), the difference against the day's rate posting to VAR_RATE_HONOUR (D45)</td><td>New deal group reference; the original stamp is kept; Finance approves the override</td><td>Ops; Finance</td></tr>
<tr><td>Expired / in grace</td><td>Collected</td><td>Late decision: honour the old quote within grace</td><td>Project late_collection_policy allows it; recorded Finance approval</td><td>Finance</td></tr>
<tr><td>Accepted</td><td>Collecting</td><td>Instructions issued: an active endpoint of the leg's partner entity whose kind matches the collection method, a bridge wallet where the partner lacks the network (D40), or cash instructions with a token (D30)</td><td>Endpoint active (a bank endpoint only with rail — D18) and of the right kind (D19); a crypto sender's wallet screened unless the project skips up-front screening (D31)</td><td>Ops</td></tr>
<tr><td>Collecting</td><td>Collected</td><td>All parts verified (hash / slip / receipt; a cash part after the partner's count)</td><td>Collected amount matches; each part landed in an active endpoint of the leg's partner entity matching collection_method (D18, D19); a single-use endpoint serves this deal only (D32); overpayment → sender credit; underpayment → wait or void</td><td>Ops verifies</td></tr>
<tr><td>Collected</td><td>Rate locked, awaiting due date</td><td>On a pair that relies on the banking channel the partner confirms the rate after its cutoff</td><td>needs_bank_lock; conversion_due_date = the next business day (weekends and HOLIDAY rows skipped — D29, D34)</td><td>System</td></tr>
<tr><td>Collected / Rate locked</td><td>Converting</td><td>Conversion instructed to the partner, optionally keeping the deal's margin unconverted (residual_in — D46)</td><td>Rate version still usable; not before conversion_due_date; a next-day rate that breaches the minimum margin defers the conversion with a reason</td><td>Ops; Finance approves</td></tr>
<tr><td>Converting</td><td>Converted</td><td>Partner books; actual_out recorded; margin recognised; the pair's rounding applied; markup-share and rebate accruals posted with the conversion (D46)</td><td>Variance within tolerance, else an exception opens (the deal does not wait); the difference posts to the account of its cause</td><td>System; Finance on exception</td></tr>
<tr><td>Converted</td><td>Settled</td><td>Client net released by the partner, the promise discharged on release, every line confirmed (full or short) or returned</td><td>Settlement lifecycle, Figure 2</td><td>—</td></tr>
<tr><td>Collected</td><td>Loss event</td><td>Money lost after verification: a frozen single-use account, cash found short, a wrong-chain transfer (D32)</td><td>Management approves the split; the whole loss is booked to NPL and the client made whole; the part stays verified and the deal continues (D46)</td><td>Ops records; Finance; Management</td></tr>
<tr><td>Inquiry … Collecting</td><td>Voided</td><td>Void before money moved</td><td>Reason recorded; no postings</td><td>Ops; Finance</td></tr>
<tr><td>Collected / Converted</td><td>Voided after collection</td><td>Void after money moved</td><td>Disposition: refund (network-fee policy), sender credit, or hold</td><td>Ops; Management</td></tr>
<tr><td>Converting / Collected</td><td>Rerouted → Collected at the alternate partner</td><td>Partner unavailable, limit reached, holiday, compliance hold</td><td>Approved REROUTE; alternate partner in the applicable set</td><td>Ops; Finance</td></tr>
</tbody></table>

<h2 class="pb">3 · Settlement, rates, reroute and approval records</h2>
${settleChart}
${rateChart}
${rerouteChart}
${approvalChart}

<h2 class="pb">4 · Losses, offsets and the reseller's invoices</h2>
${lossChart}
${offsetChart}
<h3>NPL-GR's two invoices (D46 and amendment)</h3>
<p>In the reseller project NPL-GR is the client of its own remittance deal. The vendor's invoice to NPL-GR and NPL-GR's resale invoice to its customer are posted once each, in the invoice currency, when received and when issued; the resale invoice names the vendor invoice it marks up. A deal group that collects the resale invoice names it and the part it collects (advance, then balance) at the pricing rate; each vendor payment line names the vendor invoice, the obligation it discharges and the rate at discharge, and the forex result of paying on a later day's rate is a true-up on the remittance side, never on the reseller revenue. A resale invoice is settled when its groups have collected its amount; a vendor invoice when its released lines have discharged its amount (INVOICE_BALANCE by kind).</p>

<section class="land"><h2>5 · Controlled actions: who initiates, who approves, what rejection means</h2>
<p>The approving role is always a different user from the initiator. "Escalates to Management when" lists the conditions that add a Management approval on top of, not instead of, the approving role's. The last column is the ${code("ROLE_RIGHT.action")} code that carries the right (D44); "—" marks an audited operational step with no approval row of its own.</p>
<table style="font-size:8.2pt"><thead><tr><th style="width:19%">Controlled action</th><th style="width:9%">Initiates</th><th style="width:10%">Approves</th><th style="width:30%">Escalates to Management when</th><th style="width:20%">On rejection</th><th>ROLE_RIGHT</th></tr></thead><tbody>
${ACTIONS.map((a) => `<tr>${a.map((c, i) => `<td${i === 5 ? ' class="mono"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}
</tbody></table>
</section>

<h2>6 · Rejection handling, the same way everywhere</h2>
<ol>
<li><b>Nothing is deleted.</b> The request, the rejection and its reason stay on the APPROVAL record and in the audit log. A re-submission is a new approval request that points at the rejected one.</li>
<li><b>The record returns to the initiator's last safe state.</b> A rejected quote is not sent; a rejected settlement goes back to Prepared; a rejected reroute leaves the route unchanged; a rejected balance conversion leaves the balance in its currency; a rejected offset leaves every margin where it rests.</li>
<li><b>Money that already moved is never rolled back by a rejection.</b> A conversion the partner has booked stands; a variance exception is resolved by a decision and, if needed, a reversing ledger entry, not by editing the conversion. A loss that Management has approved stands as NPL's; only its shares are recovered.</li>
<li><b>A rejection reason is mandatory</b> and is visible to the initiator; derived-economics fields are stripped from the reason shown to Operations.</li>
<li><b>Frozen states need a decision, not time.</b> A breached rate version, an open variance exception, an open offset, custody in NPL's wallet, an unfunded make-good and a negative pool all stay on the daily exception list until a role with authority acts.</li>
<li><b>Escalation never skips a level.</b> Management approves in addition to Finance; when only one Finance user is on shift, Management's countersignature stands in for the second Finance user.</li>
</ol>

<h2>7 · State tables by entity</h2>
<table><thead><tr><th style="width:22%">Entity</th><th>States and transitions</th><th style="width:34%">Notes</th></tr></thead><tbody>
${STATES.map((s) => `<tr><td class="mono">${esc(s[0])}</td><td>${esc(s[1])}</td><td>${esc(s[2])}</td></tr>`).join("")}
</tbody></table>

<h2>8 · Aging and the daily exception list</h2>
<p>These things age and are reported daily with deal, reason and hours since the event: client money in NPL's own wallet (custody — reroutes, bridge collections awaiting their hop, own-desk balances), open offsets across receiver groups, open shortfalls, open variance exceptions, a pool below zero awaiting the next conversion (invariant 41), an unfunded make-good (MAKEGOOD / LOSS_PAYABLE), loss recoveries agreed and not received, and settlement lines sent beyond the rail's expected time. Breached rate versions, frozen partner × pairs and quotes past their validity appear on the same list. Time limits for each are project configuration (THRESHOLD, OWN_WALLET.custody_max_hours) and are not fixed by this document.</p>
<p class="small"><i>Draft v${V} — for review with NPL. State names are the proposal for the state columns the ERD leaves as free text; once agreed they become the enumerations of those columns.</i></p>
</body></html>`;

const h = path.join(outDir, `NPLify-Lifecycle-and-Approvals-v${V}.html`), p = path.join(outDir, `NPLify-Lifecycle-and-Approvals-v${V}.pdf`);
fs.writeFileSync(h, clientFacing(html));
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "actions:", ACTIONS.length, "state rows:", STATES.length);
