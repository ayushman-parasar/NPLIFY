#!/usr/bin/env python3
"""Figure fit check (29 October 2026): renders every hand-drawn figure as it is embedded in the served client documents in
headless Chrome and reports text that runs past the figure's right edge (cut off in the PDF) and residue the edition filter
leaves in figure text. Needs Chrome. usage: python3 scripts/check-figures-fit.py [html files...]  (default: the client
documents registered in src/lib/documents.ts). Exit code 1 on any finding. Run by hand before a release; check-round2.py
cannot measure text widths."""
import os, sys, json, re, html, subprocess, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = tempfile.mkdtemp(); files = sys.argv[1:]
if not files:
    reg = open(os.path.join(ROOT, "src", "lib", "documents.ts"), encoding="utf-8").read()
    files = [os.path.join(ROOT, "docs", f) for f in re.findall(r'"(NPLify-[^"]+\.html)"', reg) if os.path.exists(os.path.join(ROOT, "docs", f))]
parts = []
for f in files:
    doc = open(f, encoding="utf-8").read()
    for i, m in enumerate(re.finditer(r'<svg [^>]*viewBox="0 0 \d+ \d+"[^>]*>.*?</svg>', doc, re.S)):
        svg = m.group(0)
        if 'font-family="Helvetica' not in svg and "Menlo" not in svg: continue  # not a hand-drawn figure
        svg = svg.replace('width="100%"', '').replace("<svg ", f'<svg data-f="{os.path.basename(f)} #{i+1}" ', 1)
        parts.append(f'<div style="width:1280px">{svg}</div>')
page = '<!doctype html><html><body>' + "".join(parts) + '''<script>
const out=[];
for (const svg of document.querySelectorAll("svg")) {
  const vb=svg.viewBox.baseVal; const f=svg.dataset.f;
  const rects=[...svg.querySelectorAll("rect")].filter(r=>r.getAttribute("fill")!=="none"&&+r.getAttribute("width")>40).map(r=>({x:+r.getAttribute("x"),y:+r.getAttribute("y"),w:+r.getAttribute("width"),h:+r.getAttribute("height"),fill:r.getAttribute("fill")}));
  for (const t of svg.querySelectorAll("text")) {
    const b=t.getBBox(); const right=b.x+b.width;
    if (right>vb.width-1) out.push({f,text:t.textContent.slice(0,70),right:Math.round(right),edge:vb.width,kind:"edge"});
    if (/^\\.\\d\\.|\\bv[1-5]\\.\\d|\\bD\\d\\d?\\b|was_|since\\s*:|since\\s*$|\\(\\s*\\)/.test(t.textContent)) out.push({f,text:t.textContent.slice(0,70),kind:"residue"});
  }
}
document.body.innerHTML="<pre id=r>"+JSON.stringify(out)+"</pre>";
</script></body></html>'''
open(os.path.join(S, "measure-html.html"), "w").write(page)
dom = subprocess.run(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", "--disable-gpu", "--virtual-time-budget=5000", "--dump-dom", "file://" + os.path.join(S, "measure-html.html")], capture_output=True, text=True).stdout
rows = json.loads(html.unescape(re.search(r'<pre id="r">(.*?)</pre>', dom, re.S).group(1)))
for r in rows: print(r["f"], "|", r["kind"], "|", r["text"], "|", r.get("right", ""), r.get("edge", ""))
print(len(parts), "figures measured,", len(rows), "findings"); sys.exit(1 if rows else 0)
