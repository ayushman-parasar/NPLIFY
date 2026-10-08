// Render selected ERD diagrams with the new renderer into a standalone landscape PDF (demo / QA).
//   node scripts/demo-diagrams.mjs <outDir> [ids...]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DIAGRAMS, diagramSvg, LEGEND_HTML, homeOf } from "./erd-diagrams.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));
const outDir = process.argv[2] || path.join(root, "docs");
const ids = process.argv.slice(3);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const HOME = { ...{ PROJECT: "1a", INTRODUCER: "1a", RATE_SOURCE: "1a", SENDER: "1a", RECEIVER_GROUP: "1a", OWN_WALLET: "1a", THRESHOLD: "1a", CURRENCY_PAIR: "1a",
  COLLECTION_SENDING_ENTITY: "1a", SENDER_RECEIVER_ALLOW: "1a", RECEIVER: "1a", PAIR_RATE_SOURCE: "1a", REFERRAL_RULE: "1a", RECEIVING_ENTITY: "1a", RECEIVING_ENTITY_ACCOUNT: "1a",
  PARTNER: "1b", PARTNER_CONFIG: "1b", PARTNER_PAIR: "1b", PARTNER_ENTITY: "1b", COLLECTION_RECEIVING_ENDPOINT: "1b", SETTLEMENT_SENDING_ENTITY: "1b", SETTLEMENT_RAIL: "1b",
  SETTLEMENT_REGISTRATION: "1b", PARTNER_REBATE_RULE: "1b", FEE_STRUCTURE: "1b", FEE_OVERRIDE: "1b", MARKET_RATE: "2", RATE_COMPARISON: "2", PARTNER_RATE_VERSION: "2",
  LEDGER_TRANSACTION: "4", LEDGER_POSTING: "4", LEDGER_ACCOUNT: "4", USER: "4", APPROVAL: "4", AUDIT_LOG: "4", RECORD_LOCK: "4" }, ...homeOf() };

// One-page 3a with the same scope as the existing diagram: all nine deal-domain tables on one page.
const ONE_PAGE_3A = (fields) => ({ id: "3a", fields, title: "Deal lifecycle — deal group, legs, collection, conversion, reroute, balance conversion",
  reading: "Read left to right: the parties and prices agreed → the client’s order and its legs → money in, the exchange and the records hanging off a leg → a balance conversion (an exchange of money already held, with no order behind it) and what it refers to.",
  lanes: [
    { title: "Who and what was agreed", nodes: [
      { stub: "PROJECT", for: ["DEAL_GROUP"] }, { stub: "SENDER", for: ["DEAL_GROUP"] }, { stub: "RECEIVER_GROUP", for: ["DEAL_GROUP"] }, { stub: "FEE_STRUCTURE", for: ["DEAL_GROUP"] },
      { bundle: "copied from the order onto each leg", into: "DEAL", of: ["PROJECT", "SENDER", "RECEIVER_GROUP"], edge: "client, sender, entitled group" },
      { bundle: "frozen copies stapled to the leg at quote", into: "DEAL", of: ["PARTNER_PAIR", "PARTNER_ENTITY", "FEE_STRUCTURE", "MARKET_RATE", "PARTNER_RATE_VERSION"], edge: "stamped at quote, one each" },
      { stub: "RECEIVER", for: ["DEAL"] }, { stub: "DISBURSEMENT_RETURN", for: ["DEAL"] } ] },
    { title: "The order and its legs", nodes: ["DEAL_GROUP", "DEAL"] },
    { title: "Money in, the exchange, and records hanging off a leg", nodes: ["COLLECTION", "CONVERSION", "REROUTE", "SENDER_CREDIT", "EARNINGS_RECEIVABLE"] },
    { title: "Exchange without an order", nodes: [
      { stub: "COLLECTION_RECEIVING_ENDPOINT", for: ["COLLECTION"] }, { stub: "COLLECTION_SENDING_ENTITY", for: ["COLLECTION"] }, { stub: "PARTNER_RATE_VERSION", for: ["CONVERSION"] },
      { stub: "OWN_WALLET", for: ["REROUTE"] }, { stub: "PARTNER_CONFIG", for: ["REROUTE", "EARNINGS_RECEIVABLE"] }, { stub: "SENDER", for: ["SENDER_CREDIT"] },
      "BALANCE_CONVERSION", "ENTITLEMENT_REATTRIBUTION" ] },
    { title: "What a balance conversion refers to", nodes: [
      { stub: "PROJECT", for: ["BALANCE_CONVERSION"] }, { stub: "PARTNER_CONFIG", for: ["BALANCE_CONVERSION"] }, { stub: "RECEIVER_GROUP", for: ["BALANCE_CONVERSION", "ENTITLEMENT_REATTRIBUTION"] },
      { bundle: "same rate machinery as a leg", into: "BALANCE_CONVERSION", of: ["PARTNER_PAIR", "PARTNER_RATE_VERSION", "MARKET_RATE"], edge: "rate used, one each" } ] } ] });
const EXTRA = { "3a-all": ONE_PAGE_3A("all"), "3a-keys": ONE_PAGE_3A("keys") };
const chosen = ids.length ? ids.map((id) => EXTRA[id] || DIAGRAMS.find((d) => d.id === id)).filter(Boolean) : DIAGRAMS;
const pages = chosen.map((dg) => {
  const svg = diagramSvg(dg, D, { homeOf: HOME, report: (id, miss) => miss.length && console.log(`[${id}] relations not drawn:`, miss) });
  return `<section class="diagram-page">
<h3>Diagram ${esc(dg.id)} — ${esc(dg.title)}</h3>
<p class="reading">${esc(dg.reading)}</p>
<figure>${svg}</figure>
${LEGEND_HTML}
</section>`;
});

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ERD diagrams — demo</title>
<style>
@page { size: A4 landscape; margin: 9mm 10mm 8mm 10mm; }
html,body{margin:0;padding:0} body{font:10pt/1.4 Helvetica,Arial,sans-serif;color:#111}
.diagram-page{break-after:page;height:179mm;display:flex;flex-direction:column}
.diagram-page h3{font:700 12pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 2mm}
.reading{font:9pt/1.35 Georgia,serif;color:#333;margin:0 0 3mm}
figure{margin:0;flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center;overflow:hidden}
figure svg{display:block;max-width:100%;max-height:100%;height:100%}
.legend{display:flex;flex-wrap:wrap;gap:3mm 7mm;font:7.6pt Helvetica,Arial,sans-serif;color:#333;border-top:1px solid #ddd;padding-top:1.5mm;margin-top:1.5mm}
.legend span{display:inline-flex;align-items:center;gap:1.5mm;white-space:nowrap}
</style></head><body>${pages.join("\n")}</body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, "erd-diagrams-demo.html"), pdfPath = path.join(outDir, "erd-diagrams-demo.pdf");
fs.writeFileSync(htmlPath, html);
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, "file://" + htmlPath], { stdio: "ignore" });
console.log("wrote", htmlPath, "and", pdfPath);
