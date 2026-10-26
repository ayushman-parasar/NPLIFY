// Build docs/NPLify-Configuration-Schema-v5.9.{html,pdf}: the project-agnostic configuration model —
// every entity of the configuration domain of data/erd.v5.json (fields, allowed values, defaults, validation
// rules) — with one existing NPL project (the FRS "Client 1" USDT → EUR flow) expressed end to end as a
// worked example that this script validates against the rules before it renders. The build refuses if a
// configuration-domain entity is not covered.                               node scripts/build-config-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hist, note, clientFacing } from "./client-facing.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));
const REVIEW = !!process.env.NPLIFY_REVIEW;                      // round-2 review marks: yellow = new, red strike = goes
const outDir = process.env.NPLIFY_OUT || path.join(root, "docs");
const mk = (t) => (REVIEW ? `<mark class="rev">${t}</mark>` : t);
const dl = (t) => (REVIEW ? `<del class="rev">${t}</del> ` : "");
const REV = { tables: new Set(["BANK_ACCOUNT_DETAILS", "BANK_DETAILS_TEMPLATE"]), fields: new Set(["bank_account_details_id"]), removed: { RECEIVING_ENTITY_ACCOUNT: "bank_details_ref", COLLECTION_RECEIVING_ENDPOINT: "bank_details_ref", DESTINATION_APPROVAL: "bank_details_ref", SETTLEMENT_RAIL: "bank_details_ref", COLLECTION_SENDING_ENTITY: "account_ref" } };
fs.mkdirSync(outDir, { recursive: true });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// v6.0: the figure drawn for the design review (scripts/figures-v6.0/<name>.svg, exported from the client pack's figure pass)
const figDir = path.join(here, "figures-v6.0");
const figSvg = (name) => fs.readFileSync(path.join(figDir, `${name}.svg`), "utf8");
const V = D.version, DATE = "22 October 2026";

// ------------------------------------------------------------------ schema: entities of the configuration domain, in reading order
const GLOBAL = ["CLIENT", "PARTNER", "HOLIDAY", "PARTNER_CUTOFF_OVERRIDE", "RATE_SOURCE", "MARKUP_SHARE_PARTY", "SYSTEM_SETTING", "MESSAGE_TEMPLATE", "BANK_DETAILS_TEMPLATE"];
const PROJECT_LEVEL = ["PROJECT", "THRESHOLD", "CURRENCY_PAIR", "PAIR_RATE_SOURCE", "OWN_WALLET"];
const PARTIES = ["SENDER", "SENDER_RECEIVER_ALLOW", "COLLECTION_SENDING_ENTITY", "FEE_OVERRIDE", "RECEIVER_GROUP", "RECEIVER", "RECEIVING_ENTITY", "RECEIVING_ENTITY_ACCOUNT", "BANK_ACCOUNT_DETAILS", "WALLET_SCREENING"];
const PARTNER_BLOCK = ["PARTNER_CONFIG", "PARTNER_PAIR", "FEE_STRUCTURE", "FEE_TIER", "PARTNER_ENTITY", "COLLECTION_RECEIVING_ENDPOINT", "SETTLEMENT_SENDING_ENTITY", "SETTLEMENT_RAIL", "DESTINATION_APPROVAL", "MARKUP_SHARE_RULE", "PARTNER_REBATE_RULE"];
const ALL = [...GLOBAL, ...PROJECT_LEVEL, ...PARTIES, ...PARTNER_BLOCK];
for (const n of ALL) if (!D.E[n]) throw new Error("missing entity " + n);
for (const n of Object.keys(D.E)) if (D.E[n].d === "config" && !ALL.includes(n)) throw new Error("config entity not covered: " + n);
if (new Set(ALL).size !== ALL.length) throw new Error("duplicate entity in reading order");

// Rules per entity: required fields, defaults, allowed values beyond the data dictionary, and validation.
const RULES = {
  CLIENT: { scope: "Global", req: ["name", "status"], rules: ["The commercial relationship NPL contracts with and reports on (D38). A client has one or more projects: BF, BF Sub and BF Withdrawal are three arrangements with one client.", "exposure_ceiling, when set, caps the sum of what rests at partners across the client's projects; it is stated in the reporting currency and compared through REPORTING_VALUE (D43).", "Client-level figures (CLIENT_POSITION) are roll-ups over the client's projects, never stored."] },
  PARTNER: { scope: "Global", req: ["name", "disclosure_style", "supported_methods", "status"], rules: ["A partner is set up once and reused by any project through a PARTNER_CONFIG.", "disclosure_style says where the partner's fee sits: fee_in_rate (inside its rate — Ali) or fee_on_market (stated on top of market — Jeton) (D37).", "supported_methods lists the collection and settlement methods the partner offers (crypto / bank / cash / local_deposit); networks are implied by its vehicles' wallet endpoints (D39).", "bank_cutoff_time with cutoff_timezone is the partner's standing daily bank cutoff; empty for a partner whose channel binds nothing (Jeton, Aquanow). It is required if any of the partner's pairs has needs_bank_lock (D29).", "holiday_calendar names the source calendar; the dates are HOLIDAY rows (D34)."] },
  HOLIDAY: { scope: "Per partner", req: ["partner_id", "date", "scope"], defaults: { scope: "bank_channel" }, rules: ["One row per non-business day of the partner's banking channel; conversion_due_date and execution_due_date skip these dates and weekends in the partner's cutoff_timezone (D34).", "scope bank_channel leaves crypto pairs unaffected; scope partner closes the partner altogether."] },
  PARTNER_CUTOFF_OVERRIDE: { scope: "Per partner", req: ["partner_id", "cutoff_time", "kind", "reason", "recorded_by"], rules: ["Exactly one of applies_on (a one-day override) and weekday (a recurring rule, e.g. Friday) is set.", "The effective cutoff for a day is the one-day override if any, else the weekday rule, else PARTNER.bank_cutoff_time (D29).", "kind extension needs partner_agreement_ref; Finance records it, no approval (an audited step)."] },
  RATE_SOURCE: { scope: "Global", req: ["code", "staleness_threshold_s"], rules: ["A snapshot older than staleness_threshold_s is not used for pricing; the next source in the pair's chain is tried; with every source down a manual rate needs Finance approval with evidence."] },
  MARKUP_SHARE_PARTY: { scope: "Global", req: ["name", "status"], rules: ["A party who shares NPL's markup: an external party who brought in a client, or a customer who provides sub-accounts (D26). How it is paid on a project is MARKUP_SHARE_RULE."] },
  SYSTEM_SETTING: { scope: "Global, versioned", req: ["key", "value", "effective_from", "approved_by"], rules: ["Keys today: reporting_currency, reporting_rate_max_age_min, operating_timezone (D43). A new value is a new row with a later effective_from, approved by Management.", "The reporting rate source is not a key: it is the PAIR_RATE_SOURCE chain of the platform-scope CURRENCY_PAIR (currency → reporting currency) (D44).", "Nothing here changes a price, a posting or a settlement."] },
  MESSAGE_TEMPLATE: { scope: "Global default, or per project", req: ["code", "version", "channel", "language", "body_ref", "printed_fields", "effective_from", "approved_by", "status"], rules: ["project_id null is the global default; a project row with the same code overrides it (D36).", "printed_fields lists the model fields the template may print. A template of code quote may print only sender-facing figures (sender rate, customer-facing fee and rate, amount out, validity) — never a partner rate, a margin or a cost; the save is refused otherwise.", "A new version is a new row approved by Management; the version a package was rendered with is recorded on QUOTE_PACKAGE."] },
  PROJECT: { scope: "Per client", req: ["client_id", "name", "quote_freshness_min", "quote_validity_min", "grace_min", "grace_drift_pct", "late_collection_policy", "bank_fee_treatment_default", "receiver_fee_timing", "network_fee_policy", "settlement_policy", "shortfall_tolerance", "status"], defaults: { receiver_fee_timing: "at_conversion", settlement_policy: "to_zero", shortfall_tolerance: 0 }, rules: ["One arrangement with a client; several projects may belong to one CLIENT (D38). Everything the arrangement needs sits under it.", "quote_freshness_min < quote_validity_min; grace_min and grace_drift_pct govern the grace decision after validity (D45 adds extensions before validity ends).", "network_fee_policy is the project default; a one-off override is a FEE_DECISION. When a network fee applies it is stated in USDT; when it does not, nothing posts (D46).", "exposure_ceiling caps the balance resting at a partner (settlement_policy hold_allowed); the client-level cap is on CLIENT."],
    // state and is_test (design review): printed after status, in this order, with the configuration wording
    hide: ["state", "is_test"],   // both are in the model since v6.0; printed below with the configuration wording
    extraRows: [
      ["state", "string", "yes", "draft / validated / active · default draft. Only an active project can price a deal; validated means every rule of Section 6 passes for the project and each of its partner configuration blocks; Management activates (see “Project states” in section 1)"],
      ["is_test", "bool", "yes", "default false. A dummy twin project set up from the same archetype as a real project, used only for scripted test deals on staging (Cutover Approach, Section 3); every row that belongs to it is removed by the pre-copy filter before production is loaded, and its figures are excluded from every count and balance shown to NPL"],
    ] },
  THRESHOLD: { scope: "Per project", req: ["kind", "value", "escalation"], rules: ["One row per kind and currency; currency may be blank for kinds that are not amounts (daily_slots, rate_variation_rel).", "escalation names who decides when the threshold is crossed: finance or management; the escalation adds the approval, it never replaces the first.", "settlement_limit also bounds the balance held at a partner under settlement_policy hold_allowed."],
    override: { kind: (t) => t.replace(/\.?\s*$/, "") + " / rate_min_observations / rate_fallback_spread_abs / rate_abs_tolerance / approval_time_limit / cutoff_warning_min / lock_idle_minutes (the six added kinds are described below)" },
    after: `<p>Six further THRESHOLD kinds (added in the design review), used by the breach rules of the Calculation Specification (section 2a); NPL Finance sets the values, Management approves them like any threshold.</p>
<table class="dd"><thead><tr><th style="width:20%">kind</th><th style="width:8%">currency</th><th style="width:16%">value</th><th style="width:13%">escalation</th><th>meaning</th></tr></thead><tbody>
${[["rate_min_observations", "—", "count (e.g. 10)", "finance", "fewer confirmed rate versions than this in the two-week window → the two-week average is not used; the fallback threshold applies"],
   ["rate_fallback_spread_abs", "—", "fraction (e.g. 0.015)", "finance", "the absolute spread above which a rate version breaches when the two-week average is unavailable or unusable (zero or negative)"],
   ["rate_abs_tolerance", "—", "fraction (e.g. 0.005)", "finance", "a spread further than this from the two-week average, in either direction, is flagged for Finance to verify before use; nothing freezes"],
   ["approval_time_limit", "—", "minutes", "finance / management", "one row per stage, the stage named in condition_expr (collection_verification, rate_confirmation, conversion_approval, settlement_approval, execution_confirmation, eod_reconciliation): after this many minutes a pending item of that stage is overdue and appears on the escalation role's list (Lifecycle & Approvals, 8a)"],
   ["cutoff_warning_min", "—", "minutes (e.g. 60; a second row 30)", "finance / management", "a warning is raised this many minutes before a partner's cutoff for any item still pending against it"],
   ["lock_idle_minutes", "—", "minutes (default 15)", "management", "a RECORD_LOCK not touched for this long expires on its own; Management may clear one earlier (Lifecycle & Approvals, 6a)"]]
  .map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="mono"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}
</tbody></table>` },
  BANK_DETAILS_TEMPLATE: { scope: "Platform, per rail", req: ["rail", "position", "field_key", "label", "required", "effective_from", "status"], defaults: { required: true, status: "active" }, rules: [
    "One row per rail × field, in display order. The starting templates: SWIFT — account number or IBAN, BIC, bank name and address, intermediary bank (optional); SEPA — IBAN, BIC; UK Faster Payments — sort code, account number; a local rail — bank code, account number.",
    "format_rule names the check applied on save: iban_check_digits, bic_length (8 or 11), uk_sort_code (6 digits), digits(n), or a pattern. A value that fails the rule cannot be saved.",
    "Wallets are not templated: a wallet's network and address stay on the account or endpoint row and are checksum-validated per network as before.",
    "Changed like any configuration: Finance proposes a row, Management approves; a retired field stops being required for new versions and stays readable on old ones."] },
  BANK_ACCOUNT_DETAILS: { scope: "Per bank account, versioned", req: ["holder_name", "bank_name", "country", "currency", "rail", "rail_fields", "evidence_ref", "entered_by", "entered_at", "status"], defaults: { status: "draft" }, rules: [
    "Entered by Operations from the rail's template: choose the rail, fill the template's fields, attach the bank letter or confirmation as evidence (a file under the restricted prefix). Saved only when every required field is present and every format rule passes.",
    "Approved by Finance or Management (controlled action bank_details_approve, approver never the person who entered it); the row becomes active and the account, endpoint, rail or destination approval that points at it may become active.",
    "Never edited: a change is a new row with supersedes_id naming the old one; the old row becomes superseded and stays. The account keeps pointing at the current version; a settlement line released earlier still resolves to the version current at its release.",
    "Read in full by Operations, Finance and Management — no masking anywhere, one card component shows the common fields then the rail's fields in template order. Every full read is written to AUDIT_LOG (Roles & Visibility rule 10)."] },
  CURRENCY_PAIR: { scope: "Per project, or platform", req: ["scope", "from_currency", "to_currency", "quote_direction", "rate_precision", "amount_rounding", "status"], defaults: { scope: "project", quote_direction: "out_per_in", rate_precision: 5, amount_rounding: "exact" }, rules: ["scope project needs project_id; scope platform (currency → reporting currency) has none, is managed under system settings and is never quoted (D43, D44).", "amount_rounding is the payout-side menu (exact / truncate_unit / nearest_unit / round_up_unit / nearest_n / round_up_n); exact is the default for bank transfers; nearest_n and round_up_n need rounding_unit (D25, D46).", "cash_rounding with cash_rounding_unit applies to the collected cash amount (AED 100, USD cash in Dubai 10, 1,000 for Asian currencies); both blank for a pair that is never collected in cash.", "from_currency may equal to_currency: the leg converts at rate 1 and the fee is captured at conversion (D33).", "A pair needs at least one PAIR_RATE_SOURCE with a unique priority before it can be used."] },
  PAIR_RATE_SOURCE: { scope: "Per pair", req: ["currency_pair_id", "rate_source_id", "priority"], rules: ["Priority 1 is tried first; the chain continues on staleness or outage.", "Platform pairs use the same chain: it is what REPORTING_VALUE converts with."] },
  OWN_WALLET: { scope: "Per project", req: ["provider", "role", "network", "address", "signer_arrangement", "custody_max_hours"], rules: ["Optional. role says which of the three allowed custody cases the wallet serves: reroute_contingency, own_desk (D23) or collection_bridge (D40); custody is allowed in no other case.", "networks lists the networks a bridge receives on (ERC-20 where a partner cannot).", "custody_max_hours is the limit the custody view ages against; an outbound transfer needs dual Management approval and is executed by NPL's signers outside the platform."] },
  SENDER: { scope: "Per project", req: ["name", "risk_tier", "status"], rules: ["A single paying party. Not tied to a partner.", "Must have at least one SENDER_RECEIVER_ALLOW row before it can be chosen on a deal; refunds go to its RECEIVER of kind sender_return."] },
  SENDER_RECEIVER_ALLOW: { scope: "Per sender", req: ["sender_id", "receiver_group_id"], rules: ["The allow-list (sendable_to). A sender may pay only the groups listed here; the group belongs to the same project."] },
  COLLECTION_SENDING_ENTITY: { scope: "Per sender", req: ["sender_id", "label"], rules: ["Provenance only: where the sender's funds come from. Never a payout destination."] },
  FEE_OVERRIDE: { scope: "Per sender × partner pair", req: ["sender_id", "partner_pair_id", "pct", "effective_from", "approved_by"], rules: ["Replaces the fee structure's pct for that sender from effective_from; the structure's other terms still apply.", "sender_pays_pct and receiver_pays_pct are both blank (the structure's proportion applies) or both set and summing to pct (D20)."] },
  RECEIVER_GROUP: { scope: "Per project", req: ["name", "is_default", "status"], rules: ["Exactly one group per project has is_default = true; it is created with the project.", "The unit entitlement is tracked on: payouts within a group are ordinary settlement, across groups an offset needing Management approval. Refunds use group-less sender_return receivers, so no return group is needed."] },
  RECEIVER: { scope: "Per project", req: ["kind", "name", "status"], defaults: { kind: "counterparty" }, rules: ["kind counterparty needs group_id (exactly one group); kind sender_return needs sender_id and no group; kind partner_transit needs partner_config_id and no group (D13).", "sender_return and partner_transit receivers never appear on forward deals or allow-lists; a payout to them is attributed to the group of the leg that pays them."] },
  RECEIVING_ENTITY: { scope: "Per receiver", req: ["receiver_id", "name", "status"], rules: ["A legal entity of the receiver. Bank and wallet details live on its accounts, not here."] },
  RECEIVING_ENTITY_ACCOUNT: { scope: "Per entity", req: ["receiving_entity_id", "currency", "rail", "account_kind", "status", "usage"], defaults: { usage: "standing" }, rules: ["One row per currency × rail (EUR via SWIFT and EUR via SEPA are two accounts).", "account_kind bank carries bank_account_details_id — the current BANK_ACCOUNT_DETAILS version; formerly bank_details_ref, a reference into an external store — and a bank rail; the account is active only when that details row is active (rule 14); account_kind wallet carries network and address, checksum-validated per network, and rail equal to the network (D14).", "usage single_use is a local account the receiver gives for one payout; it names reserved_for_deal_id and serves that deal only (D32).", "An account is payable through a partner only once a DESTINATION_APPROVAL with that partner is approved (invariant 8)."] },
  WALLET_SCREENING: { scope: "Per project, per address and day", req: ["project_id", "subject_kind", "network", "address", "result", "decision", "screened_by", "screened_at"], rules: ["subject_kind sender_wallet names sender_id; receiver_wallet names receiving_entity_account_id (D31).", "decision accept lands on a standard endpoint; accept_alternate only on an endpoint with risk_band elevated; reject stops the collection" + dl(" unless Finance overrides it (ROLE_RIGHT override_screening_reject)") + mk(". There is no Finance override: a reject is lifted only by a new screening row of the same address decided by Management on a second look (below)") + ".", "Operations records it; it is configuration-domain data because the decision binds later deals on the same address.",
    mk("NPL screens; the partners decide. A sanctions or AML hold, freeze or decline is the decision of the partner (or of its bank), not of NPL: NPL records it as the event it is (REROUTE with trigger compliance_hold, LOSS_EVENT with reason account_frozen, EMERGENCY_ACTION of kind destination_freeze) and routes around it; nobody at NPL overrides a partner's block, and when the partner later clears the case its clearance reference is recorded on the event that lifted the block. NPL has no compliance function and takes no compliance action of its own."),
    mk("What the report decides. The screening provider's report is stored as returned (api_response, the payload) and the rule reads from it: the outcome under the Strict rulebook, the risk score and its band (clear below 2, alert from 2 to 6, always flag above 6), the five categories against their thresholds (sanctions direct, sanctions indirect, terrorism / TF, high-risk indirect, elevated indirect) and the sanctioned, high-risk and elevated exposure by channel. Outcome CLEAR under Strict, score in the clear band, no category at or above its alert or flag threshold and no terrorism / TF trace: result standard, and Operations decides accept and proceeds. Anything else: result elevated or unacceptable as the report says, and the decision is Management's second look (ROLE_RIGHT screening_second_look): Management decides accept, accept_alternate (an elevated-band endpoint) or reject, with the reason; the report and the decision are kept together (decided_by, decided_at, reason)."),
    mk("Three kinds of block, three owners. (1) A partner's hold, freeze or decline: the partner's authority, recorded, never overridden. (2) NPL's own screening alert: Management's second look, as above. (3) A technical false positive (wrong address pasted, a listing since withdrawn, a re-screen that comes back clear): a new screening row of the same address with its evidence (evidence_ref), decided on its own report; the earlier row is never edited or reversed. The partner's own screening at collection still applies in every case.")] },
  PARTNER_CONFIG: { scope: "Per project × partner", req: ["project_id", "partner_id", "applicable_for_reroute", "status"], defaults: { applicable_for_reroute: false, is_own_desk: false }, rules: ["How this partner is used in this project. Pairs, fee structures, vehicles, endpoints, destination approvals, markup-share and rebate rules hang off it.", "applicable_for_reroute puts the partner in the project's alternate set (Management-approved).", "is_own_desk true means NPL itself converts in its own wallet for this project (D23): its pairs are priced fee_on_market with NPL's markup and its endpoints point at an OWN_WALLET of role own_desk; enabling needs Management approval (enable_own_desk)."] },
  PARTNER_PAIR: { scope: "Per partner config × pair", req: ["partner_config_id", "currency_pair_id", "partner_pricing", "status"], defaults: { needs_bank_lock: false }, rules: ["currency_pair_id is one of the project's pairs (scope project).", "partner_pricing agrees with the partner's disclosure_style; partner_fee_pct is set exactly when partner_pricing is fee_on_market.", "needs_bank_lock true means the partner's cutoff governs the rate lock and the settlement on this pair (D29); it needs PARTNER.bank_cutoff_time."] },
  FEE_STRUCTURE: { scope: "Per partner pair, versioned", req: ["partner_pair_id", "rate_basis", "mode", "pct", "sender_pays_pct", "receiver_pays_pct", "min_margin_pct", "variance_threshold_rel", "quoting_rate_policy", "effective_from", "customer_facing_fee_basis"], defaults: { mode: "fixed", quoting_rate_policy: "worst_applicable", customer_facing_fee_basis: "actual" }, rules: ["sender_pays_pct + receiver_pays_pct = pct. Each part is a percentage of the principal at the basis rate, never compounded (D46).", "rate_basis market prices on the reference feed; agent_rate prices on the partner's rate version (D37).", "mode variable needs min_markup_pct ≤ max_markup_pct; a markup above max_markup_pct is a Management decision (raise_fee_cap, D41).", "customer_facing_fee_basis fixed needs customer_facing_fee_pct (what the quote prints — D22); the figures are derived, never typed.", "A new version is a new row with a later effective_from; a deal keeps the version it was priced on."] },
  FEE_TIER: { scope: "Per fee structure", req: ["fee_structure_id", "min_monthly_volume", "volume_currency", "pct", "effective_from"], rules: ["A structure with tiers has exactly one tier at min_monthly_volume 0; thresholds are unique within a structure (D21).", "The tier is chosen at quote from the project's month-to-date Σ amount_in (PROJECT_MONTH_VOLUME); a deal that crosses a threshold is split across two tiers (DEAL_FEE_TIER).", "sender_pays_pct / receiver_pays_pct are optional; both blank means the structure's proportion."] },
  PARTNER_ENTITY: { scope: "Per partner config", req: ["partner_config_id", "name", "status"], rules: ["The partner's legal vehicle (PT-tour, PT Global Inc), the name that appears on paperwork. Fixed on a deal leg at quote; only a REROUTE changes it.", "Owns the partner's collection endpoints."] },
  COLLECTION_RECEIVING_ENDPOINT: { scope: "Per partner entity", req: ["partner_entity_id", "kind", "currency", "status", "risk_band", "usage"], defaults: { risk_band: "standard", usage: "standing" }, rules: ["kind bank carries bank_account_details_id (the current BANK_ACCOUNT_DETAILS version; formerly bank_details_ref) and needs rail before it can become active (null means not yet known — D18), and the details row must be active (rule 14); kind wallet carries network and address, and rail, when set, equals network.", "A wallet endpoint's network must be one the partner offers; cash and local_deposit collections have no standing endpoint (D39).", "own_wallet_id names an OWN_WALLET when the endpoint is NPL's own wallet: under an own-desk configuration (D23) or as a collection bridge (D40); the endpoint still belongs to the leg's partner configuration.", "usage single_use names reserved_for_deal_id and expected_amount (ad hoc local deposit accounts — D32).", "The endpoint's kind must match the leg's collection method (D19); the system refuses a collection on an endpoint of another partner entity (invariant 6)."] },
  SETTLEMENT_SENDING_ENTITY: { scope: "Per partner config", req: ["partner_config_id", "narrative_name", "status"], rules: ["The name the receiver sees on an outgoing transfer. Holds no money."] },
  SETTLEMENT_RAIL: { scope: "Per partner config", req: ["partner_config_id", "name", "currency"], rules: ["The bank or EMI that executes the transfer. expected_bank_fee is the figure the bank-fee true-up compares against (BANK_FEE_EVENT, D46).", "bank_account_details_id names the rail's own account as a BANK_ACCOUNT_DETAILS row (formerly bank_details_ref); the rail is usable only while that row is active (rule 14)."] },
  DESTINATION_APPROVAL: { scope: "Per partner config × account", req: ["partner_config_id", "receiving_entity_account_id", "approval_status"], defaults: { approval_status: "pending_partner" }, rules: ["Destination approval per partner: an account as registered with this partner.", "The payout details follow the account's kind: bank_account_details_id — the details as registered with this partner, a BANK_ACCOUNT_DETAILS row (formerly bank_details_ref) — for a bank account; network and address as registered with the partner for a wallet (D16); a wallet account carries its WALLET_SCREENING (D31).", "A quote-first deal leaves Inquiry only if at least one account in the entitled group is approved with the chosen partner (invariant 8)."] },
  MARKUP_SHARE_RULE: { scope: "Per party × project (optionally one partner pair or fee structure)", req: ["markup_share_party_id", "project_id", "basis", "pct", "effective_from", "party_kind", "settlement_mode"], defaults: { settlement_mode: "npl_pays" }, rules: ["basis share_of_earnings or share_of_net_markup is a ratio of NPL's earnings on the leg (base = fee parts − partner cost; rebates never in the base — D26); fixed_pct is applied inside the sender-facing markup.", "Several rules on one project are allowed; Σ shares of the same base ≤ 100 %.", "settlement_mode party_retains: the party holds the converted funds and pays NPL the remainder monthly."] },
  PARTNER_REBATE_RULE: { scope: "Per partner config", req: ["partner_config_id", "effective_from", "basis", "pct", "payout_currency"], defaults: { basis: "pct_of_amount" }, rules: ["Only for partners that return part of their fee. basis is pct_of_amount: the rebate is a percentage of the amount converted.", "payout_currency is the currency the partner pays the rebate in and the accrual is expressed in — the amount currency (D46).", "Optional scope by fee_structure_id or sender_id. The rebate is NPL's alone (EARN_REBATE): never shared, never in a markup-share base; reconciled monthly through PARTNER_REBATE_ACCRUAL."] },
};
for (const n of ALL) if (!RULES[n]) throw new Error("no rules for " + n);
for (const n of ALL) for (const f of RULES[n].req) if (!D.E[n].f.some((x) => x[0] === f)) throw new Error(`${n}: required field ${f} is not in the model`);

// ------------------------------------------------------------------ the worked example: the FRS project ("Client 1", USDT → EUR)
// Names and policies come from NPL's documents; fee rates, thresholds, addresses and reference numbers are illustrative placeholders.
const EX = {
  system_settings: [
    { key: "reporting_currency", value: "USD", effective_from: "2026-10-01" },
    { key: "reporting_rate_max_age_min", value: "60", effective_from: "2026-10-01" },
    { key: "operating_timezone", value: "Asia/Hong_Kong", effective_from: "2026-10-01" },
  ],
  platform_pairs: [
    { code: "USDT-USD", from_currency: "USDT", to_currency: "USD", quote_direction: "out_per_in", rate_precision: 5, amount_rounding: "exact", status: "active", sources: [{ rate_source: "KRAKEN", priority: 1 }, { rate_source: "CMC", priority: 2 }] },
    { code: "EUR-USD", from_currency: "EUR", to_currency: "USD", quote_direction: "out_per_in", rate_precision: 5, amount_rounding: "exact", status: "active", sources: [{ rate_source: "OANDA", priority: 1 }, { rate_source: "XE", priority: 2 }] },
  ],
  rate_sources: [
    { code: "KRAKEN", staleness_threshold_s: 120 },
    { code: "CMC", staleness_threshold_s: 300 },
    { code: "OANDA", staleness_threshold_s: 300 },
    { code: "XE", staleness_threshold_s: 300 },
  ],
  partners: [
    { code: "ALI", name: "Ali", disclosure_style: "fee_in_rate", rate_expiry_time: "17:00 local", holiday_calendar: "ID banking holidays", supported_methods: ["crypto", "bank", "cash", "local_deposit"], bank_cutoff_time: "14:30", cutoff_timezone: "Asia/Hong_Kong", status: "active",
      holidays: [{ date: "2026-12-25", name: "Christmas Day", scope: "bank_channel", source: "public calendar" }, { date: "2027-03-20", name: "Idul Fitri (illustrative)", scope: "bank_channel", source: "partner notice" }],
      cutoff_overrides: [{ weekday: "Friday", cutoff_time: "13:30", kind: "early_close", reason: "pre-weekend", recorded_by: "finance" }] },
    { code: "JETON", name: "Jeton", disclosure_style: "fee_on_market", rate_expiry_time: "16:00 local", holiday_calendar: "UK banking holidays", supported_methods: ["crypto", "bank"], bank_cutoff_time: null, cutoff_timezone: "Europe/London", status: "active", holidays: [], cutoff_overrides: [] },
  ],
  markup_share_parties: [],
  templates: [
    { code: "quote", version: 1, channel: "pdf", language: "en", body_ref: "tpl-quote-en-v1", printed_fields: ["sender_rate", "customer_facing_fee_pct", "customer_facing_rate", "printed_amount_out", "effective_valid_until"], effective_from: "2026-10-01", status: "active" },
    { code: "payment_instructions", version: 1, channel: "email", language: "en", body_ref: "tpl-payin-en-v1", printed_fields: ["amount_in", "network", "address", "effective_valid_until"], effective_from: "2026-10-01", status: "active" },
  ],
  client: { code: "CLIENT1", name: "Client 1", category: "FRS", legal_entity_ref: "le-client1", kyc_ref: "kyc-client1", exposure_ceiling: 400000, status: "active" },
  project: {
    code: "CLIENT1-MAIN", client: "CLIENT1", name: "Client 1 (FRS project)", client_label: "Client 1",
    quote_freshness_min: 5, quote_validity_min: 60, grace_min: 15, grace_drift_pct: 0.001,
    late_collection_policy: "requote", bank_fee_treatment_default: "carry_forward", receiver_fee_timing: "at_conversion",
    network_fee_policy: "absorbed", settlement_policy: "to_zero", shortfall_tolerance: 0, exposure_ceiling: 250000, status: "active",
  },
  thresholds: [
    { kind: "max_amount", currency: "USDT", value: 100000, escalation: "finance" },
    { kind: "settlement_limit", currency: "EUR", value: 50000, escalation: "management" },
    { kind: "daily_slots", value: 2, escalation: "management" },
    { kind: "rate_variation_rel", value: 0.002, escalation: "finance" },
  ],
  currency_pairs: [
    { code: "USDT-EUR", from_currency: "USDT", to_currency: "EUR", quote_direction: "out_per_in", rate_precision: 5, amount_rounding: "exact", status: "active",
      sources: [{ rate_source: "KRAKEN", priority: 1 }, { rate_source: "CMC", priority: 2 }] },
  ],
  own_wallets: [{ code: "AQN-LT-SUB", provider: "Aquanow", account_label: "LT Sub", role: "reroute_contingency", networks: ["TRC-20"], network: "TRC-20", address: "T…(wallet address)", signer_arrangement: "multisig", custody_max_hours: 48 }],
  bank_account_details: [
    { code: "BAD-X1-EUR", holder_name: "Entity X1 Ltd", bank_name: "Bank X", country: "DE", currency: "EUR", rail: "SEPA", rail_fields: { iban: "DE89 3704 0044 0532 0130 00", bic: "COBADEFFXXX" }, evidence_ref: "restricted/bank-letters/x1-eur.pdf", entered_by: "ops.user", entered_at: "2026-09-18", status: "active" },
    { code: "BAD-X2-EUR", holder_name: "Entity X2 GmbH", bank_name: "Bank X", country: "DE", currency: "EUR", rail: "SEPA", rail_fields: { iban: "DE02 1203 0000 0000 2020 51", bic: "BYLADEM1001" }, evidence_ref: "restricted/bank-letters/x2-eur.pdf", entered_by: "ops.user", entered_at: "2026-09-18", status: "active" },
    { code: "BAD-Y-EUR", holder_name: "Entity Y SA", bank_name: "Bank Y", country: "FR", currency: "EUR", rail: "SWIFT", rail_fields: { iban: "FR14 2004 1010 0505 0001 3M02 606", bic: "BNPAFRPPXXX", bank_address: "16 bd des Italiens, Paris", intermediary_bic: "" }, evidence_ref: "restricted/bank-letters/y-eur.pdf", entered_by: "ops.user", entered_at: "2026-09-18", status: "active" },
    { code: "BAD-PTG-IDR", holder_name: "PT Global Inc", bank_name: "Bank Mandiri", country: "ID", currency: "IDR", rail: "local", rail_fields: { bank_code: "008", account_number: "1234567890" }, evidence_ref: "restricted/bank-letters/ptg-idr.pdf", entered_by: "ops.user", entered_at: "2026-09-18", status: "active" },
    { code: "BAD-ALI-EUR-RAIL", holder_name: "Ali EU EMI", bank_name: "EMI Bank", country: "LT", currency: "EUR", rail: "SEPA", rail_fields: { iban: "LT12 1000 0111 0100 1000", bic: "EMIBLT22" }, evidence_ref: "restricted/bank-letters/ali-eur.pdf", entered_by: "ops.user", entered_at: "2026-09-18", status: "active" },
    { code: "BAD-JETON-EUR-RAIL", holder_name: "Jeton EMI", bank_name: "Jeton Bank", country: "GB", currency: "EUR", rail: "SEPA", rail_fields: { iban: "GB29 NWBK 6016 1331 9268 19", bic: "NWBKGB2L" }, evidence_ref: "restricted/bank-letters/jeton-eur.pdf", entered_by: "ops.user", entered_at: "2026-09-18", status: "active" },
  ],
  receiver_groups: [{ code: "DEFAULT", name: "Default group", is_default: true, status: "active" }],
  receivers: [
    { code: "RCV_X", kind: "counterparty", group: "DEFAULT", name: "Receiver X", status: "active", entities: [
      { code: "ENTITY_X1", name: "Entity X1", status: "active", accounts: [{ code: "X1-EUR-SEPA", currency: "EUR", rail: "SEPA", account_kind: "bank", bank_account_details: "BAD-X1-EUR", usage: "standing", status: "active" }] },
      { code: "ENTITY_X2", name: "Entity X2", status: "active", accounts: [{ code: "X2-EUR-SEPA", currency: "EUR", rail: "SEPA", account_kind: "bank", bank_account_details: "BAD-X2-EUR", usage: "standing", status: "active" }] },
    ] },
    { code: "RCV_Y", kind: "counterparty", group: "DEFAULT", name: "Receiver Y", status: "active", entities: [
      { code: "ENTITY_Y", name: "Entity Y", status: "active", accounts: [{ code: "Y-EUR-SWIFT", currency: "EUR", rail: "SWIFT", account_kind: "bank", bank_account_details: "BAD-Y-EUR", usage: "standing", status: "active" }] },
    ] },
    { code: "RET_SND_A", kind: "sender_return", sender: "SND_A", name: "Sender A (returns)", status: "active", entities: [
      { code: "RET_A", name: "Sender A", status: "active", accounts: [{ code: "RET-A-USDT-TRC20", currency: "USDT", rail: "TRC-20", account_kind: "wallet", network: "TRC-20", address: "T…(Sender A return wallet)", usage: "standing", status: "active" }] },
    ] },
    { code: "RET_SND_B", kind: "sender_return", sender: "SND_B", name: "Sender B (returns)", status: "active", entities: [
      { code: "RET_B", name: "Sender B", status: "active", accounts: [{ code: "RET-B-USDT-TRC20", currency: "USDT", rail: "TRC-20", account_kind: "wallet", network: "TRC-20", address: "T…(Sender B return wallet)", usage: "standing", status: "active" }] },
    ] },
  ],
  senders: [
    { code: "SND_A", name: "Sender A", risk_tier: "standard", status: "active", sendable_to: ["DEFAULT"], provenance: [{ label: "own wallet (TRC-20)", bank_account_details: null }], fee_overrides: [] },
    { code: "SND_B", name: "Sender B", risk_tier: "standard", status: "active", sendable_to: ["DEFAULT"], provenance: [{ label: "own wallet (TRC-20)", bank_account_details: null }],
      fee_overrides: [{ partner_pair: "CLIENT1-ALI/USDT-EUR", pct: 0.012, sender_pays_pct: 0.006, receiver_pays_pct: 0.006, effective_from: "2026-10-01", approved_by: "management" }] },
  ],
  partner_configs: [
    { code: "CLIENT1-ALI", partner: "ALI", applicable_for_reroute: false, is_own_desk: false, status: "active",
      pairs: [{ currency_pair: "USDT-EUR", partner_pricing: "fee_in_rate", needs_bank_lock: true, status: "active",
        fee_structures: [{ rate_basis: "market", mode: "fixed", pct: 0.010, sender_pays_pct: 0.004, receiver_pays_pct: 0.006, min_markup_pct: 0.008, max_markup_pct: 0.015, min_margin_pct: 0.003, variance_threshold_rel: 0.20, quoting_rate_policy: "worst_applicable", customer_facing_fee_basis: "actual", effective_from: "2026-10-01", tiers: [] }] }],
      partner_entities: [
        { code: "PT-TOUR", name: "PT-tour", status: "active", endpoints: [{ code: "PT-TOUR-USDT-TRC20", kind: "wallet", currency: "USDT", rail: "TRC-20", network: "TRC-20", address: "T…(PT-tour wallet)", risk_band: "standard", usage: "standing", status: "active" }] },
        { code: "PT-GLOBAL", name: "PT Global Inc", status: "active", endpoints: [
          { code: "PT-GLOBAL-USDT-TRC20", kind: "wallet", currency: "USDT", rail: "TRC-20", network: "TRC-20", address: "T…(PT Global wallet)", risk_band: "elevated", usage: "standing", status: "active" },
          { code: "PT-GLOBAL-IDR-BANK", kind: "bank", currency: "IDR", rail: "local", bank_account_details: "BAD-PTG-IDR", risk_band: "standard", usage: "standing", status: "active" }] },
      ],
      settlement_sending_entities: [{ narrative_name: "PT Global Inc", status: "active" }],
      settlement_rails: [{ name: "Ali's EU bank / EMI", bank_account_details: "BAD-ALI-EUR-RAIL", expected_bank_fee: 25, currency: "EUR" }],
      destination_approvals: [{ account: "X1-EUR-SEPA", approval_status: "approved", approved_at: "2026-09-20" }, { account: "X2-EUR-SEPA", approval_status: "approved", approved_at: "2026-09-20" }, { account: "Y-EUR-SWIFT", approval_status: "approved", approved_at: "2026-09-20" }, { account: "RET-A-USDT-TRC20", approval_status: "approved", approved_at: "2026-09-20" }, { account: "RET-B-USDT-TRC20", approval_status: "approved", approved_at: "2026-09-20" }],
      markup_share_rules: [], rebate_rule: null },
    { code: "CLIENT1-JETON", partner: "JETON", applicable_for_reroute: true, is_own_desk: false, status: "active",
      pairs: [{ currency_pair: "USDT-EUR", partner_pricing: "fee_on_market", partner_fee_pct: 0.005, needs_bank_lock: false, status: "active",
        fee_structures: [{ rate_basis: "market", mode: "fixed", pct: 0.010, sender_pays_pct: 0.004, receiver_pays_pct: 0.006, min_markup_pct: 0.008, max_markup_pct: 0.015, min_margin_pct: 0.003, variance_threshold_rel: 0.20, quoting_rate_policy: "worst_applicable", customer_facing_fee_basis: "actual", effective_from: "2026-10-01", tiers: [] }] }],
      partner_entities: [{ code: "JETON-EMI", name: "Jeton EMI", status: "active", endpoints: [{ code: "JETON-USDT-TRC20", kind: "wallet", currency: "USDT", rail: "TRC-20", network: "TRC-20", address: "T…(Jeton wallet)", risk_band: "standard", usage: "standing", status: "active" }] }],
      settlement_sending_entities: [{ narrative_name: "Jeton", status: "active" }],
      settlement_rails: [{ name: "Jeton EMI (SEPA)", bank_account_details: "BAD-JETON-EUR-RAIL", expected_bank_fee: 0, currency: "EUR" }],
      destination_approvals: [{ account: "X1-EUR-SEPA", approval_status: "approved", approved_at: "2026-09-22" }, { account: "X2-EUR-SEPA", approval_status: "approved", approved_at: "2026-09-22" }, { account: "Y-EUR-SWIFT", approval_status: "pending_partner" }, { account: "RET-A-USDT-TRC20", approval_status: "approved", approved_at: "2026-09-22" }, { account: "RET-B-USDT-TRC20", approval_status: "approved", approved_at: "2026-09-22" }],
      markup_share_rules: [], rebate_rule: { basis: "pct_of_amount", pct: 0.004, payout_currency: "USDT", effective_from: "2026-10-01" } },
  ],
};

// ------------------------------------------------------------------ validate the example against the schema rules
const ENUM = {
  disclosure_style: ["fee_in_rate", "fee_on_market"], supported_method: ["crypto", "bank", "cash", "local_deposit"], holiday_scope: ["bank_channel", "partner"], override_kind: ["extension", "early_close"],
  late_collection_policy: ["requote", "honor_with_approval"], bank_fee_treatment_default: ["waived", "carry_forward", "absorbed"],
  receiver_fee_timing: ["at_conversion", "post_confirmation"], network_fee_policy: ["absorbed", "charged_back"], settlement_policy: ["to_zero", "hold_allowed"],
  threshold_kind: ["max_amount", "settlement_limit", "daily_slots", "rate_variation_rel", "custom"], escalation: ["finance", "management"],
  quote_direction: ["out_per_in", "in_per_out"], amount_rounding: ["exact", "truncate_unit", "nearest_unit", "round_up_unit", "nearest_n", "round_up_n"], cash_rounding: ["truncate_n", "nearest_n", "round_up_n"],
  receiver_kind: ["counterparty", "sender_return", "partner_transit"], account_kind: ["bank", "wallet"], usage: ["standing", "single_use"], risk_band: ["standard", "elevated"], endpoint_kind: ["bank", "wallet"],
  partner_pricing: ["fee_on_market", "fee_in_rate"], rate_basis: ["market", "agent_rate"], mode: ["fixed", "variable"], quoting_rate_policy: ["worst_applicable", "designated", "best_applicable"],
  customer_facing_fee_basis: ["actual", "sender_pays_on_agent_rate", "fixed"], approval_status: ["pending_partner", "approved", "suspended"], signer_arrangement: ["hardware", "multisig"],
  wallet_role: ["reroute_contingency", "own_desk", "collection_bridge"], rate_source: ["KRAKEN", "CMC", "OANDA", "XE"], rebate_basis: ["pct_of_amount"],
  share_basis: ["share_of_earnings", "fixed_pct", "share_of_net_markup"], party_kind: ["markup_share_party", "client_party"], settlement_mode: ["npl_pays", "party_retains"],
  template_code: ["quote", "payment_instructions", "confirmation_request", "settlement_advice", "cash_token"], channel: ["email", "chat", "portal", "pdf"], system_key: ["reporting_currency", "reporting_rate_max_age_min", "operating_timezone"],
};
const SENDER_FACING = ["sender_rate", "customer_facing_fee_pct", "customer_facing_rate", "printed_amount_out", "printed_fee_pct", "printed_source_rate", "amount_in", "gross_out", "client_net", "effective_valid_until", "amount_out"];
const errors = [];
const must = (cond, msg) => { if (!cond) errors.push(msg); };
const inEnum = (v, k, where) => must(ENUM[k].includes(v), `${where}: ${k} '${v}' not in ${ENUM[k].join("/")}`);
const srcCodes = EX.rate_sources.map((s) => s.code);
const checkPair = (cp, platform) => { inEnum(cp.quote_direction, "quote_direction", cp.code); inEnum(cp.amount_rounding, "amount_rounding", cp.code); if (cp.cash_rounding) { inEnum(cp.cash_rounding, "cash_rounding", cp.code); must(cp.cash_rounding_unit > 0, cp.code + " cash rounding needs a unit"); } if (/_n$/.test(cp.amount_rounding)) must(cp.rounding_unit > 0, cp.code + " needs rounding_unit"); must(cp.sources.length >= 1, cp.code + " needs a rate source"); for (const s of cp.sources) must(srcCodes.includes(s.rate_source), cp.code + " unknown source " + s.rate_source); must(new Set(cp.sources.map((s) => s.priority)).size === cp.sources.length, cp.code + " duplicate priorities"); if (platform) must(cp.to_currency === EX.system_settings.find((s) => s.key === "reporting_currency").value, cp.code + " platform pair must end in the reporting currency"); };
for (const s of EX.system_settings) inEnum(s.key, "system_key", "SYSTEM_SETTING");
must(new Set(EX.system_settings.map((s) => s.key)).size === EX.system_settings.length, "one effective row per system key");
for (const cp of EX.platform_pairs) checkPair(cp, true);
for (const t of EX.templates) { inEnum(t.code, "template_code", "MESSAGE_TEMPLATE"); inEnum(t.channel, "channel", t.code); must(t.printed_fields.length >= 1, t.code + " prints nothing"); if (t.code === "quote") for (const f of t.printed_fields) must(SENDER_FACING.includes(f), `quote template prints a non-sender-facing field ${f}`); }
for (const p of EX.partners) { inEnum(p.disclosure_style, "disclosure_style", "PARTNER " + p.code); must(p.supported_methods.length >= 1, p.code + " needs supported_methods"); for (const m of p.supported_methods) inEnum(m, "supported_method", p.code); must(!p.bank_cutoff_time || p.cutoff_timezone, p.code + " cutoff needs a timezone"); for (const h of p.holidays) inEnum(h.scope, "holiday_scope", p.code); for (const o of p.cutoff_overrides) { inEnum(o.kind, "override_kind", p.code); must((o.applies_on ? 1 : 0) + (o.weekday ? 1 : 0) === 1, p.code + " override: exactly one of applies_on / weekday"); must(o.kind !== "extension" || o.partner_agreement_ref, p.code + " extension needs the partner's agreement"); must(p.bank_cutoff_time, p.code + " override without a standing cutoff"); } }
const P = EX.project;
must(EX.client.code === P.client, "project must belong to the client");
for (const f of RULES.PROJECT.req.filter((f) => f !== "client_id")) must(P[f] !== undefined && P[f] !== "", `PROJECT missing ${f}`);
inEnum(P.late_collection_policy, "late_collection_policy", "PROJECT"); inEnum(P.bank_fee_treatment_default, "bank_fee_treatment_default", "PROJECT"); inEnum(P.receiver_fee_timing, "receiver_fee_timing", "PROJECT"); inEnum(P.network_fee_policy, "network_fee_policy", "PROJECT"); inEnum(P.settlement_policy, "settlement_policy", "PROJECT");
must(P.quote_freshness_min < P.quote_validity_min, "freshness must be shorter than validity");
must(!EX.client.exposure_ceiling || !P.exposure_ceiling || P.exposure_ceiling <= EX.client.exposure_ceiling, "a project's ceiling cannot exceed its client's");
for (const t of EX.thresholds) { inEnum(t.kind, "threshold_kind", "THRESHOLD"); inEnum(t.escalation, "escalation", "THRESHOLD " + t.kind); }
for (const cp of EX.currency_pairs) checkPair(cp, false);
for (const w of EX.own_wallets) { inEnum(w.role, "wallet_role", w.code); inEnum(w.signer_arrangement, "signer_arrangement", w.code); must(w.custody_max_hours > 0, w.code + " needs custody_max_hours"); }
must(EX.receiver_groups.filter((g) => g.is_default).length === 1, "exactly one default group");
const groupCodes = EX.receiver_groups.map((g) => g.code), senderCodes = EX.senders.map((s) => s.code), accountCodes = [], accountByCode = {};
const badCodes = EX.bank_account_details.filter((b) => b.status === "active").map((b) => b.code);
for (const b of EX.bank_account_details) { must(b.holder_name && b.bank_name && b.country && b.currency && b.rail && b.evidence_ref, b.code + " needs every common field"); if (b.rail === "SEPA" || b.rail === "SWIFT") must(/^[A-Z]{2}\d{2}[A-Z0-9 ]{11,32}$/.test(b.rail_fields.iban) && /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(b.rail_fields.bic), b.code + " IBAN and BIC must pass the template's format rules"); if (b.rail === "local") must(b.rail_fields.bank_code && b.rail_fields.account_number, b.code + " local rail needs bank_code and account_number"); }
for (const r of EX.receivers) {
  inEnum(r.kind, "receiver_kind", r.code);
  if (r.kind === "counterparty") must(groupCodes.includes(r.group), r.code + " counterparty needs a group of the project"); else must(!r.group, r.code + " is group-less (D13)");
  if (r.kind === "sender_return") must(senderCodes.includes(r.sender), r.code + " names an unknown sender");
  for (const e of r.entities) { must(e.accounts.length >= 1, e.code + " needs an account"); const seen = new Set(); for (const a of e.accounts) { inEnum(a.account_kind, "account_kind", a.code); inEnum(a.usage, "usage", a.code); must(!seen.has(a.currency + "/" + a.rail), e.code + " duplicate currency × rail"); seen.add(a.currency + "/" + a.rail); if (a.account_kind === "bank") must(badCodes.includes(a.bank_account_details) && !a.address, a.code + " bank account names an active BANK_ACCOUNT_DETAILS row and no address"); else must(a.network && a.address && a.rail === a.network, a.code + " wallet account carries network + address, rail = network"); if (a.usage === "single_use") must(a.reserved_for_deal_id, a.code + " single_use needs its deal"); accountCodes.push(a.code); accountByCode[a.code] = { ...a, receiver: r }; } }
}
must(new Set(accountCodes).size === accountCodes.length, "duplicate account codes");
for (const s of senderCodes) must(EX.receivers.some((r) => r.kind === "sender_return" && r.sender === s), s + " has no sender_return receiver");
const partnerCodes = EX.partners.map((p) => p.code), pairCodes = EX.currency_pairs.map((c) => c.code), partnerPairCodes = [];
for (const pc of EX.partner_configs) {
  const partner = EX.partners.find((p) => p.code === pc.partner);
  must(partner, pc.code + " unknown partner");
  if (pc.is_own_desk) must(EX.own_wallets.some((w) => w.role === "own_desk"), pc.code + " own desk needs an OWN_WALLET of role own_desk");
  for (const pp of pc.pairs) {
    partnerPairCodes.push(pc.code + "/" + pp.currency_pair);
    must(pairCodes.includes(pp.currency_pair), pc.code + " unknown pair"); inEnum(pp.partner_pricing, "partner_pricing", pc.code);
    must((pp.partner_pricing === "fee_on_market") === (pp.partner_fee_pct !== undefined), pc.code + " partner_fee_pct must be set exactly when pricing is fee_on_market");
    must(partner && partner.disclosure_style === pp.partner_pricing, pc.code + " partner_pricing must match the partner's disclosure_style");
    must(!pp.needs_bank_lock || partner.bank_cutoff_time, pc.code + " needs_bank_lock requires the partner's bank_cutoff_time");
    must(pp.fee_structures.length >= 1, pc.code + " needs a fee structure");
    for (const fsr of pp.fee_structures) {
      inEnum(fsr.rate_basis, "rate_basis", pc.code); inEnum(fsr.mode, "mode", pc.code); inEnum(fsr.quoting_rate_policy, "quoting_rate_policy", pc.code); inEnum(fsr.customer_facing_fee_basis, "customer_facing_fee_basis", pc.code);
      must(Math.abs(fsr.sender_pays_pct + fsr.receiver_pays_pct - fsr.pct) < 1e-12, pc.code + " parts must sum to pct");
      must(fsr.min_markup_pct <= fsr.max_markup_pct, pc.code + " min_markup ≤ max_markup");
      must(fsr.customer_facing_fee_basis !== "fixed" || fsr.customer_facing_fee_pct !== undefined, pc.code + " fixed customer-facing fee needs its pct");
      if (fsr.tiers.length) { must(fsr.tiers.filter((t) => t.min_monthly_volume === 0).length === 1, pc.code + " tiers need exactly one at volume 0"); must(new Set(fsr.tiers.map((t) => t.min_monthly_volume)).size === fsr.tiers.length, pc.code + " duplicate tier thresholds"); }
    }
  }
  must(pc.partner_entities.length >= 1, pc.code + " needs a partner entity");
  for (const pe of pc.partner_entities) for (const ep of pe.endpoints) { inEnum(ep.kind, "endpoint_kind", ep.code); inEnum(ep.risk_band, "risk_band", ep.code); inEnum(ep.usage, "usage", ep.code); if (ep.kind === "bank") must(badCodes.includes(ep.bank_account_details) && (ep.status !== "active" || ep.rail), ep.code + " active bank endpoint needs rail and an active BANK_ACCOUNT_DETAILS row (D18, rule 14)"); else { must(ep.network && ep.address && (!ep.rail || ep.rail === ep.network), ep.code + " wallet endpoint: network + address, rail = network"); must(partner.supported_methods.includes("crypto"), ep.code + " partner does not offer crypto"); } if (ep.kind === "bank") must(partner.supported_methods.includes("bank"), ep.code + " partner does not offer bank"); if (ep.usage === "single_use") must(ep.reserved_for_deal_id && ep.expected_amount, ep.code + " single_use needs its deal and amount"); }
  must(pc.settlement_sending_entities.length >= 1 && pc.settlement_rails.length >= 1, pc.code + " needs a narrative and a rail to pay out");
  for (const sr of pc.settlement_rails) must(badCodes.includes(sr.bank_account_details), pc.code + " rail " + sr.name + " needs an active BANK_ACCOUNT_DETAILS row");
  for (const r of pc.destination_approvals) { must(accountCodes.includes(r.account), pc.code + " approval for unknown account " + r.account); inEnum(r.approval_status, "approval_status", pc.code); must(r.approval_status !== "approved" || r.approved_at, pc.code + " approved needs approved_at"); }
  for (const m of pc.markup_share_rules) { inEnum(m.basis, "share_basis", pc.code); inEnum(m.party_kind, "party_kind", pc.code); inEnum(m.settlement_mode, "settlement_mode", pc.code); }
  must(pc.markup_share_rules.filter((m) => m.basis !== "fixed_pct").reduce((a, m) => a + m.pct, 0) <= 1, pc.code + " Σ shares ≤ 100 %");
  if (pc.rebate_rule) { inEnum(pc.rebate_rule.basis, "rebate_basis", pc.code); must(pc.rebate_rule.payout_currency, pc.code + " rebate needs payout_currency"); must(pc.rebate_rule.pct > 0 && pc.rebate_rule.pct < 1, pc.code + " rebate pct as a decimal"); }
}
for (const s of EX.senders) { must(s.sendable_to.length >= 1, s.code + " needs an allow-list"); for (const g of s.sendable_to) must(groupCodes.includes(g), s.code + " unknown group " + g); for (const o of s.fee_overrides) { must(partnerPairCodes.includes(o.partner_pair), s.code + " override on unknown partner pair"); must((o.sender_pays_pct === undefined) === (o.receiver_pays_pct === undefined), s.code + " override split: both or neither"); if (o.sender_pays_pct !== undefined) must(Math.abs(o.sender_pays_pct + o.receiver_pays_pct - o.pct) < 1e-12, s.code + " override parts must sum to pct"); } }
// invariant 8 for a quote-first deal: each group has an approved destination with every partner that may pay it
for (const pc of EX.partner_configs) for (const g of EX.receiver_groups) {
  const accts = EX.receivers.filter((r) => r.kind === "counterparty" && r.group === g.code).flatMap((r) => r.entities.flatMap((e) => e.accounts.map((a) => a.code)));
  must(pc.destination_approvals.some((r) => accts.includes(r.account) && r.approval_status === "approved"), `${pc.code}: group ${g.code} has no approved destination`);
}
if (errors.length) { console.error("EXAMPLE DOES NOT VALIDATE:\n" + errors.join("\n")); process.exit(1); }

// ------------------------------------------------------------------ YAML rendering of the example (hand-rolled, readable)
function yaml(v, indent = 0) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return " []";
    if (v.every((x) => typeof x !== "object")) return " [" + v.map((x) => yaml(x).trim()).join(", ") + "]";
    return "\n" + v.map((x) => (typeof x === "object" && x !== null ? pad + "- " + yaml(x, indent + 1).replace(/^\n\s*/, "").replace(/\n/g, "\n" + "  ") : pad + "- " + yaml(x, indent + 1).trim())).join("\n");
  }
  if (v && typeof v === "object") {
    return "\n" + Object.entries(v).map(([k, x]) => pad + k + ":" + (typeof x === "object" && x !== null && (Array.isArray(x) ? x.length && x.some((y) => typeof y === "object") : Object.keys(x).length) ? yaml(x, indent + 1) : " " + yaml(x, indent + 1).trim())).join("\n");
  }
  if (v === null) return " null";
  if (typeof v === "string") return " " + (/^[\w\-.…() '/]+$/.test(v) && !/^\d/.test(v) ? v : JSON.stringify(v));
  return " " + String(v);
}
const yamlText = yaml(EX).trim();

// ------------------------------------------------------------------ html
const fieldTable = (n) => {
  const e = D.E[n], r = RULES[n];
  const rv = REVIEW && REV.tables.has(n), M = (t) => (rv ? mk(t) : t);
  return `<h4 id="${n}">${M(esc(n))} <span class="scope">· ${M(esc(r.scope))}</span></h4>
<p class="desc">${(() => { const t = esc(hist(e.desc.replace(/\bv6\.1:?\s*/g, "").replace(/\s*\(?D58\)?,?/g, ""))); return rv ? mk(t) : REVIEW && REV.removed[n] ? t.replace(/bank_account_details_id|BANK_ACCOUNT_DETAILS[^.]*\./g, (m) => mk(m)) : t; })()}</p>
<table class="dd"><thead><tr><th style="width:26%">Field</th><th style="width:9%">Type</th><th style="width:9%">Required</th><th>Allowed values · default · meaning</th></tr></thead><tbody>
${e.f.filter((f) => f[0] !== "id" && !(r.hide || []).includes(f[0])).map((f) => {
  const req = r.req.includes(f[0]) ? "yes" : f[2] === "FK" && !/null|optional|when |nullable/.test(f[3] || "") && !["project_id", "sender_id", "receiving_entity_account_id", "partner_pair_id", "fee_structure_id", "own_wallet_id", "reserved_for_deal_id", "wallet_screening_id", "group_id", "partner_config_id", "relationship_owner"].includes(f[0]) ? "yes" : "no";
  const def = r.defaults && r.defaults[f[0]] !== undefined ? ` · default <b>${esc(String(r.defaults[f[0]]))}</b>` : "";
  const txt = note(f[3] ?? (f[2] === "FK" ? "reference" : ""));
  const F = (t) => (rv || (REVIEW && REV.fields.has(f[0])) ? mk(t) : t);
  return `<tr><td class="mono">${F(esc(f[0]))}</td><td>${F(esc(f[1]))}</td><td>${F(req)}</td><td>${F(esc(r.override && r.override[f[0]] ? r.override[f[0]](txt) : txt) + def)}</td></tr>`;
}).join("")}${REVIEW && REV.removed[n] ? `<tr><td class="mono">${dl(REV.removed[n])}</td><td>${dl("string")}</td><td></td><td>${dl("reference into the restricted file store")}</td></tr>` : ""}${(r.extraRows || []).map((f) => `<tr><td class="mono">${esc(f[0])}</td><td>${esc(f[1])}</td><td>${f[2]}</td><td>${esc(f[3])}</td></tr>`).join("")}
</tbody></table>
<ul class="rules">${r.rules.map((x) => `<li>${/class="rev"/.test(x) ? x : rv || (REVIEW && /bank_account_details|BANK_ACCOUNT_DETAILS/.test(x)) ? mk(esc(x)) : esc(x)}</li>`).join("")}</ul>${r.after || ""}`;
};

const tree = `<figure class="chart">${figSvg("config-fig1")}<figcaption>Figure 1 — The configuration model, with the project state (PROJECT.state, PROJECT.is_test) and the THRESHOLD kinds. Dashed boxes are global; everything inside the shaded area belongs to one project of one client.</figcaption></figure>`;

const CSS = `
mark.rev{background:#ffe58a;color:inherit;padding:0 1px} del.rev{color:#b00020;text-decoration:line-through} .rev-note{background:#ffe58a;padding:3pt 6pt;font-size:9pt;margin:0 0 8pt}
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

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Configuration Schema Specification v${V}</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Configuration Schema Specification · Draft v${V}</p><p class="small">Numbered with the ERD edition it is built against.</p><p class="org">New XP Technologies Limited</p><p class="date">${DATE} · Confidential</p></div>
<div class="rule"></div>

${REVIEW ? `<p class="rev-note"><b>Round-2 review draft, 27 October 2026 (findings 06.1 and 06.2 of the v6.0 design review, and the bank account details of 26 October).</b> Yellow = added or replaced; red strike = what goes. Nothing else has changed.</p>` : ""}
<h2>How to read this pack</h2>
<p>Four map pages are now part of the pack as documents of their own, and are the place to start: the Top-Down Map (from the business, through the data model and the deal states, to the scenarios and the reading order), the Deal Flow on one page (Quote, Collect, Convert, Settle, with the roles and the money path), the Workflow Tree (8 classes, 27 sub-classes, 92 procedures, each naming who initiates, who approves, the codes it is written under and the records it touches) and the Workflow Tree on one page. Read them in that order, then this document. Every worked transaction (T), acceptance vector (L, B), walkthrough (W, X), flow (F) and procedure (C, A, D) has one identifier, listed in the Reading Companion's identifier register; the Test Strategy &amp; Coverage document says which test proves each procedure.</p>

<h2>1 · How configuration is organised</h2>
<p>Four ideas carry the whole model. <b>A client has projects.</b> The client is the commercial relationship; each project is one arrangement with it, with its own settings, currency pairs, senders, receiver groups and partner configurations. <b>Parties are partner-independent.</b> Senders, receiver groups and receiving entities belong to the project, so the same Sender A → Receiver Y flow can run through Ali today and Jeton tomorrow. <b>How a partner is used is a block.</b> Fees and tiers, vehicles and their collection endpoints, the narrative and the rail that pay out, the destination approvals and the rebate rule all hang off one PARTNER_CONFIG, and a deal leg stamps the block's rows it was priced and routed on. <b>The partner's clock is the partner's.</b> Cutoff, time zone, holidays and overrides belong to the global PARTNER and apply wherever a pair says it relies on the banking channel.</p>
${tree}

<h2>1a · Creating a project, project states and effective-date rules</h2>
<h3>Creating a project from an archetype</h3>
<p>A new project is not set up field by field. It is created from one of the six project archetypes of the Client Operating Procedures (Part C): the archetype pre-fills the project's policies, its currency pairs with their rate-source chains, the fee structure and tiers of each partner pair, the message templates, the thresholds and the partner configuration block. Finance then changes only what differs for the client (names, parties, accounts, the fee percentages agreed) and proposes the project; Management approves it as one change. An existing project of the same archetype may be used as the source instead of the archetype itself (cloning), with the same rules. The guided setup screens that do this are built in milestone M0 of Phase 1.</p>
<p>${mk("<b>What a clone does not carry.</b> Cloning copies structure, not agreements. The new project records its source (archetype code, or the project it was cloned from), every copied row carries that source until a user confirms or changes it, and the fields of the <i>reconfirm list</i> are left empty on the new project and must be set explicitly before it can be validated: on the project, client, name, client label, exposure ceiling, settlement policy and every threshold with an amount or a currency; on each partner pair, the fee structure's percentage and its sender and receiver parts, the tiers, the minimum and maximum markup and the rate basis; on each partner configuration block, the partner entities, collection endpoints, settlement sending entities and rails, destination approvals, rebate rule and markup shares; on the parties, the senders, receiver groups, receivers, accounts, bank account details and allow-lists. A partner's cutoff, time zone and holidays are never copied: they belong to the partner, not the project, and the new project reads them from the partner it names. The reviewer's case, an Evo-like project cloned for a partner on a different rail and cost, therefore fails validation on the rail, the partner fee and the fee percentage until each is set for the new agreement; the activation checks are rule 15 of Section 6, and the validation report names every failing row and field.")}</p>
<h3>Project states: draft, validated, active</h3>
<p>A project carries a state in addition to its status. <b>draft</b>: the project is being set up; rows may be added and changed freely under the normal proposal and approval rules; no deal can be priced on it. <b>validated</b>: every cross-entity rule of Section 6 passes for the project and for each of its partner configuration blocks; the validation report lists each rule with its result and the rows concerned, and is kept with the project. <b>active</b>: Management has activated the validated project; deals may be priced and partner configurations used. A project returns to draft when a change proposal is approved that makes a rule fail, and must be validated again before it is used. A partner configuration block added later follows the same path on its own: it cannot be used on a deal until it passes the rules of Section 6. The validation report screen is built in M0; the rules themselves already exist (Section 6) and are evaluated on save.</p>
<h3>Effective-date rules</h3>
<p>Configuration is versioned by effective date (Change control, below). The four rules below say what a new version does to deals that already exist. They are stated in the same words in section 2 of the Lifecycle &amp; Approvals document.</p>
<table><thead><tr><th style="width:36%">Rule</th><th>What happens</th></tr></thead><tbody>
<tr><td>1. New versions apply to new pricing only</td><td>An approved configuration change takes effect for deals priced on or after its effective date. A deal priced before that date is not re-priced.</td></tr>
<tr><td>2. A priced deal keeps its versions</td><td>The fee structure version, the tier, the rate basis, the rounding options, the partner configuration and the policy versions stamped at pricing stay with the deal to the end of its life, including through settlement, return and loss handling.</td></tr>
<tr><td>3. A re-quote uses the configuration of the new pricing time</td><td>An expired or requoted leg is priced afresh on the versions in force when the new quote is made (a new deal group); the original leg keeps its stamp.</td></tr>
<tr><td>4. A collect-first deal uses the configuration in force when it is priced</td><td>A collect-first leg is priced at conversion, so it uses the versions effective at that time, not at the time the money arrived, unless a documented client agreement names a different rule for that project.</td></tr>
</tbody></table>
<p>Worked scenarios (the fee rises from 2.0 % to 2.2 % effective 1 November; proposed 28 October, approved 29 October). A: quoted 30 October, collected 31 October, converted 2 November, pays 2.0 % (rule 2). B: quoted 2 November, pays 2.2 % (rule 1). C: quoted 30 October, expired, re-quoted 2 November, pays 2.2 % (rule 3). D: collected 31 October with no prior quote, priced at conversion on 2 November, pays 2.2 % (rule 4). These four scenarios are demonstrated in Phase 1 (M4) for fees, tiers, rounding options and partner settings, not only the headline percentage.</p>

<div class="box"><b>Change control.</b> Configuration is versioned: thresholds, fee structures, tiers, templates, system settings and policies are new rows with an effective date, never edits. Finance proposes, Management approves (approver ≠ proposer, from the ROLE_RIGHT rows — D44), and every change is audited. Deals keep the versions they were priced on. Three rows are not approvals but audited records: a partner cutoff override (Finance, with the partner's agreement), a wallet screening (Operations${mk(" on a clear report; Management's decision on a second look")}) and a destination approval's status as reported by the partner.</div>

<h2>2 · Global master data and system settings</h2>
${GLOBAL.map(fieldTable).join("")}

<h2 class="pb">3 · Project settings</h2>
${PROJECT_LEVEL.map(fieldTable).join("")}

<h2 class="pb">4 · Parties: senders, receiver groups, receivers, entities, accounts, screenings</h2>
<p>${mk("Bank account details are rows of the database from this edition (decision of 26 October 2026): BANK_ACCOUNT_DETAILS below, one versioned row per bank account, with the fields of its rail taken from BANK_DETAILS_TEMPLATE (Section 2). The same row type serves a receiving entity's account, a partner's collection endpoint, a settlement rail, the details a partner holds under a destination approval, and a sender's source account. The restricted prefix of the file store keeps only the evidence.")}</p>
${PARTIES.map(fieldTable).join("")}

<h2 class="pb">5 · The partner configuration block</h2>
${PARTNER_BLOCK.map(fieldTable).join("")}
<p><b>Rebates and the percentages in this document.</b> The Jeton rebate of 0.4 % quoted in the worked example and in the Scenario Catalogue is not a fixed value: it is a PARTNER_REBATE_RULE row of the project's partner configuration, changed by a new version with a later effective_from like any fee, and NPL confirmed on 20 October that it is set per project, not per deal. Every percentage, rate and amount in Sections 2 to 7 is illustrative, taken from NPL's fee table of 8 October 2026, and is replaced by the project's configured values; none is written into code.</p>

<h2>6 · Cross-entity rules the system enforces on save</h2>
<ol>
<li>Every project belongs to one client; a project's exposure_ceiling never exceeds its client's; both are compared through REPORTING_VALUE, so a platform pair must exist for every currency that rests at a partner (D43).</li>
<li>Every project has exactly one default receiver group, created by the system. A counterparty receiver is in exactly one group; sender_return and partner_transit receivers are group-less and never on a forward deal or an allow-list (D13).</li>
<li>Every sender has an allow-list naming groups of the same project and a sender_return receiver for refunds; a sender with no allow-list cannot be chosen on a deal.</li>
<li>Every receiving entity has at least one account; accounts are unique per entity, currency and rail; a bank account ${dl("carries a bank-details reference")}${mk("names its BANK_ACCOUNT_DETAILS row")}, a wallet account a network and a checksum-valid address with rail = network (D14). A single-use account or endpoint names the one deal it serves (D32).</li>
<li>A partner pair's currency pair is a project pair; partner_pricing agrees with the partner's disclosure_style; partner_fee_pct is present exactly for fee_on_market; needs_bank_lock requires the partner's bank_cutoff_time and cutoff_timezone (D29).</li>
<li>A fee structure's sender and receiver parts add up to its pct; min_markup ≤ max_markup; a fixed customer-facing fee names its pct (D22); tiers have exactly one row at volume 0 (D21); a new version is a new row with a later effective_from.</li>
<li>A partner configuration that will pay out needs at least one partner entity, one settlement sending entity (narrative) and one settlement rail. A bank endpoint cannot go active without a rail (D18); a wallet endpoint's network is one the partner offers (D39); an own-desk configuration needs an own wallet of role own_desk (D23).</li>
<li>A currency pair needs at least one rate source with a unique priority before it is usable; nearest_n and round_up_n need a rounding unit; cash rounding needs its unit (D25). A platform pair has no project and ends in the reporting currency (D44).</li>
<li>A destination approval points at an account of a receiving entity in the same project; a quote-first deal for a group needs at least one approved destination with the chosen partner (invariant 8). A wallet account's approval carries its screening (D31).</li>
<li>A quote template prints sender-facing fields only (D36); a screening decision of accept_alternate lands only on an elevated-band endpoint (D31)${mk("; on a report that is not clear under the Strict rulebook the decision is Management's second look, never a Finance override; a partner's hold, freeze or decline is recorded, never overridden")}; a cutoff override is a one-day or a weekday rule, never both; an extension names the partner's agreement.</li>
<li>quote_freshness_min is shorter than quote_validity_min; all percentages are stored as decimals; Σ markup shares of one base ≤ 100 % (D26); a rebate rule is pct_of_amount with a payout currency (D46).</li>
<li>applicable_for_reroute, is_own_desk, exposure ceilings, thresholds, fee structures and tiers, templates, system settings and platform pairs are Management-approved changes; users and roles need a second Management user (D44).</li>
<li>A project is validated only when rules 1 to 12${mk(", 14 and 15")} pass for it and for each of its partner configuration blocks; only a validated project can be activated, and only Management activates it. A partner configuration block added to an active project cannot be used on a deal until the rules pass for it.</li>
<li>${mk("A bank account, a bank endpoint and a settlement rail name a BANK_ACCOUNT_DETAILS row of the same currency and rail and can be active only while that row is active; a row is saved only when the rail's template is satisfied (required fields present, format rules passed: IBAN check digits, BIC length, sort-code pattern) and its evidence is attached; a change to any detail is a new row that supersedes the old one, never an edit; a details row is approved by Finance or Management, never by the Operations user who entered it.")}</li>
<li>${mk("A project created from an archetype or cloned from another project activates only when: every field of the reconfirm list of 1a is set on the new project itself, not inherited (a copied value counts only once a user has confirmed it on the row); every version the project references (fee structure, tiers, policies, thresholds, templates, platform pairs) is the version in force on the activation date, not one superseded since the source was set up; every partner configuration block's route is complete for the methods it will use (an active endpoint per collection method, a rail and a sending entity per bank payout, an approved destination for each group that will be paid, the partner's current partner_pricing, partner_fee_pct and cutoff); and ROLE_RIGHT rows exist for every controlled action with at least one approving role that is not the initiating role. The validation report lists each failure by entity, row and field with what fixes it; activation with any failure is refused.")}</li>
</ol>

<h2 class="pb">7 · Worked example: the FRS project, end to end</h2>
<p>The FRS describes one client flow: Sender A and Sender B pay USDT, partners Ali (through its PT vehicles) or Jeton convert to EUR, and Receiver X (Entity X1, Entity X2) and Receiver Y are paid in euros. Below is that project expressed in the schema. Names, policies and the fee split come from NPL's documents; rates of fee, thresholds, holidays, addresses and reference numbers are <b>illustrative placeholders</b> to be replaced with NPL's values.</p>
<p>How to read it: one block per entity type, in the order of Sections 2 to 5. A code such as <code>DEFAULT</code> or <code>X1-EUR-SEPA</code> is how one row refers to another; the system assigns the numeric ids. Jeton's pending destination for Receiver Y and Sender B's fee override are there on purpose, to show a rule at work.</p>
<pre class="yaml">${esc(yamlText)}</pre>

<h3>What each part does in one deal</h3>
<table><thead><tr><th style="width:30%">Step of the deal</th><th>Configuration it reads</th></tr></thead><tbody>
<tr><td>Sender A asks to send USDT for Receiver Y</td><td>SENDER Sender A; the allow-list names the default group, so the deal is attributed to <code>DEFAULT</code>; Receiver Y is a counterparty receiver in it.</td></tr>
<tr><td>Operations picks Ali for USDT → EUR</td><td>PARTNER_CONFIG CLIENT1-ALI, PARTNER_PAIR USDT-EUR (fee_in_rate: Ali's margin is inside its rate; needs_bank_lock, so Ali's 14:30 Hong Kong (GMT+8) cutoff governs the rate lock), its current FEE_STRUCTURE: basis market, fixed 1.00 % (0.40 % sender, 0.60 % receiver), customer-facing figures as actual. Jeton, the alternative, is fee_on_market at 0.50 % and binds no cutoff.</td></tr>
<tr><td>Sender B instead of Sender A</td><td>FEE_OVERRIDE: 1.20 % split 0.60 / 0.60 on CLIENT1-ALI/USDT-EUR from 1 October, Management-approved; the structure's other terms still apply (D20).</td></tr>
<tr><td>Market rate</td><td>CURRENCY_PAIR USDT-EUR, source chain Kraken then CMC, 5 decimals; a snapshot older than 120 s is not used; both feeds down → manual rate with Finance approval.</td></tr>
<tr><td>Quote clocks and the package</td><td>PROJECT: freshness 5 min, validity 60 min, grace 15 min if drift ≤ 0.10 %; beyond grace the policy is re-quote; an extension before validity ends is a QUOTE_VALIDITY_EXTENSION (D45). The package is rendered from MESSAGE_TEMPLATE quote v1, which prints the five sender-facing fields only.</td></tr>
<tr><td>Can the quote leave Inquiry?</td><td>DESTINATION_APPROVAL: Receiver Y's account Y-EUR-SWIFT is approved with Ali, so yes. Through Jeton it is still pending_partner, so a quote-first deal for Receiver Y cannot be routed through Jeton until the partner approves (invariant 8) — while Receiver X could.</td></tr>
<tr><td>Where does Sender A pay?</td><td>PARTNER_ENTITY PT-tour, its TRC-20 USDT COLLECTION_RECEIVING_ENDPOINT (standard band). Sender A's wallet is screened first (WALLET_SCREENING${mk("; clear under the Strict rulebook, so Operations decides accept")}); an accept_alternate decision ${mk("(Management's, on a second look) ")}would land on PT Global's elevated-band wallet instead. Provenance is recorded against his COLLECTION_SENDING_ENTITY.</td></tr>
<tr><td>Conversion</td><td>Receiver part taken at conversion (receiver_fee_timing); Converting may not start before conversion_due_date — the next Hong Kong business day after a post-cutoff lock, skipping Ali's HOLIDAY rows and the Friday early close (D29, D34); variance tolerance 0.20 % (THRESHOLD rate_variation_rel).</td></tr>
<tr><td>Payout</td><td>SETTLEMENT from Ali through SETTLEMENT_RAIL "Ali's EU bank / EMI" under the narrative "PT Global Inc" to Y-EUR-SWIFT; amount_rounding exact (cents go out); settlement_policy to_zero; expected bank fee 25 EUR, treatment carry_forward; Management approval above 50,000 EUR or for a third same-day slot.</td></tr>
<tr><td>If Ali is unavailable</td><td>REROUTE to Jeton (applicable_for_reroute = true) via OWN_WALLET AQN-LT-SUB (role reroute_contingency), custody limit 48 hours; Jeton's rebate of 0.40 % of the amount, in USDT, accrues on what Jeton converts (PARTNER_REBATE_RULE).</td></tr>
<tr><td>Refund</td><td>A rejected payout opens a return leg to RET_SND_A, the sender_return receiver, through the same destination-approval path; the network-fee policy absorbed applies unless a FEE_DECISION says otherwise.</td></tr>
<tr><td>Reporting</td><td>SYSTEM_SETTING reporting_currency USD; the platform pairs USDT-USD and EUR-USD convert every balance for the client-level ceiling (CLIENT.exposure_ceiling 400,000) and for the project's own cap (250,000).</td></tr>
</tbody></table>

<p class="small"><i>Draft v${V} — for review with NPL. Illustrative values are marked as such in Section 7.</i></p>
</body></html>`;

const base = REVIEW ? "NPLify-Configuration-Schema-review" : `NPLify-Configuration-Schema-v${V}`;
const h = path.join(outDir, `${base}.html`), p = path.join(outDir, `${base}.pdf`);
fs.writeFileSync(h, clientFacing(html));
fs.writeFileSync(path.join(outDir, "config-example-client1.json"), JSON.stringify(EX, null, 2));
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "· example validated, entities:", ALL.length);
