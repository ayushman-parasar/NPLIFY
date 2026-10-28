// Build docs/NPLify-Lifecycle-and-Approvals-v6.0.{html,pdf}: transaction state machines and the approval
// (maker-checker) workflows, from the agreed model at ERD v6.0 (D1–D46, the corrections of v5.9 and the design review of October 2026).
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
const REVIEW = !!process.env.NPLIFY_REVIEW;                                   // round-2 review draft: yellow = new, red strike = goes
const outDir = process.env.NPLIFY_OUT || path.join(root, "docs");
fs.mkdirSync(outDir, { recursive: true });
const mk = (t) => (REVIEW ? `<mark class="rev">${t}</mark>` : t);
const dl = (t) => (REVIEW ? `<del class="rev">${t}</del> ` : "");
const raw = (c) => (Array.isArray(c) ? c[0] : /class="rev"/.test(String(c)) ? c : esc(c));   // a cell given as [html], or carrying marks, is inserted raw
const V = D.version, DATE = "28 October 2026";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// v6.0: the figure drawn for the design review (scripts/figures-v6.0/<name>.svg, exported from the client pack's figure pass)
const figDir = path.join(here, "figures-v6.0");
const figSvg = (name) => fs.readFileSync(path.join(figDir, `${name}.svg`), "utf8");
const code = (s) => `<code>${esc(s)}</code>`;

// ------------------------------------------------------------------ state-chart drawing
// nodes: {id, label, x, y, w?, h?, kind?: 'start'|'end'|'exception'|'note'}; edges: {from, to, label?, via?:[[x,y]...], kind?}
function chart({ w, h, nodes, edges, title, file, rev }) {
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
    if (n.kind === "ponr") { // a point of no return: a short red bar across the edge, labelled below it
      if (n.horiz) parts.push(`<line x1="${n.x - 11}" y1="${n.y}" x2="${n.x + 11}" y2="${n.y}" stroke="#a33" stroke-width="3"/><text x="${n.x + 14}" y="${n.y + 3}" text-anchor="start" class="el" fill="#a33">${esc(n.label)}</text>`);
      else parts.push(`<line x1="${n.x}" y1="${n.y - 11}" x2="${n.x}" y2="${n.y + 11}" stroke="#a33" stroke-width="3"/><text x="${n.x}" y="${n.y + 26}" text-anchor="middle" class="el" fill="#a33">${esc(n.label)}</text>`);
      continue;
    }
    parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.kind === "end" ? 17 : 6}" fill="${fill[n.kind]}" stroke="${stroke[n.kind]}" stroke-width="${n.kind === "start" ? 2 : 1.2}"/>`);
    if (n.rev && REVIEW) parts.push(`<rect x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" rx="8" fill="none" stroke="#e3b400" stroke-width="2.5"/>`);
    const ls = n.label.split("\n");
    ls.forEach((l, i) => parts.push(`<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 3.5 - (ls.length - 1) * 5 + i * 10.5}" text-anchor="middle" class="st">${esc(l)}</text>`));
  }
  if (file) return `<figure class="chart">${figSvg(file)}<figcaption>${esc(title)}</figcaption></figure>`;
  return `<figure class="chart${rev && REVIEW ? " rev" : ""}"><svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
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
const dealChart = chart({ file: "lifecycle-fig1", w: 760, h: 600, title: "Figure 1 — Deal leg lifecycle. Blue: normal path. Orange: exceptions. Rounded: end states. Red bars: the points of no return (Section 7a). Collect-first and return legs enter at Collected; estimate-first enters at Collecting; a reroute after conversion (Section 2b) returns the leg to Converted at the alternate partner.", nodes: [
  { id: "inq", label: "Inquiry", x: X[0], y: r1, kind: "start" }, { id: "quo", label: "Quoted", x: X[1], y: r1 }, { id: "sent", label: "Sent", x: X[2], y: r1 }, { id: "acc", label: "Accepted", x: X[3], y: r1 }, { id: "colg", label: "Collecting", x: X[4], y: r1 },
  { id: "cold", label: "Collected", x: X[4], y: r2 }, { id: "cvg", label: "Converting", x: X[3], y: r2 }, { id: "cvd", label: "Converted", x: X[2], y: r2 }, { id: "stl", label: "Settled", x: X[1], y: r2, kind: "end" },
  { id: "grace", label: "Expired /\nin grace", x: X[2], y: r3, kind: "exception" }, { id: "req", label: "Requoted\n(new deal group)", x: X[1], y: r3, kind: "end" }, { id: "void", label: "Voided\n(no money moved)", x: X[0], y: r3, kind: "end" },
  { id: "vam", label: "Voided after\ncollection", x: X[4], y: r3, kind: "exception" }, { id: "disp", label: "Refunded / credited\n/ held", x: X[4], y: r4, kind: "end" },
  { id: "rr", label: "Rerouted", x: X[3], y: r3, kind: "exception" },
  { id: "rrc", label: "Rerouted after\nconversion", x: X[2], y: r4, kind: "exception" },
  { id: "p1", label: "money landed", x: X[4] + 59, y: r1 + 86, kind: "ponr", horiz: true }, { id: "p2", label: "partner booked", x: X[3] - 15, y: r2 + 17, kind: "ponr" }, { id: "p3", label: "partner released", x: X[2] - 15, y: r2 + 17, kind: "ponr" },
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
  { from: "lock", to: "cvg", label: "converts on the due date;\ndeferred if the rate breaches the margin", kind: "exception", via: [[458, r4 + 17], [458, r2 + 17]], lx: 458, ly: 350 },
  { from: "cvd", to: "rrc", label: "partner cannot\npay out (2b)", kind: "exception", via: [[300, r2 + 17], [300, r4 + 17]], lx: 300, ly: 250 },
  { from: "rrc", to: "cvd", label: "converted at the\nalternate partner", kind: "exception", via: [[444, r4 + 17], [444, r2 + 17]], lx: 444, ly: 396 },
  { from: "cold", to: "loss", label: "money lost after\nverification (D32)", kind: "exception", via: [[745, r2 + 17], [745, r5 + 17]], lx: 705, ly: 398 },
  { from: "loss", to: "cold", label: "loss booked to NPL,\nclient made whole;\ndeal continues", kind: "exception", via: [[598, r5 + 17], [598, r4 - 20]], lx: 598, ly: 405 },
] });

// ------------------------------------------------------------------ Figure 2: settlement, lines, confirmation
const settleChart = chart({ file: "lifecycle-fig2", w: 760, h: 350, title: "Figure 2 — Settlement: a run and its lines. The promise is discharged when the partner releases the money; a line is then “sent, not yet confirmed” until the receiver confirms, the bank deducts a fee or the bank rejects; a return or a short delivery re-raises the promise. A run completes when every line is confirmed, short or returned. Red bar: the point of no return.", nodes: [
  { id: "prep", label: "Prepared\n(Ops)", x: 20, y: 30, kind: "start" }, { id: "appr", label: "Approved\n(Finance)", x: 168, y: 30 }, { id: "rel", label: "Released by partner\n(execution_due_date)", x: 316, y: 30 }, { id: "done", label: "Completed", x: 612, y: 30, kind: "end" },
  { id: "wait", label: "Approved after cutoff:\nnext business day", x: 20, y: 140, kind: "exception" },
  { id: "rej", label: "Rejected →\nback to Ops", x: 168, y: 140, kind: "exception" },
  { id: "lsent", label: "Line: sent,\nnot yet confirmed\n(promise discharged)", x: 308, y: 135, w: 134, h: 44 },
  { id: "p1", label: "partner released", x: 301, y: 47, kind: "ponr" }, { id: "lconf", label: "Line: confirmed\n(no posting)", x: 464, y: 140, kind: "end" }, { id: "lshort", label: "Line: short\n(promise re-raised)", x: 464, y: 240, kind: "exception" }, { id: "sf", label: "SHORTFALL open →\ntopped up next run", x: 612, y: 240, kind: "end", w: 130 }, { id: "lret", label: "Line: returned\n(promise re-raised)", x: 316, y: 240, kind: "exception" },
  { id: "n1", label: "Management approves when: above settlement limit · third same-day slot · counterparty paid from another group's leg (never a refund or hop line) · only one Finance user on shift (countersign)", x: 20, y: 325, kind: "note" },
  { id: "n2", label: "a hop line (partner_transit) posts nothing on release and only when the far side credits (D40); every released line ends confirmed, short or returned (invariant 40, SETTLEMENT_LINE.outcome)", x: 20, y: 339, kind: "note" },
  { id: "n3", label: "a sent line shows released_at and expected_confirmation_by; past its expected time it is on the exception list (state table, Section 7)", x: 20, y: 311, kind: "note" },
], edges: [
  { from: "prep", to: "appr", label: "approve" }, { from: "appr", to: "rel", label: "partner executes" }, { from: "appr", to: "rej", label: "reject with reason", kind: "reject" }, { from: "rej", to: "prep", label: "re-prepare", kind: "reject", via: [[150, 120]], lx: 120, ly: 112 },
  { from: "appr", to: "wait", label: "approved after the\npartner's cutoff (D29, D34)", kind: "exception", lx: 120, ly: 100 }, { from: "wait", to: "rel", label: "", kind: "exception" },
  { from: "rel", to: "lsent", label: "each line" }, { from: "lsent", to: "lconf", label: "receiver confirms", lx: 453, ly: 128 }, { from: "lsent", to: "lshort", label: "bank fee deducted", kind: "exception" }, { from: "lshort", to: "sf", label: "carry-forward\n(Management)", kind: "exception" },
  { from: "lsent", to: "lret", label: "bank rejects", kind: "exception" }, { from: "lconf", to: "done", label: "all lines closed" }, { from: "lret", to: "done", label: "funds back in balance\nor fund a return leg", kind: "exception", via: [[375, 302], [671, 302]], lx: 530, ly: 298 },
] });

// ------------------------------------------------------------------ Figure 3: partner rate version
const rateChart = chart({ w: 760, h: 225, title: "Figure 3 — Partner rate version. Stored as quoted, with its direction and, for cash pairs, its city (D28, D30). A breach freezes quoting and conversion on that partner × pair; there is no skip path.", nodes: [
  { id: "act", label: "Active\n(new version)", x: 20, y: 30, kind: "start" }, { id: "use", label: "Usable", x: 316, y: 30, kind: "end" }, { id: "br", label: "Breached\n(pair frozen)", x: 168, y: 110, kind: "exception" }, { id: "ap", label: "Approved\n(Finance, reason)", x: 464, y: 110, kind: "end" }, { id: "rj", label: "Rejected", x: 612, y: 110, kind: "end" }, { id: "exp", label: "Expired", x: 612, y: 30, kind: "end" },
  { id: "flg", label: "Flagged\n(awaiting Finance)", x: 168, y: 175, kind: "exception", rev: true },
], edges: [
  { from: "act", to: "use", label: "spread within\navg_2w × (1 + threshold)" },
  { from: "act", to: "flg", label: "outside the absolute\ntolerance, either way", kind: "exception", via: [[79, 192]], lx: 100, ly: 128 }, { from: "flg", to: "use", label: "Finance confirms\nwith reason", kind: "exception", via: [[375, 192]], lx: 440, ly: 212 }, { from: "act", to: "br", label: "spread above limit", kind: "exception" }, { from: "br", to: "ap", label: "Finance approves\nwith reason", kind: "exception" }, { from: "br", to: "rj", label: "rejected, or better\nrate requested", kind: "reject", via: [[400, 172], [671, 172]], lx: 540, ly: 168 }, { from: "use", to: "exp", label: "expires_at" }, { from: "ap", to: "use", label: "quoting resumes", via: [[523, 100], [375, 100]], lx: 450, ly: 96 },
] });

// ------------------------------------------------------------------ Figure 4: reroute and custody
const rerouteChart = chart({ file: "lifecycle-fig4", w: 760, h: 200, title: "Figure 4 — Reroute, with the entry after conversion (phase post_conversion, Section 2b). Client money rests in NPL's own wallet in four cases only — an approved reroute before conversion, a reroute after conversion, a bridge collection awaiting its hop, an own-desk leg (invariant 3) — and every resting balance carries deal, reason and age. Red bar: the point of no return for an own-wallet transfer. A reroute after conversion starts only from a closed external instruction with the partner's reference and a reconciled balance (Section 2d, Figure 2a).", nodes: [
  { id: "req", label: "Requested\n(Ops, trigger)", x: 20, y: 30, kind: "start" }, { id: "appr", label: "Approved\n(Finance)", x: 168, y: 30 }, { id: "cust", label: "In custody\n(own wallet)", x: 316, y: 30 }, { id: "fwd", label: "Forwarded to\nalternate partner", x: 464, y: 30 }, { id: "done", label: "Completed", x: 612, y: 30, kind: "end" },
  { id: "rej", label: "Rejected →\nroute unchanged", x: 168, y: 120, kind: "end" }, { id: "rec", label: "Dues recovered\n(Management)", x: 464, y: 120, kind: "exception" },
  { id: "cvd", label: "From Converted\n(phase post_conversion)", x: 20, y: 120, kind: "exception" },
  { id: "recv", label: "Reconverted: first partner\nconverts back, no markup", x: 316, y: 120, kind: "exception", w: 134 },
  { id: "p1", label: "signers broadcast", x: 449, y: 47, kind: "ponr" },
  { id: "n1", label: "a reroute after conversion is approved by Finance, then Management; the leg's client net is write-once and the alternate partner's cost and rate difference are NPL's (Section 2b)", x: 20, y: 190, kind: "note" },
], edges: [
  { from: "req", to: "appr", label: "reason recorded" }, { from: "appr", to: "rej", label: "reject", kind: "reject" }, { from: "appr", to: "cust", label: "collection lands\nin own wallet" }, { from: "cust", to: "fwd", label: "outbound: Finance +\nManagement, signers" }, { from: "fwd", to: "done", label: "alternate partner\nconverts (margin\ncaptured there)" }, { from: "fwd", to: "rec", label: "forward_and_recover_dues", kind: "exception" }, { from: "rec", to: "done", label: "receivable ↓, wallet ↑", kind: "exception", via: [[671, 137]] },
  { from: "cvd", to: "req", label: "partner cannot\npay out", kind: "exception" }, { from: "appr", to: "recv", label: "after conversion:\nManagement added", kind: "exception", lx: 290, ly: 102 }, { from: "recv", to: "cust", label: "paid to the\nown wallet", kind: "exception", lx: 410, ly: 100 },
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

// ------------------------------------------------------------------ Figure 1a: holds on a leg (round 2, 09.1)
const holdChart = chart({ rev: true, w: 760, h: 215, title: "Figure 1a — A hold on a deal leg. The leg keeps its state; a partner hold ends only on the partner's clearance, a screening hold only on Management's second look or a new clear screening; the one movement under a hold is the disposition the partner instructs, approved by Management.", nodes: [
  { id: "any", label: "Leg in Collecting\n… Converted", x: 20, y: 30, kind: "start" }, { id: "hp", label: "On hold:\npartner hold", x: 168, y: 30, kind: "exception" }, { id: "hs", label: "On hold:\nscreening second look", x: 168, y: 120, kind: "exception", w: 134 },
  { id: "back", label: "Back to the\nstate it left", x: 464, y: 30, kind: "end" }, { id: "disp", label: "Disposition under hold\n(Management)", x: 464, y: 120, kind: "exception", w: 134 }, { id: "out", label: "Refunded on the partner's\ninstruction, or rerouted", x: 612, y: 120, kind: "end", w: 140 },
  { id: "n1", label: "while a hold stands: no conversion, settlement line, refund, reroute forward or balance conversion on the money or destination held;", x: 20, y: 196, kind: "note" },
  { id: "n2", label: "recording, screening, evidence and partner messages continue; the refund under hold is the partner's instruction, approved by Management", x: 20, y: 208, kind: "note" },
], edges: [
  { from: "any", to: "hp", label: "partner reports hold,\nfreeze or decline", kind: "exception" }, { from: "any", to: "hs", label: "report not clear,\nor reject stands", kind: "exception", lx: 110, ly: 118 },
  { from: "hp", to: "back", label: "partner clears\n(reference recorded)" }, { from: "hs", to: "back", label: "Management: accept or accept_alternate,\nor a new clear screening", lx: 400, ly: 86 },
  { from: "hp", to: "disp", label: "partner instructs\na refund", kind: "exception", lx: 420, ly: 112 }, { from: "hs", to: "disp", label: "reject stands;\npartner instructs", kind: "exception", lx: 383, ly: 172 }, { from: "disp", to: "out", label: "", kind: "exception" },
] });

// ------------------------------------------------------------------ Figure 2a: an external instruction (round 2, 09.2)
const instrChart = chart({ rev: true, w: 760, h: 215, title: "Figure 2a — An external instruction (conversion, settlement line, reroute forward). Two points of no return: the partner's acknowledgement (no withdrawal) and the execution (money moved). One open instruction per promise: a second one is refused while the first is instructed, acknowledged or unknown.", nodes: [
  { id: "prep", label: "Prepared", x: 20, y: 30, kind: "start" }, { id: "inst", label: "Instructed\n(instruction_ref)", x: 168, y: 30 }, { id: "ack", label: "Acknowledged\nby partner", x: 316, y: 30 }, { id: "exe", label: "Executed\n(booked / released)", x: 464, y: 30, kind: "end" },
  { id: "unk", label: "Outcome unknown\n(no acknowledgement)", x: 168, y: 120, kind: "exception", w: 134 }, { id: "rejn", label: "Rejected / not executed\n(partner's reference)", x: 330, y: 120, kind: "exception", w: 140 }, { id: "re", label: "Re-instructed (new ref)\nor rerouted", x: 500, y: 120, kind: "end", w: 134 },
  { id: "p1", label: "acknowledged", x: 309, y: 47, kind: "ponr" }, { id: "p2", label: "money moved", x: 457, y: 47, kind: "ponr" },
  { id: "n1", label: "outcome unknown: on the exception list with its age; Finance obtains the partner's statement; a Management exception needs the partner's written confirmation and the reconciliation (2d)", x: 20, y: 200, kind: "note" },
], edges: [
  { from: "prep", to: "inst", label: "sent to\nthe partner" }, { from: "inst", to: "ack", label: "partner\nacknowledges" }, { from: "ack", to: "exe", label: "partner\nexecutes" },
  { from: "inst", to: "unk", label: "no answer,\ncall failed", kind: "exception" }, { from: "unk", to: "ack", label: "statement: executed /\nlate acknowledgement", kind: "exception", lx: 322, ly: 104 }, { from: "unk", to: "rejn", label: "written confirmation:\nnot executed (Management)", kind: "exception", lx: 316, ly: 178 },
  { from: "ack", to: "rejn", label: "partner\nrejects", kind: "exception", lx: 445, ly: 108 }, { from: "rejn", to: "re", label: "Finance authorises\nthe one retry", kind: "exception", lx: 485, ly: 182 },
] });

// ------------------------------------------------------------------ state tables by entity
const otpChart = chart({ rev: true, w: 760, h: 230, title: "Figure 1b — Email OTP: the customer's approval of a quote (projects with the feature on). Sent is 'pending customer approval'; Accepted is 'customer approved'. The code lives for the code window; the price for the quote's validity; between the two, the drift test decides.", nodes: [
  { id: "quo", label: "Quoted\n(Finance approved\nwhere required)", x: 20, y: 30, kind: "start", w: 120 }, { id: "sent", label: "Sent = pending\ncustomer approval", x: 190, y: 30, w: 130 }, { id: "acc", label: "Accepted =\ncustomer approved", x: 370, y: 30, kind: "end", w: 130 }, { id: "col", label: "Collecting\n(full destination sent\nin the registered group)", x: 550, y: 30, w: 150 },
  { id: "rei", label: "New issue\n(order changed, resend)", x: 20, y: 125, kind: "exception", w: 130 }, { id: "rej", label: "Rejected →\nrequoted or voided", x: 190, y: 125, kind: "exception", w: 130 }, { id: "exp", label: "Quoted again\n(code expired; alert)", x: 370, y: 125, kind: "exception", w: 130 },
  { id: "n1", label: "the email: the rendered quote, a one-time code, the partial destination (first and last characters); no link, never the full account or wallet; one email per issue;", x: 20, y: 206, kind: "note" },
  { id: "n2", label: "the approval: the code pasted in the registered chat group, entered by Operations, validated by the server; the chat screenshot is the evidence", x: 20, y: 218, kind: "note" },
], edges: [
  { from: "quo", to: "sent", label: "send for approval:\nemail + code issued" }, { from: "sent", to: "acc", label: "code validated\n(+ amount above step-up)" }, { from: "acc", to: "col", label: "proceed to\ncollection" },
  { from: "sent", to: "rei", label: "order edited\nor resent", kind: "exception", lx: 60, ly: 92 }, { from: "rei", to: "sent", label: "new code", kind: "exception", lx: 150, ly: 112 },
  { from: "sent", to: "rej", label: "customer rejects\n(reason recorded)", kind: "exception", lx: 262, ly: 98 }, { from: "sent", to: "exp", label: "unused for the\ncode window", kind: "exception", lx: 345, ly: 92 },
] });

const STATES = [
  ["DEAL_GROUP", "Inquiry → Quoted → Sent → Accepted → Collecting → Collected → Converting → Converted → Settled; Expired / in grace; Requoted; Voided; Voided after collection → Refunded / Credited / Held" + mk(" (with Email OTP on, Sent is shown as pending customer approval and Accepted as customer approved; 2e)"), "The group's state follows its legs: Settled when every forward leg is settled and no return leg is open. In NPL-GR the group names the resale invoice it collects and the part of it (invoice_id, invoice_amount, invoice_rate — D46 and amendment)."],
  ["DEAL (leg)", "As Figure 1. A collect-first or return leg is born at Collected; an estimate-first leg enters Collecting; leg 2 of a route is born at Collected when leg 1 pays the transit receiver. On a bank-channel pair a Collected leg carries rate_locked_at, cutoff_at and conversion_due_date and may not convert before the due date (D29)", "leg_type and funding_source decide the entry point. Pricing fields are write-once after priced_at; a leg priced on an expired leg's rate carries rate_reused_from_deal_id and the override that allowed it (D45). A return or hop leg inherits the parent leg's receiver group; cross_group_payout never fires on it (D13)."],
  ["QUOTE_PACKAGE", "issued → superseded (by a re-issue)", "One row per issue of a group's quote; a quote-first leg is Sent only when a package has sent_at; freshness runs from the leg's market snapshot to sent_at, validity from sent_at (D35)." + mk(" With Email OTP on, the issue is the approval email (channel email) and its code belongs to that issue; a re-issue voids the code.")],
  [mk("CUSTOMER_APPROVAL"), mk("issued → approved / rejected / expired / voided / locked"), mk("One row per code sent (2e): the quote issue, the code reference and hash, the amount expected above the step-up threshold, the partial destination printed, the email snapshot, the attempts, the decision with its stamps and the chat evidence. The decision is write-once; every send, delivery event, reply, attempt, lock and tripwire is a CUSTOMER_APPROVAL_EVENT row.")],
  ["QUOTE_VALIDITY_EXTENSION", "requested → approved (Finance; Management past the cutoff or the rate version's expiry)", "Any number per leg before the validity in force ends; each moves DEAL.effective_valid_until and re-issues the package at the same price (D45)."],
  ["WALLET_SCREENING (decision)", ["accept | accept_alternate | reject " + dl("(Finance may override a reject)") + mk("; a report not clear under the provider's Strict rulebook awaits Management's second look, a screening hold on the leg (2c)")], ["An Operations action before a crypto collection or before a wallet payout; accept_alternate lands only on an elevated-band endpoint (D31)." + mk(" Finance has no right on a screening; a reject stands until a new screening row decided by Management (Roles & Visibility rule 11).")]],
  [[mk("DEAL (hold)")], [mk("none → partner_hold | screening_hold → none (cleared); → disposition (refund on the partner's instruction, or reroute)")], [mk("The leg keeps its state; hold_kind and hold_ref name the event or screening row; every money-moving action on the leg is refused while the hold stands; lifted by the partner's clearance reference or Management's second look (2c).")]],
  ["COLLECTION", "pending → verified; reversed (only when Management unwinds a deal after a loss). Cash: token_issued → handed_over → counted → verified", "Parts post as verified; a cash part only after the partner's count (D30). Overpayment creates SENDER_CREDIT; underpayment waits or is voided. After a loss the part stays verified: NPL's funds stand in (D46, invariant 31)."],
  ["CONVERSION", ["Expected → " + mk("instructed → acknowledged → ") + "Booked → Approved; Variance exception (Booked, beyond tolerance) → Resolved" + mk("; instructed → outcome unknown → acknowledged | rejected → re-instructed under a new reference, as a retry (2d)")], "The booked figure is what the partner did; the difference posts to VAR_CONVERSION (partner_calculates), VAR_CUTOFF (after the cutoff) or VAR_RATE_HONOUR (an honoured expired rate); the exception is resolved by Finance; the deal does not wait. residual_in keeps the deal's margin unconverted, EARN_GROSS recognised in the collection currency (D46)."],
  ["BALANCE_CONVERSION", "Requested (Finance) → Approved (Management) → Booked; Rejected. A banking-ready balance waits for conversion_due_date (D29)", "Owns exactly one CONVERSION; entitlement re-attributed to the served group on booking."],
  ["REROUTE", "Requested → Approved → In custody → Forwarded → Completed; Rejected", "Phase pre_collection or post_collection; outcome via_own_wallet or refund_sender; forward_full or forward_and_recover_dues."],
  ["REROUTE, phase post_conversion", "Requested → Approved (Finance, Management) → Reconverted → In custody → Forwarded → Completed; Rejected", ["Trigger as for any reroute; outcome via_own_wallet only; the reroute owns the balance conversion back and names the second conversion; the leg returns to Converted at the alternate partner." + mk(" Starts only from a closed payout instruction at the first partner: rejected or acknowledged as not executed, with reference, and the balance reconciled (2d).")]],
  ["EARNINGS_OFFSET", "requested (Finance) → approved (Management) → posted", "Recovers EARNINGS_RECEIVABLE rows at the from-partner; the swap is recorded for NPL in FX_RESULT (D46)."],
  ["SETTLEMENT", "Prepared → Approved → Released → Completed; Rejected (back to Prepared). A bank-rail run approved after the cutoff is released on execution_due_date (D29, D34)", "Completed when every line is confirmed, short or returned."],
  ["SETTLEMENT_LINE (outcome)", [mk("instructed → acknowledged (= sent) → ") + "sent → confirmed | short | returned" + mk("; instructed → outcome unknown → acknowledged | rejected → re-instructed under a new reference, as a retry (2d)")], "The promise is discharged on release; a short confirmation re-raises it for the missing part and a return for what came back (invariant 40). A line paying a group-less receiver carries deal_id (D17) and is never an offset; a hop line posts only when the far side credits (D40)."],
  ["SETTLEMENT_LINE, “sent, not yet confirmed”", "sent (released by the partner, released_at set) → confirmed | short | returned", "NPL Finance confirmed on 20 October that this state is shown by name on the settlement screens and on the Finance log report of released, unconfirmed lines (Phase 2, M7). A line whose expected_confirmation_by has passed is on the exception list; the promise was discharged on release (Ledger Posting Design, rule 13) and nothing posts until the line ends confirmed, short or returned."],
  ["CONFIRMATION (result)", "full | short", "Full posts nothing; short opens a SHORTFALL unless the treatment is waived (D46)."],
  ["SHORTFALL", "open → topped_up", "Top-up funded from the pool, Management approval, paid with the next settlement."],
  ["SETTLEMENT_RETURN", "recorded (terminal)", "Funds a return leg or stays in balance; the bounce fee is a BANK_FEE_EVENT."],
  ["BANK_FEE_EVENT", "open → applied", "Applied to the settlement that carried the true-up; treatment waived / carry_forward / absorbed; a covered fee is a FEE_DECISION (D41)."],
  ["COLLECTION_RECEIVING_ENDPOINT (status)", "inactive → active; active → suspended; a single_use endpoint retires after its one reference (D32)", "A bank endpoint becomes active only with rail set; a wallet may stay without rail, and its rail, when set, equals its network (D18); the network must be one the partner's vehicle offers (D39)."],
  ["RECEIVING_ENTITY_ACCOUNT (usage)", "standing; single_use → retired after the one payout it was reserved for", "D32."],
  ["RATE_COMPARISON", "open → closed", "One per partner × pair × date; closed at end of day."],
  ["PARTNER_RATE_VERSION", ["active → usable → expired; active → breached → approved → usable, or rejected" + mk("; active → flagged (spread outside the absolute tolerance, either direction) → usable when Finance confirms it with a reason, or rejected; a flagged version prices nothing and the pair is not frozen (Calculation Specification 2a)")], "Never overwritten; each conversion names its version; stored as quoted with direction and, for cash, the city (D28, D30)."],
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
  ["PARTNER_PAIR", "active → inactive | dormant; dormant → active", "A dormant pair prices nothing and accepts no collection or settlement line; it returns to active only through the reactivation checklist (Scenario Catalogue; Configuration Schema, partner pair) by Finance or Management; a route unused for the project's route_unused_days threshold is put on the quarterly review."],
  ["EMERGENCY_ACTION", "applied → ratified | lifted", "Applied at once by Finance with a mandatory reason, ratified by Management within the time limit of 8a or lifted; while applied or ratified a partner_suspend blocks new pricing, conversion instructions and settlement releases on every pair of the partner, a destination_freeze blocks every settlement line to that account, a cutoff_override moves the day's cutoff (2b)."],
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
mark.rev{background:#ffe58a;color:inherit;padding:0 1px} del.rev{color:#b00020;text-decoration:line-through} .rev-note{background:#ffe58a;padding:3pt 6pt;font-size:9pt;margin:0 0 8pt}
figure.chart.rev{outline:3px solid #ffe58a;outline-offset:3pt}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Transaction Lifecycle &amp; Approval State Machines v${V}</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Transaction Lifecycle &amp; Approval State Machines · Draft v${V}</p><p class="small">Numbered with the ERD edition it is built against.</p><p class="org">New XP Technologies Limited</p><p class="date">${DATE} · Confidential</p></div>
<div class="rule"></div>
${REVIEW ? `<p class="rev-note"><b>Round-2 review draft, 28 October 2026 (Email OTP, the reviewer's change request CR-01, added to the draft of 27 October: findings 09.1 and 09.2 of the v6.0 design review; the screening decision of 26 October carried from documents 6 and 7; the flagged rate state from document 5; the settlement outcome-unknown state from document 3).</b> Yellow = added or replaced; red strike = what goes; a yellow frame marks a new or changed figure.</p>` : ""}
<h2>How to read this pack</h2>
<p>Four map pages are now part of the pack as documents of their own, and are the place to start: the Top-Down Map (from the business, through the data model and the deal states, to the scenarios and the reading order), the Deal Flow on one page (Quote, Collect, Convert, Settle, with the roles and the money path), the Workflow Tree (8 classes, 27 sub-classes, 96 procedures, each naming who initiates, who approves, the codes it is written under and the records it touches) and the Workflow Tree on one page. Read them in that order, then this document. Every worked transaction (T), acceptance vector (L, B), walkthrough (W, X), flow (F) and procedure (C, A, D) has one identifier, listed in the Reading Companion's identifier register; the Test Strategy &amp; Coverage document says which test proves each procedure.</p>

<h2>1 · Three roles, one principle</h2>
<p>Every controlled action is <b>maker-checker</b>: one person initiates, a different person in the approving role approves, and the system refuses an approval by the initiator. Since D44 the rights are configuration, not code: ${code("ROLE")} holds the three roles of today and ${code("ROLE_RIGHT")} says per controlled action which role may initiate, which may approve and which is added on escalation; the approver's role must hold ${code("may_approve")} for the action (invariant 9). Visibility is cumulative: Operations sees the least, Finance sees everything Operations sees plus the economics, Management sees everything.</p>
<table><thead><tr><th style="width:16%">Role</th><th>Does</th><th>Sees</th><th>Never sees</th></tr></thead><tbody>
<tr><td>Operations</td><td>Quotes, screens wallets, verifies collections (cash after the partner's count), instructs conversions, prepares settlements, requests reroutes, records destination approvals, enters partner rates as quoted</td><td>Operational fields, sender-facing prices (including the customer-facing figures the quote prints), partner rates as entered, deal states</td><td>Reference rate at capture, spread, margin, pool, cost breakdown, ledger balances, the four variances, FX_RESULT, loss shares, offsets, earnings, reseller margins — on any screen, export, message or report (ROLE.sees_economics = false)</td></tr>
<tr><td>Finance</td><td>Approves what Operations initiates (quotes, extensions, rates, conversions, settlements, exceptions); resolves variance exceptions; recommends covered fees and fee caps; ${dl("overrides a screening reject;")}${mk("records a partner's hold, freeze or decline and its clearance (a screening that is not clear is Management's second look);")} requests balance conversions, dues recovery, earnings offsets and loss splits; owns reconciliation, the month-end true-ups and ledger adjustments; proposes configuration</td><td>Everything Operations sees plus all economics, postings and balances</td><td>—</td></tr>
<tr><td>Management</td><td>Approves escalations and the heavier actions listed in Section 5 (loss splits, offsets, balance conversions, dues recovery, covered fees and raised caps, own-wallet transfers, post-money voids, own desks); approves configuration, system settings and user changes; countersigns releases when only one Finance user is on shift</td><td>Everything</td><td>—</td></tr>
</tbody></table>


<h2>2 · The deal: Quote → Collect → Convert → Settle</h2>
<p>A deal is a group of one or more legs. A quote-first leg walks the whole top row of Figure 1; a collect-first leg is born at Collected because the money arrived before any quote; an estimate-first leg enters Collecting with an indicative figure and is priced at conversion; a return leg is born at Collected, funded by the returned payout and attributed to its parent leg's group. Pricing fields are stamped once and never recomputed. Fee parts are percentages of the principal at the basis rate and never compound (invariant 42); a target-out quote applies the fee as a markup on the target (D46 amendment).</p>
${dealChart}
<h3>Transitions</h3>
<table><thead><tr><th style="width:14%">From</th><th style="width:14%">To</th><th>Event</th><th>Guard</th><th style="width:16%">Who</th></tr></thead><tbody>
<tr><td>Inquiry</td><td>Quoted</td><td>Price computed: partner × pair chosen, fee structure and tier applied (D20, D21), rate snapshot taken, day's rate comparison created if missing; the customer-facing fee and rate derived (D22)</td><td>Partner rate version usable (not breached); margin ≥ floor, else Finance approval; an approved destination exists for the entitled group with that partner (invariant 8); the method is one the partner offers (invariant 36)</td><td>Ops; Finance if below margin</td></tr>
<tr><td>Quoted</td><td>Sent</td><td>Quote package issued and marked sent (QUOTE_PACKAGE, template sender-facing only — D35, D36)${mk("; on a project with Email OTP on, the issue is the approval email: the rendered quote, a one-time code and the partial destination, sent by the email service to the sender's registered approver address, one email per quote issue (2e); the group is then <i>pending customer approval</i>")}</td><td>Within quote_freshness_min of the snapshot; otherwise re-price${mk("; with Email OTP on, also an approved approver address and chat group on the sender, with no change to them pending")}</td><td>Ops</td></tr>
<tr><td>Sent</td><td>Accepted</td><td>Sender accepts${mk("; with Email OTP on, acceptance is the code: the customer pastes it (and, at or above the step-up amount, the amount) in the registered chat group, Operations enters it, the server validates it (right code, right issue, unexpired, unused, amount if required) and stamps the approval with the entering user and the time; the chat screenshot is attached as evidence (2e)")}</td><td>Within the validity in force (effective_valid_until)${mk("; with Email OTP on, within the code window (default 24 hours): inside validity at the quoted price; after validity only if the drift test passes (grace_drift_pct), otherwise a new issue")}</td><td>Ops records${mk(" (enters the code)")}</td></tr>
<tr><td>Sent / Accepted</td><td>Sent / Accepted (validity extended)</td><td>QUOTE_VALIDITY_EXTENSION: the package re-issued at the same price with a later validity${mk("; with Email OTP on, the re-issue is a new quote issue with a new code, and the old code is void")}</td><td>Before the validity in force ends; any number of times; Finance approves, Management added when the new validity passes the partner's cutoff or the rate version's expiry (D45)</td><td>Ops requests; Finance</td></tr>
<tr><td>Sent / Accepted</td><td>Expired / in grace</td><td>Validity lapses</td><td>Grace applies for grace_min only if market drift ≤ grace_drift_pct${mk("; with Email OTP on, the grace for the acceptance is the code window, with the same drift test")}</td><td>System</td></tr>
<tr><td>${mk("Sent")}</td><td>${mk("Sent (new issue)")}</td><td>${mk("Email OTP: any change to the order (amount, rate, fee, method, destination) or a resend supersedes the issue; a new email and a new code go out; the old code is void")}</td><td>${mk("Before acceptance")}</td><td>${mk("Ops")}</td></tr>
<tr><td>${mk("Sent")}</td><td>${mk("Requoted (new deal group) or Voided")}</td><td>${mk("Email OTP: the customer rejects, by a reply to the email from the registered address or in the registered chat group; the reason is recorded verbatim")}</td><td>${mk("—")}</td><td>${mk("Ops records; reason mandatory")}</td></tr>
<tr><td>${mk("Sent")}</td><td>${mk("Quoted")}</td><td>${mk("Email OTP: the code window passes with the code unused; the group returns to Quoted and Operations is alerted; a new issue needs a new send")}</td><td>${mk("—")}</td><td>${mk("System")}</td></tr>
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
<tr><td>Collected / Converted</td><td>Voided after collection</td><td>Void after money moved</td><td>Disposition: refund (network-fee policy), sender credit, or hold${mk("; a refund while the leg is on hold only on the partner's written instruction, with its reference, and Management's approval (2c)")}</td><td>Ops; Management</td></tr>
<tr><td>Converting / Collected</td><td>Rerouted → Collected at the alternate partner</td><td>Partner unavailable, limit reached, holiday, compliance hold</td><td>Approved REROUTE; alternate partner in the applicable set${mk("; the money itself not under a partner hold (2c)")}</td><td>Ops; Finance</td></tr>
<tr><td>${mk("Collecting … Converted")}</td><td>${mk("On hold (the leg keeps its state)")}</td><td>${mk("A partner reports a hold, freeze or decline on the leg's money or its destination (EMERGENCY_ACTION destination_freeze, REROUTE trigger compliance_hold, LOSS_EVENT account_frozen), or NPL's screening of a wallet on the leg is not clear under the provider's Strict rulebook (second look pending) or stands at reject")}</td><td>${mk("The hold is recorded on the leg with its kind (partner_hold / screening_hold) and the event or screening row it comes from; every money-moving action on the leg is refused while it stands (2c)")}</td><td>${mk("System on the event; Ops records")}</td></tr>
<tr><td>${mk("On hold")}</td><td>${mk("The state it left")}</td><td>${mk("Partner hold: the partner's clearance, recorded with its reference. Screening hold: Management's second-look decision accept or accept_alternate, or a new screening row that is clear")}</td><td>${mk("Clearance reference present (partner); APPROVAL by Management, approver not the person who screened (screening); the lift is written to AUDIT_LOG with the reference")}</td><td>${mk("Finance records; Management decides")}</td></tr>
<tr><td>${mk("On hold")}</td><td>${mk("Voided after collection → Refunded, or Rerouted")}</td><td>${mk("Disposition under hold: the partner instructs a refund in writing, or the money is moved to a partner the hold does not touch")}</td><td>${mk("The partner's instruction reference recorded; Management approves; a refund goes only to the sender's return receiver; never while a partner hold is on the balance itself")}</td><td>${mk("Management")}</td></tr>
<tr><td>Converted</td><td>Rerouted after conversion → Converted at the alternate partner</td><td>The converting partner cannot pay out (suspended, limit reached, holiday, bank down) and NPL chooses not to wait: the balance is converted back, held in NPL's wallet, forwarded and converted again</td><td>Approved REROUTE with phase post_conversion; alternate partner in the applicable set; Management approval; custody within custody_max_hours; the client net stays as priced${mk("; any payout instruction already given to the first partner is acknowledged by it as rejected or not executed, with its reference (2d)")}</td><td>Ops; Finance; Management</td></tr>
</tbody></table>

<h2>2a · Effective-date rules</h2>
<p>Pricing stamps are write-once, and configuration is versioned by effective date (Configuration Schema, section 1). The four rules below say which version a deal uses; they are the same rules as in the Configuration Schema.</p>
<table><thead><tr><th style="width:34%">Rule</th><th>What happens</th></tr></thead><tbody>
<tr><td>1. New versions apply to new pricing only</td><td>An approved configuration change takes effect for deals priced on or after its effective date. A deal priced before that date is not re-priced.</td></tr>
<tr><td>2. A priced deal keeps its versions</td><td>The fee structure version, the tier, the rate basis, the rounding options, the partner configuration and the policy versions stamped at pricing stay with the deal to the end of its life, including through settlement, return and loss handling.</td></tr>
<tr><td>3. A re-quote uses the configuration of the new pricing time</td><td>An expired or requoted leg is priced afresh on the versions in force when the new quote is made (a new deal group); the original leg keeps its stamp.</td></tr>
<tr><td>4. A collect-first deal uses the configuration in force when it is priced</td><td>A collect-first leg is priced at conversion, so it uses the versions effective at that time, not at the time the money arrived, unless a documented client agreement names a different rule for that project.</td></tr>
</tbody></table>

<h2>2b · Emergencies in the middle of a deal: the three cases</h2>
<p>When a partner must be suspended, a destination frozen or a cutoff overridden (the emergency actions of Section 5), the deals already in flight are in one of three positions. The table says what can be done in each.</p>
<table><thead><tr><th style="width:20%">Case</th><th>What can be done</th><th style="width:20%">Who</th><th style="width:22%">What posts</th></tr></thead><tbody>
<tr><td>1. Collection started, not completed (Accepted or Collecting)</td><td>Void before money moves: the leg is voided, the instructions withdrawn, a single-use endpoint released. If the sender has already paid part, the deal is in case 2 for that part.</td><td>Operations starts, Finance approves</td><td>Nothing; no money has moved.</td></tr>
<tr><td>2. Collected, not converted (Collected or Rate locked)</td><td>Reroute with phase post_collection: the unconverted money goes through NPL's own wallet to an alternate partner in the applicable set, or is refunded to the sender (a post-money void).</td><td>Operations requests; Finance approves the reroute; Management approves a refund</td><td>Existing Pattern D of the Ledger Posting Design (T12, T13): HELD, then COLLECTED at the alternate partner.</td></tr>
<tr><td>3. Converted, sitting at the partner (Converted)</td><td>Reroute after conversion, phase post_conversion (NPL decision, 20 October): the converting partner converts the client's balance back to the collection currency at its rate of the day, pays it to NPL's own wallet, NPL forwards it to the alternate partner, and that partner converts at its own rate of the day. The client's entitlement is unchanged; the rate difference and the second partner's cost are NPL's.</td><td>Operations requests; Finance approves; Management approves, because NPL's wallet holds client money in the meantime</td><td>New Pattern O of the Ledger Posting Design (T56 to T58): a balance conversion back, custody, the forward, the second conversion with VAR_CONVERSION and the pool.</td></tr>
</tbody></table>
<h3>Reroute after conversion (phase post_conversion)</h3>
<p>Figure 4 gains one entry point. A REROUTE with phase post_conversion starts from a leg in Converted, not from Collected: Requested (Operations, trigger recorded) → Approved (Finance, then Management) → Reconverted (the converting partner has converted the balance back; a BALANCE_CONVERSION owned by the reroute, no markup) → In custody (own wallet) → Forwarded to alternate partner → Completed when the alternate partner has converted and the leg is back in Converted there. The leg's client net is write-once and is what the alternate partner must deliver into the client's balance; what it actually delivers, less its stated cost, differs from that by the rate difference, which is posted to VAR_CONVERSION against NPL's pool at the alternate partner. NPL's margin captured at the first conversion stays where it was earned. Custody is bounded by custody_max_hours and shown on the custody view like any reroute. The first partner's transfer to NPL's wallet and NPL's forward to the alternate partner are both outbound transfers under the controls of Section 5.${mk(" A reroute after conversion is also an alternative payout, so Section 2d applies: it starts only when any payout instruction already given to the first partner is acknowledged by that partner as rejected or not executed.")}</p>

<h2>${mk("2c · Holds: scope, allowed actions, release and audit")}</h2>
<p>${mk("A hold is a named condition on a deal leg, not a narrative. It comes from one of two sources and keeps the leg in the state it was in: a <b>partner hold</b> (the partner, or its bank, reports a hold, freeze or decline on the client's money or on a destination: NPL records it as the event it is and does not decide it) or a <b>screening hold</b> (NPL's own screening of a wallet on the leg is not clear under the provider's Strict rulebook and awaits Management's second look, or a decision of reject stands). NPL has no compliance function; the partner's decisions are the partner's, and the only decision NPL takes is Management's second look on its own screening (Roles &amp; Visibility rule 11).")}</p>
${holdChart}
<table><thead><tr><th style="width:18%">${mk("Question")}</th><th>${mk("Rule")}</th></tr></thead><tbody>
<tr><td>${mk("Scope")}</td><td>${mk("The hold attaches to the leg and names what it covers: the collected money (partner hold on the balance, or a screening hold on the sender's wallet), or the destination (partner freeze of the destination, or a screening hold on the receiver's wallet). A partner hold on a balance covers every leg whose money rests in it.")}</td></tr>
<tr><td>${mk("Blocked while it stands")}</td><td>${mk("Every action that moves the held money or pays the held destination: instructing a conversion or a balance conversion, preparing or releasing a settlement line, a refund or sender credit paid out, a reroute forward from custody, a return leg. The server refuses them with the hold as the reason, whichever role asks and whichever channel (screen, API, a replayed request).")}</td></tr>
<tr><td>${mk("Allowed while it stands")}</td><td>${mk("Recording and evidence: a new screening row, partner messages and their references, the exception list, verification of a part that has already landed, a void before money moved on a leg that has not collected, and settlement lines of other legs that neither draw on the held money nor pay the held destination.")}</td></tr>
<tr><td>${mk("Who lifts it")}</td><td>${mk("A partner hold: nobody at NPL; it ends when the partner's clearance is recorded with its reference (Finance records it; it is an audited record, not an approval). A screening hold: Management's second-look decision accept or accept_alternate (an APPROVAL under screening_second_look, approver never the person who screened), or a new screening row that is clear. Finance has no right over either.")}</td></tr>
<tr><td>${mk("Disposition")}</td><td>${mk("While a hold stands, the only money movement is the one the partner instructs in writing (a refund to the sender's return receiver, or a transfer the partner directs); it is recorded with the partner's reference and approved by Management, and never happens while a partner hold is on the balance itself. The reviewer's case, funds from a newly flagged wallet and a partner asking for a refund, is exactly this path: Operations cannot issue the return transfer; Management approves it on the partner's instruction.")}</td></tr>
<tr><td>${mk("Expiry and re-screening")}</td><td>${mk("A hold does not expire by time. A screening hold is re-examined only by a new screening row (new report, new decision); a partner hold is chased daily from the exception list with its age (Section 8). A leg on hold for longer than the project's limit is escalated to Management by the time-limit rule of 8a.")}</td></tr>
<tr><td>${mk("Audit")}</td><td>${mk("The start and the end of every hold are AUDIT_LOG rows naming the event or screening row, the reference, the actor and the time; the second-look decision is an APPROVAL; every refused action under a hold is logged with the hold as its reason. The ERD gains the hold on the leg (hold_kind, hold_ref) and the tests of the Test Strategy (S-HOLD) attempt a payout, a conversion, a refund and a reroute under each kind of hold.")}</td></tr>
</tbody></table>

<h2>${mk("2d · External instructions: prepared, acknowledged, executed")}</h2>
<p>${mk("Every instruction NPL gives a partner — a conversion, a balance conversion, a settlement line, the forward of a reroute — is one row with its own reference (instruction_ref, the idempotency key of the Architecture) and an acknowledgement status that distinguishes three facts the reviewer asks to keep apart: the instruction is <b>prepared</b> at NPL, the partner has <b>acknowledged</b> it (from then on it cannot be withdrawn: the first point of no return), and the partner has <b>executed</b> it (the money moved: the second). A line is \"sent\" only on the partner's acknowledgement; an instruction with no acknowledgement is \"outcome unknown\" and stays so until the partner's statement or confirmation says executed or not executed. The two held states are different things: \"sent, not yet confirmed\" (Ledger Posting Design rule 13a) is an acknowledged instruction waiting for its execution to be confirmed, and posts nothing; \"sent, outcome unknown\" is an instruction the partner has not acknowledged at all. A line enters \"outcome unknown\" when the partner's acknowledgement has not arrived by the acknowledgement time-out of the instruction (the partner's configured wait after the call; a failed call counts the same), and Operations raises a partner reference inquiry the same day, recording the partner's answer with its evidence on the instruction.")}</p>
${instrChart}
<ol>
<li>${mk("<b>One open instruction per promise.</b> While an instruction for a promise (a settlement line, a conversion of a balance) is instructed, acknowledged or of unknown outcome, the server refuses a second instruction for the same promise from any role and any channel: the unique key is the promise, not the request (Ledger Posting Design rule 1b, Pattern P). This is what prevents a double payment.")}</li>
<li>${mk("<b>A reroute or any alternative payout starts from a closed instruction.</b> A reroute after conversion, a re-instructed settlement line or a payout through another partner is allowed only when the original instruction's status is rejected, or acknowledged as not executed, with the partner's reference recorded on the instruction, and the balance reconciliation shows the client's money still at the first partner (ledger balance equal to the partner's statement, the amount included).")}</li>
<li>${mk("<b>Unknown is not rejected.</b> An instruction with outcome unknown is on the exception list with its age; Finance obtains the partner's statement or written confirmation; nothing is re-instructed meanwhile. Management may authorise an exception only with the partner's written confirmation that the instruction was not and will not be executed, its reference, and the reconciliation attached; the exception is an APPROVAL naming them, and the instruction is closed as rejected before the alternative is instructed. Three ways out, each recorded on the held instruction: <b>executed</b> — the partner's statement or reference shows the money moved; the instruction is marked acknowledged and executed against that reference and the line continues as usual, nothing posted twice; <b>not received</b> — the partner confirms in writing that it never received the instruction and will not execute it; Management closes the instruction as rejected on that confirmation (the exception above) and Finance authorises the one retry under a new partner reference, recorded as a retry of the held instruction (retry_of), never a second open instruction; <b>answered late</b> — the acknowledgement arrives after the time-out; it is recorded as the acknowledgement with its real time and the line proceeds as acknowledged. The Test Strategy test G-EXT is this rule at acceptance level.")}</li>
<li>${mk("<b>Delayed confirmation is not failure.</b> The reviewer's case, the first partner debits EUR but confirmation is delayed, is an acknowledged instruction: the alternative payout is refused until the partner's statement arrives, and when it shows the money moved the line ends confirmed as usual. The Test Strategy test S-ACK exercises every acknowledgement outcome (acknowledged late, rejected, unknown then executed, unknown then not executed) and proves no second instruction can be created while the first is open.")}</li>
</ol>

<h2>${mk("2e · Email OTP: the customer's approval of the order")}</h2>
<p>${mk("Today a customer's consent to an order is a message in a chat group that the system never sees. <b>Email OTP</b> is an optional feature, switched on per project, that makes that consent a recorded step of the deal: after the quote is prepared (and Finance has approved it where the thresholds require), the customer's registered approver receives one email with the order as quoted and a one-time code, pastes the code in that sender's registered chat group (each sender has its own group and its own approver address), and Operations enters it. The code is the acceptance. In the states of Figure 1 nothing new is needed: <i>Sent</i> is the quote awaiting the customer's code, <i>Accepted</i> is the code validated; the screens label them <i>pending customer approval</i> and <i>customer approved</i>, and the approval row carries its own stamps. Projects with the feature off follow today's flow unchanged. The design comes from the reviewer's change request CR-01 of October 2026 and is a priced change to the build scope.")}</p>
${otpChart}
<table><thead><tr><th style="width:20%">${mk("Question")}</th><th>${mk("Rule")}</th></tr></thead><tbody>
<tr><td>${mk("What the email carries")}</td><td>${mk("The quote issue as rendered (deal reference with the issue number, client, pair, amount in, the sender-facing rate at five decimals, fees, amount out, collection method, validity), a one-time code, its expiry in the project's time zone, and, where the collection destination exists at that point, a <b>partial destination</b>: the first and last four characters of the collection wallet, or the last four digits of the receiving account; nothing for cash collection, where the token at handover is the control. The instruction printed: paste the code in the registered chat group to approve; reply with 'reject' and the reason to reject; the full destination will follow in the registered group and must match the partial above; NPL never creates new groups.")}</td></tr>
<tr><td>${mk("What it never carries")}</td><td>${mk("A link or button that approves or rejects (mail scanners open links, and a link invites a swapped destination), the full wallet or bank account, or anything of the hidden field groups. The email is information and a code; the approval happens across two channels the customer already has, the registered inbox and the registered chat group. A cloned chat group cannot produce the email leg, cannot use a code (codes approve only the real issue, entered by Operations from the registered group) and cannot substitute a destination that survives the partial-identifier check.")}</td></tr>
<tr><td>${mk("The code")}</td><td>${mk("Eight or more characters from an unambiguous alphabet, generated at random, stored only as a hash, bound to the deal group, the quote issue and the approver address it was sent to, valid for the project's code window (default 24 hours), consumed on its first successful validation. Five failed attempts lock it; a locked, expired or voided code needs a new send. A code is never shown on any screen or report.")}</td></tr>
<tr><td>${mk("Step-up for large orders")}</td><td>${mk("At or above the project's step-up amount (default USD 50,000 equivalent), the customer's paste must carry the code and the order amount, and Operations enters both; a code alone does not validate.")}</td></tr>
<tr><td>${mk("One issue, one code")}</td><td>${mk("The code approves exactly one quote issue. Any change to the order after sending (amount, rate, fees, method, destination) and any resend is a new issue: a new email, a new code, the old code void. The emailed snapshot is stored with the deal, content-addressed like a bank slip. Exactly one email per issue.")}</td></tr>
<tr><td>${mk("The two clocks")}</td><td>${mk("The quote's validity decides the price; the code window decides how long the customer has. Inside validity the approval counts at the quoted price. After validity but inside the code window it counts only if the rate has moved less than the project's drift tolerance at that moment (grace_drift_pct, the existing rule); otherwise a new issue. After the code window the code is expired, the group is back at Quoted and Operations is alerted. The screens show a countdown on the work list and raise three alerts: a code nearing expiry, a rejection received, and a change to a sender's approver address or chat group pending Finance's approval.")}</td></tr>
<tr><td>${mk("Tripwire")}</td><td>${mk("If a code is issued and nothing from the registered chat group has been recorded against it within the tripwire window (default 4 hours), an alert tells Operations to verify with the customer through a known contact outside the chat. A validated code whose chat evidence cannot be produced from the registered group blocks collection and opens an exception.")}</td></tr>
<tr><td>${mk("Rejection")}</td><td>${mk("A reply to the email from the registered approver address, or a message in the registered chat group, is recorded as a rejection with its reason verbatim; the group leaves Sent (re-quoted as a new group, or voided). Nothing that arrives by email ever approves; a reply from any other address is recorded and ignored.")}</td></tr>
<tr><td>${mk("Evidence and audit")}</td><td>${mk("The approval record carries the stored email snapshot, the code reference, the validation time, the entering user and the chat screenshot; a rejection carries its reason. Every send, resend, delivery failure, bounce, reply, validation attempt, lock, void and tripwire is an event on the approval and an AUDIT_LOG row.")}</td></tr>
<tr><td>${mk("The settings, protected")}</td><td>${mk("The project holds the switch and the three windows; each sender holds exactly one approver email and one registered chat group (platform, group name, group id), because every sender has its own chat group with NPL. While the switch is on, a quote for a sender without an approved address and group cannot be sent, and the screen says why; there is no fallback. The three windows are THRESHOLD rows and follow the threshold rule: Finance proposes, Management approves. The switch and the sender's settings change through set_email_otp_settings: Operations enters, Finance approves, never the same person; a new approver address activates only after a verification code sent to it comes back through that sender's chat group; while a change is pending no approval email can be sent for that sender; a change of address voids that sender's open codes only, so a live code never moves; the sender row shows the current address, the audit log the history. Switching the feature off is the same controlled change; groups already pending complete or expire under the rules in force when sent (Roles &amp; Visibility rule 13; Configuration Schema rule 16).")}</td></tr>
</tbody></table>
<p>${mk("Operations sends the full deposit wallet or account only after the approval, in the registered chat group, and the customer's standing rule is to pay only if it matches the partial identifier in the email. The acceptance test is S-OTP (Test Strategy).")}</p>

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
${ACTIONS.map((a) => `<tr>${a.map((c, i) => `<td${i === 5 ? ' class="mono"' : ""}>${raw(c)}</td>`).join("")}</tr>`).join("")}
</tbody></table>
<p>Deals in flight when an emergency action is applied are handled by the three cases of the table in 2b.</p>
</section>

<h2>6 · Rejection handling, the same way everywhere</h2>
<ol>
<li><b>Nothing is deleted.</b> The request, the rejection and its reason stay on the APPROVAL record and in the audit log. A re-submission is a new approval request that points at the rejected one.</li>
<li><b>The record returns to the initiator's last safe state.</b> A rejected quote is not sent; a rejected settlement goes back to Prepared; a rejected reroute leaves the route unchanged; a rejected balance conversion leaves the balance in its currency; a rejected offset leaves every margin where it rests.</li>
<li><b>Money that already moved is never rolled back by a rejection.</b> A conversion the partner has booked stands; a variance exception is resolved by a decision and, if needed, a reversing ledger entry, not by editing the conversion. A loss that Management has approved stands as NPL's; only its shares are recovered.</li>
<li><b>A rejection reason is mandatory</b> and is visible to the initiator; derived-economics fields are stripped from the reason shown to Operations.</li>
<li><b>Frozen states need a decision, not time.</b> A breached rate version, an open variance exception, an open offset, custody in NPL's wallet, an unfunded make-good and a negative pool all stay on the daily exception list until a role with authority acts.${mk(" A leg on hold (2c) and an instruction with outcome unknown (2d) are on the same list and end the same way: by a recorded decision or reference, never by time.")}</li>
<li><b>Escalation never skips a level.</b> Management approves in addition to Finance; when only one Finance user is on shift, Management's countersignature stands in for the second Finance user.</li>
</ol>

<h2>6a · Concurrency rules</h2>
<p>Section 5 of the Architecture note already gives every money-moving action a unique key, so a retried request cannot post twice, and locks the record a person is editing. Three rules complete that protection.</p>
<table><thead><tr><th style="width:30%">Rule</th><th>What the system does</th></tr></thead><tbody>
<tr><td>1. An approval is valid only for the state the approver saw</td><td>An APPROVAL carries the record version it was requested on. If the record changed between request and approval (another user edited it, a job moved it, a second approval landed), the approval is refused and the approver is shown the current state; a fresh request is needed. Two approvers acting on the same request at once: the first commit wins, the second is refused.</td></tr>
<tr><td>2. Two runs of a job never overlap</td><td>Each background job of the Architecture note (Section 4) takes a lock row before it runs and releases it at the end; a run that finds the lock held exits at once and is recorded as skipped. After a restart the job catches up from where the last run finished, so nothing is processed twice.</td></tr>
<tr><td>3. A record lock expires</td><td>RECORD_LOCK is released on save or cancel; it expires after a fixed idle time (THRESHOLD kind lock_idle_minutes, default 15) so a closed laptop does not block a record for the day; Management can clear a lock; the lock, its release, its expiry and any clearance are written to AUDIT_LOG. The lock row carries lock_expires_at (ERD Appendix B.5).</td></tr>
</tbody></table>
<p>These rules are built in Phase 1 (M3 to M5) and tested with the concurrency, duplicate-submission and outage cases of the go-live acceptance tests (Cutover Approach, exit criteria 9 to 13).</p>

<h2>7 · State tables by entity</h2>
<table><thead><tr><th style="width:22%">Entity</th><th>States and transitions</th><th style="width:34%">Notes</th></tr></thead><tbody>
${STATES.map((s) => `<tr><td class="mono">${raw(s[0])}</td><td>${raw(s[1])}</td><td>${raw(s[2])}</td></tr>`).join("")}
</tbody></table>

<h2>7a · The point of no return, and what can still be done after it</h2>
<p>Rule 3 of Section 6 says that money which has moved is never rolled back. The table names the moment in each stage after which that holds, and the only recovery actions that remain. The same points are marked on Figures 1 to 4.</p>
<table><thead><tr><th style="width:14%">Stage</th><th style="width:24%">Point of no return</th><th style="width:26%">Before it</th><th>After it, the only recovery actions</th></tr></thead><tbody>
<tr><td>Collection</td><td>The sender's money lands on the endpoint (hash confirmed, slip received, cash counted)</td><td>Void before money moved: no posting, instructions withdrawn (Operations, Finance)</td><td>Post-money void with a disposition: refund to the sender's return receiver, sender credit, or hold (Management); a loss event if the money is lost after verification</td></tr>
<tr><td>Conversion</td><td>The partner books the conversion</td><td>Conversion instruction withdrawn; deal stays Collected</td><td>The booked figure stands; a variance beyond tolerance is a Finance decision and, if needed, a reversing entry; a reroute after conversion (Section 2b) moves the balance, never the booking</td></tr>
<tr><td>Settlement</td><td>The partner releases the payout (execution)</td><td>Rejected back to Prepared; lines changed and re-submitted</td><td>Nothing is cancelled: the line ends confirmed, short or returned; a return funds a return leg or stays in balance; a duplicate instruction is refused by its idempotency key</td></tr>
<tr><td>${mk("External instruction (any)")}</td><td>${mk("The partner acknowledges the instruction (2d); the money moves at execution")}</td><td>${mk("Withdraw the instruction (Operations, Finance); a second instruction for the same promise is refused while the first is open")}</td><td>${mk("Nothing is re-instructed until the partner reports rejected or not executed, with its reference; outcome unknown waits on the partner's statement; a Management exception needs the partner's written confirmation and the reconciliation")}</td></tr>
<tr><td>Own-wallet transfer</td><td>NPL's signers broadcast the transaction</td><td>Management rejects; funds stay in custody</td><td>The transfer is final on chain; a wrong destination is a loss event; the hop or forward is recorded when the far side credits</td></tr>
</tbody></table>

<h2>8 · Aging and the daily exception list</h2>
<p>These things age and are reported daily with deal, reason and hours since the event: ${mk("a quote awaiting the customer's code (Email OTP), with the hours left in its code window and whether the tripwire has passed; ")}client money in NPL's own wallet (custody — reroutes, bridge collections awaiting their hop, own-desk balances), open offsets across receiver groups, open shortfalls, open variance exceptions, a pool below zero awaiting the next conversion (invariant 41), an unfunded make-good (MAKEGOOD / LOSS_PAYABLE), loss recoveries agreed and not received, and settlement lines sent beyond the rail's expected time${mk(", legs on hold (partner or screening) with the hold's age and source, and external instructions whose outcome is unknown")}. Breached rate versions, frozen partner × pairs and quotes past their validity appear on the same list. Time limits for each are project configuration (THRESHOLD, OWN_WALLET.custody_max_hours) and are not fixed by this document.</p>
<h2>8a · Next action and time limits</h2>
<p>NPL's decision (19 October): pending items belong to the role, not to a named person. Two things are therefore required of every pending item, and one time limit per stage.</p>
<table><thead><tr><th style="width:22%">Requirement</th><th>What every pending item shows or does</th></tr></thead><tbody>
<tr><td>Visible to the whole role</td><td>Every pending approval, collection, conversion, settlement or exception is on the list of every user in the role that must act, whoever started it; the initiator's absence changes nothing.</td></tr>
<tr><td>Self-explanatory</td><td>Each item shows its state, why it is pending, the last action with its time and user, the next action required, the role that must act, how long it has been pending, and the cutoff it is running against (the per-role lists gain a next-action column in Phase 1).</td></tr>
<tr><td>Time limit per stage</td><td>THRESHOLD kind approval_time_limit, one row per stage, in minutes, with an escalation role (Configuration Schema). When the limit passes, the item appears on the escalation role's list as overdue and raises an alert (Phase 3, M8). NPL maintains the values: Finance proposes, Management approves. A cutoff warning is raised a configurable number of minutes before a partner's cutoff for any item still pending against it.</td></tr>
</tbody></table>
<h3>Default time limits (illustrative, from the design review)</h3>
<table><thead><tr><th style="width:26%">Stage</th><th style="width:18%">Role that acts</th><th style="width:28%">Default limit</th><th>Escalates to</th></tr></thead><tbody>
<tr><td>${mk("Customer approval (Email OTP)")}</td><td>${mk("Operations")}</td><td>${mk("the tripwire window from the send (default 4 hours): verify with the customer outside the chat; the code window (default 24 hours) ends the item")}</td><td>${mk("Finance")}</td></tr>
<tr><td>Collection verification</td><td>Operations</td><td>15 minutes from the partner's confirmation</td><td>Finance</td></tr>
<tr><td>Partner rate confirmation</td><td>Finance</td><td>15 minutes from the rate being entered</td><td>Management</td></tr>
<tr><td>Conversion approval</td><td>Finance</td><td>15 minutes from the request</td><td>Management, at once if the cutoff is within 30 minutes</td></tr>
<tr><td>Settlement approval</td><td>Finance</td><td>30 minutes from the request</td><td>Management</td></tr>
<tr><td>Partner execution confirmation</td><td>Operations</td><td>the rail's expected time (Section 8)</td><td>Finance; the partner is chased</td></tr>
<tr><td>${mk("External instruction, outcome unknown")}</td><td>${mk("Operations, then Finance")}</td><td>${mk("the partner reference inquiry is raised the same day the acknowledgement time-out passes; Finance obtains the partner's statement")}</td><td>${mk("Management, if the partner has not answered by its next statement or within two business days, whichever comes first (2d)")}</td></tr>
<tr><td>End-of-day reconciliation</td><td>Finance</td><td>before the day is closed</td><td>Management, if a discrepancy stays open</td></tr>
<tr><td>Cutoff warning</td><td>the role holding the item</td><td>60 minutes before the partner's cutoff; a second warning at 30</td><td>Management at the second warning</td></tr>
</tbody></table>
<p>These are the values proposed in the review; NPL sets the real ones per project before the parallel run. Where the delay affects a client (a missed cutoff, a reroute, a changed settlement date), the Operating Procedures say when and how the client is told.</p>
<p class="small"><i>Draft v${V} — for review with NPL. State names are the proposal for the state columns the ERD leaves as free text; once agreed they become the enumerations of those columns.</i></p>
</body></html>`;

const base = REVIEW ? "NPLify-Lifecycle-and-Approvals-review" : `NPLify-Lifecycle-and-Approvals-v${V}`;
const h = path.join(outDir, base + ".html"), p = path.join(outDir, base + ".pdf");
fs.writeFileSync(h, clientFacing(html));
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "actions:", ACTIONS.length, "state rows:", STATES.length);
