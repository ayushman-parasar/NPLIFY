import erd from "@data/erd.v5.json";

type Field = [string, string, string?, string?];
type Entity = { d: string; col: number; desc: string; f: Field[]; v?: string; ch?: string[] };
type Relation = [string, string, string, string, string, string, string?];
type OpenQuestion = { q: string; blocks: string; status: string; a: string; impl: string; ents: string[] };
type Scenario = { id: string; name: string; story: string; trace: [string, string, string[]][]; verdict: string; fix: string };
type Walk = { name: string; steps: [string, string][] };

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
};

export const data = erd as unknown as ErdData;
export const KB_VERSION = `erd-v${data.version}`;

/** The whole model rendered as text: the assistant's knowledge base. Deterministic, so it caches. */
export function buildKnowledgeBase(d: ErdData = data): string {
  const L: string[] = [];
  L.push(d.DOC_META, "", `THIS IS ERD DRAFT v${d.version} (8 October 2026), which supersedes v5.1, v5.0, v4.0 and v3.0. It incorporates the ERD review decisions of 6–8 October 2026: D13 (no return group; return and hop legs inherit the parent leg’s attribution), D14 (explicit wallet fields on receiving-entity accounts), D15 (FACILITATING_ENTITY renamed PARTNER_ENTITY, pending NPL confirmation; the partner’s collection endpoints merged into COLLECTION_RECEIVING_ENDPOINT), and the v5.2 decisions D16 (registration payout details follow the account’s kind), D17 (DISBURSEMENT_LINE.deal_id), D18 (nullable rail on collection endpoints) and D19 (endpoint kind matches the leg’s collection method), with invariant 19.`, "", "CONVENTIONS:", ...d.CONVENTIONS.map((c) => "- " + c), "");
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
  L.push("", "=== SECOND SOURCE: ERD REVIEW DECISION RECORD (6–7 October 2026) ===", d.DECISIONS);
  L.push("", "=== THIRD SOURCE: NPLify — Project Understanding v1.0 (Sud’s comments) ===", d.UNDERSTANDING);
  return L.join("\n");
}

/** Standing instructions for the assistant. Kept stable so the prefix caches. */
export const RULES = `You are the assistant built into the interactive map of the NPLify P0 entity-relationship model (ERD), used by NPL staff. Your knowledge base is exactly three sources reproduced below: (1) the ERD & Data Model Draft v5.2 as shown on the map; (2) the ERD review decision record of 6–8 October 2026 (decisions D1–D19), which records the scenarios reviewed, the decisions taken and their reasons; and (3) the Project Understanding v1.0 with Sud’s comments, the business understanding the ERD was built from. Answer every question strictly from them: entities, fields, types, keys, relationships and cardinalities, data flow, domains, invariants, notes, derived views, open questions and their answers, FRS reconciliation, business rules, roles, exceptions, scenarios and the typical flows. When asked why something is modelled a certain way, use the decision record. If something is in none of the sources, say so plainly and name the closest open question or invariant; never invent tables, fields or rules, and never answer questions unrelated to this model. If sources disagree, say which says what; the decision record is the newest.

Style: precise and compact. Name entities exactly as in the model (UPPER_SNAKE_CASE) and fields in snake_case, in backticks. When describing a path between entities, list it step by step with the foreign key that carries each hop. Short paragraphs or bullet lists. Quantities and formulas exactly as written.

At the very end of every answer add one final line in exactly this form, listing up to 12 entity names from the model that the answer is about (exact names, comma separated), or an empty list if none apply:
[[map: ENTITY_A, ENTITY_B]]`;

export const SYSTEM_PROMPT = `${RULES}\n\n=== KNOWLEDGE BASE ===\n${buildKnowledgeBase()}`;
