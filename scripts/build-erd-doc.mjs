// Build the ERD baseline document (HTML + PDF) from data/erd.v5.json.
//   node scripts/build-erd-doc.mjs            -> docs/NPLify-P0-ERD-v<version>.html and .pdf
// Diagrams are Mermaid erDiagrams rendered in headless Chrome (the v5.x document design); the PDF is
// printed with headless Chrome. Each diagram gets its own page, landscape or portrait by its aspect.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { D, erDiagram, renderSvgs, stubNote } from "./mermaid-diagrams.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const REVIEW = !!process.env.NPLIFY_REVIEW;                      // round-2 review marks: yellow = new, red strike = goes
const outDir = process.env.NPLIFY_OUT || path.join(root, "docs");
const mk = (t) => (REVIEW ? `<mark class="rev">${t}</mark>` : t);
const dl = (t) => (REVIEW ? `<del class="rev">${t}</del> ` : "");
// v6.1 (D58): what the review marks cover in the generated parts — new tables, changed fields, removed fields
const REV = { tables: new Set(["BANK_ACCOUNT_DETAILS", "BANK_DETAILS_TEMPLATE"]),
  fields: { RECEIVING_ENTITY_ACCOUNT: ["bank_account_details_id"], COLLECTION_RECEIVING_ENDPOINT: ["bank_account_details_id"], DESTINATION_APPROVAL: ["bank_account_details_id"], SETTLEMENT_RAIL: ["bank_account_details_id"], COLLECTION_SENDING_ENTITY: ["bank_account_details_id"] },
  removed: { RECEIVING_ENTITY_ACCOUNT: [["bank_details_ref", "string", "", "external store; when account_kind = bank"]], COLLECTION_RECEIVING_ENDPOINT: [["bank_details_ref", "string", "", "external store; when kind = bank"]], DESTINATION_APPROVAL: [["bank_details_ref", "string", "", "external store; bank account"]], SETTLEMENT_RAIL: [["bank_details_ref", "string", "", ""]], COLLECTION_SENDING_ENTITY: [["account_ref", "string", "", ""]] } };
const ADDED_TABLES = [
  ["CUSTOMER_APPROVAL", "deal", "Email OTP (CR-01, October 2026): one row per one-time code sent for a quote issue; the customer's approval of the order as a recorded, attributable step (Lifecycle 2e). The code is stored only as a hash; the decision is write-once.", [
    ["id", "int", "PK"], ["deal_group_id", "int", "FK", "the group whose quote is approved"], ["quote_package_id", "int", "FK", "the quote issue the code is bound to; a re-issue voids the row"], ["code_ref", "string", "", "short public reference printed in the email, for support"], ["code_hash", "string", "", "the one-time code, hashed; never the code itself"], ["approver_email", "string", "", "the address the email went to, as it was at issue; a change of the project's address voids the row"],
    ["issued_at", "timestamptz", ""], ["issued_by", "int", "FK", "USER (Operations)"], ["expires_at", "timestamptz", "", "issued_at + the project's code window"], ["stepup_required", "bool", "", "true at or above the step-up amount; the paste must then carry the amount"], ["amount_expected", "decimal", "", "the order amount the paste must match when stepup_required"], ["partial_destination", "string", "", "the partial identifier exactly as printed; empty for cash"], ["snapshot_ref", "string", "", "the stored email, content-addressed (write-once)"],
    ["status", "string", "", "issued / approved / rejected / expired / voided / locked"], ["attempts", "int", "", "failed validations; five lock the code"], ["decided_at", "timestamptz", "", "nullable"], ["decided_by", "int", "FK", "USER who entered the code or recorded the rejection"], ["evidence_ref", "string", "", "the chat screenshot from the registered group (write-once)"], ["reject_reason", "string", "", "verbatim, when rejected"], ["reject_channel", "string", "", "email_reply / chat"]]],
  ["CUSTOMER_APPROVAL_EVENT", "deal", "The trail under a customer approval: every send, delivery event, bounce, reply, validation attempt, lock, void and tripwire alert, with its time and, for inbound mail, the sender address and the text; insert-only.", [
    ["id", "int", "PK"], ["customer_approval_id", "int", "FK"], ["kind", "string", "", "sent / delivered / bounced / failed / reply / attempt / locked / voided / expired / tripwire"], ["at", "timestamptz", ""], ["actor_id", "int", "FK", "USER, nullable (system events)"], ["from_address", "string", "", "inbound mail only; matched against the registered address"], ["matched_approver", "bool", "", "inbound mail only"], ["body_ref", "string", "", "inbound text stored, content-addressed"], ["message_id", "string", "", "the email service's id for a send or a reply"]]],
];
const addedTable = ([name, , desc, fields]) => `<h4 id="dd-${name}">${mk(esc(name))}</h4><p class="small">${mk(esc(desc))}</p><table class="dd"><thead><tr><th>Field</th><th>Type</th><th>Key</th><th>Notes</th></tr></thead><tbody>${fields.map((f) => `<tr>${[esc(f[0]), esc(f[1]), esc(f[2] ?? ""), esc(f[3] ?? "")].map((c, i) => `<td${i === 0 || i === 2 ? ' class="mono"' : ""}>${c ? mk(c) : ""}</td>`).join("")}</tr>`).join("\n")}</tbody></table>`;
const revRow = (name, f) => REVIEW && (REV.tables.has(name) || (REV.fields[name] || []).includes(f[0]));
// round 2, 28 October 2026 (NPL): a wallet source keeps its network and address on COLLECTION_SENDING_ENTITY — columns for stage 2, shown here now
const ADDED = { PROJECT: [["email_otp_enabled", "bool", "", "default false; Email OTP, the customer's approval of each quote by email code (Lifecycle 2e); on only with an approved approver address and chat group"], ["email_otp_approver_email", "string", "", "nullable; exactly one registered approver address; protected master data: Operations enters, Finance approves, verified by a code before it is active (Roles rule 13)"], ["email_otp_chat_platform", "string", "", "nullable; the registered chat group's platform"], ["email_otp_chat_group_name", "string", "", "nullable; the registered chat group's name"], ["email_otp_chat_group_id", "string", "", "nullable; the group id where the platform gives one; the three chat columns change together, under the same approval"]],
  COLLECTION_SENDING_ENTITY: [["wallet_network", "string", "", "nullable; the network of a source wallet (TRC-20, ERC-20, …); set together with wallet_address"], ["wallet_address", "string", "", "nullable; the address the funds come from; a row carries a bank-details row or a wallet network + address, exactly one of the two; never a payout destination"]] };
const ADDED_DESC = { PROJECT: " Email OTP (CR-01, October 2026): the switch, the one approver address and the registered chat group live here; the three windows are THRESHOLD kinds email_otp_code_window_min, email_otp_stepup_amount and email_otp_tripwire_min.", DEAL_GROUP: " With Email OTP on, state Sent is shown as pending customer approval and Accepted as customer approved; the approval itself is the CUSTOMER_APPROVAL row of the current quote issue (Lifecycle 2e).", QUOTE_PACKAGE: " With Email OTP on, channel email: the issue is the approval email and carries the code; a re-issue voids the code.", COLLECTION_SENDING_ENTITY: " A wallet source is recorded as its network and address on this row (wallet_network, wallet_address) beside the label; a bank source is the BANK_ACCOUNT_DETAILS row; a row carries exactly one of the two (NPL, 28 October 2026)." };
fs.mkdirSync(outDir, { recursive: true });
const V = D.version;
const DATE = "22 October 2026";
const DATE56 = "9 October 2026";
const DATE52 = "8 October 2026";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const code = (s) => `<code>${esc(s)}</code>`;

import { DIAGRAMS, homeOf } from "./erd-diagram-defs.mjs";
import { hist, note, clientFacing } from "./client-facing.mjs";
for (const dg of DIAGRAMS) for (const n of dg.nodes) if (!D.E[n.replace("~", "")]) throw new Error(`unknown entity ${n} in diagram ${dg.id}`);
const drawn = new Set(DIAGRAMS.flatMap((dg) => dg.nodes.filter((n) => !n.startsWith("~"))));
const tables = Object.keys(D.E).filter((n) => D.E[n].d !== "view");
for (const n of tables) if (!drawn.has(n)) throw new Error(`table ${n} is drawn in no diagram`);

console.log("rendering diagrams …");
const svgs = renderSvgs(DIAGRAMS.map((dg) => ({ id: dg.id, text: erDiagram(dg.nodes, { direction: "TB", noSelf: dg.noSelf }), config: {} })), path.join(outDir, ".mermaid-work"));
const DG = Object.fromEntries(DIAGRAMS.map((dg) => [dg.id, dg]));
// v6.0: the seven diagrams are the redrawn figures of the design review (scripts/erd-figures-v6.0/<id>.svg, exported
// from the client pack's figure pass; boxes coloured by class, key fields only). The Mermaid diagrams are still rendered
// and used when a figure file is missing.
const figDir = path.join(here, "erd-figures-v6.0");
const figureSvg = (id) => { const f = path.join(figDir, `${id}.svg`); if (!fs.existsSync(f)) return null; const svg = fs.readFileSync(f, "utf8"); return REVIEW ? svg : svg.replace(/<g class="rev">[\s\S]*?<\/g>/g, ""); };
const diagramPage = (dg) => {
  const drawn = figureSvg(dg.id);
  const svg = drawn ?? svgs[dg.id];
  const m = drawn ? /viewBox="0 0 (\d+) (\d+)"/.exec(drawn) : /data-w="(\d+)" data-h="(\d+)"/.exec(svg);
  const land = m ? +m[1] / +m[2] >= 1.15 : true;
  return `<section class="diagram-page ${land ? "land" : "port"}">
<p class="dgnote"><b>Diagram ${esc(dg.id)}.</b> ${stubNote(dg.nodes, homeOf)}</p>
<figure>${svg}<figcaption>Diagram ${esc(dg.id)} — ${esc(dg.title)}</figcaption></figure>
</section>`;
};

// ------------------------------------------------------------------ text helpers
// Tables whose description is printed in the dictionary: the three tables new in v6.0 (the whole description) and
// the tables whose v6.0 change is a rule rather than a field (the "v6.0:" sentence of the description only).
const DICT_DESC = { EMERGENCY_ACTION: "all", PARTNER_STATEMENT_RECONCILIATION: "all", OPENING_ENTRY: "all", BANK_ACCOUNT_DETAILS: "all", BANK_DETAILS_TEMPLATE: "all", OWN_WALLET: "v6.0", REROUTE: "text" };
const DICT_TEXT = {
  REROUTE: `“Reroute is the only way partner or partner entity change after quote” now holds for a converted leg too; a post_conversion reroute leaves the leg's pricing stamp and client net untouched and moves only where the balance rests.`,
};
const dictDesc = (name) => {
  const mode = DICT_DESC[name];
  if (!mode) return "";
  if (mode === "text") return `<p class="small">${esc(DICT_TEXT[name])}</p>`;
  let t = String(D.E[name].desc ?? "");
  if (mode === "v6.0") { const i = t.indexOf("v6.0:"); if (i < 0) return ""; t = t.slice(i + 5).trim(); t = t[0].toUpperCase() + t.slice(1); }
  t = t.replace(/\bv6\.0\b[,:]?\s*/g, "").replace(/\s*,?\s*\bD5\d\b/g, "");
  const out = esc(hist(t.replace(/\bv6\.1:?\s*/g, "").replace(/\s*\(?D58\)?,?/g, "")));
  return `<p class="small">${REVIEW && REV.tables.has(name) ? mk(out) : out}${ADDED_DESC[name] ? mk(esc(ADDED_DESC[name])) : ""}</p>`;
};
const fieldTable = (name) => {
  const e = D.E[name];
  return `<h4 id="dd-${name}">${REVIEW && REV.tables.has(name) ? mk(esc(name)) : esc(name)}</h4>
${dictDesc(name)}<table class="dd"><thead><tr><th>Field</th><th>Type</th><th>Key</th><th>Notes</th></tr></thead><tbody>
${e.f.map((f) => `<tr>${[esc(f[0]), esc(f[1]), esc(f[2] ?? ""), esc(note(f[3] ?? ""))].map((c, i) => `<td${i === 0 || i === 2 ? ' class="mono"' : ""}>${revRow(name, f) ? mk(c) : c}</td>`).join("")}</tr>`).join("\n")}${REVIEW ? (REV.removed[name] || []).map((f) => `<tr>${[esc(f[0]), esc(f[1]), esc(f[2]), esc(f[3])].map((c, i) => `<td${i === 0 || i === 2 ? ' class="mono"' : ""}>${c ? dl(c) : ""}</td>`).join("")}</tr>`).join("\n") : ""}${(ADDED[name] || []).map((f) => `<tr>${[esc(f[0]), esc(f[1]), esc(f[2]), esc(f[3])].map((c, i) => `<td${i === 0 || i === 2 ? ' class="mono"' : ""}>${c ? mk(c) : ""}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>`;
};
const byDomain = (d) => Object.keys(D.E).filter((n) => D.E[n].d === d);
const views = byDomain("view");
const table = (head, rows, widths = []) => `<table><thead><tr>${head.map((h, i) => `<th${widths[i] ? ` style="width:${widths[i]}"` : ""}>${h}</th>`).join("")}</tr></thead><tbody>
${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>`;

const notes = {
  config: [
    `A <b>Client</b> is the commercial relationship NPL contracts with; a <b>Project</b> is one arrangement with it (D38) and owns its configuration. Counterparty receivers sit in <b>receiver groups</b>: every project has one default group and every counterparty receiver belongs to exactly one group. Entitlement is tracked per group, so payouts within a group are ordinary settlement and only payouts across groups are offsets; a project with a single group never has an offset.`,
    `A <b>Receiver</b> has a kind: ${code("counterparty")} for a client receiver; ${code("sender_return")} stands for a sender so refunds use the ordinary payout path and the partner's destination approval; ${code("partner_transit")} stands for a partner's collection endpoint so the hop of a two-leg route is an ordinary payout. ${code("sender_return")} and ${code("partner_transit")} receivers belong to no group (${code("group_id")} is null). They never appear on forward deals or allow lists — both validate kind = counterparty — and a payout to them is attributed to the group of the leg that pays them, so no entitlement moves between groups on a refund or a hop. Groups exist for entitlement and offset accounting; refund exclusion is a receiver-kind rule, not a group (D13).`,
    `A receiving entity holds one or more <b>accounts</b>, each with a currency and rail (EUR via SWIFT and EUR via SEPA are two accounts). An account is a bank account or a wallet (${code("account_kind")}): a bank account carries ${dl(code("bank_details_ref"))}${mk(code("bank_account_details_id"))} and a bank rail; a wallet carries ${code("network")} and ${code("address")} explicitly, mirroring the partner-side ${code("COLLECTION_RECEIVING_ENDPOINT")}, so addresses can be checksum-validated, checked against the rail, and found when the same address is registered with two partners. Destination approvals and settlement lines point at the account. ${dl(`No table stores actual bank details: ${code("bank_details_ref")} points at the external store.`)}${mk(`The bank details themselves are rows of ${code("BANK_ACCOUNT_DETAILS")}: a bank account carries ${code("bank_account_details_id")}, the current version of its details. A details row is never edited — a change is a new row that names the one it supersedes — so a settlement line released before the change still resolves to the details it was released against. The fields a rail needs (IBAN and BIC for SEPA; account or IBAN, BIC, bank address and intermediary for SWIFT; sort code and account number in the UK; bank code and account number on a local rail) come from ${code("BANK_DETAILS_TEMPLATE")}, which also carries the format rule each field is validated against on save. Only the evidence (bank letter, KYC, legal document) stays a file under the restricted prefix.`)}`,
    `Fees are per partner × pair (${code("FEE_STRUCTURE")} under ${code("PARTNER_PAIR")}), so choosing the partner is part of pricing. ${code("PARTNER.disclosure_style")} records whether the partner's markup is visible; ${code("partner_fee_pct")} is known only for fee_on_market partners.`,
    `A partner operates through one or more legal vehicles (${code("PARTNER_ENTITY")}: PT-tour, PT Global Inc); the deal stamps the vehicle at quote so paperwork names the right company. Each vehicle owns the endpoints a sender can pay into (${code("COLLECTION_RECEIVING_ENDPOINT")}): kind = bank with a currency and ${dl(code("bank_details_ref"))}${mk(code("bank_account_details_id"))}, or kind = wallet with ${code("network")} and ${code("address")}. The partner side therefore mirrors the client side — ${code("PARTNER_CONFIG")} → ${code("PARTNER_ENTITY")} → ${code("COLLECTION_RECEIVING_ENDPOINT")} as ${code("RECEIVER")} → ${code("RECEIVING_ENTITY")} → ${code("RECEIVING_ENTITY_ACCOUNT")} (D15). An endpoint also carries a nullable ${code("rail")}: a bank endpoint must have it before it becomes active, and a wallet may leave it null but must match ${code("network")} when it is set (D18); the endpoint's kind must match the leg's ${code("collection_method")} (D19). Cash-in has no endpoint record; the leg carries the city and the collection the token (D30). The collected cash amount is rounded by the pair's ${code("cash_rounding")} option — truncate, nearest or round up — to ${code("cash_rounding_unit")} (100 / 500 / 1,000 by currency), the same menu as payout rounding (D25).`,
    `Destination approval is per partner: ${code("DESTINATION_APPROVAL")} is an account of the project's receiving entity as registered with this partner, carrying the partner's approval status and the payout details the partner holds. Those details follow the account's kind: ${dl(code("bank_details_ref"))}${mk(code("bank_account_details_id") + " (the details as registered with this partner)")} for a bank account, ${code("network")} and ${code("address")} for a wallet (D16). ${code("SETTLEMENT_SENDING_ENTITY")} is the narrative on an outgoing transfer; ${code("SETTLEMENT_RAIL")} is the bank/EMI that executes it; neither holds money. ${code("COLLECTION_SENDING_ENTITY")} is provenance only and never a payout destination${mk(`; its source account, when known, is a ${code("BANK_ACCOUNT_DETAILS")} row too`)}.`,
    `${code("OWN_WALLET")} has a role: reroute contingency (AQN-LT-Sub at Aquanow), own desk, or a collection bridge on a network a partner lacks, forwarded to the partner as a hop within the wallet's custody limit (D40); ${code("PARTNER_CONFIG.applicable_for_reroute")} defines the alternate-partner set. ${code("PARTNER.supported_methods")} declares what a partner offers — cash and local deposits have no standing endpoint to read it from (D39). ${code("WALLET_REGISTRY")} lists every known address with its owner and role. Under an <b>own-desk</b> partner configuration (${code("is_own_desk")}, the NPL-GR game-reseller project) NPL itself is the converting party: its pairs are priced market plus NPL's markup and its collection endpoints are NPL's own wallets (${code("COLLECTION_RECEIVING_ENDPOINT.own_wallet_id")}); the custody view reports every such balance (D23).`,
    `<b>Fees.</b> A ${code("FEE_OVERRIDE")} may carry its own sender / receiver split instead of inheriting the structure's proportion (D20). ${code("FEE_TIER")} rows under a structure price by the project's calendar-month volume; a leg that takes the month past a threshold is split across two tiers (D21). ${code("customer_facing_fee_basis")} / ${code("customer_facing_fee_pct")} on the structure say what the customer's quote prints when it differs from the recorded parts; the printed "source rate" is derived at quote, never typed (D22). ${code("CURRENCY_PAIR.amount_rounding")} is a menu — truncate, nearest or round up, to the unit or to ${code("rounding_unit")} — and a pair may have the same currency on both sides (D25, D33).`,
    `<b>Who else earns on a deal.</b> ${code("MARKUP_SHARE_PARTY")} / ${code("MARKUP_SHARE_RULE")} record a share NPL pays — or, with basis ${code("share_of_net_markup")} and ${code("party_kind")} client_party, the customer who provides a sub-account and shares NPL's markup (Raeen): the base is the leg's fee parts less its partner cost, rebates excluded, several parties may hold rules with different shares, and ${code("settlement_mode")} party_retains means the party holds the converted money and pays NPL the remainder monthly (D26). ${code("PARTNER_REBATE_RULE")} records the rebate a partner pays NPL, with a basis (percentage of amount or of the partner's fee) and an optional scope by sender or fee structure; the rebate is NPL's alone and is reported as its own stream (D27).`,
    `<b>Project state and test twin.</b> A project is priced against only when it is active (Configuration Schema 1a: draft, validated, active); ${code("PROJECT.is_test")} flags the dummy twin project used for scripted test deals, ${dl("which the pre-copy filter of the cutover removes with every row that references it.")}${mk("which the clean-target extract of the cutover leaves behind together with every row that belongs to it: the dependency closure and the checks on the production image are in Appendix C.")} ${code("THRESHOLD")} rows also carry the time limits per approval stage (${code("approval_time_limit")}), the cutoff warnings (${code("cutoff_warning_min")}), the lock idle time (${code("lock_idle_minutes")}) and the three breach-rule values (${code("rate_min_observations")}, ${code("rate_fallback_spread_abs")}, ${code("rate_abs_tolerance")}).`,
    `<b>Cutoff, screening, single use.</b> ${code("PARTNER.bank_cutoff_time")} (the partner's own clock, beside its rate expiry and holiday calendar), its per-day changes in ${code("PARTNER_CUTOFF_OVERRIDE")} (an agreed extension or an early close) and ${code("PARTNER_PAIR.needs_bank_lock")} drive same-day or next-day conversion and, on bank rails, same-day or next-day settlement (D29). Cash legs carry their city (${code("DEAL.cash_location")}) and cash rate versions theirs (D30). ${code("WALLET_SCREENING")} records the screening of a sending or receiving wallet address, by Operations, and the endpoint's ${code("risk_band")} says which decisions may land on it (D31). An endpoint or a receiving-entity account may be ${code("single_use")}, reserved for one deal (ad hoc local deposit accounts, D32). ${code("HOLIDAY")} rows under the partner are the dates behind every "next business day" (D34); ${code("MESSAGE_TEMPLATE")} is the versioned wording of outgoing messages and declares the fields it may print — a quote template prints sender-facing figures only (D36).`,
  ],
  rates: [
    `The rate comparison for the day is created lazily by the first deal that needs it, one per partner × pair × date, and reused by every deal that day. A partner may give a new rate during the day, so one date can hold several versions. Rolling averages are built from confirmed versions only.`,
    `A version is breached when spread &gt; avg_2w × (1 + variance_threshold_rel); quoting and conversion on that partner × pair freeze until Finance approves with a reason, rejects, or asks for a better rate. Versions are never overwritten; every deal leg, conversion and balance conversion references its exact version.`,
    `Breach rules for thin or unusual history (Calculation Specification 2a): with fewer than ${code("rate_min_observations")} confirmed versions, or a zero or negative baseline, the fallback threshold ${code("rate_fallback_spread_abs")} applies; a spread beyond ${code("rate_abs_tolerance")} from the average in either direction is flagged for Finance. The three values are ${code("THRESHOLD")} rows of the project.`,
    `Cross-source slippage is a query over ${code("MARKET_RATE")} across sources for the same pair and window.`,
    `A version stores the rate <b>as the partner quoted it</b> (${code("quoted_rate")}, ${code("quoted_direction")}); ${code("rate")} is normalised to the pair's direction and derived — 1 ÷ quoted when the directions differ — so Ali's 1.1738 becomes 0.851934 without a hand inversion, and a direction slip is caught by the breach check (D28). Cash pairs are priced per ${code("location")}: INR cash in Delhi and in Mumbai are two versions on the same day (D30).`,
  ],
  deal: [
    mk(`<b>Email OTP (CR-01).</b> On a project with the feature on, a quote issue is an approval email with a one-time code, and the customer's acceptance is that code entered by Operations from the registered chat group: ${code("CUSTOMER_APPROVAL")} (one row per code; hash only; write-once decision; the email snapshot and the chat screenshot as evidence) and ${code("CUSTOMER_APPROVAL_EVENT")} (sends, deliveries, replies, attempts). The group's states are unchanged: Sent is pending customer approval, Accepted is customer approved. The settings sit on ${code("PROJECT")} (switch, approver address, registered chat group) and ${code("THRESHOLD")} (code window, step-up amount, tripwire window). The two tables are listed in Appendix B.3 and are stage-2 model items; the diagram of 3a is not redrawn in this round.`),
    `<b>Every deal belongs to a deal group.</b> ${code("DEAL_GROUP")} is the client-facing instruction: the pair as the sender sees it, the sender rate, fee, reference and entry mode. A plain single-partner deal is a group of one leg; a route that needs two partners (INR → USDT at Ali, USDT → EUR at Jeton) has two forward legs; a rejected payout is unwound with a return leg.`,
    `<b>Legs.</b> ${code("leg_type")} forward or return; ${code("funding_source")} collection, prior_leg (leg 2 of a route, no collection) or returned_settlement (a return leg). Priced once and partner fixed at quote hold per leg. Attribution is to the receiver group: set at quote on the first forward leg, inherited by leg n of a route from leg n−1 and by a return leg from its parent leg. The receiver is optional until settlement.`,
    `Two entry modes as before: collect-first legs are born in state Collected with priced_at = conversion time; quote-first legs carry sent / valid / grace timestamps and a late decision. An estimate-first mode gives an indicative figure and prices at conversion.`,
    `<b>Conversion has exactly one owner</b>: a deal leg or a ${code("BALANCE_CONVERSION")}. The receiver-side fee is taken at conversion. Amounts are rounded at conversion by the pair's option (D25); a dropped fraction (${code("rounding_residual")}, signed) stays client money in the balance and pays out when it reaches a unit, an amount added by rounding up is NPL's cost. NPL's margin is captured at conversion and is never again at risk from a return or a forward.`,
    `<b>Balance conversion</b> is NPL converting a client's held balance (5K SGD → USDT to fund a 15K USDT payout): Finance-initiated, Management-approved, no sender, receiver or collection, same rate machinery, markup by ${code("FEE_DECISION")}. It names the receiver group it serves; ${code("ENTITLEMENT_REATTRIBUTION")} moves that group's entitlement to the new currency, and any excess over the group's entitlement is booked as an approved offset.`,
    `<b>Reroute</b> is the only way partner or partner entity change after quote. Forwarding is forward_full or forward_and_recover_dues: NPL nets what the alternate partner owes it (${code("EARNINGS_RECEIVABLE")}) against the funds forwarded, within the outstanding receivable, with the partner's agreement recorded. Post-collection outcome is via the own wallet or a refund to the sender. A reroute after conversion (${code("phase")} post_conversion, NPL decision of 20 October 2026) starts from a leg in Converted: the converting partner converts the balance back to the collection currency (${code("return_conversion_id")}, a balance conversion owned by the reroute, no markup), pays it to NPL's own wallet, and NPL forwards it to the alternate partner, which converts at its own rate of the day (${code("second_conversion_id")}); the leg's client net is unchanged, the ${code("rate_difference")} is NPL's gain or cost (VAR_CONVERSION, Ledger Posting Design Pattern O), and Management's ratification (${code("ratified_by")}) is needed in addition to Finance's because NPL's wallet holds client money in the meantime. Own-wallet custody cases therefore become four.`,
    `One settlement model: ${code("SETTLEMENT")} drains one partner's holding into one or many ${code("SETTLEMENT_LINE")}s, rounded as the pair says. Under settlement_policy to_zero the balance after release is less than one unit; under hold_allowed the balance may rest at the partner within the project's exposure cap.`,
    `A settlement line records when it was released (${code("released_at")}), by when the rail should confirm it (${code("expected_confirmation_by")}) and when it ended (${code("confirmed_at")}), so the named state "sent, not yet confirmed" can be shown and aged (Lifecycle &amp; Approvals §7; Ledger Posting Design rule 13a). The promise is discharged on release; a return or a short delivery re-raises it.`,
    `A line paying a counterparty receiver whose group differs from the paying leg's attributed group is an offset, created by the same action, with Management approval and tighter aging. A line paying a sender_return or partner_transit receiver is never an offset: those receivers have no group, and the line debits the group of the leg it names in ${code("deal_id")} (D13, D17).`,
    `<b>Rejected payout.</b> When the receiving or intermediary bank rejects a transfer, ${code("SETTLEMENT_RETURN")} records the returned amount, bank fee and reason; the line's outcome becomes returned, a reversing ledger transaction puts the money back into the client's balance and the paying leg's group entitlement, and ${code("BANK_FEE_EVENT")} books the bounce fee. The money then stays in balance for later payouts, or funds a return leg — attributed to the same group — that converts back and pays the sender's return receiver.`,
    `<b>Fee decisions.</b> ${code("FEE_DECISION")} is a one-off, approved decision on a single subject: markup applied or waived on a return leg or balance conversion, a network-fee override on a refund, a bank-fee treatment override on one settlement. Standing rules stay in ${code("FEE_STRUCTURE")} and ${code("FEE_OVERRIDE")}.`,
    `${code("CONFIRMATION")} is full or short; a short confirmation opens a ${code("SHORTFALL")} topped up by a later settlement or an explicit separate payout — cash found short at hand-over included. Rounding differences no longer land here. ${code("MARKUP_SHARE_ACCRUAL")} and ${code("PARTNER_REBATE_ACCRUAL")} accrue per deal under their rules; a party_retains markup-share accrual is a receivable from the party, reconciled monthly like a rebate (D26); rebates are reconciled monthly against the partner's statement, which covers NPLify deals only (D27).`,
    `<b>Pricing stamps (v5.3).</b> A leg stamps the override and the base tier that priced it; a leg that crosses a tier threshold holds two ${code("DEAL_FEE_TIER")} portions and a blended fee (D20, D21). The deal group stamps the customer-facing fee and rate the quote printed (D22). On a pair that needs a bank lock the leg records ${code("rate_locked_at")} and ${code("conversion_due_date")}: locked before the partner's cutoff it converts the same day, otherwise the next business day at that day's version; the sender's figures are write-once, NPL absorbs the difference as a cutoff-timing variance, and a conversion whose next-day rate breaches the margin is deferred with a reason. The client balance view shows the locked leg's converted value as pending from the lock; a void removes it (D29). ${code("QUOTE_PACKAGE")} is the record of what was sent for a deal group — template version, channel, printed figures, ${code("sent_at")}, hash — one row per issue; a quote-first leg is Sent only when a package has sent_at, re-issues are new rows, a new price is a new deal group (D35).`,
    `<b>Invoices.</b> ${code("INVOICE")} is an obligation in its own currency — a vendor's EUR invoice a reseller customer pays in THB or USDT, in parts, over days. A deal group names the invoice it pays (advance, then balance); each payout line records how much of the obligation it discharged and the market snapshot used; ${code("INVOICE_BALANCE")} is the open remainder (D24).`,
    `<b>Cash and crypto parts.</b> A cash part carries the token (the local-currency bill whose serial identifies the agent), the agent's contact and the partner's count; the leg carries the city, which also selects the rate version (D30). A crypto part carries the sender's declared address and the screening that admitted it, unless the project skips up-front screening (D31).`,
    `<b>Loss events.</b> ${code("LOSS_EVENT")} records money lost after it was verified or released — a frozen local account, cash short that cannot be recovered, a wrong-chain transfer — on either side, by any method, for a partial or full amount, with the loss split across sender, NPL, partner and client. The whole loss is booked to NPL and the client made whole in one transaction (source LossEvent; MAKEGOOD / LOSS_PAYABLE when it cannot be funded at once); Management approves the split and each share is a separate ${code("LOSS_RECOVERY")} posting; the collection part stays verified and is reversed only when the deal is unwound (D32, D46).`,
  ],
  ledger: [
    `Client due balances are held as one account per project × partner × currency (CL.&lt;PARTNER&gt;.&lt;CCY&gt;.DUE); group entitlement is a view, not an account. ${code("holder_type")} never includes a settlement rail or narrative entity.`,
    `<b>Ownership moves between client and company only at the events invariant 16 names</b> — margin recognition at conversion, the two sides of an earnings offset, the forex true-ups of invoice lines, fees NPL absorbs or covers, top-ups, make-wholes, make-goods and the client's loss share — and every transaction balances per owner as well as per currency (D46). NPL never advances money to a receiver, and withholding on a reroute is not a separate event because the margin is always captured by whichever partner converts.`,
    `Recover dues on a reroute posts own-wallet cash against the earnings receivable at the partner: company money on both sides, no income.`,
    `Transaction sources: Collection, Conversion, BalanceConversion, Settlement, SettlementReturn, Confirmation, BankFeeEvent, Reroute, MarkupShare, Rebate, LossEvent, LossRecovery, Invoice, EarningsOffset, Adjustment (D46). Account purposes include PAYABLE, SHARE_PAYABLE, SHARE_RECEIVABLE, REBATE_RECEIVABLE, LOSS_RECEIVABLE, MAKEGOOD / LOSS_PAYABLE, EARN_GROSS, EARN_REBATE, the four VAR_ accounts, FX_RESULT, the reseller purposes (RESELL_REVENUE, RESELL_COST, VENDOR_PAYABLE, RESALE_RECEIVABLE, REMIT_CLAIM), EXP_ROUNDING and EXP_LOSS; ADVANCE and INTRANSIT do not exist. Cost components include share, rebate, rounding, fx_timing, cutoff_timing, loss and resale.`,
    `<b>Three streams NPL never mixes (v5.3).</b> Earnings on deals post to EARN_GROSS at conversion; a partner's rebate posts to EARN_REBATE and is never in the base a client party shares (D26, D27); NPL's remainder from a party that holds the converted funds sits in SHARE_RECEIVABLE until the party pays it. The cost of rounding up is EXP_ROUNDING (D25). A loss is booked to EXP_LOSS in full first and the client made whole; the partner's and the sender's agreed shares are LOSS_RECEIVABLE owed to NPL, the client's share is a partial reversal of the make-good, and what remains in EXP_LOSS is NPL's own share (D32, D46). Own-desk deals use the ordinary partner-coded accounts with the own-desk configuration as holder and EXP_PARTNER zero by construction (D23).`,
    `One system-settings area (D43, D44): ${code("SYSTEM_SETTING")} holds NPL-wide, Management-approved keys — the reporting currency, its staleness limit, the operating time zone; ${code("ROLE")} holds the user roles and ${code("ROLE_RIGHT")} what each may initiate and approve per controlled action, with the role added on escalation; platform-scope ${code("CURRENCY_PAIR")}s carry the conversion rates through the ordinary rate-source chain. ${code("REPORTING_VALUE")} converts any per-currency figure into the reporting currency at the latest market rate of its platform pair, as a display-only estimate that carries the rate it used (D43). ${code("APPROVAL")}, ${code("AUDIT_LOG")} and ${code("RECORD_LOCK")} are modelled once and apply to all master data. Approver ≠ initiator on every approval; Operations never sees derived economics. Approval actions include price_quote, extend_quote_validity, refund_to_third_party, cross_group_payout, balance_conversion, recover_dues, cover_bank_fee, raise_fee_cap, enable_own_desk, approve_loss_split, override_screening_reject and earnings_offset (ROLE_RIGHT rows, D44, D46). cross_group_payout never fires on a line paying a sender_return or partner_transit receiver. Wallet screening itself is an Operations action, not an approval (D31).`,
    `<b>Three tables of this edition.</b> ${code("OPENING_ENTRY")} is one row per opening balance entered on the opening date (Cutover Approach, Section 4; Ledger Posting Design, Pattern R), posted once, one transaction per row (source Opening): company-side balances against CO.NONE.&lt;CCY&gt;.OPENING_BALANCE, client-side balances between the client's jar and the project's promise, and OPENING_BALANCE is never posted to again. ${code("PARTNER_STATEMENT_RECONCILIATION")} is one row per partner configuration, currency and statement date (Pattern Q): a row for every business day of the parallel run and for every month end afterwards, a difference cleared only by a true-up transaction, never by an edit, and a row in state difference_open on the exception list. ${code("EMERGENCY_ACTION")} is the record behind the controlled action emergency_suspend (Lifecycle &amp; Approvals, section 5): applied by Finance, in effect at once, lifted unless Management ratifies it within one business day; ratified_by is never applied_by. ${code("LEDGER_TRANSACTION.corrects_period")} names the month a correction belongs to when it is posted in a later month (rule 11a).`,
    `<b>Controls on the person and the record version.</b> The approver is never the initiator <i>on the person</i>: ${code("USER.person_ref")} names the natural person behind every account, and ${code("APPROVAL.approved_by")} is refused when its person_ref equals requested_by's, so a user holding two accounts cannot approve their own request (Roles &amp; Visibility rule 5a). An approval is valid only for the record version the approver saw, so two approvers at once leave exactly one winner and a changed record is re-approved (Lifecycle &amp; Approvals 6a). At most one open lock per record: a ${code("RECORD_LOCK")} is released on save or cancel, expires after the project's lock idle time, or is cleared by Management, and every release is written to ${code("AUDIT_LOG")}. Rules at database level are listed in Appendix C: postings balance per currency and per owner; ledger and audit tables accept inserts only; every PAYABLE line carries its receiver group; the seven type-plus-id references are checked by one generic trigger; the approver's person_ref differs from the initiator's; versioned configuration is write-once.`,
  ],
};

const frsVocab = D.FRS_VOCAB;
const frsDev = D.FRS_DEV.map(([a, b, c]) => a.startsWith("Strict Client") ? [a, "RECEIVER_GROUP → RECEIVER → RECEIVING_ENTITY → account; SENDER with a group allow-list; FRS project = one default group", "Generalisation per NPL instruction"] : a.startsWith("One settlement per deal") ? [a, "Accumulate → settle the balance rounded as the pair says (residual carried), or hold within the exposure cap where the project allows", "Generalisation (D25)"] : a.startsWith("AQN-LT-Sub") ? [a, "OWN_WALLET at Aquanow; pass-through is a two-leg deal group or a reroute via the own wallet; also NPL-GR's own-desk collection endpoint", "Resolved (v4.0, D23)"] : [a, b, c]);

// ------------------------------------------------------------------ v6.0 additions: reading note, scope, classification, Appendices C and D
const READING_NOTE = `<h2 class="pb">How to read this pack</h2>
<p>Four map pages are now part of the pack as documents of their own, and are the place to start: the Top-Down Map (from the business, through the data model and the deal states, to the scenarios and the reading order), the Deal Flow on one page (Quote, Collect, Convert, Settle, with the roles and the money path), the Workflow Tree (8 classes, 27 sub-classes, 92 procedures, each naming who initiates, who approves, the codes it is written under and the records it touches) and the Workflow Tree on one page. Read them in that order, then this document. Every worked transaction (T), acceptance vector (L, B), walkthrough (W, X), flow (F) and procedure (C, A, D) has one identifier, listed in the Reading Companion's identifier register; the Test Strategy &amp; Coverage document says which test proves each procedure.</p>`;

const SCOPE_NOTE = `<p><b>Scope (NPL decision, 19 October 2026):</b> the whole model is in scope for Phase 1. Nothing among the ${tables.length} tables and ${views.length} views of this edition, including the tables added in it (${code("EMERGENCY_ACTION")}, ${code("PARTNER_STATEMENT_RECONCILIATION")}, ${code("OPENING_ENTRY")}), is deferred; the milestone estimates of the proposal stand.</p>`;

// Every table belongs to exactly one class; the build refuses a table left out or listed twice.
const CLASSES = [
  ["Configuration &amp; master data (dimensions)", ["CLIENT", "PARTNER", "HOLIDAY", "PARTNER_CUTOFF_OVERRIDE", "RATE_SOURCE", "MARKUP_SHARE_PARTY", "SYSTEM_SETTING", "MESSAGE_TEMPLATE", "PROJECT", "THRESHOLD", "CURRENCY_PAIR", "PAIR_RATE_SOURCE", "OWN_WALLET", "SENDER", "SENDER_RECEIVER_ALLOW", "COLLECTION_SENDING_ENTITY", "FEE_OVERRIDE", "RECEIVER_GROUP", "RECEIVER", "RECEIVING_ENTITY", "RECEIVING_ENTITY_ACCOUNT", "WALLET_SCREENING", "BANK_ACCOUNT_DETAILS", "BANK_DETAILS_TEMPLATE", "PARTNER_CONFIG", "PARTNER_PAIR", "FEE_STRUCTURE", "FEE_TIER", "PARTNER_ENTITY", "COLLECTION_RECEIVING_ENDPOINT", "SETTLEMENT_SENDING_ENTITY", "SETTLEMENT_RAIL", "DESTINATION_APPROVAL", "MARKUP_SHARE_RULE", "PARTNER_REBATE_RULE"]],
  ["Rate reference", ["MARKET_RATE", "RATE_COMPARISON", "PARTNER_RATE_VERSION"]],
  ["Transactional events (facts)", ["INVOICE", "DEAL_GROUP", "DEAL", "QUOTE_PACKAGE", "QUOTE_VALIDITY_EXTENSION", "SENDER_CREDIT", "DEAL_FEE_TIER", "COLLECTION", "CONVERSION", "REROUTE", "EARNINGS_RECEIVABLE", "BALANCE_CONVERSION", "ENTITLEMENT_REATTRIBUTION", "EARNINGS_OFFSET", "SETTLEMENT", "SETTLEMENT_LINE", "SETTLEMENT_RETURN", "CONFIRMATION", "SHORTFALL", "BANK_FEE_EVENT", "FEE_DECISION", "MARKUP_SHARE_ACCRUAL", "PARTNER_REBATE_ACCRUAL", "LOSS_EVENT", "LOSS_RECOVERY"]],
  ["Ledger &amp; control (facts of the books; governance)", ["LEDGER_TRANSACTION", "LEDGER_POSTING", "LEDGER_ACCOUNT", "OPENING_ENTRY", "PARTNER_STATEMENT_RECONCILIATION", "USER", "ROLE", "ROLE_RIGHT", "APPROVAL", "AUDIT_LOG", "RECORD_LOCK", "EMERGENCY_ACTION"]],
];
{
  const seen = new Map();
  for (const [cls, list] of CLASSES) for (const t of list) { if (!D.E[t] || D.E[t].d === "view") throw new Error(`classified ${t} is not a table`); if (seen.has(t)) throw new Error(`${t} classified twice`); seen.set(t, cls); }
  for (const t of tables) if (!seen.has(t)) throw new Error(`table ${t} has no class`);
}
const CLASSIFICATION = `<h2>Classification of the tables (fact and dimension)</h2>
<p>Pete asked which tables are the facts and which the dimensions. In this model there are five classes; every table belongs to exactly one, and the diagrams (1a to 4) colour each box by its class. Configuration and master data are the dimensions: rows that describe how the business is set up, versioned by effective date and never edited. Rate reference is a time series of reference values. Transactional events are the facts: one row per thing that happened to a deal. Ledger and control tables are the facts of the books and the records that govern them. Derived views are never stored.</p>
${table(["Class", "Tables", "Count"], [
  ...CLASSES.map(([cls, list]) => [cls, `<span class="mono">${list.map((t) => (REVIEW && REV.tables.has(t) ? mk(t) : t)).join(", ")}</span>`, String(list.length)]),
  ["Derived views (never stored)", `<span class="mono">${views.join(", ")}</span>`, `${views.length} views`],
], ["26%", "", "9%"])}
<p>${tables.length} tables and ${views.length} views. ${code("WALLET_SCREENING")} is configuration-domain data although Operations records it, because its decision binds later deals on the same address; ${code("PARTNER_RATE_VERSION")} is rate reference although Finance confirms it, because deals stamp it as a reference, not as an event of their own.</p>`;

const APPENDIX_C = `<h2 class="pb">Appendix C · Constraints and invariants, and where each is enforced</h2>
<p>Every rule stated in prose in this document, in the Configuration Schema (section 6) and in the Ledger Posting Design (section 2) is listed here with the mechanism that enforces it in the deployable schema. Four kinds: a unique key or foreign key, a CHECK on one row, a database trigger (for rules that span rows or tables), or an application validation in the API. The last column says which rules must be at database level, because a screen, a job or a mistake must not be able to get around them; the others are enforced by the API and verified by tests. Implemented in Phase 1 (M2) with the schema; the acceptance test for each is a write that breaks the rule and is refused.</p>
${table(["Rule", "Mechanism", "Database level", "Notes"], [
  ["Ledger and audit tables accept inserts only", "Privileges (no UPDATE or DELETE for the application role) and a BEFORE UPDATE OR DELETE trigger", "must", "Architecture note §3; LEDGER_ACCOUNT may only change status to closed"],
  ["Postings balance per currency and per ownership tag within a transaction", "Deferred constraint trigger at commit", "must", "Ledger Posting Design rule 2"],
  ["Every CL.PROJECT.&lt;CCY&gt;.PAYABLE line carries receiver_group_id", "Trigger on LEDGER_POSTING", "must", "GROUP_ENTITLEMENT is a sum over these"],
  ["A transaction names a source record of the stated source_type, and the record exists", "Generic type-plus-id trigger (below)", "must", "rule 1"],
  ["One transaction per event; a retried event posts nothing", "Unique key on the idempotency key of every money-moving action", "must", "rule 1a; Architecture note §5"],
  ["A CONVERSION has exactly one owner", "CHECK: exactly one of deal_id, balance_conversion_id is set", "must", ""],
  ["Approver is never the initiator, on the person", "Trigger on APPROVAL comparing USER.person_ref of approved_by and requested_by", "must", "Roles &amp; Visibility rule 5 and 5a"],
  ["Approval valid only for the record version seen", "Trigger comparing APPROVAL.record_version with the record's current version", "must", "Lifecycle &amp; Approvals 6a"],
  ["Versioned configuration is write-once", "Trigger refusing UPDATE on FEE_STRUCTURE, FEE_TIER, THRESHOLD, SYSTEM_SETTING, MESSAGE_TEMPLATE, PARTNER_RATE_VERSION, FEE_OVERRIDE except the status column", "must", "a new value is a new row with a later effective_from"],
  ["Pricing fields are write-once after priced_at", "Trigger on DEAL and DEAL_GROUP", "must", "Lifecycle &amp; Approvals §2"],
  ["Exactly one default receiver group per project", "Partial unique index on RECEIVER_GROUP(project_id) where is_default", "yes", "Configuration Schema rule 2"],
  ["Accounts unique per entity, currency and rail; endpoints unique per entity, currency, network or rail", "Unique keys", "yes", "rule 4"],
  ["A single-use account or endpoint serves one deal", "Unique key on reserved_for_deal_id where usage = single_use", "yes", ""],
  [mk("Bank details are write-once; a change is a new version"), mk("Trigger refusing UPDATE on BANK_ACCOUNT_DETAILS except the status column; supersedes_id names the replaced row"), mk("must"), mk("the version current at release stays what a settlement line resolves to")],
  [mk("A bank account, bank endpoint or settlement rail is active only with active bank details of the same rail"), mk("Trigger on status change checking the BANK_ACCOUNT_DETAILS row and its rail"), mk("yes"), mk("Configuration Schema rule 14")],
  [mk("rail_fields match the rail's template: required fields present, format rules pass (IBAN check digits, BIC length, sort-code pattern)"), mk("Application validation on save against BANK_DETAILS_TEMPLATE"), mk("no"), mk("Configuration Schema rule 14")],
  [mk("Every full read of a bank-details row is logged"), mk("Application: the read endpoint writes an AUDIT_LOG row (record_type BANK_ACCOUNT_DETAILS, field read, actor, time)"), mk("no"), mk("Roles &amp; Visibility rule 10")],
  ["One open lock per record", "Partial unique index on RECORD_LOCK(record_type, record_id) where released_at is null", "yes", "Lifecycle &amp; Approvals 6a"],
  ["One reconciliation per partner configuration, currency and statement date", "Unique key on PARTNER_STATEMENT_RECONCILIATION", "yes", ""],
  ["sender_pays_pct + receiver_pays_pct = pct; min_markup ≤ max_markup; a fixed customer-facing fee names its pct", "CHECK on FEE_STRUCTURE and FEE_OVERRIDE", "yes", "rule 6"],
  ["partner_fee_pct present exactly for fee_on_market", "CHECK on PARTNER_PAIR", "yes", "rule 5"],
  ["A bank endpoint is active only with a rail; a wallet's rail equals its network", "CHECK on COLLECTION_RECEIVING_ENDPOINT and RECEIVING_ENTITY_ACCOUNT", "yes", "rule 7"],
  ["A cutoff override is one-day or weekday, never both; an extension names the partner's agreement", "CHECK on PARTNER_CUTOFF_OVERRIDE", "yes", "rule 10"],
  ["quote_freshness_min &lt; quote_validity_min", "CHECK on PROJECT", "yes", "rule 11"],
  ["A project prices deals only when active", "Trigger on DEAL insert checking PROJECT.state", "yes", "Configuration Schema 1a"],
  ["Loss shares sum to the loss amount; a recovery never exceeds its share", "Trigger on LOSS_EVENT and LOSS_RECOVERY", "yes", ""],
  ["Σ DEAL_FEE_TIER portions = amount_in", "Trigger", "yes", ""],
  ["needs_bank_lock requires the partner's cutoff and time zone; a partner pair's currency pair belongs to the project; a wallet endpoint's network is one the partner offers", "Application validation on save, re-checked by the project validation report", "no", "cross-table rules of Configuration Schema §6; the validation report lists them"],
  ["Wallet addresses are checksum-valid per network", "Application validation", "no", ""],
  ["Σ markup shares of one base ≤ 100 %; tiers have one row at volume 0 and unique thresholds", "Application validation; unique key on FEE_TIER(fee_structure_id, min_monthly_volume)", "partly", ""],
  ["State transitions follow the state machines", "Application (every state change is a named action)", "no", "Architecture note §5; tested per transition"],
  ["Every reference to another table is a foreign key", "FOREIGN KEY on every column the dictionary marks FK", "yes", "Appendix B"],
  [mk("No row of the production image belongs to a test project, directly or through a type-plus-id reference"), mk("The post-extract scan over the dependency closure (below), run before the one commit of the load and after every restore"), mk("must"), mk("Cutover Approach §7; Test Strategy G-FILTER, G-RESTORE")],
  [mk("Zero orphan references after an extract or a restore: every FOREIGN KEY and every type-plus-id reference resolves"), mk("FOREIGN KEYs checked at the commit of the load (constraints deferred); the registry trigger's check re-run as a scan over the seven references"), mk("must"), mk("G-FILTER, G-RESTORE")],
  [mk("A type value is one the registry knows, the id exists in the table the registry maps it to, and a ledger source belongs to the transaction's project"), mk("TYPE_REGISTRY table read by the generic trigger; CHECK against the registry; for LEDGER_TRANSACTION the trigger also reads the source row's project through the registry's project column"), mk("must"), mk("option b, strengthened (below)")],
  [mk("Evidence references are write-once and content-addressed"), mk("Trigger refusing UPDATE of every evidence_ref and statement_ref column once set; the object key carries the file's SHA-256; bucket versioning with object lock (Architecture §3)"), mk("must"), mk("below; D-POLY11")],
  [mk("A leg on hold accepts no money-moving write"), mk("Trigger on CONVERSION, BALANCE_CONVERSION, SETTLEMENT_LINE, the reroute forward and the refund disposition checking DEAL.hold_kind"), mk("must"), mk("Lifecycle 2c; hold_kind and hold_ref added in stage 2")],
  [mk("One open external instruction per promise"), mk("Partial unique index on the promise (settlement line, balance) where ack_status is instructed, acknowledged or unknown"), mk("must"), mk("Lifecycle 2d; ack_status and instruction_ref added in stage 2")],
  [mk("A screening decision is write-once; a reject is lifted only by a new screening row"), mk("Trigger refusing UPDATE of WALLET_SCREENING.decision"), mk("must"), mk("Roles &amp; Visibility rule 11; Configuration Schema §4")],
  [mk("A flagged or breached rate version prices nothing"), mk("Trigger on DEAL and CONVERSION insert checking PARTNER_RATE_VERSION.status = usable"), mk("must"), mk("Calculation Specification 2a; Lifecycle Figure 3; status value flagged added in stage 2")],
  [mk("A dormant partner pair prices nothing and accepts no collection or settlement line"), mk("Trigger on DEAL, COLLECTION and SETTLEMENT_LINE insert checking PARTNER_PAIR.status"), mk("yes"), mk("Scenario Catalogue Part 1; status value dormant added in stage 2")],
  [mk("A sender's source is a bank-details row or a wallet network and address, exactly one of the two"), mk("CHECK on COLLECTION_SENDING_ENTITY: (bank_account_details_id IS NOT NULL) <> (wallet_network IS NOT NULL AND wallet_address IS NOT NULL), and wallet_network and wallet_address set together"), mk("must"), mk("Configuration Schema §4 COLLECTION_SENDING_ENTITY (NPL, 28 October 2026)")],
  [mk("Email OTP: one open code per quote issue"), mk("Partial unique index on CUSTOMER_APPROVAL(quote_package_id) where status = issued"), mk("must"), mk("Lifecycle 2e")],
  [mk("Email OTP: a code validates once; the decision is write-once"), mk("Trigger refusing UPDATE of status once approved / rejected / expired / voided / locked, and of decided_at, decided_by, evidence_ref, reject_reason"), mk("must"), mk("Lifecycle 2e; Roles rule 13")],
  [mk("Email OTP: no collection without the customer's approval of the current issue"), mk("Trigger on COLLECTION insert: when PROJECT.email_otp_enabled, an approved CUSTOMER_APPROVAL exists for the group's current (not superseded) quote issue"), mk("must"), mk("Lifecycle 2e; Test Strategy S-OTP")],
  [mk("Email OTP: a new issue or a change of approver address voids the open code"), mk("Trigger on QUOTE_PACKAGE insert (superseded_by set) and on PROJECT.email_otp_approver_email change: open rows of the old issue / address set to voided"), mk("must"), mk("Lifecycle 2e")],
  [mk("Email OTP settings are complete and approved before use, and never edited directly"), mk("CHECK: email_otp_enabled implies approver_email and the three chat columns set; the columns change only through the controlled action set_email_otp_settings with its APPROVAL (Finance); the API refuses send_email_otp while such an APPROVAL is pending"), mk("must"), mk("Configuration Schema rule 16; Roles rule 13")],
], ["30%", "34%", "10%", ""])}
<h3>Type-plus-id references: option b, one generic trigger</h3>
<p>NPL chose option b on 19 October: the type-plus-id references stay as they are and one generic database trigger checks, on insert and update, that the id exists in the table the type column names, and refuses the row otherwise. The trigger is applied to all seven such references: ${code("LEDGER_TRANSACTION")} (source_type, source_id), ${code("LEDGER_ACCOUNT")} (holder_type, holder_id), ${code("APPROVAL")} (subject_type, subject_id), ${code("AUDIT_LOG")} (record_type, record_id), ${code("RECORD_LOCK")} (record_type, record_id), ${code("FEE_DECISION")} (subject_type, subject_id) and ${code("EMERGENCY_ACTION")} (subject_type, subject_id); ${code("DEAL.funding_ref_id")} is checked against the table funding_source names in the same way. The trade-off accepted: the database cannot cascade or report these as foreign keys, so a referenced row can never be deleted (none of these tables deletes), ${dl("and the trigger must be kept in step when a type value is added.")}${mk("and a type value is added by a row in the TYPE_REGISTRY table the trigger reads (type value → table name → the column that carries the project, where one exists), never by editing the trigger; a value the registry does not know is refused.")} The acceptance test inserts a row whose id does not exist for each of the seven references and expects a refusal. The four discriminator-plus-column references (${code("WALLET_SCREENING.subject_kind")}, ${code("LOSS_EVENT.side")}, ${code("RECEIVER.kind")}, ${code("CONVERSION")}'s one owner) are ordinary foreign keys with a CHECK that exactly the right column is set.</p>
<h3>${mk("Critical sources: three checks, not one")}</h3>
<p>${mk("For the ledger (LEDGER_TRANSACTION.source_type, source_id) existence is not enough, because an id that happens to exist in another table would pass an existence check under the wrong type. Three checks apply to every ledger source, and the first two to the other six references: (1) the type value is in TYPE_REGISTRY; (2) the id exists in the table the registry maps the type to; (3) for a ledger source, the source row's project (read through the registry's project column: the deal's project for a Collection, Conversion or Settlement line, the balance conversion's, the reroute's, the opening entry's) equals the transaction's project, so a Settlement id of another project is refused as firmly as a missing one. The negative tests D-POLY8 to D-POLY10 insert, for each reference, an unknown type, an id that exists only in another table and a ledger source of another project, and expect a refusal from the database and from the API; a restore into a scratch instance re-runs the same three checks as a scan and reports every broken link (G-RESTORE).")}</p>
<h3>${mk("Immutable evidence references")}</h3>
<p>${mk("Six columns name a file: COLLECTION.evidence_ref, SETTLEMENT_LINE.evidence_ref, WALLET_SCREENING.evidence_ref, OPENING_ENTRY.evidence_ref, BANK_ACCOUNT_DETAILS.evidence_ref and PARTNER_STATEMENT_RECONCILIATION.statement_ref. Each is write-once (a trigger refuses an update once the value is set; a corrected document is a new row that names the old one, as everywhere in the model) and content-addressed: the object key carries the file's SHA-256, the bucket keeps every version with an object lock, and the application rejects an upload whose hash does not match the key it is stored under. A reference therefore resolves to exactly the bytes that were attached, or to nothing; it can never resolve to a changed file. The restore audit re-hashes every object the extracted rows name and reports a missing or altered one (D-POLY11, G-RESTORE).")}</p>
<h3>${mk("The extract closure and the clean-production image")}</h3>
<p>${mk("The Cutover Approach (Section 7) builds production from staging by extracting the real projects and everything that belongs to them, deleting nothing on staging. The reviewer asked for the closure to be published and for the integrity of the image to be checked by the database, not assumed. The closure is the dependency graph of Appendix B read from PROJECT outward, in five classes:")}</p>
${table([mk("Class"), mk("Tables"), mk("Rule in the extract")], [
  [mk("Roots"), mk("PROJECT where is_test is false; the CLIENT rows those projects belong to"), mk("Copied. A client with only test projects is not.")],
  [mk("Project-owned"), mk("The 17 tables with project_id and every table reached from them by foreign key: parties and allow-lists, receiving entities and accounts, the partner configuration block (pairs, entities, endpoints, sending entities, rails, destination approvals, fee structures, tiers, overrides, rebate and share rules), deal groups and legs, quote packages and extensions, collections, conversions, reroutes, balance conversions, credits, settlements and lines, returns, confirmations, shortfalls, bank-fee events, accruals, loss events and recoveries, earnings receivable and offsets, opening entries, screenings, bank account details, reconciliations"), mk("Copied when the path by foreign keys leads to a real project; never when it leads to a test project. A row with no path to any project is in the next class.")],
  [mk("Shared, copied whole"), mk("PARTNER, HOLIDAY, PARTNER_CUTOFF_OVERRIDE, RATE_SOURCE, MARKET_RATE, RATE_COMPARISON, PARTNER_RATE_VERSION, SYSTEM_SETTING, the global MESSAGE_TEMPLATE rows, BANK_DETAILS_TEMPLATE, MARKUP_SHARE_PARTY, the platform CURRENCY_PAIRs, ROLE, ROLE_RIGHT"), mk("Copied whole. USER is copied without the test accounts, which are a named list recorded in the extract's audit row.")],
  [mk("Type-plus-id tables"), mk("LEDGER_TRANSACTION with its LEDGER_POSTING rows, LEDGER_ACCOUNT, APPROVAL, AUDIT_LOG, RECORD_LOCK, FEE_DECISION, EMERGENCY_ACTION"), mk("A row is copied if and only if the record its type and id name is in the extract, resolved through TYPE_REGISTRY; an AUDIT_LOG row on a shared row is copied, one on a test record is not. The reviewer's example (an audit row for a test deal) is therefore excluded by construction, not by a filter on PROJECT.")],
  [mk("Files"), mk("The objects named by the extracted rows' evidence_ref and statement_ref columns"), mk("Copied by key, re-hashed on arrival; nothing else from the staging bucket.")],
], ["16%", "46%", ""])}
<p>${mk("<b>Ids are never renumbered.</b> Every table is copied with its ids, order and content unchanged, so a reference in production equals the same reference on staging and the two images can be compared row by row.")}</p>
<p>${mk("<b>The checks on the image</b>, run by the extract before its one commit and again after every restore from backup (Cutover 8a), are the automated scan the reviewer asks for: (1) every FOREIGN KEY resolves — the load runs with constraints deferred and commits once, so a dangling key fails the whole load; (2) every type-plus-id reference resolves through the registry, with the three checks above; (3) the closure inverted from the test projects reaches zero rows of the image; (4) the count per table equals staging's count of real-project rows, computed by the same closure on staging; (5) the ledger identities of the Ledger Posting Design (Section 20) hold and every balance per project, partner and currency equals staging's; (6) every evidence object is present and its SHA-256 equals its key; (7) the extract writes one AUDIT_LOG row in production (record_type Extract) naming the staging snapshot, the counts per table, the test accounts left out and the result of each check. Any check that fails leaves production empty (Cutover, rollback).")}</p>
<p>${mk("<b>Audit retention.</b> The production AUDIT_LOG and ledger accept inserts only and are never pruned. The audit rows of the test projects are not in production; they are in the staging snapshot, which is kept read-only as the record of the parallel run, test projects included, for the retention period NPL sets (a SYSTEM_SETTING; proposed: the same period as the ledger's). Nothing of the run is therefore lost: production holds the real projects' audit from their first staging entry, and the snapshot holds the rest.")}</p>`;

const APPENDIX_D = `<h2>Appendix D · Locking and indexes</h2>
<p>At ten deals a weekday the model is a few thousand rows a month, so locking is about correctness and indexes are about the few queries that scan: balances, reconciliation and search. Implemented in Phase 1 (M2); the concurrency tests of the go-live acceptance exercise the locks.</p>
${table(["Lock", "Taken when", "Effect"], [
  ["Row lock on the record of a controlled action", "For the duration of the action's database transaction (SELECT … FOR UPDATE on the DEAL, SETTLEMENT, CONVERSION or configuration row)", "Two users acting on the same record are serialised; the second sees the first's result and, if the state changed, is refused by the version check (6a)"],
  ["Lock on the APPROVAL row while it is approved or rejected", "During the approver's action", "Two approvers on one request: the first commit wins, the second is refused"],
  ["Lock on the project's month-volume row", "While a quote is priced", "Two quotes priced at once read the counter in order, so a tier split is computed on the true month-to-date figure (Calculation Specification 5a)"],
  ["Job lock row per job", "From the start to the end of a job run", "Two runs of a job never overlap (6a); a run that finds the lock held exits and is recorded as skipped"],
  ["Edit lock (RECORD_LOCK)", "While a person has a record open for editing", "Advisory, with expiry and clearance (6a); it prevents two people editing one record, not two transactions"],
], ["28%", "30%", ""])}
${table(["Index", "Serves"], [
  ["LEDGER_POSTING (ledger_account_id, ledger_transaction_id)", "every balance view, the ledger explorer"],
  ["LEDGER_TRANSACTION (source_type, source_id); (posted_at)", "tracing a posting to its event; reports by posting date"],
  ["LEDGER_POSTING (receiver_group_id) where not null", "GROUP_ENTITLEMENT"],
  ["DEAL (deal_group_id); DEAL (state, project_id); DEAL (priced_at)", "the per-role lists, the month-volume counter, reports by deal date"],
  ["COLLECTION (deal_id); SETTLEMENT_LINE (settlement_id); SETTLEMENT_LINE (outcome, expected_confirmation_by)", "deal screens; the sent-not-confirmed report and the exception list"],
  ["APPROVAL (state, subject_type, subject_id); APPROVAL (requested_by, state)", "the approvals queue; own requests"],
  ["AUDIT_LOG (record_type, record_id, at)", "the audit trail of a record"],
  ["PARTNER_RATE_VERSION (partner_pair_id, status, expires_at); MARKET_RATE (currency_pair_id, captured_at)", "pricing, the day's comparison, the two-week average"],
  ["PARTNER_STATEMENT_RECONCILIATION (partner_config_id, currency, statement_date) unique", "reconciliation history"],
  ["WALLET_SCREENING (network, address, screened_at)", "the decision that binds later deals on the same address"],
  ["USER (person_ref)", "the person-level approver check"],
].map(([a, b]) => [`<span class="mono">${a}</span>`, b]), ["55%", ""])}
<p>No other index is planned for P0; one is added when a query is measured to need it, never in advance.</p>`;

// ------------------------------------------------------------------ HTML
const RUN =`NPLify · P0 Technical Baseline · ERD &amp; Data Model · Draft v${V}`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify · P0 Technical Baseline — ERD & Data Model · Draft v${V}</title>
<style>
mark.rev{background:#ffe58a;color:inherit;padding:0 1px} del.rev{color:#b00020;text-decoration:line-through} .rev-note{background:#ffe58a;padding:3pt 6pt;font-size:9pt;margin:0 0 8pt}
@page { size: A4; margin: 16mm 18mm 16mm 18mm; @top-left { content: "${RUN.replace(/&amp;/g, "&")}"; font: 8pt Helvetica, Arial, sans-serif; color: #666 } @bottom-right { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
@page land { size: A4 landscape; margin: 12mm 12mm 10mm 12mm; }
html,body{margin:0;padding:0}
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111}
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
.diagram-page{break-before:page;break-after:page;display:flex;flex-direction:column}
.diagram-page.land{page:land;height:185mm}
.diagram-page.port{height:262mm}
.diagram-page .dgnote{font-size:9.2pt;margin:0 0 3mm;flex:0 0 auto}
.diagram-page figure{margin:0;flex:1;min-height:0;display:flex;flex-direction:column}
.diagram-page figure svg{flex:1;min-height:0;width:100%;height:100%}
.diagram-page figcaption{font:italic 10pt Georgia,serif;text-align:center;margin-top:2mm;flex:0 0 auto}
.small{font-size:9pt;color:#444}
</style></head><body>

<div class="title">
<h1>NPLify · P0 Technical Baseline</h1>
<p class="sub">Entity-Relationship Diagram &amp; Data Model · Draft v${V}</p>
<p class="org">New XP Technologies Limited</p>
<p class="date">${DATE} · Confidential</p>
</div>

${REVIEW ? `<p class="rev-note"><b>Round-2 review draft, 28 October 2026 (Email OTP, the reviewer's change request CR-01, and the sender wallet of 28 October, added to the draft of 27 October: findings 12.1 and 12.2 of the v6.0 design review; the Appendix C rows carried from documents 5 to 9; and the bank account details of 26 October).</b> Yellow = text, fields and tables added or replaced; red strike = what goes. Nothing else has changed.</p>` : ""}
${READING_NOTE}
<h2>Conventions</h2>
<p><b>Convention:</b> all monetary amounts are stored as exact decimals; every table carries ${code("created_at")} / ${code("created_by")}; audit, approvals and locking are modelled once (domain 4) and apply to all master data. Derived figures (client balance, group entitlement, offsets, custody) are <b>views over postings and deals — never stored</b>.</p>
<p>Seven diagrams across four domains, one schema: ${tables.length} tables and ${views.length} views. In each diagram, boxes show the key fields only (full attributes in Appendix B) and are coloured by class — configuration and master data, rate reference, transactional event, ledger and control, derived view; a dashed box is a table drawn in another diagram and names it. Relationship lines run from the referenced row to the row that stores the foreign key; a dashed line is a reference or a polymorphic link resolved by a type column plus an id. The deal lifecycle has three diagrams: 3a is the deal and its collection, 3b the conversion and its exceptions, 3c the settlement. Appendix A reconciles the model with the FRS; Appendix B is the data dictionary.</p>
<div class="rule"></div>
${SCOPE_NOTE}
${CLASSIFICATION}

<h2>1 · Configuration domain</h2>
<p>A <b>Client</b> is the commercial relationship NPL contracts with; a <b>Project</b> is one arrangement with it (D38) and owns its configuration. Partners are global counterparties; how a partner is used <i>in this project</i> is the <b>partner configuration</b> block — fees, vehicles, endpoints, destination approvals and rebate terms hang off it. Counterparty receivers are organised in <b>receiver groups</b>, the unit entitlement is tracked on, and each receiving entity holds one or more <b>accounts</b> with a currency and rail.</p>
${diagramPage(DG["1a"])}
${diagramPage(DG["1b"])}
<h3>Notes</h3><ul>${notes.config.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>2 · Rates domain</h2>
${diagramPage(DG["2"])}
<h3>Notes</h3><ul>${notes.rates.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>3 · Deal lifecycle domain</h2>
<h3>3a · Deal group, legs, pricing stamps, invoice, collection</h3>
${diagramPage(DG["3a"])}
<h3>3b · Conversion, reroute, earnings receivable, balance conversion, entitlement re-attribution</h3>
${diagramPage(DG["3b"])}
<h3>3c · Settlement, return, confirmation, fees, shares, rebates, loss events and recoveries</h3>
${diagramPage(DG["3c"])}
<h3>Derived views (never stored)</h3>
${table(["View", "Definition"], views.map((v) => [`<span class="mono">${esc(v)}(${D.E[v].f.map((f) => f[0]).join(", ")})</span>`, esc(hist(D.E[v].desc))]), ["34%"])}
<h3>Notes</h3><ul>${notes.deal.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2>4 · Ledger &amp; controls domain</h2>
${diagramPage(DG["4"])}
<h3>Notes</h3><ul>${notes.ledger.map((n) => `<li>${n}</li>`).join("")}</ul>

<h2 class="pb">Appendix A · FRS reconciliation</h2>
<h3>A.1 Vocabulary</h3>
${table(["FRS term", "Model entity"], frsVocab.map(([a, b]) => [esc(a), `<span class="mono">${esc(note(b))}</span>`]), ["30%"])}
<h3>A.2 Deviations from the FRS (classified)</h3>
${table(["FRS statement", "Model", "Classification"], frsDev.map(([a, b, c]) => [esc(a), esc(note(b)), esc(note(c))]), ["28%", "", "24%"])}
<h2 class="pb">Appendix B · Data dictionary (field annotations)</h2>
<p class="small">Every table also carries ${code("created_at")} and ${code("created_by")}. Types: int, string, bool, decimal, datetime, date.</p>
<h3>B.1 Configuration</h3>${byDomain("config").map(fieldTable).join("")}
<h3>B.2 Rates</h3>${byDomain("rates").map(fieldTable).join("")}
<h3>B.3 Deal, collection, conversion, reroute, balance conversion</h3>${byDomain("deal").map(fieldTable).join("")}${ADDED_TABLES.map(addedTable).join("")}
<h3>B.4 Settlement, return, confirmation, fees, shares, rebates, losses and recoveries</h3>${byDomain("settle").map(fieldTable).join("")}
<h3>B.5 Ledger &amp; controls</h3>${byDomain("ledger").map(fieldTable).join("")}
${APPENDIX_C}
${APPENDIX_D}
</body></html>`;

const base = REVIEW ? "NPLify-P0-ERD-review" : `NPLify-P0-ERD-v${V}`;
const htmlPath = path.join(outDir, `${base}.html`);
// The client-facing pass knows the v1–v5 edition tokens; this edition's own token and draft marker are removed here.
const thisEdition = (s) => s.replace(/\s*[·—–-]\s*Draft v6\.0\b/g, "").replace(/\bDraft v6\.0\b/g, "").replace(/\(v6\.0,\s*/g, "(").replace(/\bv6\.0[,:]?\s*/g, "").replace(/\(scope:\s*/g, "(");
fs.writeFileSync(htmlPath, thisEdition(clientFacing(html)));
const pdfPath = path.join(outDir, `${base}.pdf`);
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, "file://" + htmlPath], { stdio: "ignore" });
fs.rmSync(path.join(outDir, ".mermaid-work"), { recursive: true, force: true });
console.log("wrote", htmlPath, "and", pdfPath, `(${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB)`);
