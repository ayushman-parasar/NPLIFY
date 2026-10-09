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
    version: "v5.6",
    blurb: "The entity-relationship diagram and data dictionary behind the interactive map: every table, field, key and link, the invariants, the derived views and the walkthroughs.",
    audience: "client",
    files: { html: "NPLify-P0-ERD-v5.6.html", pdf: "NPLify-P0-ERD-v5.6.pdf" },
    group: "model",
  },
  {
    slug: "reading-guide",
    title: "ERD Reading Guide",
    version: "v1.0",
    blurb: "A plain-language companion to the six diagrams: how to read a lane, a box and an arrow, and what each domain is for.",
    audience: "client",
    files: { html: "NPLify-ERD-Reading-Guide-v1.0.html", pdf: "NPLify-ERD-Reading-Guide-v1.0.pdf" },
    group: "model",
  },
  {
    slug: "ledger",
    title: "Ledger Posting Design",
    version: "v1.1",
    blurb: "How every deal, collection, conversion, settlement, fee and rebate becomes append-only postings, and how balances and positions are derived from them.",
    audience: "client",
    files: { html: "NPLify-Ledger-Posting-Design-v1.1.html", pdf: "NPLify-Ledger-Posting-Design-v1.1.pdf" },
    group: "design",
  },
  {
    slug: "lifecycle",
    title: "Lifecycle & Approvals",
    version: "v1.1",
    blurb: "The states a deal moves through from inquiry to confirmation, the controlled actions along the way, and who may initiate or approve each.",
    audience: "client",
    files: { html: "NPLify-Lifecycle-and-Approvals-v1.1.html", pdf: "NPLify-Lifecycle-and-Approvals-v1.1.pdf" },
    group: "design",
  },
  {
    slug: "roles",
    title: "Roles & Visibility Matrix",
    version: "v1.0",
    blurb: "Which role sees which figures and may take which action, across Operations, Finance, Management and client users.",
    audience: "client",
    files: { html: "NPLify-Roles-and-Visibility-Matrix-v1.0.html", pdf: "NPLify-Roles-and-Visibility-Matrix-v1.0.pdf" },
    group: "design",
  },
  {
    slug: "calculation",
    title: "Calculation Specification",
    version: "v1.0",
    blurb: "The arithmetic of a deal: quote, conversion, fees, markup shares, rebates, rounding and residuals, with worked vectors.",
    audience: "client",
    files: { html: "NPLify-Calculation-Specification-v1.0.html", pdf: "NPLify-Calculation-Specification-v1.0.pdf", json: "calc-vectors.json" },
    group: "design",
  },
  {
    slug: "configuration",
    title: "Configuration Schema",
    version: "v1.0",
    blurb: "What a client, project and partner configuration contains, with an example configuration for one client.",
    audience: "client",
    files: { html: "NPLify-Configuration-Schema-v1.0.html", pdf: "NPLify-Configuration-Schema-v1.0.pdf", json: "config-example-client1.json" },
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
    blurb: "The business understanding the model was built from, with Sud's comments.",
    audience: "staff",
    files: { docx: "NPLify-Project-Understanding-v1.1.docx" },
    group: "working",
  },
];

export const GROUPS: { id: Doc["group"]; title: string; blurb: string }[] = [
  { id: "model", title: "The model", blurb: "Start here: the diagram itself and how to read it." },
  { id: "design", title: "Design specifications", blurb: "How the model behaves: postings, lifecycle, roles, arithmetic and configuration." },
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
