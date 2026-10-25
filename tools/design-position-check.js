'use strict';
/**
 * Position-aware design conformance.
 *
 * Checks that every key label in the generated document sits at the same
 * absolute coordinates as the client's reference PDF. Text-extraction order
 * differs for two-column layouts, so matching by x/y is the only reliable
 * way to prove the layout is identical.
 *
 *   node tools/design-position-check.js <reference.pdf> <generated.pdf>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const LABELS = [
  'INVOICE', 'Treasure Mountain Jewelshop Limited', '(Jami Ann Hughes)',
  'Invoice #:', 'Date:', 'PO Ref #:',
  'Billed To (Customer):', 'Payment & Status Details:',
  'Albern Coin & Foreign Exchange Ltd.', '1615 Centre Street NW',
  'Calgary, AB T2E 2S2', 'Customer #:', 'Payment Type:', 'Reference #:',
  'Currency:', 'Amount Paid:', 'Payment Status:',
  'Item #', 'Description', 'Qty', 'Unit Price', 'Total',
  'Sub-Total:', 'GST (5.00%):', 'Total Due:',
  'Terms & Conditions:', 'ALL PURCHASES ARE FINAL.',
  'Items certified clear of all liens and notes.'
];

function blocks(pdfPath) {
  const script = `
import pymupdf, json, sys
d = pymupdf.open(sys.argv[1]); p = d[0]
out = []
for b in p.get_text('dict')['blocks']:
    for l in b.get('lines', []):
        t = ''.join(s['text'] for s in l['spans']).strip()
        if not t: continue
        x0,y0,x1,y1 = l['bbox']
        out.append({'t': t, 'x': x0, 'y': y0, 'x1': x1, 'y1': y1,
                    'size': round(max(s['size'] for s in l['spans']), 1),
                    'font': l['spans'][0]['font']})
print(json.dumps(out))
`;
  const tmp = path.join(os.tmpdir(), 'tmj_pos.py');
  fs.writeFileSync(tmp, script, 'utf8');
  return JSON.parse(execFileSync('python3', [tmp, pdfPath], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
}

// A label may be split across lines; find the span that contains it.
function findLabel(bs, label) {
  const exact = bs.filter(b => b.t === label);
  if (exact.length) return exact[0];
  // label may be the start of a longer line, e.g. "Invoice #: TMJ-2026-0915"
  const starts = bs.filter(b => b.t.startsWith(label));
  if (starts.length) return starts[0];
  // or the end, e.g. "Item #" inside a header row
  const has = bs.filter(b => b.t.includes(label));
  return has.length ? has[0] : null;
}

(async () => {
  const [refPath, genPath] = process.argv.slice(2);
  const A = blocks(refPath), B = blocks(genPath);

  console.log(`reference : ${refPath.split('/').pop()}`);
  console.log(`generated : ${genPath.split('/').pop()}\n`);

  let checked = 0, ok = 0;
  const problems = [];

  for (const label of LABELS) {
    const a = findLabel(A, label);
    const b = findLabel(B, label);
    if (!a && !b) continue;
    checked++;
    if (!a) { problems.push(`${label}: missing from REFERENCE`); continue; }
    if (!b) { problems.push(`${label}: missing from GENERATED`); continue; }

    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const dSize = Math.abs(a.size - b.size);
    const sameFont = a.font === b.font;
    // Allow small vertical drift for flowed rows, but require x/size/font match.
    const xOk = dx <= 2.5;
    const sizeOk = dSize <= 0.6;
    if (xOk && sizeOk && sameFont) {
      ok++;
    } else {
      problems.push(
        `${label.padEnd(38)} ref(x=${a.x.toFixed(1)},y=${a.y.toFixed(1)},${a.size}pt,${a.font}) ` +
        `gen(x=${b.x.toFixed(1)},y=${b.y.toFixed(1)},${b.size}pt,${b.font}) ` +
        `[dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}]`
      );
    }
  }

  console.log(`position/size/font conformance: ${ok}/${checked} labels aligned`);
  if (problems.length) {
    console.log('\nmisalignments:');
    for (const p of problems) console.log('  ' + p);
  }
  process.exitCode = problems.length ? 1 : 0;
})();
