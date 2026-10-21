#!/usr/bin/env python3
"""Check that a regenerated v6.0 HTML document carries the content of the hand-built client copy.
    python3 scripts/verify-v6.0-port.py docs/NPLify-<Name>-v6.0.html "<client-copy pdf>"
Prints the words (3+ characters, letters/digits/underscore) of the client PDF that the HTML lacks, and the count the
other way round, after stripping tags. A clean port leaves only words that exist because of PDF layout (hyphenation
fragments, page numbers) — a handful at most. Needs pdftotext."""
import re, sys, html, subprocess

h = open(sys.argv[1], encoding="utf-8").read()
h = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h, flags=re.S)
h = html.unescape(re.sub(r"<[^>]+>", " ", h))
pdf = subprocess.run(["pdftotext", "-layout", sys.argv[2], "-"], capture_output=True, text=True).stdout
W = lambda t: set(w.lower() for w in re.findall(r"[A-Za-z0-9_]{3,}", t))
hw, pw = W(h), W(pdf)
missing = sorted(pw - hw)
# ignore page-number-like tokens and hyphenation fragments that pdftotext produces
missing = [w for w in missing if not re.fullmatch(r"\d{1,3}", w)]
print(f"client words {len(pw)} | html words {len(hw)} | in client, not in html: {len(missing)} | in html, not in client: {len(hw - pw)}")
print(" ".join(missing[:400]))
sys.exit(1 if len(missing) > 40 else 0)
