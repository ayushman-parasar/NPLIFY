// Client-facing text: the scenario catalogue is written with references to the decision record (D46), to earlier
// editions (v5.3) and to the review questions (Q4). Visitors have none of those documents, so the references are
// stripped at render time. Mirrors scripts/client-facing.mjs, which does the same for the generated documents.

const DREF = /\b(?:decisions?\s+)?D(?:[1-9]|[1-4]\d)\b(?:\s*[–-]\s*D?(?:[1-9]|[1-4]\d)\b)?(?:\s*\(\d\))?(?:\s+(?:and\s+(?:its\s+)?)?amendment)?/g;
const VER = /\bv[1-5]\.\d(?:\.\d)?\b/g;
const INV = /\binvariants?\s+\d+(?:\s*(?:,|and|–|-|to)\s*\d+)*\b/g;
const QREF = /\bQ\d{1,2}\b/g;
const HISTORY = /\b(?:restated|renamed|retired|was\s+[A-Za-z_]*_[A-Za-z_]+|was\s+[A-Z_]{3,}|amendment|amended|no longer|Supersedes)\b/;

function cleanParens(text: string): string {
  return text.replace(/\(([^()]*)\)/g, (m, inner: string) => {
    if (!/\b(?:D(?:[1-9]|[1-4]\d)|v[1-5]\.\d|invariants?\s+\d+|Q\d{1,2}|was\s+[A-Za-z_]+_[A-Za-z_]+|was\s+[A-Z_]{3,})\b/.test(inner)) return m;
    if (HISTORY.test(inner)) return "";
    let r = inner.replace(DREF, "").replace(VER, "").replace(INV, "").replace(QREF, "");
    r = r.replace(/^[\s,;:·—–-]+|[\s,;:·—–-]+$/g, "").replace(/\s*,\s*,+/g, ",").replace(/\s{2,}/g, " ");
    if (!/[A-Za-z0-9]/.test(r)) return "";
    return "(" + r + ")";
  });
}

/** Strips decision, edition, invariant and review-question references from a line of the catalogue. */
export function clientText(text: string | undefined | null): string {
  let t = cleanParens(String(text ?? ""));
  t = t.replace(/\bthe\s+D(?:[1-9]|[1-4]\d)\s+amendment\b/g, "a later amendment").replace(DREF, "").replace(VER, "").replace(INV, "the ledger rules").replace(QREF, "");
  t = t.replace(/\s*,\s*,+/g, ",").replace(/\s+([,.;:)])/g, "$1").replace(/\(\s+/g, "(").replace(/ {2,}/g, " ").replace(/\(\s*\)/g, "");
  return t.trim();
}
