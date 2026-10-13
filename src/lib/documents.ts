// The document pack shown on /documents and served by /documents/[file]. Only files listed here are served,
// from the docs/ folder of the repo (traced into the deployment by next.config.ts). Keep the newest edition of
// each document here; older editions stay in docs/ for the record but are not served.

export type DocFormat = "html" | "pdf" | "xlsx" | "docx" | "json";
export type Audience = "client" | "staff";

export type Doc = {
  slug: string;
  title: string;
  version: string;
  blurb: string;
  audience: Audience; // client: visitors may open it; staff: NPL and New XP accounts only
  files: Partial<Record<DocFormat, string>>; // file names inside docs/
  group: "model" | "design" | "working";
};

export const DOCS: Doc[] = [
  {
    slug: "erd",
    title: "ERD & Data Model",
    version: "v5.9",
    blurb: "The entity-relationship diagram and data dictionary behind the interactive map: every table, field, key and link, the derived views and the notes per domain.",
    audience: "client",
    files: { html: "NPLify-P0-ERD-v5.9.html", pdf: "NPLify-P0-ERD-v5.9.pdf" },
    group: "model",
  },
  {
    slug: "ledger",
    title: "Ledger Posting Design",
    version: "v5.9",
    blurb: "The chart of accounts and how every deal, collection, conversion, settlement, fee, share, rebate, variance, loss and reseller invoice becomes append-only postings, with the balances and reports derived from them.",
    audience: "client",
    files: { html: "NPLify-Ledger-Posting-Design-v5.9.html", pdf: "NPLify-Ledger-Posting-Design-v5.9.pdf" },
    group: "design",
  },
  {
    slug: "ledger-companion",
    title: "Ledger Patterns — Reading Companion",
    version: "v5.9",
    blurb: "The same worked transactions as the Ledger Posting Design, laid out with a plain-language explanation beside each table, for readers with no bookkeeping background.",
    audience: "client",
    files: { html: "NPLify-Ledger-Patterns-Companion-v5.9.html", pdf: "NPLify-Ledger-Patterns-Companion-v5.9.pdf" },
    group: "design",
  },
  {
    slug: "lifecycle",
    title: "Lifecycle & Approvals",
    version: "v5.9",
    blurb: "The states a deal, a settlement, a conversion, a reroute, a loss event and an earnings offset move through, the 35 controlled actions along the way, and who may initiate, approve or escalate each.",
    audience: "client",
    files: { html: "NPLify-Lifecycle-and-Approvals-v5.9.html", pdf: "NPLify-Lifecycle-and-Approvals-v5.9.pdf" },
    group: "design",
  },
  {
    slug: "roles",
    title: "Roles & Visibility Matrix",
    version: "v5.9",
    blurb: "Which role sees which figures and may take which action: Operations, Finance and Management as nested rings, the approval rights per controlled action, and every field of the model classified.",
    audience: "client",
    files: { html: "NPLify-Roles-and-Visibility-Matrix-v5.9.html", pdf: "NPLify-Roles-and-Visibility-Matrix-v5.9.pdf" },
    group: "design",
  },
  {
    slug: "calculation",
    title: "Calculation Specification",
    version: "v5.9",
    blurb: "Every calculation the engine performs, in order, with its rounding rule: fee parts on the principal, target-out quotes, tiers, rounding, shares and rebates, the four variance kinds, invoice instalments, earnings offsets and the reseller arithmetic, with acceptance vectors checked against NPL's own figures.",
    audience: "client",
    files: { html: "NPLify-Calculation-Specification-v5.9.html", pdf: "NPLify-Calculation-Specification-v5.9.pdf" },
    group: "design",
  },
  {
    slug: "configuration",
    title: "Configuration Schema",
    version: "v5.9",
    blurb: "Every configuration table — client, system settings, project, parties, the partner block — with its fields, allowed values, defaults and the rules checked on save, and one client's configuration as a validated example.",
    audience: "client",
    files: { html: "NPLify-Configuration-Schema-v5.9.html", pdf: "NPLify-Configuration-Schema-v5.9.pdf" },
    group: "design",
  },
  {
    slug: "architecture",
    title: "Architecture & Stack Note",
    version: "v5.9",
    blurb: "One app, one database and one bucket in NPL's AWS account, expanded against the model: the background jobs, the insert-only ledger enforced in the database, the visibility filter, environments, backups and cost.",
    audience: "client",
    files: { html: "NPLify-Architecture-and-Stack-v5.9.html", pdf: "NPLify-Architecture-and-Stack-v5.9.pdf" },
    group: "design",
  },
  {
    slug: "cutover",
    title: "Cutover Approach",
    version: "v5.9",
    blurb: "From the spreadsheets to NPLify: a parallel run of three to four weeks on a staging instance, earlier deals entered as real postings, the daily reconciliation, the exit criteria and the switch on a quiet day.",
    audience: "client",
    files: { html: "NPLify-Cutover-Approach-v5.9.html", pdf: "NPLify-Cutover-Approach-v5.9.pdf" },
    group: "design",
  },
  {
    slug: "operating-procedures",
    title: "Operating Procedures",
    version: "v5.9",
    blurb: "One standard operating procedure per project — BF, BF Sub, BF Withdrawal, Evo, NPL-GR, YN Remit, 66 Group, GDC, Peru, JTN, Jonas, AK Personal — on top of the ten common procedures for collecting and paying out and the standing procedures of the day.",
    audience: "client",
    files: { html: "NPLify-Operating-Procedures-v5.9.html", pdf: "NPLify-Operating-Procedures-v5.9.pdf" },
    group: "design",
  },
  {
    slug: "gaps",
    title: "Model Gaps & Proposals",
    version: "v1.0",
    blurb: "The gaps found while tracing NPL's fee practice through the model, and the proposals (A–M) that became decisions D20–D33.",
    audience: "staff",
    files: { html: "NPLify-Model-Gaps-and-Proposals-v1.0.html", pdf: "NPLify-Model-Gaps-and-Proposals-v1.0.pdf" },
    group: "working",
  },
  {
    slug: "fee-outlines",
    title: "Fee Outlines workbook",
    version: "v0.2",
    blurb: "NPL's fee table with the fill-in register, the simulated transaction patterns and NPL's answers of 8 October.",
    audience: "staff",
    files: { xlsx: "NPLify-Fee-Outlines-v0.2.xlsx" },
    group: "working",
  },
  {
    slug: "understanding",
    title: "Project Understanding",
    version: "v1.1",
    blurb: "The business understanding the model was built from, with NPL's review comments.",
    audience: "staff",
    files: { docx: "NPLify-Project-Understanding-v1.1.docx" },
    group: "working",
  },
];

export const GROUPS: { id: Doc["group"]; title: string; blurb: string }[] = [
  { id: "model", title: "The model", blurb: "Start here: the diagram itself." },
  { id: "design", title: "Design specifications", blurb: "How the model behaves and how it is built: postings, lifecycle, roles, arithmetic, configuration, architecture, cutover and the operating procedures per project." },
  { id: "working", title: "Working papers", blurb: "Internal material behind the decisions. Staff only." },
];

export const CONTENT_TYPES: Record<DocFormat, string> = {
  html: "text/html; charset=utf-8",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  json: "application/json; charset=utf-8",
};

export const FORMAT_LABEL: Record<DocFormat, string> = { html: "Read online", pdf: "PDF", xlsx: "Excel", docx: "Word", json: "JSON" };

export function visibleDocs(isVisitor: boolean): Doc[] {
  return isVisitor ? DOCS.filter((d) => d.audience === "client") : DOCS;
}

/** Finds the document and format that serve a given file name, or null if the file is not part of the pack. */
export function findFile(file: string): { doc: Doc; format: DocFormat } | null {
  for (const doc of DOCS) {
    for (const [format, name] of Object.entries(doc.files) as [DocFormat, string][]) {
      if (name === file) return { doc, format };
    }
  }
  return null;
}
