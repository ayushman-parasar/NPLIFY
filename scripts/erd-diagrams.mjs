// ERD diagram renderer: lane layout, key-only boxes, orthogonal edges, stub pills and bundles.
// Used by build-erd-doc.mjs (and demo-diagrams.mjs). Pure functions over the model data.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// One line in plain English under each entity name.
export const ROLE = {
  PROJECT: "the client and its settings",
  PARTNER: "a conversion partner (global)",
  RATE_SOURCE: "where market rates come from",
  INTRODUCER: "who referred the client; earns commission",
  SENDER: "who pays money in",
  RECEIVER_GROUP: "a pot of entitlement; one default per project",
  RECEIVER: "who gets paid: counterparty, sender_return or partner_transit",
  OWN_WALLET: "NPL’s own wallet (reroutes, pass-through)",
  THRESHOLD: "a limit that triggers an approval",
  CURRENCY_PAIR: "a from → to currency pair",
  PARTNER_CONFIG: "how one partner is used in this project",
  COLLECTION_SENDING_ENTITY: "the account a sender pays from (provenance only)",
  SENDER_RECEIVER_ALLOW: "who a sender is allowed to pay",
  RECEIVING_ENTITY: "the legal entity behind a receiver",
  PAIR_RATE_SOURCE: "which rate source serves a pair",
  PARTNER_PAIR: "a pair the partner handles, with its pricing",
  SETTLEMENT_SENDING_ENTITY: "the sender name shown on an outgoing transfer",
  SETTLEMENT_RAIL: "the bank / EMI that executes a payout",
  FEE_OVERRIDE: "a sender-specific fee on one pair",
  RECEIVING_ENTITY_ACCOUNT: "one bank account or wallet of a receiving entity",
  SETTLEMENT_REGISTRATION: "a destination account approved by the partner",
  FEE_STRUCTURE: "NPL’s fee for a partner × pair",
  REFERRAL_RULE: "commission terms for an introducer",
  PARTNER_REBATE_RULE: "rebate a partner pays NPL",
  PARTNER_ENTITY: "the partner’s legal vehicle (name on paperwork)",
  COLLECTION_RECEIVING_ENDPOINT: "the partner account or wallet money arrives in",
  MARKET_RATE: "a market-rate snapshot",
  RATE_COMPARISON: "the day’s partner-vs-market comparison",
  PARTNER_RATE_VERSION: "one rate a partner gave on a day",
  DEAL_GROUP: "the client’s order: what was asked for",
  DEAL: "one leg of the order: one partner, one pair, one conversion",
  COLLECTION: "money arriving for a forward leg, in parts",
  CONVERSION: "the currency exchange; NPL’s margin is taken here",
  REROUTE: "plan B when funds are stuck at a partner",
  SENDER_CREDIT: "an overpayment NPL owes back to a sender",
  EARNINGS_RECEIVABLE: "NPL’s margin still resting at a partner",
  BALANCE_CONVERSION: "exchange of a held balance, without a deal",
  ENTITLEMENT_REATTRIBUTION: "whose entitlement a balance conversion moved",
  DISBURSEMENT: "one payment run out of one partner’s holding",
  DISBURSEMENT_LINE: "one payment slip: who, how much, which account",
  DISBURSEMENT_RETURN: "a payment the bank bounced back",
  CONFIRMATION: "the receiver confirms a slip, in full or short",
  SHORTFALL: "the missing amount after a short confirmation",
  BANK_FEE_EVENT: "expected vs actual bank fee on a run",
  FEE_DECISION: "a one-off approved markup, waiver or override",
  REFERRAL_ACCRUAL: "commission earned by an introducer on one deal",
  PARTNER_REBATE_ACCRUAL: "rebate expected from a partner on one deal",
  LEDGER_TRANSACTION: "one balanced money move, caused by one event",
  LEDGER_POSTING: "one debit or credit line of a transaction",
  LEDGER_ACCOUNT: "a jar of money: OWNER.HOLDER.CCY.PURPOSE",
  USER: "a staff member and their role",
  APPROVAL: "a request approved by a different person",
  AUDIT_LOG: "who changed which field, when",
  RECORD_LOCK: "someone is editing this record",
};

// Fields shown inside a box besides keys: the ones that decide what a row is.
const DISC = new Set(["kind", "account_kind", "leg_type", "funding_source", "state", "status", "outcome", "action", "side", "purpose",
  "ownership", "subject_type", "source_type", "record_type", "entry_mode", "amount_mode", "phase", "trigger", "treatment", "result",
  "role", "mode", "rate_basis", "decision", "forwarding_policy", "disclosure_style", "calc_mode", "fee_kind", "leg_no", "holder_type",
  "collection_method", "disburse_policy", "network_fee_policy", "rail", "network", "currency"]);
const ACTORS = new Set(["approved_by", "requested_by", "verified_by", "confirmed_by", "posted_by", "prepared_by", "escalated_to", "locked_by", "actor_id"]);

export const COLOR = { config: "#2f5d9e", rates: "#0f7c74", deal: "#b7651a", settle: "#7a3fa0", ledger: "#2f7d3c", view: "#6b7280" };

// Geometry (SVG user units; the page scales the whole drawing)
const W = 158, WS = 132, G = 112, GPAD = 16, HEAD = 13, ROLE_H = 15, ROW = 8.4, FOOT = 8.5, PAD = 3, PILL_H = 16, VGAP = 26, SGAP = 7, LANE_HEAD = 30, PSTEP = 15, LH = 6.6, MM_PER_UNIT = 0.34;

// ------------------------------------------------------------------ diagram definitions
// lane.nodes: "NAME" (full box) · {stub:"NAME", for:["TARGET",...]} (grey pill, linked only to those)
//             · {bundle:"title", into:"NAME", of:["A","B"], edge:"label"} (one panel, one edge)
export const DIAGRAMS = [
  { id: "3a", title: "Deal lifecycle — the order, its legs, the money in and the exchange",
    reading: "Read left to right: the parties and prices agreed → the client’s order and the legs that carry it out → the money arriving for a leg and the exchange that converts it. Ledger postings are in Diagram 4.",
    lanes: [
      { title: "Who and what was agreed", nodes: [
        { stub: "PROJECT", for: ["DEAL_GROUP"] },
        { stub: "SENDER", for: ["DEAL_GROUP"] },
        { stub: "RECEIVER_GROUP", for: ["DEAL_GROUP"] },
        { stub: "FEE_STRUCTURE", for: ["DEAL_GROUP"] },
        { bundle: "copied from the order onto each leg", into: "DEAL", of: ["PROJECT", "SENDER", "RECEIVER_GROUP"], edge: "client, sender, entitled group" },
        { bundle: "frozen copies stapled to the leg at quote", into: "DEAL", of: ["PARTNER_PAIR", "PARTNER_ENTITY", "FEE_STRUCTURE", "MARKET_RATE", "PARTNER_RATE_VERSION"], edge: "stamped at quote, one each" },
        { stub: "RECEIVER", for: ["DEAL"] },
        { stub: "DISBURSEMENT_RETURN", for: ["DEAL"] } ] },
      { title: "The order and its legs", nodes: ["DEAL_GROUP", "DEAL"] },
      { title: "Money in and the exchange", nodes: ["COLLECTION", "CONVERSION"] },
      { title: "What they refer to", nodes: [
        { stub: "COLLECTION_RECEIVING_ENDPOINT", for: ["COLLECTION"] },
        { stub: "COLLECTION_SENDING_ENTITY", for: ["COLLECTION"] },
        { stub: "PARTNER_RATE_VERSION", for: ["CONVERSION"] },
        { stub: "BALANCE_CONVERSION", for: ["CONVERSION"] } ] } ] },
  { id: "3b", title: "Deal lifecycle — reroute, balance conversion and side records",
    reading: "Two independent corners of the deal domain. Left: records that hang off a leg — plan B when funds are stuck (reroute), an overpayment owed back, NPL’s margin resting at a partner. Right: a balance conversion exchanges money already held, with no order behind it; it owns its own conversion and records whose entitlement it moved.",
    lanes: [
      { title: "What they refer to", nodes: [
        { stub: "DEAL", for: ["REROUTE", "SENDER_CREDIT", "EARNINGS_RECEIVABLE"] },
        { stub: "OWN_WALLET", for: ["REROUTE"] },
        { stub: "PARTNER_CONFIG", for: ["REROUTE", "EARNINGS_RECEIVABLE"] },
        { stub: "SENDER", for: ["SENDER_CREDIT"] } ] },
      { title: "Records hanging off a leg", nodes: ["REROUTE", "SENDER_CREDIT", "EARNINGS_RECEIVABLE"] },
      { title: "Exchange without an order", nodes: ["BALANCE_CONVERSION", "ENTITLEMENT_REATTRIBUTION"] },
      { title: "What a balance conversion refers to", nodes: [
        { stub: "PROJECT", for: ["BALANCE_CONVERSION"] },
        { stub: "PARTNER_CONFIG", for: ["BALANCE_CONVERSION"] },
        { stub: "RECEIVER_GROUP", for: ["BALANCE_CONVERSION", "ENTITLEMENT_REATTRIBUTION"] },
        { bundle: "same rate machinery as a leg", into: "BALANCE_CONVERSION", of: ["PARTNER_PAIR", "PARTNER_RATE_VERSION", "MARKET_RATE"], edge: "rate used, one each" },
        { stub: "CONVERSION", for: ["BALANCE_CONVERSION"] },
        { stub: "FEE_DECISION", for: ["BALANCE_CONVERSION"] } ] } ] },
  { id: "3c", title: "Settlement — the payment run, its slips, and what happens to each slip",
    reading: "Read left to right: what a payment run is made of → the run and its slips → what happens to a slip afterwards: confirmed in full or short, or bounced by the bank. A bounced slip feeds a return leg back in Diagram 3a.",
    lanes: [
      { title: "What a payment run uses", nodes: [
        { stub: "PROJECT", for: ["DISBURSEMENT"] },
        { stub: "PARTNER_CONFIG", for: ["DISBURSEMENT"] },
        { stub: "SETTLEMENT_SENDING_ENTITY", for: ["DISBURSEMENT"] },
        { stub: "SETTLEMENT_RAIL", for: ["DISBURSEMENT"] },
        { stub: "DEAL", for: ["DISBURSEMENT_LINE"] },
        { stub: "RECEIVER", for: ["DISBURSEMENT_LINE"] },
        { stub: "SETTLEMENT_REGISTRATION", for: ["DISBURSEMENT_LINE"] } ] },
      { title: "The payment run and its slips", nodes: ["DISBURSEMENT", "DISBURSEMENT_LINE"] },
      { title: "What happens to a slip afterwards", nodes: ["BANK_FEE_EVENT", "CONFIRMATION", "SHORTFALL", "DISBURSEMENT_RETURN"] },
      { title: "What they refer to", nodes: [
        { stub: "RECEIVER", for: ["SHORTFALL"] },
        { stub: "DEAL", for: ["DISBURSEMENT_RETURN"] } ] } ] },
  { id: "3d", title: "Settlement — fee decisions, referrals and rebates",
    reading: "Three small records that hang off deals: a one-off approved fee decision (on a return leg, a balance conversion or a payment run), the referral commission an introducer earns on a deal, and the rebate a partner owes NPL on a deal.",
    lanes: [
      { title: "What they refer to", nodes: [
        { stub: "DEAL", for: ["FEE_DECISION", "REFERRAL_ACCRUAL", "PARTNER_REBATE_ACCRUAL"] },
        { stub: "BALANCE_CONVERSION", for: ["FEE_DECISION"] },
        { stub: "DISBURSEMENT", for: ["FEE_DECISION"] },
        { stub: "REFERRAL_RULE", for: ["REFERRAL_ACCRUAL"] },
        { stub: "PARTNER_REBATE_RULE", for: ["PARTNER_REBATE_ACCRUAL"] } ] },
      { title: "Fee decisions and accruals", nodes: ["FEE_DECISION", "REFERRAL_ACCRUAL", "PARTNER_REBATE_ACCRUAL"] } ] },
];

// Shorter wording for the diagram; the map and the knowledge base keep the full labels.
const SHORT = {
  "DEAL>DISBURSEMENT_LINE": "leg settled by this slip (D17)",
  "DISBURSEMENT_RETURN>DEAL": "funds a return leg",
  "DEAL>DEAL": "leg n−1 funds leg n (prior_leg)",
  "DEAL>FEE_DECISION": "markup on a return leg",
  "DISBURSEMENT>FEE_DECISION": "network / bank fee override",
  "DISBURSEMENT>BANK_FEE_EVENT|applied_disbursement_id": "fee true-up applied to",
  "DISBURSEMENT>BANK_FEE_EVENT|disbursement_id": "bank fee of this run",
  "DISBURSEMENT_LINE>DISBURSEMENT_RETURN": "bounced by the bank",
  "DISBURSEMENT>DISBURSEMENT_LINE": "one or many slips",
  "DEAL>COLLECTION": "money in, 1..n parts (forward legs only)",
  "DEAL>CONVERSION": "converts (one owner)",
  "BALANCE_CONVERSION>CONVERSION": "converts (one owner)",
  "RECEIVER>DEAL": "receiver, once known",
  "COLLECTION_RECEIVING_ENDPOINT>COLLECTION": "paid into (null for cash)",
  "DEAL>EARNINGS_RECEIVABLE|recovered_by_deal_id": "leg that recovered it (recover dues)",
  "DEAL>EARNINGS_RECEIVABLE|deal_id": "leg that created it",
  "DEAL>SENDER_CREDIT": "overpayment on this leg",
  "SENDER>SENDER_CREDIT": "sender who is owed it",
  "DEAL>REROUTE": "plan B for this leg",
  "OWN_WALLET>REROUTE": "custody wallet",
  "PARTNER_CONFIG>EARNINGS_RECEIVABLE": "partner holding the margin",
  "PARTNER_CONFIG>BALANCE_CONVERSION": "partner holding the balance",
  "COLLECTION_SENDING_ENTITY>COLLECTION": "paid from (provenance)",
  "COLLECTION_RECEIVING_ENDPOINT>COLLECTION": "endpoint paid into (null for cash)",
  "PARTNER_CONFIG>DISBURSEMENT": "partner whose holding is drained",
  "SETTLEMENT_SENDING_ENTITY>DISBURSEMENT": "sender name shown",
  "SETTLEMENT_RAIL>DISBURSEMENT": "bank that executes it",
  "DISBURSEMENT>SHORTFALL": "later run that tops it up",
  "DISBURSEMENT>BANK_FEE_EVENT|applied_disbursement_id": "run the true-up is applied to",
  "DISBURSEMENT_LINE>CONFIRMATION": "confirmed by the receiver",
  "CONFIRMATION>SHORTFALL": "opened when short",
  "RECEIVER>SHORTFALL": "receiver who is short",
  "DEAL>REFERRAL_ACCRUAL": "deal it accrued on",
  "DEAL>PARTNER_REBATE_ACCRUAL": "deal it accrued on",
  "REFERRAL_RULE>REFERRAL_ACCRUAL": "rule it accrues under",
  "PARTNER_REBATE_RULE>PARTNER_REBATE_ACCRUAL": "rule it accrues under",
  "DISBURSEMENT_RETURN>DEAL|funding_ref_id": "funds a return leg",
};

export function homeOf(diagrams = DIAGRAMS) {
  const h = {};
  for (const dg of diagrams) for (const lane of dg.lanes) for (const n of lane.nodes) if (typeof n === "string") h[n] = dg.id;
  return h;
}

const wrap = (s, max) => {
  const out = []; let line = "";
  for (const w of String(s).split(/\s+/)) {
    if ((line + " " + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
};
const tw = (s, px) => s.length * px * 0.52; // rough text width for Helvetica

function boxRows(e, all = false) {
  const keyRows = all ? e.f : e.f.filter((f) => f[2] === "PK" || f[2] === "FK" || DISC.has(f[0]) || /_ref_id$/.test(f[0]));
  const actors = keyRows.filter((f) => ACTORS.has(f[0]));
  const rows = keyRows.filter((f) => !ACTORS.has(f[0])).map((f) => ({ ty: f[1], name: f[0], key: f[2] || "" }));
  if (actors.length) rows.push({ ty: "", name: actors.map((f) => f[0].replace(/_(by|to|id)$/, "")).join(" / "), key: "→ USER", actor: true });
  const hidden = e.f.length - keyRows.length;
  return { rows, hidden };
}

// ------------------------------------------------------------------ layout
export function diagramSvg(dg, D, opts = {}) {
  const HOME = opts.homeOf || homeOf();
  const lanes = dg.lanes.map((lane, li) => ({ title: lane.title, li, items: [] }));
  const full = {}, stubs = [], bundles = [];
  dg.lanes.forEach((lane, li) => {
    for (const spec of lane.nodes) {
      let it;
      if (typeof spec === "string") {
        const e = D.E[spec]; if (!e) throw new Error("unknown entity " + spec);
        const { rows, hidden } = boxRows(e, dg.fields === "all");
        const roleLines = wrap(ROLE[spec] || e.desc.split(/[.;]/)[0], 44).slice(0, 2);
        it = { kind: "full", name: spec, e, rows, hidden, roleLines, w: W, h: HEAD + ROLE_H + rows.length * ROW + (hidden ? FOOT : 2) + PAD, li };
        full[spec] = it;
      } else if (spec.stub) {
        if (!D.E[spec.stub]) throw new Error("unknown stub " + spec.stub);
        it = { kind: "stub", name: spec.stub, for: spec.for, w: WS, h: PILL_H, li, id: stubs.length };
        stubs.push(it);
      } else {
        it = { kind: "bundle", name: spec.bundle, into: spec.into, of: spec.of, edge: spec.edge || "references, one each", w: WS, h: 13 + spec.of.length * (PILL_H + 1) + 4, li, id: bundles.length };
        bundles.push(it);
      }
      lanes[li].items.push(it);
    }
  });
  // lane widths and x
  let x = 0;
  for (const l of lanes) { l.w = Math.max(...l.items.map((it) => it.w)); l.x = x; x += l.w + G; for (const it of l.items) it.x = l.x + (l.w - it.w) / 2; }
  const stackLane = (l) => { let y = 0; for (const it of l.items) { it.y = y; y += it.h + (it.kind === "full" ? VGAP : SGAP); } return y - (l.items.length ? (l.items[l.items.length - 1].kind === "full" ? VGAP : SGAP) : 0); };
  const laneH = lanes.map(stackLane);
  const maxH = Math.max(...laneH);
  lanes.forEach((l, i) => { const off = (maxH - laneH[i]) / 2; for (const it of l.items) it.y += off; });

  // ---- edges from the model
  const skip = new Set(["actor", "view"]);
  const edges = [];
  const covered = (A, B) => bundles.some((b) => b.into === B && b.of.includes(A));
  const notShown = [];
  const lbl = (r) => SHORT[`${r[0]}>${r[1]}|${r[3]}`] || SHORT[`${r[0]}>${r[1]}`] || r[4];
  for (const r of D.R) {
    if (skip.has(r[2])) continue;
    const [A, B] = r;
    if (full[A] && full[B]) { edges.push({ a: full[A], b: full[B], r, text: lbl(r) }); continue; }
    if (full[B] && !full[A]) {
      if (covered(A, B)) continue;
      const c = stubs.find((s) => s.name === A && (!s.for || s.for.includes(B)));
      if (c) edges.push({ a: c, b: full[B], r, text: lbl(r) }); else notShown.push(`${A} → ${B} (${r[4]})`);
      continue;
    }
    if (full[A] && !full[B]) {
      const c = stubs.find((s) => s.name === B && (!s.for || s.for.includes(A)));
      if (c) edges.push({ a: full[A], b: c, r, text: lbl(r) }); else notShown.push(`${A} → ${B} (${r[4]})`);
    }
  }
  for (const b of bundles) edges.push({ a: b, b: full[b.into], r: [b.name, b.into, "refs", "", b.edge, "1 : n"], text: b.edge });
  if (opts.report) opts.report(dg.id, notShown);

  // pull references next to what they feed: stub-only lanes re-sort freely; mixed lanes keep the
  // curated order and let stubs float as far as that order allows
  const want = (it) => {
    const ys = edges.filter((e) => (e.a === it || e.b === it) && other(e, it).li !== it.li).map((e) => { const o = other(e, it); return o.y + o.h / 2; });
    return ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length - it.h / 2 : it.y;
  };
  const other = (e, n) => (e.a === n ? e.b : e.a);
  for (const l of lanes) {
    const mixed = l.items.some((it) => it.kind === "full");
    const items = mixed ? l.items.slice() : l.items.slice().sort((p, q) => want(p) - want(q));
    let prevBottom = -Infinity;
    for (const it of items) {
      const target = it.kind === "full" ? it.y : want(it);
      const gap = it.kind === "full" || (prevBottom > -Infinity && items[items.indexOf(it) - 1].kind === "full") ? VGAP : SGAP;
      it.y = Math.max(target, prevBottom + gap); prevBottom = it.y + it.h;
    }
    if (!mixed) { const over = prevBottom - maxH; if (over > 0) { const shift = Math.min(over, Math.max(0, items[0].y)); for (const it of items) it.y -= shift; } }
    l.items = items;
  }
  const all = [...Object.values(full), ...stubs, ...bundles];
  const top = Math.min(0, ...all.map((n) => n.y)), bottom = Math.max(...all.map((n) => n.y + n.h));

  // ---- routing: ports
  const ports = new Map();
  const side = (n) => ports.get(n) || ports.set(n, { left: [], right: [], top: [], bottom: [] }).get(n);
  const idxIn = (n) => lanes[n.li].items.indexOf(n);
  for (const e of edges) {
    const { a, b } = e;
    if (a === b) { e.type = "self"; continue; }
    if (a.li === b.li) {
      const ia = idxIn(a), ib = idxIn(b);
      if (Math.abs(ia - ib) === 1) { e.type = "vert"; side(a)[ia < ib ? "bottom" : "top"].push(e); side(b)[ia < ib ? "top" : "bottom"].push(e); }
      else { e.type = "bulge"; side(a).right.push(e); side(b).right.push(e); }
    } else if (a.li < b.li) { e.type = "fwd"; side(a).right.push(e); side(b).left.push(e); }
    else { e.type = "back"; side(a).left.push(e); side(b).right.push(e); }
  }
  const key = (e, n, s = "") => e.r.join("|") + "#" + (e.a === n ? "a" : "b") + n.name + (n.id ?? "") + s;
  const portPos = new Map();
  for (const [n, p] of ports) {
    for (const s of ["left", "right"]) {
      const list = p[s].slice().sort((e1, e2) => (other(e1, n).y + other(e1, n).h / 2) - (other(e2, n).y + other(e2, n).h / 2));
      const k = list.length; if (!k) continue;
      const y0 = n.y + (n.kind === "full" ? HEAD + ROLE_H - 2 : 4), y1 = n.y + n.h - 4;
      const step = k === 1 ? 0 : Math.min(PSTEP, (y1 - y0) / (k - 1));
      const start = k === 1 ? n.y + n.h / 2 : (y0 + y1) / 2 - step * (k - 1) / 2;
      list.forEach((e, i) => portPos.set(key(e, n), start + i * step));
    }
    for (const s of ["top", "bottom"]) {
      const k = p[s].length; if (!k) continue;
      p[s].forEach((e, i) => portPos.set(key(e, n, s), n.x + n.w / 2 + (i - (k - 1) / 2) * 16));
    }
  }
  const pp = (e, n, s = "") => portPos.get(key(e, n, s));
  // channels: one x per edge in each gutter, ordered by where the edge ends
  const gutterOf = (e) => e.type === "bulge" ? e.a.li : Math.min(e.a.li, e.b.li);
  const byGutter = {};
  for (const e of edges) if (["fwd", "back", "bulge"].includes(e.type)) (byGutter[gutterOf(e)] ||= []).push(e);
  for (const [g, list] of Object.entries(byGutter)) {
    list.sort((e1, e2) => (pp(e1, e1.b) - pp(e2, e2.b)) || (pp(e1, e1.a) - pp(e2, e2.a)));
    const gx = lanes[+g].x + lanes[+g].w;
    const usable = G - 2 * GPAD, step = list.length === 1 ? 0 : Math.min(11, usable / (list.length - 1));
    const start = gx + G / 2 - step * (list.length - 1) / 2;
    list.forEach((e, i) => { e.cx = start + i * step; e.gx0 = gx + 2; e.gx1 = gx + G - 2; });
  }

  // ---- drawing
  const parts = [], labelParts = [];
  const placed = []; // label rectangles already on the page
  const overlapArea = (r, q) => Math.max(0, Math.min(r.x1, q.x1) - Math.max(r.x0, q.x0)) * Math.max(0, Math.min(r.y1, q.y1) - Math.max(r.y0, q.y0));
  const style = (kind) => kind === "owns" ? { color: "#1f3f73", sw: 1.3, dash: "", mk: "arro" } : kind === "poly" ? { color: "#b23a6e", sw: 0.9, dash: ' stroke-dasharray="3 2"', mk: "arrp" } : { color: "#666", sw: 0.8, dash: "", mk: "arr" };
  const cardOf = (c) => { const m = (c || "").split(":").map((s) => s.trim()); return [m[0] || "", m[1] || ""]; };
  const drawLabel = (lines, x0, yTop) => {
    const wmax = Math.max(...lines.map((l) => tw(l, 6.2))) + 5, h = lines.length * LH + 2.5;
    labelParts.push(`<rect x="${x0.toFixed(1)}" y="${yTop.toFixed(1)}" width="${wmax.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="#fff" fill-opacity="0.94"/>`);
    lines.forEach((l, i) => labelParts.push(`<text x="${(x0 + wmax / 2).toFixed(1)}" y="${(yTop + 6.4 + i * LH).toFixed(1)}" text-anchor="middle" class="lbl">${esc(l)}</text>`));
    placed.push({ x0, y0: yTop, x1: x0 + wmax, y1: yTop + h });
  };
  // a label for a horizontal segment: centred on the segment, kept inside the gutter, nudged off other labels
  const labelOn = (text, segX0, segX1, lineY, gx0, gx1) => {
    const lines = wrap(text, 24).slice(0, 3);
    const wmax = Math.max(...lines.map((l) => tw(l, 6.2))) + 5, h = lines.length * LH + 2.5;
    let x0 = (segX0 + segX1) / 2 - wmax / 2;
    x0 = Math.max(gx0, Math.min(x0, gx1 - wmax));
    const cands = [lineY - h - 1, lineY + 3.5, lineY - h - 9, lineY + 11.5];
    let best = null;
    for (const yTop of cands) {
      const r = { x0, y0: yTop, x1: x0 + wmax, y1: yTop + h };
      const ov = placed.reduce((s, q) => s + overlapArea(r, q), 0);
      if (!best || ov < best.ov) best = { yTop, ov };
      if (ov === 0) break;
    }
    drawLabel(lines, x0, best.yTop);
  };
  const card = (x, y, t, anchor = "middle") => t && labelParts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" class="card">${esc(t)}</text>`);

  for (const e of edges) {
    const { a, b, r } = e;
    const st = style(r[2]);
    const [sc, tc] = cardOf(r[5]);
    if (e.type === "self") {
      const cx = a.x + a.w / 2, y = a.y + a.h, x1 = cx + 28, x2 = cx + 52;
      parts.push(`<path d="M${x1},${y} L${x1},${y + 14} L${x2},${y + 14} L${x2},${y}" fill="none" stroke="${st.color}" stroke-width="${st.sw}" marker-end="url(#${st.mk})"/>`);
      const lines = wrap(e.text, 30).slice(0, 2);
      drawLabel(lines, x2 + 5, y + 14 - LH);
      card(x1 - 3, y + 7, sc, "end"); card(x2 + 3, y + 7, tc, "start");
      continue;
    }
    if (e.type === "vert") {
      const down = a.y < b.y;
      const xa = pp(e, a, down ? "bottom" : "top"), xb = pp(e, b, down ? "top" : "bottom");
      const ya = down ? a.y + a.h : a.y, yb = down ? b.y : b.y + b.h, ym = (ya + yb) / 2;
      parts.push(`<path d="M${xa},${ya} L${xa},${ym} L${xb},${ym} L${xb},${yb}" fill="none" stroke="${st.color}" stroke-width="${st.sw}"${st.dash} marker-end="url(#${st.mk})"/>`);
      const lines = wrap(e.text, 34).slice(0, 2);
      drawLabel(lines, Math.max(xa, xb) + 5, ym - (lines.length * LH + 2.5) / 2);
      card(Math.min(xa, xb) - 3, ya + (down ? 7 : -3), sc, "end"); card(Math.min(xa, xb) - 3, yb + (down ? -2.5 : 8), tc, "end");
      continue;
    }
    let p1, p2;
    if (e.type === "fwd") { p1 = [a.x + a.w, pp(e, a)]; p2 = [b.x, pp(e, b)]; }
    else if (e.type === "back") { p1 = [a.x, pp(e, a)]; p2 = [b.x + b.w, pp(e, b)]; }
    else { p1 = [a.x + a.w, pp(e, a)]; p2 = [b.x + b.w, pp(e, b)]; }
    const cx = e.cx;
    parts.push(`<path d="M${p1[0]},${p1[1]} L${cx},${p1[1]} L${cx},${p2[1]} L${p2[0]},${p2[1]}" fill="none" stroke="${st.color}" stroke-width="${st.sw}"${st.dash} marker-end="url(#${st.mk})"/>`);
    // label beside the box that stores the key (target side), kept inside the gutter
    const d1 = Math.sign(cx - p1[0]) || 1, d2 = Math.sign(p2[0] - cx) || 1;
    const lo = Math.min(p1[0], p2[0]), hi = Math.max(p1[0], p2[0]);
    labelOn(e.text, cx, p2[0], p2[1], Math.max(e.gx0, lo + 12), Math.min(e.gx1, hi - 22));
    card(p1[0] + d1 * 2.5, p1[1] - 2, sc, d1 > 0 ? "start" : "end");
    card(p2[0] - d2 * 8, p2[1] - 2, tc, d2 > 0 ? "end" : "start");
  }

  // ---- nodes
  for (const n of all) {
    if (n.kind === "full") {
      const c = COLOR[n.e.d];
      parts.push(`<g><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="2" fill="#fff" stroke="#333" stroke-width="0.7"/>`);
      parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${HEAD}" fill="${c}"/>`);
      parts.push(`<text x="${n.x + n.w / 2}" y="${n.y + 9.3}" text-anchor="middle" class="name">${esc(n.name)}</text>`);
      n.roleLines.forEach((l, i) => parts.push(`<text x="${n.x + n.w / 2}" y="${n.y + HEAD + 6 + i * 6.4}" text-anchor="middle" class="role">${esc(l)}</text>`));
      parts.push(`<line x1="${n.x}" y1="${n.y + HEAD + ROLE_H}" x2="${n.x + n.w}" y2="${n.y + HEAD + ROLE_H}" stroke="#bbb" stroke-width="0.5"/>`);
      n.rows.forEach((f, i) => {
        const y = n.y + HEAD + ROLE_H + (i + 1) * ROW - 2.2;
        parts.push(`<text x="${n.x + 4}" y="${y}" class="row${f.actor ? " act" : ""}">${f.ty ? `<tspan class="ty">${esc(f.ty)}</tspan> ` : ""}${esc(f.name)}</text>`);
        if (f.key) parts.push(`<text x="${n.x + n.w - 4}" y="${y}" text-anchor="end" class="key${f.actor ? " act" : ""}">${esc(f.key)}</text>`);
      });
      if (n.hidden) parts.push(`<text x="${n.x + 4}" y="${n.y + n.h - 3}" class="foot">+ ${n.hidden} more field${n.hidden > 1 ? "s" : ""} — see Appendix B</text>`);
      parts.push(`</g>`);
    } else if (n.kind === "stub") {
      parts.push(`<g><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" fill="#f3f4f6" stroke="#9aa3af" stroke-width="0.7" stroke-dasharray="2.5 1.5"/>`);
      parts.push(`<text x="${n.x + 8}" y="${n.y + 10.8}" class="stubname">${esc(n.name)}</text>`);
      parts.push(`<text x="${n.x + n.w - 7}" y="${n.y + 10.8}" text-anchor="end" class="stubtag">↗ ${HOME[n.name] || "?"}</text></g>`);
    } else {
      parts.push(`<g><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="3" fill="#fafafa" stroke="#9aa3af" stroke-width="0.7" stroke-dasharray="2.5 1.5"/>`);
      parts.push(`<text x="${n.x + n.w / 2}" y="${n.y + 8.5}" text-anchor="middle" class="bundletitle">${esc(n.name)}</text>`);
      n.of.forEach((nm, i) => {
        const y = n.y + 12 + i * (PILL_H + 1);
        parts.push(`<rect x="${n.x + 4}" y="${y}" width="${n.w - 8}" height="${PILL_H - 1}" rx="7" fill="#f3f4f6" stroke="#9aa3af" stroke-width="0.6"/>`);
        parts.push(`<text x="${n.x + 11}" y="${y + 10.2}" class="stubname">${esc(nm)}</text>`);
        parts.push(`<text x="${n.x + n.w - 10}" y="${y + 10.2}" text-anchor="end" class="stubtag">↗ ${HOME[nm] || "?"}</text>`);
      });
      parts.push(`</g>`);
    }
  }
  const headParts = lanes.map((l) => {
    const ls = wrap(l.title, 26).slice(0, 2);
    return ls.map((t, i) => `<text x="${l.x + l.w / 2}" y="${top - 9 - (ls.length - 1 - i) * 8}" text-anchor="middle" class="lane">${esc(t)}</text>`).join("") +
      `<line x1="${l.x}" y1="${top - 5}" x2="${l.x + l.w}" y2="${top - 5}" stroke="#cbd5e1" stroke-width="0.8"/>`;
  });

  const m = 10;
  const last = lanes[lanes.length - 1];
  const extra = edges.some((e) => (e.type === "self" || e.type === "bulge") && e.a.li === last.li) ? 110 : 0;
  const vx0 = -m, vy0 = top - LANE_HEAD - m, vw = last.x + last.w + m * 2 + extra, vh = bottom - vy0 + m + (edges.some((e) => e.type === "self") ? 24 : 0);
  const wmm = Math.min(277, vw * MM_PER_UNIT).toFixed(0);
  return `<svg viewBox="${vx0} ${vy0} ${vw} ${vh}" preserveAspectRatio="xMidYMin meet" style="width:${wmm}mm" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram ${dg.id} — ${esc(dg.title)}">
<defs>
 <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="#666" stroke-width="1.3"/></marker>
 <marker id="arro" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,1 L9,5 L0,9 z" fill="#1f3f73"/></marker>
 <marker id="arrp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="#b23a6e" stroke-width="1.3"/></marker>
</defs>
<style>
 .name{font:700 7.6px Helvetica,Arial,sans-serif;fill:#fff}
 .role{font:italic 5.6px Helvetica,Arial,sans-serif;fill:#444}
 .row{font:6.4px Menlo,Consolas,monospace;fill:#111} .act{fill:#6b7280}
 .ty{fill:#888} .key{font:700 6px Menlo,Consolas,monospace;fill:#1f4e8c}
 .foot{font:italic 5.4px Helvetica,Arial,sans-serif;fill:#6b7280}
 .lbl{font:6.2px Helvetica,Arial,sans-serif;fill:#222}
 .card{font:700 6px Helvetica,Arial,sans-serif;fill:#555}
 .stubname{font:700 6.4px Helvetica,Arial,sans-serif;fill:#4b5563}
 .stubtag{font:5.6px Helvetica,Arial,sans-serif;fill:#6b7280}
 .bundletitle{font:italic 5.8px Helvetica,Arial,sans-serif;fill:#4b5563}
 .lane{font:700 7px Helvetica,Arial,sans-serif;fill:#334155;letter-spacing:.04em;text-transform:uppercase}
</style>
${headParts.join("\n")}
${parts.join("\n")}
${labelParts.join("\n")}
</svg>`;
}

export const LEGEND_HTML = `<div class="legend">
<span><svg viewBox="0 0 40 10" width="40" height="10"><path d="M2,5 H36" stroke="#1f3f73" stroke-width="1.6"/><path d="M30,1 L38,5 L30,9 z" fill="#1f3f73"/></svg> owns · the parent creates and deletes the child</span>
<span><svg viewBox="0 0 40 10" width="40" height="10"><path d="M2,5 H36" stroke="#666" stroke-width="1"/><path d="M30,1 L38,5 L30,9" fill="none" stroke="#666" stroke-width="1.4"/></svg> refers to · the row stores the other row’s id</span>
<span><svg viewBox="0 0 40 10" width="40" height="10"><path d="M2,5 H36" stroke="#b23a6e" stroke-width="1" stroke-dasharray="3 2"/><path d="M30,1 L38,5 L30,9" fill="none" stroke="#b23a6e" stroke-width="1.4"/></svg> polymorphic · a type column + id</span>
<span><b>1 ▸ n</b> one row on the <b>1</b> side, many on the <b>n</b> side; the arrow points at the table that stores the key</span>
<span><svg viewBox="0 0 44 14" width="44" height="14"><rect x="1" y="1" width="42" height="12" rx="6" fill="#f3f4f6" stroke="#9aa3af" stroke-dasharray="2.5 1.5"/></svg> defined in another diagram (↗ which one)</span>
</div>`;
