#!/usr/bin/env python3
"""Build 12 slide HTMLs for the TMJ PO Studio walkthrough video.
Design language matches the app: deep navy + gold, Inter/Helvetica."""
import json, pathlib, html

ROOT = pathlib.Path('/Users/sayeedsmacmini/.openclaw-autoclaw/agents/cuteadmoa-56/workspace/tmj-po-studio')
video = ROOT / 'video'
sp = json.loads((video / 'screenplay.json').read_text())
out = video / 'slides'
out.mkdir(exist_ok=True)

# assets
app_shot = (ROOT / 'video/screens/test.png').as_posix()          # real app review screen
invoice_png = (ROOT / 'video/screens/06_preview.png').as_posix() # real generated invoice render

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:1920px;height:1080px;overflow:hidden;
  font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;color:#eef2f8;
  background:
    radial-gradient(1400px 800px at 78% -10%, rgba(201,162,39,.14), transparent 60%),
    radial-gradient(1100px 700px at 0% 0%, rgba(30,58,95,.65), transparent 60%),
    #070c16;}
.slide{width:1920px;height:1080px;display:flex;flex-direction:column;justify-content:center;padding:110px 150px;position:relative}
.kicker{font-size:26px;letter-spacing:6px;text-transform:uppercase;color:#c9a227;font-weight:700;margin-bottom:28px}
h1{font-size:120px;line-height:1.04;letter-spacing:-2px;font-weight:800}
h2{font-size:76px;line-height:1.08;letter-spacing:-1.5px;font-weight:800;margin-bottom:30px}
.sub{font-size:34px;color:#a8b6cc;line-height:1.5;max-width:1250px;font-weight:400}
.gold{color:#e6c65c}
.rule{width:180px;height:6px;border-radius:3px;background:linear-gradient(90deg,#e6c65c,#c9a227);margin:44px 0}
.chips{display:flex;gap:22px;margin-top:56px}
.chip2{padding:20px 38px;border:1.5px solid rgba(255,255,255,.16);border-radius:16px;font-size:27px;font-weight:600;color:#dfe7f2;background:rgba(255,255,255,.04)}
.shot{position:absolute;right:120px;top:190px;width:900px;border-radius:20px;border:1px solid rgba(255,255,255,.18);
  box-shadow:0 60px 120px -30px rgba(0,0,0,.85);}
.shotcap{position:absolute;right:120px;top:150px;font-size:20px;color:#8fa1bb;letter-spacing:1px}
ul.big{list-style:none;margin-top:44px}
ul.big li{font-size:34px;line-height:1.5;padding-left:52px;position:relative;margin-bottom:24px;color:#dbe4f0}
ul.big li::before{content:'';position:absolute;left:0;top:17px;width:16px;height:16px;border-radius:50%;
  background:linear-gradient(145deg,#e6c65c,#c9a227)}
.num{position:absolute;right:70px;bottom:50px;font-size:24px;color:#5d6f8c;font-weight:700;letter-spacing:2px}
.brand{position:absolute;left:150px;bottom:56px;display:flex;align-items:center;gap:18px}
.bmark{width:56px;height:56px;border-radius:14px;display:grid;place-items:center;font-weight:800;font-size:19px;color:#0b1220;
  background:linear-gradient(145deg,#e6c65c,#c9a227)}
.bname{font-size:23px;font-weight:700;color:#c8d4e6;line-height:1.3}
.bname small{display:block;font-size:16px;color:#7f90aa;font-weight:400}
.two{display:flex;gap:60px;align-items:center;margin-top:20px}
.panel{background:rgba(15,24,40,.75);border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:46px 54px}
.stat{font-size:58px;font-weight:800;color:#e6c65c;letter-spacing:-1px}
.statlab{font-size:23px;color:#a8b6cc;margin-top:8px}
"""

def brand():
    return '<div class="brand"><div class="bmark">TM</div><div class="bname">TMJ PO Studio<small>Treasure Mountain Jewelshop Ltd</small></div></div>'
def num(i):
    return f'<div class="num">{i:02d} / 12</div>'

def slide(i, body, extra=''):
    htmlp = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="slide">{body}{extra}{brand()}{num(i)}</div></body></html>"""
    (out / f'slide{i:02d}.html').write_text(htmlp)
    print('built', f'slide{i:02d}.html')

S = {s['id']: s for s in sp['scenes']}

# 1 title
slide(1, f"""
  <div class="kicker">Treasure Mountain Jewelshop Ltd</div>
  <h1>TMJ <span class="gold">PO</span> Studio</h1>
  <div class="rule"></div>
  <p class="sub">From Albern purchase orders to finished Treasure Mountain invoices —<br>in minutes, not hours.</p>
  <div class="chips"><div class="chip2">Import PDFs</div><div class="chip2">Auto-parse</div><div class="chip2">Approve</div><div class="chip2">Generate</div></div>
""")

# 2 problem
slide(2, f"""
  <div class="kicker">The problem</div>
  <h2>Manual entry takes hours —<br>and invites <span class="gold">mistakes</span></h2>
  <p class="sub">Dozens of purchase-order PDFs arrive every month. Retyping each line into an
  invoice is slow, and a single wrong digit becomes a real loss.</p>
  <ul class="big"><li>Hours of retyping per batch</li><li>Numbers transcribed by hand</li><li>No built-in check that the totals agree</li></ul>
""")

# 3 import (with app screenshot)
slide(3, f"""
  <div class="kicker">Step 1 — import</div>
  <h2>Drag &amp; drop.<br>That's the whole job.</h2>
  <p class="sub">Single PDFs, a whole ZIP archive, or scanned images — drop them in and the studio unpacks everything automatically.</p>
  <div class="rule"></div>
  <div class="chips"><div class="chip2">PDF</div><div class="chip2">ZIP · nested OK</div><div class="chip2">PNG / JPG</div><div class="chip2">Batch</div></div>
""", f'<div class="shotcap">The import workspace</div><img class="shot" src="file://{app_shot}">')

# 4 parsing
slide(4, f"""
  <div class="kicker">Step 2 — smart parsing</div>
  <h2>Every field,<br>read automatically</h2>
  <div class="two">
    <div>
      <ul class="big">
        <li>Purchase order number &amp; date</li>
        <li>Line items, quantities, unit prices</li>
        <li>Sub-total, GST, purchase total</li>
        <li>Cheque number &amp; payment status</li>
      </ul>
    </div>
    <div class="panel" style="min-width:420px">
      <div class="stat">31 / 31</div>
      <div class="statlab">real purchase orders parsed with zero differences against the validated reference</div>
    </div>
  </div>
""")

# 5 validation
slide(5, f"""
  <div class="kicker">Built-in protection</div>
  <h2>Every record is<br><span class="gold">cross-checked</span></h2>
  <p class="sub">The math must agree before anything reaches an invoice:</p>
  <ul class="big"><li>Qty × unit price = line total</li><li>Line items = Sub-Total</li><li>Sub-Total + GST = Purchase Total</li><li>Payments = Purchase Total</li></ul>
""")

# 6 review
slide(6, f"""
  <div class="kicker">Step 3 — review &amp; correct</div>
  <h2>Fix anything<br>in seconds</h2>
  <p class="sub">Every extracted value is editable. Add or remove lines, adjust a quantity — totals recompute instantly as you type.</p>
  <div class="rule"></div>
  <div class="chips"><div class="chip2">Editable fields</div><div class="chip2">Live totals</div><div class="chip2">One-click delete</div></div>
""", f'<div class="shotcap">The review workspace</div><img class="shot" src="file://{app_shot}">')

# 7 live preview (real generated invoice)
slide(7, f"""
  <div class="kicker">What you see is what you get</div>
  <h2>The preview <span class="gold">is</span> the document</h2>
  <p class="sub">Same layout, same fonts, same numbers — rendered by the same engine that prints the final PDF. Preview full-size before anything is sent.</p>
""", f'<img class="shot" style="width:1000px;top:120px" src="file://{invoice_png}">')

# 8 approve
slide(8, f"""
  <div class="kicker">Step 4 — approve</div>
  <h2>Approve, and the<br>record locks</h2>
  <p class="sub">Happy with the numbers? Approve the invoice. Approved records are locked against accidental edits — and can be revoked anytime.</p>
  <ul class="big"><li>One click to approve</li><li>Fields lock until revoked</li><li>Status visible on every record</li></ul>
""")

# 9 generation
slide(9, f"""
  <div class="kicker">Step 5 — generate</div>
  <h2>One click.<br>Whole batch.</h2>
  <p class="sub">Every document is a print-ready, US-Letter PDF with Treasure Mountain's branding — navy headers, ruled tables, premium typography.</p>
  <div class="rule"></div>
  <div class="chips"><div class="chip2">Invoices</div><div class="chip2">Purchase orders</div><div class="chip2">Clear filenames</div></div>
""")

# 10 own numbering
slide(10, f"""
  <div class="kicker">Your numbering</div>
  <h2>Your own PO sequence —<br>independent of Albern</h2>
  <p class="sub">Start anywhere — 000002, 000003 — with the Albern reference printed alongside every document, so the two systems always stay linked.</p>
  <div class="two">
    <div class="panel"><div class="stat">TMJ-000002</div><div class="statlab">your sequence</div></div>
    <div class="panel"><div class="stat">144119</div><div class="statlab">Albern reference, kept alongside</div></div>
  </div>
""")

# 11 private
slide(11, f"""
  <div class="kicker">Private by design</div>
  <h2>Everything stays<br>on your computer</h2>
  <ul class="big"><li>No cloud upload — parsing and rendering are local</li><li>No account, no subscription</li><li>Pick any folder for your output files</li></ul>
""")

# 12 closing
slide(12, f"""
  <div class="kicker">TMJ PO Studio</div>
  <h1 style="font-size:100px">Import. Review.<br><span class="gold">Generate.</span></h1>
  <div class="rule"></div>
  <p class="sub">Professional invoices in minutes — not hours.</p>
  <div class="chips"><div class="chip2">macOS</div><div class="chip2">Windows</div></div>
""")

print('all slides built in', out)
