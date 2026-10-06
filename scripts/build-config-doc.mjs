// Build docs/NPLify-Configuration-Schema-v1.0.pdf: the project-agnostic configuration model with
// the FRS project expressed end-to-end as a validated worked example. node scripts/build-config-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v4.json"), "utf8"));
const outDir = path.join(root, "docs");
fs.mkdirSync(outDir, { recursive: true });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ------------------------------------------------------------------ schema: entities of the configuration domain, in reading order
const GLOBAL = ["PARTNER", "RATE_SOURCE", "INTRODUCER"];
const PROJECT_LEVEL = ["PROJECT", "THRESHOLD", "CURRENCY_PAIR", "PAIR_RATE_SOURCE", "OWN_WALLET"];
const PARTIES = ["SENDER", "SENDER_RECEIVER_ALLOW", "COLLECTION_SENDING_ENTITY", "FEE_OVERRIDE", "RECEIVER_GROUP", "RECEIVER", "RECEIVING_ENTITY", "RECEIVING_ENTITY_ACCOUNT", "REFERRAL_RULE"];
const PARTNER_BLOCK = ["PARTNER_CONFIG", "PARTNER_PAIR", "FEE_STRUCTURE", "FACILITATING_ENTITY", "WALLET", "COLLECTION_RECEIVING_ENTITY", "SETTLEMENT_SENDING_ENTITY", "SETTLEMENT_RAIL", "SETTLEMENT_REGISTRATION", "PARTNER_REBATE_RULE"];
const ALL = [...GLOBAL, ...PROJECT_LEVEL, ...PARTIES, ...PARTNER_BLOCK];
for (const n of ALL) if (!D.E[n]) throw new Error("missing entity " + n);
for (const n of Object.keys(D.E)) if (D.E[n].d === "config" && !ALL.includes(n)) throw new Error("config entity not covered: " + n);

// Rules per entity: required fields, defaults, allowed values beyond the data dictionary, and validation.
const RULES = {
  PARTNER: { scope: "Global", req: ["name", "disclosure_style", "status"], rules: ["A partner is set up once and reused by any project through a PARTNER_CONFIG.", "disclosure_style decides how its price is read: markup_included (its rate contains its margin) or market_plus (it states market + x %)."] },
  RATE_SOURCE: { scope: "Global", req: ["code", "staleness_threshold_s"], rules: ["A snapshot older than staleness_threshold_s is not used for pricing; the next source in the pair's chain is tried."] },
  INTRODUCER: { scope: "Global", req: ["name", "status"], rules: ["Only needed where NPL pays referral commissions."] },
  PROJECT: { scope: "Per client", req: ["name", "quote_freshness_min", "quote_validity_min", "grace_min", "grace_drift_pct", "late_collection_policy", "bank_fee_treatment_default", "receiver_fee_timing", "network_fee_policy", "disburse_policy", "exposure_ceiling", "status"], defaults: { receiver_fee_timing: "at_conversion", disburse_policy: "to_zero", late_collection_policy: "requote" }, rules: ["The project is the client: everything below belongs to exactly one project.", "Creating a project creates its default RECEIVER_GROUP automatically.", "exposure_ceiling is the most client money that may rest at any one partner; it is enforced at every release.", "Every change is versioned, proposed by Finance and approved by Management."] },
  THRESHOLD: { scope: "Per project", req: ["kind", "value"], rules: ["One row per kind and currency; currency may be blank for kinds that are not amounts (daily_slots, rate_variation_rel).", "escalation names who decides when the threshold is hit: finance or management.", "condition_expr is only read for kind = custom."] },
  CURRENCY_PAIR: { scope: "Per project", req: ["from_currency", "to_currency", "quote_direction", "rate_precision", "amount_rounding", "status"], defaults: { quote_direction: "out_per_in", rate_precision: 5, amount_rounding: "truncate_whole_unit" }, rules: ["from_currency is the collection currency, to_currency the payout currency.", "rate_precision is 5 for ordinary pairs and 8 for sub-unit pairs such as USDT → BTC.", "cash_rounding_unit applies only when the pair is collected in cash (100, 500 or 1000 by currency).", "At least one PAIR_RATE_SOURCE is required before the pair can be used."] },
  PAIR_RATE_SOURCE: { scope: "Per pair", req: ["currency_pair_id", "rate_source_id", "priority"], rules: ["Priority 1 is tried first; the chain continues on staleness or outage; with every source down a manual rate needs Finance approval and evidence."] },
  OWN_WALLET: { scope: "Per project", req: ["provider", "network", "address", "signer_arrangement", "custody_max_hours"], rules: ["Optional. Needed only if the project may reroute through NPL's own wallet.", "custody_max_hours is the aging limit reported on the custody view."] },
  SENDER: { scope: "Per project", req: ["name", "risk_tier", "status"], rules: ["A single paying party. Not tied to a partner.", "Must have at least one SENDER_RECEIVER_ALLOW row before it can be chosen on a deal."] },
  SENDER_RECEIVER_ALLOW: { scope: "Per sender", req: ["sender_id", "receiver_group_id"], rules: ["The allow-list (sendable_to). A sender may pay only the groups listed here; the group must belong to the same project and must not be the return group.", "Required for collect-first attribution (open question 1)."] },
  COLLECTION_SENDING_ENTITY: { scope: "Per sender", req: ["sender_id", "label"], rules: ["Provenance only: where the sender's funds come from. Never a payout destination."] },
  FEE_OVERRIDE: { scope: "Per sender × partner pair", req: ["sender_id", "partner_pair_id", "pct", "effective_from", "approved_by"], rules: ["Replaces the fee structure's total pct for that sender from effective_from; the sender : receiver proportion of the structure is kept. pct may be 0."] },
  RECEIVER_GROUP: { scope: "Per project", req: ["name", "is_default", "kind", "status"], defaults: { kind: "client" }, rules: ["Exactly one group per project has is_default = true; it is created with the project.", "Each project also has one group of kind return, created automatically when the first sender_return receiver is needed.", "Create further client groups only when flows must be kept apart; with a single group no offset can arise."] },
  RECEIVER: { scope: "Per group", req: ["group_id", "kind", "name", "status"], defaults: { kind: "counterparty" }, rules: ["kind sender_return requires sender_id and the return group; kind partner_transit requires partner_config_id.", "A receiver is in exactly one group; moving it is a Management-approved change because it re-attributes entitlement."] },
  RECEIVING_ENTITY: { scope: "Per receiver", req: ["receiver_id", "name", "status"], rules: ["A legal entity of the receiver. Bank and wallet details live on its accounts, not here."] },
  RECEIVING_ENTITY_ACCOUNT: { scope: "Per entity", req: ["receiving_entity_id", "currency", "rail", "details_ref", "status"], rules: ["One row per currency × rail (EUR via SWIFT and EUR via SEPA are two accounts).", "An account can be paid only through a SETTLEMENT_REGISTRATION with status approved at the paying partner."] },
  REFERRAL_RULE: { scope: "Per introducer × project", req: ["introducer_id", "project_id", "basis", "pct", "effective_from"], rules: ["basis fixed_pct adds pct to the sender share before the sender rate is computed; basis share_of_earnings pays pct of NPL's earnings per deal.", "partner_pair_id narrows the rule to one partner × pair; blank means the whole project."] },
  PARTNER_CONFIG: { scope: "Per project × partner", req: ["project_id", "partner_id", "applicable_for_reroute", "status"], defaults: { applicable_for_reroute: false }, rules: ["How this partner is used in this project. Everything in the partner block hangs off it.", "applicable_for_reroute = true puts the partner in the project's alternate set (Management approval)."] },
  PARTNER_PAIR: { scope: "Per partner config × pair", req: ["partner_config_id", "currency_pair_id", "partner_pricing", "status"], rules: ["currency_pair_id must be one of the project's pairs.", "partner_markup_pct is required when partner_pricing = market_plus_pct and must be blank otherwise."] },
  FEE_STRUCTURE: { scope: "Per partner pair, versioned", req: ["partner_pair_id", "rate_basis", "mode", "pct", "sender_share_pct", "receiver_share_pct", "min_margin_pct", "variance_threshold_rel", "quoting_rate_policy", "effective_from"], defaults: { quoting_rate_policy: "worst_applicable" }, rules: ["sender_share_pct + receiver_share_pct = pct.", "mode variable requires floor_pct ≤ cap_pct and min_margin_pct; mode fixed ignores floor and cap.", "A new version is a new row with a later effective_from; rows are never edited (deals keep the version they were priced on).", "variance_threshold_rel is the tolerance used by the partner-rate breach check for this partner × pair."] },
  FACILITATING_ENTITY: { scope: "Per partner config", req: ["partner_config_id", "name", "status"], rules: ["The partner's legal vehicle or channel (e.g. PT Sukses for Ali). Fixed on a deal leg at quote."] },
  WALLET: { scope: "Per facilitating entity", req: ["facilitating_entity_id", "network", "address", "currency", "status"], rules: ["Crypto-in collection endpoint. One per network and currency."] },
  COLLECTION_RECEIVING_ENTITY: { scope: "Per partner config", req: ["partner_config_id", "name", "bank_details_ref", "currency", "status"], rules: ["Bank-in collection endpoint at the partner. Cash collections have no endpoint record."] },
  SETTLEMENT_SENDING_ENTITY: { scope: "Per partner config", req: ["partner_config_id", "narrative_name", "status"], rules: ["The name the receiver sees on an outgoing transfer. Holds no money."] },
  SETTLEMENT_RAIL: { scope: "Per partner config", req: ["partner_config_id", "name", "currency"], rules: ["The bank or EMI that executes the transfer. expected_bank_fee is the figure the bank-fee true-up compares against. Holds no money."] },
  SETTLEMENT_REGISTRATION: { scope: "Per partner config × account", req: ["partner_config_id", "receiving_entity_account_id", "approval_status"], defaults: { approval_status: "pending_partner" }, rules: ["Destination approval is per partner: the same account is registered separately with each partner that may pay it.", "A quote-first deal cannot leave Inquiry unless the entitled group has at least one approved registration with the chosen partner (invariant 8)."] },
  PARTNER_REBATE_RULE: { scope: "Per partner config", req: ["partner_config_id", "pct_of_partner_fee", "effective_from"], rules: ["Only for partners that return part of their fee; drives the monthly Partner Commissions reconciliation."] },
};
for (const n of ALL) if (!RULES[n]) throw new Error("no rules for " + n);

// ------------------------------------------------------------------ the worked example: the FRS project ("Client 1", USDT → EUR)
// Values marked (illustrative) in the document are not from NPL's documents.
const EX = {
  partners: [
    { code: "ALI", name: "Ali", disclosure_style: "markup_included", rate_expiry_time: "17:00 local", holiday_calendar: "ID", status: "active" },
    { code: "JETON", name: "Jeton", disclosure_style: "market_plus", rate_expiry_time: "16:00 local", holiday_calendar: "EU", status: "active" },
  ],
  rate_sources: [
    { code: "KRAKEN", staleness_threshold_s: 120 },
    { code: "CMC", staleness_threshold_s: 300 },
    { code: "OANDA", staleness_threshold_s: 300 },
    { code: "XE", staleness_threshold_s: 300 },
  ],
  project: {
    code: "CLIENT1", name: "Client 1 (FRS project)", client_label: "Client 1",
    quote_freshness_min: 5, quote_validity_min: 60, grace_min: 15, grace_drift_pct: 0.001,
    late_collection_policy: "requote", bank_fee_treatment_default: "carry_forward", receiver_fee_timing: "at_conversion",
    network_fee_policy: "absorbed", disburse_policy: "to_zero", shortfall_tolerance: 0, exposure_ceiling: 250000, status: "active",
  },
  thresholds: [
    { kind: "max_amount", currency: "USDT", value: 100000, escalation: "finance" },
    { kind: "settlement_limit", currency: "EUR", value: 50000, escalation: "management" },
    { kind: "daily_slots", value: 2, escalation: "management" },
    { kind: "rate_variation_rel", value: 0.002, escalation: "finance" },
  ],
  currency_pairs: [
    { code: "USDT-EUR", from_currency: "USDT", to_currency: "EUR", quote_direction: "out_per_in", rate_precision: 5, amount_rounding: "truncate_whole_unit", status: "active",
      sources: [{ rate_source: "KRAKEN", priority: 1 }, { rate_source: "CMC", priority: 2 }] },
  ],
  own_wallet: { provider: "Aquanow", account_label: "LT Sub", network: "TRC-20", address: "T…(wallet address)", signer_arrangement: "multisig", custody_max_hours: 48 },
  receiver_groups: [
    { code: "DEFAULT", name: "Default group", is_default: true, kind: "client", status: "active" },
    { code: "RETURNS", name: "Return group", is_default: false, kind: "return", status: "active" },
  ],
  receivers: [
    { code: "SUD", group: "DEFAULT", kind: "counterparty", name: "Sud", status: "active", entities: [
      { code: "NEWXP", name: "NewXP Entity", status: "active", accounts: [{ code: "NEWXP-EUR-SEPA", currency: "EUR", rail: "SEPA", details_ref: "bank-ref-001", status: "active" }] },
      { code: "REFERSCOUT", name: "ReferScout Entity", status: "active", accounts: [{ code: "RS-EUR-SEPA", currency: "EUR", rail: "SEPA", details_ref: "bank-ref-002", status: "active" }] },
    ] },
    { code: "RAJ", group: "DEFAULT", kind: "counterparty", name: "Raj", status: "active", entities: [
      { code: "VOICEAI", name: "VoiceAIWrapper", status: "active", accounts: [{ code: "VAI-EUR-SWIFT", currency: "EUR", rail: "SWIFT", details_ref: "bank-ref-003", status: "active" }] },
    ] },
  ],
  senders: [
    { code: "AYUSH", name: "Ayush", risk_tier: "standard", status: "active", sendable_to: ["DEFAULT"], provenance: [{ label: "own account", account_ref: "wallet-ayush-1" }] },
    { code: "NAVEEN", name: "Naveen", risk_tier: "standard", status: "active", sendable_to: ["DEFAULT"], provenance: [{ label: "own account", account_ref: "wallet-naveen-1" }] },
  ],
  partner_configs: [
    { code: "CLIENT1-ALI", partner: "ALI", applicable_for_reroute: false, status: "active",
      pairs: [{ currency_pair: "USDT-EUR", partner_pricing: "disclosed_rate", status: "active",
        fee_structures: [{ rate_basis: "market", mode: "fixed", pct: 0.010, sender_share_pct: 0.004, receiver_share_pct: 0.006, min_margin_pct: 0.003, variance_threshold_rel: 0.20, quoting_rate_policy: "worst_applicable", effective_from: "2026-10-01" }] }],
      facilitating_entities: [{ code: "PT-TOUR", name: "PT-tour", status: "active", wallets: [{ network: "TRC-20", address: "T…(PT-tour wallet)", currency: "USDT", status: "active" }] },
        { code: "PT-GLOBAL", name: "PT Global Inc", status: "active", wallets: [{ network: "TRC-20", address: "T…(PT Global wallet)", currency: "USDT", status: "active" }] }],
      collection_receiving_entities: [],
      settlement_sending_entities: [{ narrative_name: "PT Global Inc", status: "active" }],
      settlement_rails: [{ name: "Ali's EU bank / EMI", bank_details_ref: "rail-ref-ali-eur", expected_bank_fee: 25, currency: "EUR" }],
      registrations: [{ account: "NEWXP-EUR-SEPA", approval_status: "approved" }, { account: "RS-EUR-SEPA", approval_status: "approved" }, { account: "VAI-EUR-SWIFT", approval_status: "approved" }],
      rebate_rule: null },
    { code: "CLIENT1-JETON", partner: "JETON", applicable_for_reroute: true, status: "active",
      pairs: [{ currency_pair: "USDT-EUR", partner_pricing: "market_plus_pct", partner_markup_pct: 0.005, status: "active",
        fee_structures: [{ rate_basis: "market", mode: "fixed", pct: 0.010, sender_share_pct: 0.004, receiver_share_pct: 0.006, min_margin_pct: 0.003, variance_threshold_rel: 0.20, quoting_rate_policy: "worst_applicable", effective_from: "2026-10-01" }] }],
      facilitating_entities: [{ code: "JETON-EMI", name: "Jeton EMI", status: "active", wallets: [{ network: "TRC-20", address: "T…(Jeton wallet)", currency: "USDT", status: "active" }] }],
      collection_receiving_entities: [],
      settlement_sending_entities: [{ narrative_name: "Jeton", status: "active" }],
      settlement_rails: [{ name: "Jeton EMI (SEPA)", bank_details_ref: "rail-ref-jeton-eur", expected_bank_fee: 0, currency: "EUR" }],
      registrations: [{ account: "NEWXP-EUR-SEPA", approval_status: "approved" }, { account: "RS-EUR-SEPA", approval_status: "approved" }, { account: "VAI-EUR-SWIFT", approval_status: "approved" }],
      rebate_rule: null },
  ],
  introducers: [], referral_rules: [],
};

// ------------------------------------------------------------------ validate the example against the schema rules
const ENUM = {
  disclosure_style: ["markup_included", "market_plus"], late_collection_policy: ["requote", "honor_with_approval"], bank_fee_treatment_default: ["waived", "carry_forward", "absorbed"],
  receiver_fee_timing: ["at_conversion", "post_confirmation"], network_fee_policy: ["absorbed", "charged_back"], disburse_policy: ["to_zero", "hold_allowed"],
  threshold_kind: ["max_amount", "settlement_limit", "daily_slots", "rate_variation_rel", "custom"], escalation: ["finance", "management"],
  quote_direction: ["out_per_in", "in_per_out"], amount_rounding: ["truncate_whole_unit"], group_kind: ["client", "return"], receiver_kind: ["counterparty", "sender_return", "partner_transit"],
  partner_pricing: ["market_plus_pct", "disclosed_rate"], rate_basis: ["market", "partner"], mode: ["fixed", "variable"], quoting_rate_policy: ["worst_applicable", "designated", "best_applicable"],
  approval_status: ["pending_partner", "approved", "suspended"], signer_arrangement: ["hardware", "multisig"], rate_source: ["KRAKEN", "CMC", "OANDA", "XE"],
};
const errors = [];
const must = (cond, msg) => { if (!cond) errors.push(msg); };
const inEnum = (v, k, where) => must(ENUM[k].includes(v), `${where}: ${k} '${v}' not in ${ENUM[k].join("/")}`);
const P = EX.project;
for (const f of RULES.PROJECT.req) must(P[f] !== undefined && P[f] !== "", `PROJECT missing ${f}`);
inEnum(P.late_collection_policy, "late_collection_policy", "PROJECT"); inEnum(P.bank_fee_treatment_default, "bank_fee_treatment_default", "PROJECT"); inEnum(P.receiver_fee_timing, "receiver_fee_timing", "PROJECT"); inEnum(P.network_fee_policy, "network_fee_policy", "PROJECT"); inEnum(P.disburse_policy, "disburse_policy", "PROJECT");
must(P.quote_freshness_min < P.quote_validity_min, "freshness must be shorter than validity");
for (const p of EX.partners) inEnum(p.disclosure_style, "disclosure_style", "PARTNER " + p.code);
for (const t of EX.thresholds) { inEnum(t.kind, "threshold_kind", "THRESHOLD"); inEnum(t.escalation, "escalation", "THRESHOLD " + t.kind); }
const srcCodes = EX.rate_sources.map((s) => s.code);
for (const cp of EX.currency_pairs) { inEnum(cp.quote_direction, "quote_direction", cp.code); inEnum(cp.amount_rounding, "amount_rounding", cp.code); must(cp.sources.length >= 1, cp.code + " needs a rate source"); for (const s of cp.sources) must(srcCodes.includes(s.rate_source), cp.code + " unknown source " + s.rate_source); must(new Set(cp.sources.map((s) => s.priority)).size === cp.sources.length, cp.code + " duplicate priorities"); }
inEnum(EX.own_wallet.signer_arrangement, "signer_arrangement", "OWN_WALLET");
must(EX.receiver_groups.filter((g) => g.is_default).length === 1, "exactly one default group");
must(EX.receiver_groups.filter((g) => g.kind === "return").length === 1, "exactly one return group");
for (const g of EX.receiver_groups) inEnum(g.kind, "group_kind", g.code);
const groupCodes = EX.receiver_groups.map((g) => g.code), accountCodes = [];
for (const r of EX.receivers) { must(groupCodes.includes(r.group), "receiver " + r.code + " unknown group"); inEnum(r.kind, "receiver_kind", r.code); must(r.kind !== "counterparty" || EX.receiver_groups.find((g) => g.code === r.group).kind === "client", r.code + " counterparty must be in a client group"); for (const e of r.entities) { must(e.accounts.length >= 1, e.code + " needs an account"); for (const a of e.accounts) accountCodes.push(a.code); } }
must(new Set(accountCodes).size === accountCodes.length, "duplicate account codes");
for (const s of EX.senders) { must(s.sendable_to.length >= 1, s.code + " needs an allow-list"); for (const g of s.sendable_to) { must(groupCodes.includes(g), s.code + " unknown group " + g); must(EX.receiver_groups.find((x) => x.code === g).kind !== "return", s.code + " may not target the return group"); } }
const partnerCodes = EX.partners.map((p) => p.code), pairCodes = EX.currency_pairs.map((c) => c.code);
for (const pc of EX.partner_configs) {
  must(partnerCodes.includes(pc.partner), pc.code + " unknown partner");
  for (const pp of pc.pairs) {
    must(pairCodes.includes(pp.currency_pair), pc.code + " unknown pair"); inEnum(pp.partner_pricing, "partner_pricing", pc.code);
    must((pp.partner_pricing === "market_plus_pct") === (pp.partner_markup_pct !== undefined), pc.code + " partner_markup_pct must be set exactly when pricing is market_plus_pct");
    const partner = EX.partners.find((p) => p.code === pc.partner);
    must((partner.disclosure_style === "market_plus") === (pp.partner_pricing === "market_plus_pct"), pc.code + " partner_pricing must match the partner's disclosure_style");
    must(pp.fee_structures.length >= 1, pc.code + " needs a fee structure");
    for (const fsr of pp.fee_structures) {
      inEnum(fsr.rate_basis, "rate_basis", pc.code); inEnum(fsr.mode, "mode", pc.code); inEnum(fsr.quoting_rate_policy, "quoting_rate_policy", pc.code);
      must(Math.abs(fsr.sender_share_pct + fsr.receiver_share_pct - fsr.pct) < 1e-12, pc.code + " shares must sum to pct");
      if (fsr.mode === "variable") must(fsr.floor_pct <= fsr.cap_pct, pc.code + " floor ≤ cap");
    }
  }
  must(pc.facilitating_entities.length >= 1, pc.code + " needs a facilitating entity");
  must(pc.settlement_sending_entities.length >= 1 && pc.settlement_rails.length >= 1, pc.code + " needs a narrative and a rail to pay out");
  for (const r of pc.registrations) { must(accountCodes.includes(r.account), pc.code + " registration for unknown account " + r.account); inEnum(r.approval_status, "approval_status", pc.code); }
}
// invariant 8 for a quote-first deal: each client group has an approved registration with every partner that may pay it
for (const pc of EX.partner_configs) for (const g of EX.receiver_groups.filter((g) => g.kind === "client")) {
  const accts = EX.receivers.filter((r) => r.group === g.code).flatMap((r) => r.entities.flatMap((e) => e.accounts.map((a) => a.code)));
  must(pc.registrations.some((r) => accts.includes(r.account) && r.approval_status === "approved"), `${pc.code}: group ${g.code} has no approved registration`);
}
if (errors.length) { console.error("EXAMPLE DOES NOT VALIDATE:\n" + errors.join("\n")); process.exit(1); }

// ------------------------------------------------------------------ YAML rendering of the example (hand-rolled, readable)
function yaml(v, indent = 0) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return " []";
    return "\n" + v.map((x) => (typeof x === "object" && x !== null ? pad + "- " + yaml(x, indent + 1).replace(/^\n\s*/, "").replace(/\n/g, "\n" + "  ") : pad + "- " + yaml(x, indent + 1).trim())).join("\n");
  }
  if (v && typeof v === "object") {
    return "\n" + Object.entries(v).map(([k, x]) => pad + k + ":" + (typeof x === "object" && x !== null && (Array.isArray(x) ? x.length : Object.keys(x).length) ? yaml(x, indent + 1) : " " + yaml(x, indent + 1).trim())).join("\n");
  }
  if (v === null) return " null";
  if (typeof v === "string") return " " + (/^[\w\-.…() ]+$/.test(v) && !/^\d/.test(v) ? v : JSON.stringify(v));
  return " " + String(v);
}
const yamlText = yaml(EX).trim();

// ------------------------------------------------------------------ html
const fieldTable = (n) => {
  const e = D.E[n], r = RULES[n];
  return `<h4 id="${n}">${esc(n)} <span class="scope">· ${esc(r.scope)}</span></h4>
<p class="desc">${esc(e.desc)}</p>
<table class="dd"><thead><tr><th style="width:26%">Field</th><th style="width:9%">Type</th><th style="width:9%">Required</th><th>Allowed values · default · meaning</th></tr></thead><tbody>
${e.f.filter((f) => f[0] !== "id").map((f) => {
  const req = r.req.includes(f[0]) ? "yes" : f[2] === "FK" ? "yes" : "no";
  const def = r.defaults && r.defaults[f[0]] !== undefined ? ` · default <b>${esc(String(r.defaults[f[0]]))}</b>` : "";
  return `<tr><td class="mono">${esc(f[0])}</td><td>${esc(f[1])}</td><td>${req}</td><td>${esc(f[3] ?? (f[2] === "FK" ? "reference" : ""))}${def}</td></tr>`;
}).join("")}
</tbody></table>
<ul class="rules">${r.rules.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
};

const tree = `<figure class="chart"><svg viewBox="0 0 760 420" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The configuration model: global master data, the project, its parties and groups, and one partner configuration block per partner">
<style>.b{fill:#fff;stroke:#2f5d9e;stroke-width:1.2}.g{fill:#f3f6fb;stroke:#2f5d9e;stroke-width:1.2}.gl{fill:#fff;stroke:#777;stroke-width:1.2;stroke-dasharray:3 2}.t{font:600 9.5px Helvetica,Arial,sans-serif;fill:#111}.s{font:8.3px Helvetica,Arial,sans-serif;fill:#444}.h{font:700 10px Helvetica,Arial,sans-serif;fill:#2f5d9e}.l{stroke:#2f5d9e;stroke-width:1.1;fill:none}</style>
<text x="20" y="22" class="h">Global master data (shared by all projects)</text>
<rect x="20" y="30" width="150" height="34" rx="6" class="gl"/><text x="95" y="51" text-anchor="middle" class="t">PARTNER</text>
<rect x="190" y="30" width="150" height="34" rx="6" class="gl"/><text x="265" y="51" text-anchor="middle" class="t">RATE_SOURCE</text>
<rect x="360" y="30" width="150" height="34" rx="6" class="gl"/><text x="435" y="51" text-anchor="middle" class="t">INTRODUCER</text>
<text x="20" y="100" class="h">One project = one client</text>
<rect x="20" y="108" width="720" height="296" rx="8" class="g"/>
<rect x="36" y="122" width="150" height="34" rx="6" class="b"/><text x="111" y="143" text-anchor="middle" class="t">PROJECT</text>
<rect x="36" y="172" width="150" height="30" rx="6" class="b"/><text x="111" y="191" text-anchor="middle" class="t">THRESHOLD</text>
<rect x="36" y="212" width="150" height="30" rx="6" class="b"/><text x="111" y="231" text-anchor="middle" class="t">CURRENCY_PAIR</text>
<text x="111" y="256" text-anchor="middle" class="s">→ PAIR_RATE_SOURCE (chain)</text>
<rect x="36" y="268" width="150" height="30" rx="6" class="b"/><text x="111" y="287" text-anchor="middle" class="t">OWN_WALLET</text>
<rect x="36" y="308" width="150" height="30" rx="6" class="b"/><text x="111" y="327" text-anchor="middle" class="t">SENDER</text>
<text x="111" y="352" text-anchor="middle" class="s">allow-list → groups</text>
<text x="111" y="364" text-anchor="middle" class="s">provenance · fee overrides</text>
<rect x="214" y="122" width="170" height="30" rx="6" class="b"/><text x="299" y="141" text-anchor="middle" class="t">RECEIVER_GROUP</text>
<text x="299" y="165" text-anchor="middle" class="s">one default · one return</text>
<rect x="214" y="178" width="170" height="30" rx="6" class="b"/><text x="299" y="197" text-anchor="middle" class="t">RECEIVER (kind)</text>
<rect x="214" y="222" width="170" height="30" rx="6" class="b"/><text x="299" y="241" text-anchor="middle" class="t">RECEIVING_ENTITY</text>
<rect x="214" y="266" width="170" height="30" rx="6" class="b"/><text x="299" y="285" text-anchor="middle" class="t">RECEIVING_ENTITY_ACCOUNT</text>
<text x="299" y="309" text-anchor="middle" class="s">currency × rail</text>
<rect x="214" y="330" width="170" height="30" rx="6" class="b"/><text x="299" y="349" text-anchor="middle" class="t">REFERRAL_RULE</text>
<path class="l" d="M299,152 V178 M299,208 V222 M299,252 V266"/>
<text x="420" y="134" class="h">Partner configuration block (one per partner used)</text>
<rect x="412" y="142" width="312" height="250" rx="6" class="b"/>
<rect x="424" y="152" width="140" height="28" rx="5" class="b"/><text x="494" y="170" text-anchor="middle" class="t">PARTNER_CONFIG</text>
<text x="430" y="200" class="s">PARTNER_PAIR → FEE_STRUCTURE (versioned)</text>
<text x="430" y="216" class="s">FACILITATING_ENTITY → WALLET (crypto-in)</text>
<text x="430" y="232" class="s">COLLECTION_RECEIVING_ENTITY (bank-in)</text>
<text x="430" y="248" class="s">SETTLEMENT_SENDING_ENTITY (narrative)</text>
<text x="430" y="264" class="s">SETTLEMENT_RAIL (bank / EMI that executes)</text>
<text x="430" y="280" class="s">SETTLEMENT_REGISTRATION → account (approval per partner)</text>
<text x="430" y="296" class="s">PARTNER_REBATE_RULE</text>
<text x="430" y="326" class="s">applicable_for_reroute puts the partner in the</text>
<text x="430" y="338" class="s">project's alternate set</text>
<text x="430" y="366" class="s">Deals reference the block: partner × pair, fee version,</text>
<text x="430" y="378" class="s">facilitating entity and registration are stamped on the leg.</text>
<path class="l" d="M186,139 H214 M186,139 H412 V152 M95,64 V108 M265,64 V108 M435,64 V108" stroke-dasharray="3 2"/>
</svg><figcaption>Figure 1 — The configuration model. Dashed boxes are global; everything inside the shaded area belongs to one project.</figcaption></figure>`;

const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;margin:0}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
h4{font:700 10pt Helvetica,Arial,sans-serif;margin:14pt 0 2pt;break-after:avoid}
h4 .scope{font-weight:400;color:#666;font-size:9pt}
p{margin:0 0 7pt} .desc{font-size:9.6pt;color:#333} ul,ol{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 3pt}
ul.rules{font-size:9.3pt;color:#333}
code,.mono{font:8.8pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;margin:4pt 0 6pt;font-size:9.2pt}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt;vertical-align:bottom}
td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top}
table.dd{font-size:8.8pt} table.dd td,table.dd th{padding:2pt 5pt}
tr{break-inside:avoid}
.title{text-align:center;margin-top:40mm}
.title .sub{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 10pt}
.title .org{margin:0 0 2pt} .title .date{margin:0 0 16pt}
.rule{border-top:2px solid #222;border-bottom:1px solid #222;height:2px;margin:10pt 0 14pt}
.pb{break-before:page}
figure.chart{margin:8pt 0 12pt;break-inside:avoid} figcaption{font:italic 9.5pt Georgia,serif;margin-top:3pt}
pre.yaml{font:8.3pt/1.35 Menlo,Consolas,monospace;background:#f7f7f7;border-left:3px solid #2f5d9e;padding:8pt 10pt;white-space:pre-wrap;margin:4pt 0 10pt}
.box{border:1px solid #2f5d9e;background:#f3f6fb;padding:6pt 9pt;margin:8pt 0;font-size:9.8pt}
.small{font-size:9pt;color:#444}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Configuration Schema Specification v1.0</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Deliverable 5 — Configuration Schema Specification · Draft v1.0</p><p class="org">New XP Technologies Limited</p><p class="date">7 October 2026 · Confidential</p></div>
<p><b>Status:</b> Built against ERD &amp; Data Model Draft v4.0, the Calculation Specification v1.0 and the Project Understanding v1.0 with NPL's review comments. It specifies every configuration entity (fields, allowed values, defaults, validation rules) in a project-agnostic way, and expresses one existing NPL project, the FRS "Client 1" USDT → EUR flow, end to end in that schema. The worked example was validated against the rules in this document by the script that produced it.<br>
<b>Audience:</b> NPL Finance and Management, who own configuration, and the New XP engineering team.</p>
<div class="rule"></div>

<h2>1 · How configuration is organised</h2>
<p>Three ideas carry the whole model. <b>A project is a client.</b> Everything a client needs sits under its project: settings, currency pairs, senders, receiver groups, and one partner configuration block per partner the client uses. <b>Parties are partner-independent.</b> Senders, receiver groups and receiving entities belong to the project, so the same Ayush → Raj flow can run through Ali today and Jeton tomorrow. <b>How a partner is used is a block.</b> Fees, vehicles, collection endpoints, narratives, rails, destination approvals and rebate terms for one partner in one project all hang off a single PARTNER_CONFIG.</p>
${tree}
<div class="box"><b>Change control.</b> Configuration is versioned: thresholds, fee structures and policies are new rows with an effective date, never edits. Finance proposes, Management approves (approver ≠ proposer), and every change is audited. Deals keep the versions they were priced on.</div>

<h2>2 · Global master data</h2>
${GLOBAL.map(fieldTable).join("")}

<h2 class="pb">3 · Project settings</h2>
${PROJECT_LEVEL.map(fieldTable).join("")}

<h2 class="pb">4 · Parties: senders, receiver groups, receivers, entities, accounts</h2>
${PARTIES.map(fieldTable).join("")}

<h2 class="pb">5 · The partner configuration block</h2>
${PARTNER_BLOCK.map(fieldTable).join("")}

<h2 class="pb">6 · Cross-entity rules the system enforces on save</h2>
<ol>
<li>Every project has exactly one default receiver group and at most one return group; both are created by the system.</li>
<li>A receiver is in exactly one group; a counterparty receiver is in a client group; a sender_return receiver is in the return group and names its sender; a partner_transit receiver names its partner configuration.</li>
<li>A sender's allow-list names groups of the same project and never the return group; a sender with no allow-list cannot be chosen on a deal.</li>
<li>Every receiving entity has at least one account; account rows are unique per entity, currency and rail.</li>
<li>A partner pair's currency pair belongs to the same project; partner_markup_pct is present exactly when partner_pricing is market_plus_pct, and partner_pricing agrees with the partner's disclosure_style.</li>
<li>A fee structure's sender and receiver shares add up to its pct; variable mode needs floor ≤ cap and a minimum margin; a new version is a new row with a later effective_from.</li>
<li>A partner configuration that will pay out needs at least one facilitating entity, one settlement sending entity (narrative) and one settlement rail.</li>
<li>A currency pair needs at least one rate source with a unique priority before it is usable.</li>
<li>A registration points at an account of a receiving entity in the same project; a quote-first deal for a group needs at least one approved registration with the chosen partner (invariant 8).</li>
<li>quote_freshness_min is shorter than quote_validity_min; grace_drift_pct and all percentages are stored as decimals.</li>
<li>applicable_for_reroute, exposure_ceiling, thresholds and fee structures are Management-approved changes.</li>
</ol>

<h2 class="pb">7 · Worked example: the FRS project, end to end</h2>
<p>The FRS describes one client flow: senders Ayush and Naveen pay USDT, partners Ali (through its PT vehicles) or Jeton convert to EUR, and receivers Sud (NewXP Entity, ReferScout Entity) and Raj (VoiceAIWrapper) are paid in euros. Below is that project expressed in the schema. Names, policies and the fee split come from NPL's documents; rates of fee, thresholds, addresses and reference numbers are <b>illustrative placeholders</b> to be replaced with NPL's values.</p>
<p>How to read it: one block per entity type, in the order of Sections 2 to 5. A code such as <code>DEFAULT</code> or <code>NEWXP-EUR-SEPA</code> is how one row refers to another; the system assigns the numeric ids.</p>
<pre class="yaml">${esc(yamlText)}</pre>

<h3>What each part does in one deal</h3>
<table><thead><tr><th style="width:30%">Step of the deal</th><th>Configuration it reads</th></tr></thead><tbody>
<tr><td>Ayush asks to send USDT for Raj</td><td>SENDER Ayush; his allow-list names the default group, so the deal is attributed to <code>DEFAULT</code>; Raj is a receiver in it.</td></tr>
<tr><td>Operations picks Ali for USDT → EUR</td><td>PARTNER_CONFIG CLIENT1-ALI, PARTNER_PAIR USDT-EUR (disclosed rate: Ali's margin is inside its rate), its current FEE_STRUCTURE: basis market (the FRS prices on Kraken), fixed 1.00 % (0.40 % sender, 0.60 % receiver). Jeton, the alternative, states market + 0.50 % instead.</td></tr>
<tr><td>Market rate</td><td>CURRENCY_PAIR USDT-EUR, source chain Kraken then CMC, 5 decimals; a snapshot older than 120 s is not used.</td></tr>
<tr><td>Quote clocks</td><td>PROJECT: freshness 5 min, validity 60 min, grace 15 min if drift ≤ 0.10 %; beyond grace the policy is re-quote.</td></tr>
<tr><td>Can the quote leave Inquiry?</td><td>SETTLEMENT_REGISTRATION: Raj's account VAI-EUR-SWIFT is approved with Ali, so yes. In the FRS project every destination is approved with both partners; a project where a registration is still pending_partner could not quote that group through that partner.</td></tr>
<tr><td>Where does Ayush pay?</td><td>FACILITATING_ENTITY PT-tour, its TRC-20 USDT WALLET. Provenance recorded against his COLLECTION_SENDING_ENTITY.</td></tr>
<tr><td>Conversion</td><td>Receiver fee taken at conversion (receiver_fee_timing); amounts truncated to whole euros (amount_rounding); variance tolerance 0.20 % (THRESHOLD rate_variation_rel).</td></tr>
<tr><td>Payout</td><td>DISBURSEMENT from Ali through SETTLEMENT_RAIL "Ali's EU bank / EMI" under the narrative "PT Global Inc" to VAI-EUR-SWIFT; whole euros; disburse_policy to_zero; expected bank fee 25 EUR, treatment carry_forward; Management approval above 50,000 EUR or for a third same-day slot.</td></tr>
<tr><td>If Ali is unavailable</td><td>REROUTE to Jeton (applicable_for_reroute = true) via the OWN_WALLET at Aquanow, custody limit 48 hours.</td></tr>
</tbody></table>

<h2>8 · Import and export format</h2>
<p>A project's configuration can be exchanged as the YAML or JSON document shown above: one file per project plus one for global master data. Codes are the keys; the system resolves them to ids on import and rejects the file with the list of broken rules from Section 6 rather than importing part of it. Exports carry the version and effective dates of every fee structure and threshold so a file is a faithful snapshot of what deals were priced on.</p>
<p class="small"><i>Draft v1.0 — for review with NPL. Illustrative values are marked as such in Section 7.</i></p>
</body></html>`;

const h = path.join(outDir, "NPLify-Configuration-Schema-v1.0.html"), p = path.join(outDir, "NPLify-Configuration-Schema-v1.0.pdf");
fs.writeFileSync(h, html);
fs.writeFileSync(path.join(outDir, "config-example-client1.json"), JSON.stringify(EX, null, 2));
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "· example validated, entities:", ALL.length);
