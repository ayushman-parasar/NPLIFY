// Client-facing pass for the P0 documents: the client has no decision record, no version history and no
// invariant list, so references to decisions (D46), editions (v5.3), review questions (Q4), invariants
// ("invariant 7") and renames ("was FACILITATING_ENTITY") are removed from the rendered text.
//   hist(text)          — for a prose description: strips the tokens and drops sentences that are pure history
//   note(text)          — for a short field note: strips the tokens, keeps the sentence
//   clientFacing(html)  — final pass over a whole HTML document (parentheticals and stray tokens)

const DREF = /\b(?:decisions?\s+)?D(?:[1-9]|[1-5]\d)\b(?:\s*[–-]\s*D?(?:[1-9]|[1-5]\d)\b)?(?:\s*\(\d\))?(?:\s+(?:and\s+(?:its\s+)?)?amendment)?/g;
const VER = /\bv[1-5]\.\d(?:\.\d)?\b/g;
const INV = /\binvariants?\s+\d+(?:\s*(?:,|and|–|-|to)\s*\d+)*\b/g;
const QREF = /\bQ\d{1,2}\b/g;
const DATED = /\b(?:amended|amendment)\s+\d{1,2}\s+(?:Oct|October)\b/g;
const WAS = /\(?\bwas\s+(?:a\s+)?[A-Za-z_]*_[A-Za-z_]+\b\)?|\(?\bwas\s+[A-Z_]{3,}\b\)?/g;

const tidy = (s) => s
  .replace(/\s*,\s*,+/g, ",").replace(/\(\s*[,;:]\s*/g, "(").replace(/\s*[,;:]\s*\)/g, ")")
  .replace(/\s+([,.;:)])/g, "$1").replace(/\(\s+/g, "(").replace(/ {2,}/g, " ");

function cleanParens(text) {
  return text.replace(/\(([^()<>]*)\)/g, (m, inner) => {
    if (!/\b(?:D(?:[1-9]|[1-5]\d)|v[1-5]\.\d|invariants?\s+\d+|Q\d{1,2}|Understanding|was\s+[A-Za-z_]+_[A-Za-z_]+|was\s+[A-Z_]{3,})\b/.test(inner)) return m;
    if (HISTORY.test(inner) || /\badded\b.*\bso\b|Understanding/.test(inner)) return "";
    if (/^\s*(?:v[1-5]\.\d(?:\.\d)?\s*[,:]?\s*)?(?:D(?:[1-9]|[1-4]\d)\b[^:]*:\s*)?[+−-]\s/.test(inner)) return "";   // "(v5.7, D46: + LossRecovery, Invoice)" is a change note
    let r = inner.replace(DREF, "").replace(VER, "").replace(INV, "").replace(QREF, "").replace(DATED, "").replace(WAS, "").replace(/Understanding\s*§?[\d.a-z]*/g, "");
    r = r.replace(/\b(?:amendment|amended|rule)\b\s*$/g, "").replace(/^\s*(?:and|the|in|since|from|per|of|see)\s+(?=[,;:]|$)/i, "");
    r = r.replace(/^[\s,;:·—–-]+|[\s,;:·—–-]+$/g, "").replace(/\s*,\s*,+/g, ",").replace(/\s{2,}/g, " ");
    if (!/[A-Za-z0-9]/.test(r)) return "";
    if (/^(?:amendment|amended|the amendment|and|also|restated|new|again)$/i.test(r)) return "";
    return "(" + r + ")";
  });
}

function stripTokens(text) {
  let t = cleanParens(text);
  t = t.replace(/^\s*v[1-5]\.\d(?:\.\d)?\s*(?:\([^()]*\))?\s*:\s*/, "");           // "v5.3 (D29): " prefix
  t = t.replace(/\bthe\s+D(?:[1-9]|[1-5]\d)\s+amendment\b/g, "a later amendment").replace(DREF, "").replace(DATED, "");
  t = t.replace(/\bsince\s+v[1-5]\.\d(?:\.\d)?\b/g, "").replace(/\b(?:in|until|from|as of)\s+v[1-5]\.\d(?:\.\d)?\b/g, "").replace(VER, "");
  t = t.replace(INV, "").replace(/\binvariant\b(?=\s*[.,;)])/g, "");
  return tidy(t).replace(/^[\s,;:·—–-]+/, "").trim();
}

const HISTORY = /\b(?:restated|renamed|rename\b|retired|retire\b|was\s+[A-Za-z_]*_[A-Za-z_]+|was\s+[A-Z_]{3,}|FRS keeps|NPL confirmed|a later amendment|amendment|amended|dropped from the value set|no longer|replaces? (?:the )?[A-Z_]{3,}|moved (?:here|to its|down to)|carried over|Supersedes)/;

export function hist(text) {
  const parts = String(text ?? "").split(/(?<=[.;])\s+/);
  const kept = parts.map(stripTokens).filter((s) => s && /[A-Za-z0-9]/.test(s) && !HISTORY.test(s));
  return kept.join(" ").replace(/\s{2,}/g, " ").trim();
}

export function note(text) {
  let t = cleanParens(String(text ?? "")).split(/\s*;\s*/).filter((c) => !HISTORY.test(c) || !/[a-z]/.test(c)).join("; ");
  t = stripTokens(t).replace(QREF, "").replace(/\bonly if confirms\b/g, "only when confirmed");
  t = t.replace(/\s*;\s*(?:renamed from|was)\s+[A-Za-z_]+\b/g, "").replace(/\s*\(?\bwas\s+[A-Za-z_]+\)?/g, "");
  return tidy(t).replace(/^[\s,;:·—–-]+|[\s,;:·—–-]+$/g, "");
}

export function clientFacing(html) {
  let h = cleanParens(html);
  h = h.replace(/\bthe\s+D(?:[1-9]|[1-4]\d)\s+amendment\b/g, "a later amendment").replace(DREF, "").replace(DATED, "");
  h = h.replace(/<span class="new">([^<]*)<\/span>/g, "$1");
  h = h.replace(/\bthe events invariant \d+ names\b/g, "named events").replace(/\bone of the ownership movements invariant \d+ names\b/g, "one of the named ownership movements").replace(INV, "the ledger rules");
  // no draft marker and no edition number anywhere in a client document
  h = h.replace(/\s*·\s*Draft v\d\.\d(?:\.\d)?/g, "")
    .replace(/<p class="small"[^>]*>Numbered with the ERD edition it is built against\.?<\/p>\s*/g, "")
    .replace(/Draft v\d\.\d(?:\.\d)?\s*[—–-]\s*(?:companion )?for review with NPL\.?\s*/g, "")
    .replace(/\(Draft v\d\.\d(?:\.\d)?\)/g, "")
    .replace(/<p class="small"><i>\s*<\/i><\/p>\s*/g, "")
    .replace(/\s+v\d\.\d(?:\.\d)?\b/g, "")
    .replace(/\(\s*\)/g, "");
  h = h.replace(/\s*,\s*,+/g, ",").replace(/ {2,}/g, " ").replace(/\s+([,.;:])(?=\s|<|$)/g, "$1").replace(/\(\s*\)/g, "");
  return h;
}
