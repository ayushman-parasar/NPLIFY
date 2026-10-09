import erd from "@data/erd.v5.json";

type Field = [string, string, string?, string?];
type Entity = { d: string; col: number; desc: string; f: Field[]; v?: string; ch?: string[] };
type Relation = [string, string, string, string, string, string, string?];
type OpenQuestion = { q: string; blocks: string; status: string; a: string; impl: string; ents: string[] };
type Scenario = { id: string; name: string; story: string; trace: [string, string, string[]][]; verdict: string; fix: string };
type Walk = { name: string; steps: [string, string][] };
type ScenarioCatalogue = { intro: string; projects: { client: string; projects: string; lead: string; scenarios: [string, string, string, string][] }[]; flows: [string, string, string, string][]; open_questions: string[]; answered_questions: [string, string][] };
type FeePractice = { intro: string; projects: { project: string; category: string; context: string }[]; payment_methods: { partner: string; method: string; process: string }[]; fee_table: Record<string, string>[]; answers: string[]; proposals: [string, string, string][]; documents: [string, string][] };

export type ErdData = {
  version: string;
  DOMS: Record<string, { name: string; c: string }>;
  COLS: { t: string; s: string }[];
  E: Record<string, Entity>;
  ORDER: Record<string, string[]>;
  R: Relation[];
  INV: [string[], string][];
  WALKS: Walk[];
  DOC_META: string;
  CONVENTIONS: string[];
  NOTES: Record<string, string[]>;
  OPENQ: OpenQuestion[];
  UND_NEW: string[];
  FRS_VOCAB: [string, string][];
  FRS_DEV: [string, string, string][];
  UNDERSTANDING: string;
  DECISIONS: string;
  SCENARIOS: Scenario[];
  SCENARIO_V4: Record<string, string>;
  FEE_PRACTICE: FeePractice;
  SCENARIO_CATALOGUE: ScenarioCatalogue;
};

export const data = erd as unknown as ErdData;
export const KB_VERSION = `erd-v${data.version}`;

/** The whole model rendered as text: the assistant's knowledge base. Deterministic, so it caches. */
export function buildKnowledgeBase(d: ErdData = data): string {
  const L: string[] = [];
  L.push(d.DOC_META, "", `THIS IS ERD DRAFT v${d.version} (9 October 2026), the consolidated edition of the 8–9 October work, which supersedes v5.3, v5.2, v5.1, v5.0, v4.0 and v3.0. v5.4 adds D38 — CLIENT above PROJECT (a client runs several arrangements; CLIENT_POSITION rolls their figures up). It carries the review decisions of 6–8 October 2026 — D13 (no return group; return and hop legs inherit the parent leg’s attribution), D14 (explicit wallet fields on receiving-entity accounts), D15 (FACILITATING_ENTITY renamed PARTNER_ENTITY, confirmed by NPL on 9 October; the partner’s collection endpoints merged into COLLECTION_RECEIVING_ENDPOINT), D16 (registration payout details follow the account’s kind), D17 (SETTLEMENT_LINE.deal_id), D18 (nullable rail on collection endpoints), D19 (endpoint kind matches the leg’s collection method) — and applies the fee-practice decisions of 8–9 October 2026, D20–D33: FEE_OVERRIDE with its own split (D20), FEE_TIER volume tiers per calendar month with DEAL_FEE_TIER portions (D21), the displayed fee on FEE_STRUCTURE and DEAL_GROUP (D22), NPL-GR as an own-desk project with invariant 3 restated (D23), INVOICE and per-line discharge with the INVOICE_BALANCE view (D24), a rounding menu per pair with a signed residual (D25), MARKUP_SHARE_RULE as a share of the net markup settled by the party (D26), rebates as their own stream EARN_REBATE with a rule basis and scope (D27), partner rates stored as quoted with direction (D28), the partner’s bank cutoff with per-day overrides, binding the rate lock and the outgoing bank settlement, with a pending converted value in PROJECT_BALANCE (D29), cash by token with rates per city (D30), WALLET_SCREENING as an Operations action with endpoint risk bands (D31), single-use endpoints and accounts and LOSS_EVENT with a shared, possibly partial loss (D32), same-currency pass-through converted at rate 1 (D33), and the FRS terms that had no home — HOLIDAY dates behind every next business day (D34), QUOTE_PACKAGE as the record of what was sent (D35), MESSAGE_TEMPLATE with the fields it may print (D36), and the naming alignment with the FRS and NPL’s words — SETTLEMENT for disbursement, MARKUP_SHARE_* for introducer / referral, DESTINATION_APPROVAL for settlement registration, sender_pays / receiver_pays, min_markup / max_markup, customer_facing_* (D37), and NPL’s operational answers of the same evening — partner methods as configuration (D39), bridge wallets and the WALLET_REGISTRY view (D40), cash settlement evidence and Finance-recommends-Management-approves for fee concessions (D41), and a once-only Finance-approved extension of a quote’s validity at the same price (D42), and a system reporting currency with REPORTING_VALUE as a display-only estimate at the latest market rate (D43). 65 tables, 9 views, invariants 1–38; amendments of 9 October to D15 (closed), D27 and D29 recorded.`, "", "CONVENTIONS:", ...d.CONVENTIONS.map((c) => "- " + c), "");
  L.push("DOMAIN LAYOUT (left to right on the map): " + d.COLS.map((c, i) => `${i + 1}. ${c.t} — ${c.s}`).join("; "), "");
  const byDom: Record<string, string[]> = {};
  for (const n of Object.keys(d.E)) (byDom[d.E[n].d] ||= []).push(n);
  for (const dom of Object.keys(byDom)) {
    L.push(`=== DOMAIN: ${d.DOMS[dom].name} ===`);
    for (const n of byDom[dom]) {
      const e = d.E[n];
      L.push(`## ${n}${dom === "view" ? " (derived view, never stored)" : ""}`);
      L.push(e.desc);
      L.push((dom === "view" ? "parameters: " : "fields: ") + e.f.map((r) => r[0] + (r[1] ? " " + r[1] : "") + (r[2] ? " " + r[2] : "") + (r[3] ? " (" + r[3] + ")" : "")).join("; "));
      const inc = d.R.filter((r) => r[1] === n && r[0] !== n);
      const out = d.R.filter((r) => r[0] === n && r[1] !== n);
      const self = d.R.filter((r) => r[0] === n && r[1] === n);
      if (inc.length) L.push("fed by (upstream): " + inc.map((r) => `${r[0]} [${r[2]}, ${r[5]}${r[3] ? ", via " + n + "." + r[3] : ""}] — ${r[4]}`).join("; "));
      if (out.length) L.push("feeds (downstream): " + out.map((r) => `${r[1]} [${r[2]}, ${r[5]}${r[3] ? ", via " + r[1] + "." + r[3] : ""}] — ${r[4]}`).join("; "));
      if (self.length) L.push("self reference: " + self.map((r) => `${r[3]} — ${r[4]} (${r[5]})`).join("; "));
      L.push("");
    }
  }
  L.push("ASSOCIATION KINDS: owns = composition, parent owns child lifecycle; refs = reference / lookup / FK stamped at quote; poly = polymorphic link resolved by a type column plus an id; view = a derived figure computed from the source; actor = approver / confirmer FKs to USER; self = self reference. Arrow direction = direction of data flow: from the referenced row into the row that stores the foreign key.", "");
  L.push("INVARIANTS (enforced at write time):", ...d.INV.map((i, k) => `${k + 1}. ${i[1]}`), "");
  for (const dom of Object.keys(d.NOTES)) L.push(`NOTES — ${dom}:`, ...d.NOTES[dom].map((x) => "- " + x), "");
  L.push("OPEN QUESTIONS AND REVIEW POINTS (question · blocks · status · recorded answer · how the current draft reflects it):", ...d.OPENQ.map((q, i) => `${i + 1}. ${q.q} — blocks: ${q.blocks} — status: ${q.status === "answered" ? "ANSWERED" : q.status === "pending" ? "PENDING (material to come)" : "STILL OPEN (to be discussed)"} — answer: ${q.a} — in the model: ${q.impl}${q.ents.length ? " — entities: " + q.ents.join(", ") : ""}`), "");
  L.push("NEW FACTS FROM SUD’S COMMENTS ON THE UNDERSTANDING DOCUMENT:", ...d.UND_NEW.map((x) => "- " + x), "");
  L.push("APPENDIX A.1 FRS VOCABULARY (FRS term → model entity):", ...d.FRS_VOCAB.map((v) => `- ${v[0]} → ${v[1]}`), "");
  L.push("APPENDIX A.2 DEVIATIONS FROM THE FRS (FRS statement | model | classification):", ...d.FRS_DEV.map((v) => `- ${v[0]} | ${v[1]} | ${v[2]}`), "");
  L.push("TYPICAL FLOWS (ordered walkthroughs):");
  d.WALKS.forEach((w) => L.push(`* ${w.name}: ` + w.steps.map((st, i) => `${i + 1}) ${st[0]}: ${st[1]}`).join(" ")));
  L.push("", "EDGE-CASE SCENARIOS TRACED AGAINST v3.0 AND THEIR v4.0 RESOLUTION:");
  d.SCENARIOS.forEach((sc) => L.push(`* ${sc.id} — ${sc.name}`, "Scenario: " + sc.story, ...sc.trace.map((t, i) => `  ${i + 1}) ${t[0]}: ${t[1]}`), "v3.0 verdict: " + sc.verdict, "v4.0 resolution: " + (d.SCENARIO_V4[sc.id] ?? ""), ""));
  L.push("", "=== SECOND SOURCE: ERD REVIEW DECISION RECORD (6–9 October 2026, D1–D33) ===", d.DECISIONS);
  L.push("", "=== THIRD SOURCE: NPLify — Project Understanding v1.0 (Sud’s comments) ===", d.UNDERSTANDING);
  const fp = d.FEE_PRACTICE;
  L.push("", "=== FOURTH SOURCE: NPL’S FEE PRACTICE (fee table of October 2026; Sud’s answers and tabs of 8 October 2026; clarifications of 8–9 October) ===", fp.intro, "");
  L.push("PROJECTS AS NPL RUNS THEM TODAY (NPL’s own words, ‘Project Context’ tab):", ...fp.projects.map((p) => `* ${p.project} [${p.category}]: ${p.context}`), "");
  L.push("PAYMENT METHODS AND THEIR PROCESS (NPL’s own words, ‘Payment methods’ tab):", ...fp.payment_methods.map((m) => `* ${m.partner} — ${m.method}: ${m.process}`), "");
  L.push("FEE TABLE (one line per client / product; fee, partner cost and margin are NPL’s figures; derived economics — Finance and Management only):", ...fp.fee_table.map((r, i) => `${i + 1}. ${r.client} — partner ${r.partner}; total fee ${r.total_fee}; partner cost ${r.partner_cost}; NPL margin ${r.npl_margin}; pair ${r.pair}; earnings share ${r.earnings_share || "none"}${r.note ? "; note: " + r.note : ""}; customer-facing calculation: ${r.customer_facing_calculation}; internal: ${r.internal_calculation}`), "");
  L.push("FACTS CONFIRMED BY NPL (8–9 October 2026):", ...fp.answers.map((a) => "- " + a), "");
  L.push("THE THIRTEEN GAPS (proposals A–M of ‘Model Gaps & Proposals v1.0’) AND THE v5.3 DECISION THAT APPLIED EACH:", ...fp.proposals.map((p) => `- ${p[0]}: ${p[1]} → ${p[2]}`), "");
  L.push("DOCUMENTS OF THE P0 PACK AND THEIR CURRENT VERSION:", ...fp.documents.map((x) => `- ${x[0]}: ${x[1]}`), "");
  const sc = d.SCENARIO_CATALOGUE;
  L.push("", "=== FIFTH SOURCE: SCENARIO CATALOGUE (9 October 2026) — every NPL client and project, its scenarios, the shared flow each uses and the tables that carry it ===", sc.intro, "");
  for (const p of sc.projects) {
    L.push(`## CLIENT: ${p.client} — projects: ${p.projects}`, p.lead);
    for (const [name, what, fee, erd] of p.scenarios) L.push(`* ${name} — what happens: ${what} — fee and flows: ${fee} — ERD path: ${erd}`);
    L.push("");
  }
  L.push("SHARED OPERATIONAL FLOWS (referenced as F1–F10 above):", ...sc.flows.map((f) => `${f[0]} ${f[1]} — ${f[2]} — ERD path: ${f[3]}`), "");
  L.push("OPERATIONAL QUESTIONS AND NPL’S ANSWERS (9 October 2026):", ...sc.answered_questions.map((q) => `- ${q[0]}: ${q[1]}`), "");
  if (sc.open_questions.length) L.push("STILL TO CONFIRM WITH NPL:", ...sc.open_questions.map((q) => "- " + q), "");
  return L.join("\n");
}

/** Standing instructions for the assistant. Kept stable so the prefix caches. */
export const RULES = `You are the assistant built into the interactive map of the NPLify P0 entity-relationship model (ERD), used by NPL staff. Your knowledge base is exactly five sources reproduced below: (1) the ERD & Data Model Draft v5.4 as shown on the map; (2) the ERD review decision record of 6–9 October 2026 (decisions D1–D43), which records the scenarios reviewed, the decisions taken and their reasons; (3) the Project Understanding v1.0 with Sud’s comments, the business understanding the ERD was built from; and (4) NPL’s fee practice — the fee table, Sud’s answers and his Project Context and Payment methods notes of 8 October 2026 — which is business fact in NPL’s own words and the basis of decisions D20–D33; and (5) the scenario catalogue of 9 October 2026 — every NPL client and project with its scenarios, the shared operational flow each uses (F1–F10) and the tables that carry it, in v5.4 names. Answer every question strictly from them: entities, fields, types, keys, relationships and cardinalities, data flow, domains, invariants, notes, derived views, open questions and their answers, FRS reconciliation, business rules, roles, exceptions, scenarios and the typical flows. When asked why something is modelled a certain way, use the decision record. If something is in none of the sources, say so plainly and name the closest open question or invariant; never invent tables, fields or rules, and never answer questions unrelated to this model. If sources disagree, say which says what; the decision record and the fee-practice source are the newest. Figures in the fee table (partner costs, NPL margins, rebates, shares) are derived economics: give them when asked, but say they are Finance-level figures. When NPL staff ask how one of their clients’ deals or projects works, answer first in NPL’s own words from the scenario catalogue and the fee practice (what happens, which partner, which flow), then name the tables and the decision; for a question about a client across its arrangements, use CLIENT → PROJECT and the CLIENT_POSITION view, and PROJECT_BALANCE for one arrangement at one partner.

Style: precise and compact. Name entities exactly as in the model (UPPER_SNAKE_CASE) and fields in snake_case, in backticks. When describing a path between entities, list it step by step with the foreign key that carries each hop. Short paragraphs or bullet lists. Quantities and formulas exactly as written.

At the very end of every answer add one final line in exactly this form, listing up to 12 entity names from the model that the answer is about (exact names, comma separated), or an empty list if none apply:
[[map: ENTITY_A, ENTITY_B]]`;

export const SYSTEM_PROMPT = `${RULES}\n\n=== KNOWLEDGE BASE ===\n${buildKnowledgeBase()}`;
