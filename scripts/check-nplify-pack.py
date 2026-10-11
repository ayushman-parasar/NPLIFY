#!/usr/bin/env python3
"""Consistency check for one NPLify document edition.

Usage:
  python3 check-nplify-pack.py ERD.pdf POSTING.pdf COMPANION.pdf

Needs pdftotext (poppler). Reports, per document, every stale phrase that the
11 October 2026 review flagged, then cross-checks the two ledger documents
against the ERD: account purposes, transaction sources, cost components,
worked-transaction count, and the table/view counts the ERD claims.
Exit code 1 when anything is reported, so it can run in a build step.
"""
import re, subprocess, sys, collections, tempfile, os

def text(pdf, layout=True):
    with tempfile.NamedTemporaryFile(suffix='.txt', delete=False) as t:
        out = t.name
    args = ['pdftotext'] + (['-layout'] if layout else []) + [pdf, out]
    subprocess.run(args, check=True)
    s = open(out, encoding='utf-8', errors='replace').read(); os.unlink(out)
    return s

def ws(s): return re.sub(r'\s+', ' ', s)

STALE = {
 'ERD': [
  ('inv 31: collection-side loss moves the part to reversed', r'collection-side event moves the part to reversed'),
  ('Diagram 3c note: one reversing transaction posts the loss', r'one reversing transaction posts it'),
  ('Diagram 4 note: ownership flips at one event only', r'Ownership flips client → company at one event only'),
  ('Diagram 4 note: source list ends LossEvent, Adjustment', r'Rebate, LossEvent, Adjustment\. Account purposes'),
  ('Diagram 4 note: sender loss share reduces client balance', r"sender[’']s shares of a loss reduce the client balance"),
  ('Diagram 4 note: cost components without resale', r'Cost components include share, rebate, rounding, fx_timing, cutoff_timing and loss\.'),
  ('Diagram 4 note: approval actions without earnings_offset', r'approve_loss_split and override_screening_reject\. cross_group_payout'),
  ('DEAL.rate_reused_from_deal_id posts to VARIANCE', r'posts to VARIANCE'),
  ('D24 posts to variance (should name VAR_FX_TIMING)', r'discharged posts to variance with component fx_timing'),
  ('D29 posts to variance (should name VAR_CUTOFF)', r'used posts to variance with component cutoff_timing'),
  ('D45 posts to variance (should name VAR_RATE_HONOUR)', r"actual rate posts to variance\. Invariant 37"),
  ('§7 Q2: ownership flips at one event only', r'Ownership flips at one event only'),
  ('inv 1 balances per currency only', r'1\. Postings in one transaction sum to zero per currency\. 2\.'),
  ('§6 dependent docs: Lifecycle row pre-D46', r'Lifecycle & Approvals v1\.1 → v1\.2 Rate-locked[^D]*?enable_own_desk\. Roles'),
  ('§6 dependent docs: old Calculation Specification row', r'Calculation Specification v1\.0 → v1\.1'),
  ('§6 heading New tables (v5.3) holds later rows', r'New tables \(v5\.3\)'),
  ('Status paragraph: stale v5.5 sentence', r'Fourteen tables and five views are added; invariants 3 and 9'),
  ('§3c heading says referrals', r'3c · Settlement, return, confirmation, fees, referrals'),
  ('B.4 heading says referrals', r'B\.4 Settlement, return, confirmation, fees, referrals'),
  ('SETTLEMENT_LINE.outcome has no short value', r'outcome string sent / confirmed / returned'),
  ('INTRANSIT mentioned outside a retirement note', r'INTRANSIT(?! retired)(?! as a client asset)(?! do not exist)(?! retired)'),
  ('pct_of_partner_fee outside a retirement note', r'(?<!− )(?<!the old )pct_of_partner_fee(?![^.]{0,80}(retire|dropped))'),
 ],
 'POSTING': [
  ('§24: recovery postings under source LossEvent', r'under source LossEvent'),
  ('What-changed box: proposes (Section 22)', r'proposes \(Section 22\)'),
  ('§4: Section 24 asks for the source record', r'asks for the source record'),
  ('§4 source list without LossRecovery', r'MarkupShare, Rebate, LossEvent, Adjustment, Invoice'),
  ('§22 has no LossRecovery row', r'(?s)22 · Transaction sources(?:(?!LossRecovery +[A-Z]).)*?23 · Who sees'),
  ('§23 Management list without earnings_offset', r'Management approves the actions the ledger patterns depend on:(?:(?!earnings_offset)[^.])*\.'),
  ('§3 COLLECTED: same purpose exists under CO', r'same purpose exists under CO'),
  ('§21: client money in transit', r'Client money by partner, in transit, in custody'),
  ('T49: network fee posts as in T16 (T16 posts nothing)', r'posts as in T16'),
  ('line "state sent" (field is outcome)', r'state sent'),
  ('chart: "replaces FX_RESULT" (should be FX_CLEARING)', r'replaces FX_RESULT'),
  ('pct_of_partner_fee outside a retirement note', r'(?<!− )(?<!the old )pct_of_partner_fee(?![^.]{0,80}(retire|dropped))'),
 ],
 'COMPANION': [
  ('page 2: INTRANSIT listed as a live jar', r'INTRANSIT'),
  ('page 2: jars hold money in transit', r"in NPL's wallet, in transit"),
  ('closing: proposed D46', r'proposed D46'),
  ('Pattern J: share owed to a partner in the business', r'owed to a partner in the business'),
  ('T11: rounding down (T2)', r'Rounding down \(T2\)'),
  ('T46 arithmetic: USDT per THB', r'USDT per THB'),
 ],
}

def main(erd_pdf, post_pdf, comp_pdf):
    problems = 0
    docs = {'ERD': text(erd_pdf), 'POSTING': text(post_pdf), 'COMPANION': text(comp_pdf)}
    raw = {'POSTING': text(post_pdf, False), 'COMPANION': text(comp_pdf, False)}
    print('== Stale phrases (0 hits = fixed)')
    for name, checks in STALE.items():
        d = ws(docs[name])
        for label, pat in checks:
            n = len(re.findall(pat, d))
            if n:
                problems += 1; print(f'  {name:9s} {n:2d}  {label}')
    erd = ws(docs['ERD'])
    m = re.search(r'purpose string (.*?) kind string asset', erd)
    purposes = [p.strip() for p in re.sub(r'\(.*?\)', '', m.group(1)).split('/')] if m else []
    m = re.search(r'source_type string (.*?)(?: \(v5|source_id)', erd)
    sources = [s.strip() for s in m.group(1).split('/')] if m else []
    m = re.search(r'cost_component string (.*?)(?: \(v5|LEDGER_ACCOUNT)', erd)
    comps = [c.strip() for c in m.group(1).split('/')] if m else []
    print('\n== Cross-check against the ERD enumerations')
    tcount = {}
    for name in ('POSTING', 'COMPANION'):
        t = ws(raw[name])
        accts = re.findall(r'\b(?:CL|CO)\.(?:[A-Z_]+|<[A-Z]+>(?: / <?[A-Z]+>?)?|<PARTNER> / OWN)\.\s?(?:<CCY>|[A-Z]{3,4})\.\s?([A-Z_]{3,})', t)
        used = set(accts)
        extra = sorted(used - set(purposes) - {'INTRANSIT'})
        if extra: problems += 1; print(f'  {name}: purposes not in ERD: {extra}')
        missing = sorted(set(purposes) - used)
        if missing: print(f'  {name}: ERD purposes with no worked line: {missing}')
        srcs = set(re.findall(r'source: ?([A-Z][A-Za-z]+)', t))
        bad = sorted(srcs - set(sources))
        if bad: problems += 1; print(f'  {name}: sources not in ERD: {bad}')
        cc = set(re.findall(r'\b(principal|earnings|rebate|partner_cost|bank_fee|network_fee|variance|share|rounding|fx_timing|cutoff_timing|loss|resale)\b', t))
        badc = sorted(cc - set(comps))
        if badc: problems += 1; print(f'  {name}: cost components not in ERD: {badc}')
        tcount[name] = re.findall(r'\bT(\d{1,2}[a-z]?) ·', t)
    if set(tcount['POSTING']) != set(tcount['COMPANION']):
        problems += 1
        print('  worked-transaction headings differ:', sorted(set(tcount['POSTING']) ^ set(tcount['COMPANION'])))
    print(f"  worked transactions: posting {len(set(tcount['POSTING']))}, companion {len(set(tcount['COMPANION']))}")
    lines = docs['ERD'].split('\n')
    tables = 0
    for i, l in enumerate(lines):
        if re.fullmatch(r'[A-Z][A-Z_]{2,}', l.strip()) and ' '.join(x.strip() for x in lines[i+1:i+4]).startswith('Field'):
            tables += 1
    claim = re.search(r'(\d+) tables and (\d+) views', erd)
    views = len(set(re.findall(r'\b([A-Z][A-Z_]{3,})\([a-z_, ]*\) ', erd)))
    print(f'  ERD claims {claim.group(1) if claim else "?"} tables / {claim.group(2) if claim else "?"} views; Appendix B defines {tables} tables; views table lists {views}')
    if claim and int(claim.group(1)) != tables: problems += 1; print('  table count mismatch')
    print('\nRESULT:', 'clean' if not problems else f'{problems} item(s) to fix')
    return 1 if problems else 0

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__); sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
