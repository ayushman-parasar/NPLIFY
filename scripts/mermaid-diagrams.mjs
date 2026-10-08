// Mermaid erDiagram text for an ERD diagram, in the design of the v5.x documents.
//   nodes: full entities (attribute tables) and stubs (name-only boxes, defined in another diagram)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));

// Shorter relationship wording for the diagrams; the map and knowledge base keep the full labels.
export const SHORT = {
  "DEAL>DEAL": "leg n-1 funds leg n",
  "DISBURSEMENT_RETURN>DEAL": "funds a return leg",
  "DEAL>COLLECTION": "money in, 1..n parts",
  "DEAL>CONVERSION": "converts",
  "BALANCE_CONVERSION>CONVERSION": "converts",
  "DEAL>REROUTE": "plan B",
  "DEAL>SENDER_CREDIT": "overpayment",
  "SENDER>SENDER_CREDIT": "owed to",
  "DEAL>EARNINGS_RECEIVABLE|deal_id": "created by",
  "DEAL>EARNINGS_RECEIVABLE|recovered_by_deal_id": "recovered by",
  "PARTNER_CONFIG>EARNINGS_RECEIVABLE": "resting at",
  "PARTNER_CONFIG>REROUTE": "alternate partner",
  "PARTNER_CONFIG>BALANCE_CONVERSION": "at partner",
  "RECEIVER_GROUP>BALANCE_CONVERSION": "group served",
  "BALANCE_CONVERSION>ENTITLEMENT_REATTRIBUTION": "entitlement moved",
  "COLLECTION_RECEIVING_ENDPOINT>COLLECTION": "paid into",
  "COLLECTION_SENDING_ENTITY>COLLECTION": "paid from",
  "PARTNER_RATE_VERSION>CONVERSION": "version used",
  "RECEIVER>DEAL": "receiver (optional)",
  "RECEIVER_GROUP>DEAL": "attribution",
  "DEAL>DISBURSEMENT_LINE": "leg settled",
  "DEAL>FEE_DECISION": "markup on return leg",
  "DISBURSEMENT>FEE_DECISION": "fee override",
  "DISBURSEMENT>BANK_FEE_EVENT|applied_disbursement_id": "true-up applied to",
  "DISBURSEMENT>BANK_FEE_EVENT|disbursement_id": "bank fee",
  "DISBURSEMENT_LINE>DISBURSEMENT_RETURN": "bounced",
  "DISBURSEMENT>DISBURSEMENT_LINE": "slips",
  "DISBURSEMENT>SHORTFALL": "tops up",
  "RECEIVER>DISBURSEMENT_LINE": "paid receiver",
  "SETTLEMENT_REGISTRATION>DISBURSEMENT_LINE": "destination",
  "PARTNER_CONFIG>DISBURSEMENT": "partner holding",
  "FEE_STRUCTURE>FEE_TIER": "volume tiers",
  "FEE_OVERRIDE>DEAL": "override used",
  "FEE_TIER>DEAL": "base tier",
  "DEAL>DEAL_FEE_TIER": "tier portions",
  "FEE_TIER>DEAL_FEE_TIER": "tier",
  "PROJECT>INVOICE": "vendor obligations",
  "RECEIVER>INVOICE": "vendor owed",
  "INVOICE>DEAL_GROUP": "pays",
  "INVOICE>DISBURSEMENT_LINE": "discharged by",
  "MARKET_RATE>DISBURSEMENT_LINE": "discharge snapshot",
  "OWN_WALLET>COLLECTION_RECEIVING_ENDPOINT": "own-desk endpoint",
  "DEAL>COLLECTION_RECEIVING_ENDPOINT": "single-use, reserved",
  "DEAL>RECEIVING_ENTITY_ACCOUNT": "single-use, reserved",
  "PROJECT>WALLET_SCREENING": "screenings",
  "SENDER>WALLET_SCREENING": "sending wallet",
  "RECEIVING_ENTITY_ACCOUNT>WALLET_SCREENING": "receiver wallet",
  "WALLET_SCREENING>COLLECTION": "admitted",
  "WALLET_SCREENING>SETTLEMENT_REGISTRATION": "screened",
  "COLLECTION>LOSS_EVENT": "loss on a part",
  "DISBURSEMENT_LINE>LOSS_EVENT": "loss on a line",
  "FEE_STRUCTURE>REFERRAL_RULE": "scope",
  "FEE_STRUCTURE>PARTNER_REBATE_RULE": "scope",
  "SENDER>PARTNER_REBATE_RULE": "sender scope",
};

const side = (tok, left) => {
  const t = (tok || "").trim();
  const k = t === "1" ? "one" : t === "0..1" ? "zo" : t === "1..n" ? "om" : "zm";
  return left ? { one: "||", zo: "|o", zm: "}o", om: "}|" }[k] : { one: "||", zo: "o|", zm: "o{", om: "|{" }[k];
};

// Document convention (v5.x): ||--o{ composition (the parent owns the child); ||..o{ a reference or a
// polymorphic link. Actor links (USER foreign keys) are drawn only between two full entities.
export function erDiagram(nodes, opts = {}) {
  const full = new Set(nodes.filter((n) => !n.startsWith("~")));
  const stub = new Set(nodes.filter((n) => n.startsWith("~")).map((n) => n.slice(1)));
  const present = (n) => full.has(n) || stub.has(n);
  const L = ["erDiagram"];
  if (opts.direction) L.push(`    direction ${opts.direction}`);
  for (const r of D.R) {
    if (r[2] === "view") continue;
    if (r[2] === "actor" && !(full.has(r[0]) && full.has(r[1]))) continue;
    if (!present(r[0]) || !present(r[1])) continue;
    if (!full.has(r[0]) && !full.has(r[1])) continue;
    const [a, b] = r[5].split(":");
    const line = r[2] === "owns" ? "--" : "..";
    const label = (opts.short && (SHORT[`${r[0]}>${r[1]}|${r[3]}`] || SHORT[`${r[0]}>${r[1]}`])) || r[4] || r[3];
    L.push(`    ${r[0]} ${side(a, true)}${line}${side(b, false)} ${r[1]} : "${label.replace(/"/g, "'")}"`);
  }
  for (const n of full) {
    const e = D.E[n];
    L.push(`    ${n} {`);
    for (const f of e.f) L.push(`        ${f[1] || "string"} ${f[0]}${f[2] ? " " + f[2] : ""}`);
    L.push(`    }`);
  }
  return L.join("\n");
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// "PROJECT, SENDER are defined in Diagram 1a; PARTNER_PAIR in 1b; DEAL in Diagram 3a." for a diagram's stubs
export function stubNote(nodes, homeOf) {
  const groups = {};
  for (const n of nodes) if (n.startsWith("~")) (groups[homeOf[n.slice(1)] || "?"] ||= []).push(n.slice(1));
  const ids = Object.keys(groups).sort();
  return ids.map((id, i) => `${groups[id].map((n) => `<code>${n}</code>`).join(", ")} ${i === 0 ? "are defined in Diagram " : "in "}${id}`).join("; ") + ".";
}

const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Render diagrams with Mermaid in headless Chrome and return finished SVG strings keyed by id.
// Each item: { id, text, config } — config is merged into mermaid.initialize (e.g. { layout: "elk" }).
export function renderSvgs(items, workDir) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: false });</script>
</head><body>
<script type="module">
let note = "";
try { const elk = (await import("https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0/dist/mermaid-layout-elk.esm.min.mjs")).default; mermaid.registerLayoutLoaders(elk); } catch (e) { note = "elk unavailable: " + e.message; }
const items = ${JSON.stringify(items)};
for (const [i, it] of items.entries()) {
  const out = document.createElement("div"); out.className = "out"; out.dataset.id = it.id; document.body.appendChild(out);
  try {
    const cfg = it.config || {};
    mermaid.initialize({ startOnLoad: false, theme: "neutral", ...cfg, er: { useMaxWidth: false, fontSize: 12, entityPadding: 12, minEntityWidth: 90, minEntityHeight: 50, ...(cfg.er || {}) } });
    const { svg } = await mermaid.render("m" + i, it.text);
    const host = document.createElement("div"); host.innerHTML = svg; document.body.appendChild(host);
    const el = host.querySelector("svg"), bb = el.getBBox(), pad = 14;
    el.setAttribute("viewBox", [bb.x - pad, bb.y - pad, bb.width + 2 * pad, bb.height + 2 * pad].join(" "));
    el.removeAttribute("width"); el.removeAttribute("height"); el.removeAttribute("style"); el.setAttribute("preserveAspectRatio", "xMidYMin meet");
    el.dataset.w = Math.round(bb.width + 2 * pad); el.dataset.h = Math.round(bb.height + 2 * pad);
    out.appendChild(el); host.remove();
  } catch (e) { out.textContent = "RENDER ERROR: " + e.message; }
}
document.body.dataset.note = note; document.body.dataset.done = "1";
</script></body></html>`;
  fs.mkdirSync(workDir, { recursive: true });
  const htmlPath = path.join(workDir, "render.html");
  fs.writeFileSync(htmlPath, html);
  const dom = execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--virtual-time-budget=60000", "--dump-dom", "file://" + htmlPath], { maxBuffer: 1 << 28 }).toString();
  const out = {};
  for (const chunk of dom.split('<div class="out" data-id="').slice(1)) {
    const id = chunk.slice(0, chunk.indexOf('"')).replace(/&amp;/g, "&");
    const a = chunk.indexOf("<svg"), b = chunk.lastIndexOf("</svg>");
    out[id] = a >= 0 && b > a ? chunk.slice(a, b + 6) : chunk.slice(chunk.indexOf(">") + 1, chunk.indexOf("</div>"));
  }
  const note = /data-note="([^"]*)"/.exec(dom)?.[1];
  if (note) console.warn(note);
  for (const [id, svg] of Object.entries(out)) if (!svg.includes("<svg")) throw new Error(`${id}: ${svg.slice(0, 200)}`);
  return out;
}

// Lay finished SVGs onto landscape pages and print to PDF.
export function renderPdf(pages, outBase, svgs) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ERD diagrams</title>
<style>
@page { size: A4 landscape; margin: 9mm 10mm; } @page port { size: A4 portrait; margin: 10mm; }
html,body{margin:0;padding:0} body{font:10pt Helvetica,Arial,sans-serif;color:#111;background:#fff}
section{break-after:page;display:flex;flex-direction:column;height:178mm} section.port{page:port;height:275mm}
h3{font:700 12pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 3mm}
figure{margin:0;flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center}
figure svg{width:100%;height:100%}
.cap{font:italic 9pt Georgia,serif;color:#333;margin-top:2mm}
</style></head><body>
${pages.map((p) => `<section class="${p.landscape === false ? "port" : ""}"><h3>Diagram ${esc(p.id)} — ${esc(p.title)}</h3><figure>${svgs[p.id] || "missing"}</figure><p class="cap">${esc(p.caption || "")}</p></section>`).join("\n")}
</body></html>`;
  fs.writeFileSync(outBase + ".html", html);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${outBase}.pdf`, "file://" + outBase + ".html"], { stdio: "ignore" });
  return outBase + ".pdf";
}
