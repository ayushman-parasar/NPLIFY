// Write data/controlled-actions.v6.1.json: the controlled-actions table of the Lifecycle & Approvals and Roles &
// Visibility documents (scripts/controlled-actions.mjs), as the assistant's sixth source. Run without NPLIFY_REVIEW so
// no review mark is rendered; any tag that still reaches a cell is stripped. `npm run build` runs this first (prebuild).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
delete process.env.NPLIFY_REVIEW;
const { ACTIONS } = await import("./controlled-actions.mjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clean = (t) => String(t).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const rows = ACTIONS.map((r, i) => {
  if (r.length !== 6) throw new Error(`controlled action ${i + 1} has ${r.length} cells, not 6`);
  const [action, initiates, approves, management_when, on_rejection, right] = r.map(clean);
  return { n: i + 1, action, initiates, approves, management_when, on_rejection, right: right === "—" ? null : right };
});
const out = {
  version: "6.1",
  source: "Controlled actions: the shared table of the Lifecycle & Approvals document (section 5) and the Roles & Visibility Matrix (section 4), edition 6.1 of 28 October 2026 with the corrections of 29 October 2026; ROLE_RIGHT codes per decision D44.",
  columns: ["action", "initiates", "approves", "management_when", "on_rejection", "right"],
  rows,
};
const file = path.join(root, "data", "controlled-actions.v6.1.json");
fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${path.relative(root, file)}: ${rows.length} controlled actions, ${rows.filter((r) => r.right).length} with a ROLE_RIGHT code`);
