'use strict';
/**
 * Controlled design proof.
 *
 * The client's own reference (urgent_final.pdf) was built from different
 * data than our sample POs, so a direct diff mixes design differences with
 * data differences. This renders OUR template using the REFERENCE's exact
 * values, then compares the two PDFs label-by-label.
 *
 * If they align, our template is design-equivalent to the client's file.
 *
 *   node tools/design-proof.js <reference.pdf> <out-dir>
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { renderDocument } = require('../renderer/template');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function chromePdf(html, outPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmj-proof-'));
  const htmlPath = path.join(tmp, 'doc.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=4000',
    `--print-to-pdf=${outPath}`, 'file://' + htmlPath
  ], { stdio: 'ignore', timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
}

// The reference document's exact values.
const REF_DATA = {
  po: 'Pending',
  dateLong: 'September 15, 2026',
  dateISO: '2026-09-15',
  items: [{ description: 'Lot of Jewellery 30.1g @ 5950.70', qty: 1, unit_price: 4000.89, total: 4000.89 }],
  subtotal: 4000.89,
  gst: 200.04,
  total: 4200.93,
  payments: [{ date: '', ptype: '', amount: 0, currency: '', ref: '' }],
  paidTotal: 0,
  owing: 4200.93
};

function pdfBlocks(pdfPath) {
  const script = `
import pymupdf, json, sys
d = pymupdf.open(sys.argv[1]); p = d[0]
out = []
for b in p.get_text('dict')['blocks']:
    for l in b.get('lines', []):
        t = ''.join(s['text'] for s in l['spans']).strip()
        if not t: continue
        x0,y0,x1,y1 = l['bbox']
        out.append({'t': t, 'x': x0, 'y': y0, 'x1': x1,
                    'size': round(max(s['size'] for s in l['spans']), 1),
                    'font': l['spans'][0]['font'],
                    'bold': any('Bold' in s['font'] for s in l['spans'])})
print(json.dumps(out))
`;
  const tmp = path.join(os.tmpdir(), 'tmj_proof.py');
  fs.writeFileSync(tmp, script, 'utf8');
  return JSON.parse(execFileSync('python3', [tmp, pdfPath], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
}

function findLine(bs, needle) {
  const exact = bs.filter(b => b.t === needle);
  if (exact.length) return exact[0];
  const starts = bs.filter(b => b.t.startsWith(needle));
  if (starts.length) return starts[0];
  const has = bs.filter(b => b.t.includes(needle));
  return has.length ? has[0] : null;
}

const CHECKS = [
  ['company', 'Treasure Mountain Jewelshop Limited'],
  ['owner', '(Jami Ann Hughes)'],
  ['street', '906 23 Ave NW'],
  ['city', 'Calgary, AB T2M 1T4'],
  ['phone', 'Ph: 587-893-5343'],
  ['gst', 'GST#: 79768 5419 RT 0001'],
  ['title', 'INVOICE'],
  ['invoice#', 'Invoice #:'],
  ['date', 'Date:'],
  ['poref', 'PO Ref #:'],
  ['billed', 'Billed To (Customer):'],
  ['customer', 'Albern Coin & Foreign Exchange Ltd.'],
  ['cust street', '1615 Centre Street NW'],
  ['cust city', 'Calgary, AB T2E 2S2'],
  ['cust #', 'Customer #:'],
  ['payment hdr', 'Payment & Status Details:'],
  ['pay type', 'Payment Type:'],
  ['ref #', 'Reference #:'],
  ['currency', 'Currency:'],
  ['amount paid', 'Amount Paid:'],
  ['pay status', 'Payment Status:'],
  ['item hdr', 'Item #'],
  ['desc hdr', 'Description'],
  ['qty hdr', 'Qty'],
  ['unit hdr', 'Unit Price'],
  ['total hdr', 'Total'],
  ['desc', 'Lot of Jewellery 30.1g @ 5950.70'],
  ['subtotal', 'Sub-Total:'],
  ['gst line', 'GST (5.00%):'],
  ['total due', 'Total Due:'],
  ['terms hdr', 'Terms & Conditions:'],
  ['terms 1', 'ALL PURCHASES ARE FINAL.'],
  ['terms 2', 'Items certified clear of all liens and notes.'],
  ['value sub', '$4,000.89'],
  ['value gst', '$200.04'],
  ['value due', '$4,200.93']
];

(async () => {
  const [refPath, outDir] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });

  const out = path.join(outDir, 'proof.pdf');
  chromePdf(renderDocument(REF_DATA, 'invoice'), out);
  console.log('rendered:', out, '\n');

  const A = pdfBlocks(refPath), B = pdfBlocks(out);

  let ok = 0, bad = 0;
  const problems = [];
  for (const [name, needle] of CHECKS) {
    const a = findLine(A, needle), b = findLine(B, needle);
    if (!a) { problems.push(`${name.padEnd(12)} "${needle}" not in REFERENCE`); continue; }
    if (!b) { problems.push(`${name.padEnd(12)} "${needle}" missing from OURS`); bad++; continue; }
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const ds = Math.abs(a.size - b.size);
    const db = a.bold !== b.bold;
    if (dx <= 2.5 && dy <= 3.0 && ds <= 0.6 && !db) {
      ok++;
    } else {
      bad++;
      problems.push(
        `${name.padEnd(12)} "${needle.slice(0, 28)}"  ref(x=${a.x.toFixed(1)},y=${a.y.toFixed(1)},${a.size}pt,bold=${a.bold}) ` +
        `ours(x=${b.x.toFixed(1)},y=${b.y.toFixed(1)},${b.size}pt,bold=${b.bold}) [dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}]`
      );
    }
  }

  console.log(`design proof vs client reference: ${ok}/${CHECKS.length} elements match`);
  if (problems.length) {
    console.log('\nremaining differences:');
    for (const p of problems) console.log('  ' + p);
  }
})();
