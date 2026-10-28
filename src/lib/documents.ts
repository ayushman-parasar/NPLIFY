// The document pack shown on /documents and served by /documents/[file]. Only files listed here are served,
// from the docs/ folder of the repo (traced into the deployment by next.config.ts). Keep the newest edition of
// each document here; older editions stay in docs/ for the record but are not served.
// v6.1 (28 October 2026): round 2 of the design review and the Email OTP change request applied. HTML and PDF are both the
// builder's output, so they always say the same thing. The four map pages are hand-edited HTML; their PDFs are rendered from it.

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
    slug: "top-down-map",
    title: "Top-Down Map",
    version: "v6.1",
    blurb: "One page from the business, through the data model and the deal states, to the scenarios and the reading order of the pack. Start here.",
    audience: "client",
    files: { html: "NPLify-Top-Down-Map.html", pdf: "NPLify-Top-Down-Map-v6.1-client.pdf" },
    group: "model",
  },
  {
    slug: "deal-flow",
    title: "Deal Flow on one page",
    version: "v6.1",
    blurb: "Quote, Collect, Convert, Settle on one page, with the roles and the money path.",
    audience: "client",
    files: { html: "NPLify-Deal-Flow-Simple.html", pdf: "NPLify-Deal-Flow-One-Page-v6.1-client.pdf" },
    group: "model",
  },
  {
    slug: "workflow-tree",
    title: "Workflow Tree",
    version: "v6.1",
    blurb: "8 classes, 27 sub-classes, 93 procedures: each naming who initiates, who approves, the codes it is written under and the records it touches.",
    audience: "client",
    files: { html: "NPLify-Workflow-Tree.html", pdf: "NPLify-Workflow-Tree-v6.1-client.pdf" },
    group: "model",
  },
  {
    slug: "workflow-tree-one-page",
    title: "Workflow Tree on one page",
    version: "v6.1",
    blurb: "The same tree reduced to one page.",
    audience: "client",
    files: { html: "NPLify-Workflow-Tree-Simple.html", pdf: "NPLify-Workflow-Tree-One-Page-v6.1-client.pdf" },
    group: "model",
  },
  {
    slug: "erd",
    title: "ERD & Data Model",
    version: "v6.1",
    blurb: "The entity-relationship diagram and data dictionary behind the interactive map: every table, field, key and link, the derived views and the notes per domain.",
    audience: "client",
    files: { html: "NPLify-P0-ERD-v6.1.html", pdf: "NPLify-P0-ERD-v6.1.pdf" },
    group: "model",
  },
  {
    slug: "ledger",
    title: "Ledger Posting Design",
    version: "v6.1",
    blurb: "The chart of accounts and how every deal, collection, conversion, settlement, fee, share, rebate, variance, loss and reseller invoice becomes append-only postings, with the balances and reports derived from them.",
    audience: "client",
    files: { html: "NPLify-Ledger-Posting-Design-v6.1.html", pdf: "NPLify-Ledger-Posting-Design-v6.1.pdf" },
    group: "design",
  },
  {
    slug: "ledger-companion",
    title: "Ledger Patterns — Reading Companion",
    version: "v6.1",
    blurb: "The same worked transactions as the Ledger Posting Design, laid out with a plain-language explanation beside each table, for readers with no bookkeeping background.",
    audience: "client",
    files: { html: "NPLify-Ledger-Patterns-Companion-v6.1.html", pdf: "NPLify-Ledger-Patterns-Companion-v6.1.pdf" },
    group: "design",
  },
  {
    slug: "lifecycle",
    title: "Lifecycle & Approvals",
    version: "v6.1",
    blurb: "The states a deal, a settlement, a conversion, a reroute, a loss event and an earnings offset move through, the 40 controlled actions along the way, and who may initiate, approve or escalate each.",
    audience: "client",
    files: { html: "NPLify-Lifecycle-and-Approvals-v6.1.html", pdf: "NPLify-Lifecycle-and-Approvals-v6.1.pdf" },
    group: "design",
  },
  {
    slug: "roles",
    title: "Roles & Visibility Matrix",
    version: "v6.1",
    blurb: "Which role sees which figures and may take which action: Operations, Finance and Management as nested rings, the approval rights per controlled action, and every field of the model classified.",
    audience: "client",
    files: { html: "NPLify-Roles-and-Visibility-Matrix-v6.1.html", pdf: "NPLify-Roles-and-Visibility-Matrix-v6.1.pdf" },
    group: "design",
  },
  {
    slug: "calculation",
    title: "Calculation Specification",
    version: "v6.1",
    blurb: "Every calculation the engine performs, in order, with its rounding rule: fee parts on the principal, target-out quotes, tiers, rounding, shares and rebates, the four variance kinds, invoice instalments, earnings offsets and the reseller arithmetic, with acceptance vectors checked against NPL's own figures (24 of 24 match) and the regression gate.",
    audience: "client",
    files: { html: "NPLify-Calculation-Specification-v6.1.html", pdf: "NPLify-Calculation-Specification-v6.1.pdf" },
    group: "design",
  },
  {
    slug: "configuration",
    title: "Configuration Schema",
    version: "v6.1",
    blurb: "Every configuration table — client, system settings, project, parties, the partner block — with its fields, allowed values, defaults and the rules checked on save, and one client's configuration as a validated example.",
    audience: "client",
    files: { html: "NPLify-Configuration-Schema-v6.1.html", pdf: "NPLify-Configuration-Schema-v6.1.pdf" },
    group: "design",
  },
  {
    slug: "architecture",
    title: "Architecture & Stack Note",
    version: "v6.1",
    blurb: "One app, one database and one bucket in NPL's AWS account, expanded against the model: the background jobs, the insert-only ledger enforced in the database, the visibility filter, environments, backups and cost.",
    audience: "client",
    files: { html: "NPLify-Architecture-and-Stack-v6.1.html", pdf: "NPLify-Architecture-and-Stack-v6.1.pdf" },
    group: "design",
  },
  {
    slug: "scenario-catalogue",
    title: "Scenario Catalogue",
    version: "v6.1",
    blurb: "Every NPL client and project with its scenarios in NPL's own words, the shared operational flows F1–F10, the guided walkthroughs W1–W8, and one deal walked through the model class by class.",
    audience: "client",
    files: { html: "NPLify-Scenario-Catalogue-v6.1.html", pdf: "NPLify-Scenario-Catalogue-v6.1.pdf" },
    group: "design",
  },
  {
    slug: "test-strategy",
    title: "Test Strategy & Coverage",
    version: "v6.1",
    blurb: "Every test family with its purpose, result class, level and phase; the regression gate every release must pass; and the coverage map from the Workflow Tree's 27 sub-classes to the tests that prove them.",
    audience: "client",
    files: { html: "NPLify-Test-Strategy-and-Coverage-v6.1.html", pdf: "NPLify-Test-Strategy-and-Coverage-v6.1-client.pdf" },
    group: "design",
  },
  {
    slug: "cutover",
    title: "Cutover Approach",
    version: "v6.1",
    blurb: "From the spreadsheets to NPLify: a parallel run of three to four weeks on a staging instance, the opening balances entered as verified opening entries, the daily reconciliation, the exit criteria, the recovery objectives and the switch on a quiet day.",
    audience: "client",
    files: { html: "NPLify-Cutover-Approach-v6.1.html", pdf: "NPLify-Cutover-Approach-v6.1.pdf" },
    group: "design",
  },
  {
    slug: "operating-procedures",
    title: "Operating Procedures",
    version: "v6.1",
    blurb: "One SOP per project for Operations, Finance and Management: the eleven common procedures (cash by token, USDT with wallet screening, bank transfers, the Email OTP approval), the standing procedures of the day including the health checks and the fallback workbook, and how a new project is started.",
    audience: "client",
    files: { html: "NPLify-Operating-Procedures-v6.1.html", pdf: "NPLify-Operating-Procedures-v6.1.pdf" },
    group: "design",
  },
  {
    slug: "gaps",
    title: "Model Gaps & Proposals",
    version: "v2.0",
    blurb: "The gaps found while tracing NPL's fee practice through the model and the proposals (A–M) that became decisions D20–D32, with the status at v6.0: every gap applied, including those of the design review of 19–21 October, and every question answered. No open gap.",
    audience: "staff",
    files: { html: "NPLify-Model-Gaps-and-Proposals-v2.0.html", pdf: "NPLify-Model-Gaps-and-Proposals-v2.0.pdf" },
    group: "working",
  },
  {
    slug: "fee-outlines",
    title: "Fee Outlines workbook",
    version: "v0.3",
    blurb: "NPL's fee table with the fill-in register, the simulated transaction patterns and NPL's answers of 8 October; v0.3 folds in the corrected Evo receiver line of 21 October and lists all 23 acceptance vectors B.",
    audience: "staff",
    files: { xlsx: "NPLify-Fee-Outlines-v0.3.xlsx" },
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
  { id: "model", title: "The model", blurb: "Start here: the four map pages in order, then the diagram itself." },
  { id: "design", title: "Design specifications", blurb: "How the model behaves and how it is built: postings, lifecycle, roles, arithmetic, configuration, architecture and cutover." },
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
