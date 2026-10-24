'use strict';
/**
 * Offline parser verification harness.
 * Parses the real Albern PO PDFs with the app's own engine and diffs the
 * result against the validated Python extraction (tmj_2024_extract/parsed.json).
 *
 *   node tools/verify-parser.js <dir-with-pdfs> [reference.json]
 */
const fs = require('fs');
const path = require('path');
const { extractPdfText } = require('../parser/extractPdf');
const { parsePO } = require('../parser/parsePO');

async function main() {
  const dir = process.argv[2];
  const refPath = process.argv[3];
  if (!dir) { console.error('usage: node tools/verify-parser.js <pdf-dir> [reference.json]'); process.exit(1); }

  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
  const records = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    try {
      const { text, pages } = await extractPdfText(buf, f);
      const rec = parsePO(text, f);
      rec.pages = pages;
      records.push(rec);
    } catch (e) {
      console.log(`  FAIL ${f}: ${e.message}`);
    }
  }

  console.log(`parsed ${records.length}/${files.length} PDFs\n`);
  if (files.length && records.length !== files.length) {
    console.error(`ERROR: ${files.length - records.length} file(s) failed to parse — aborting comparison.`);
    process.exit(2);
  }
  const issues = [];
  for (const r of records) {
    const warn = r.warnings.length ? ' ⚠ ' + r.warnings.join(' | ') : '';
    console.log(
      `PO ${String(r.po || '??????').padStart(7)}  ${String(r.dateLong || '-').padEnd(20)} items=${String(r.items.length).padStart(2)} ` +
      `sub=${r.subtotal != null ? r.subtotal.toFixed(2).padStart(9) : '      -  '} ` +
      `gst=${r.gst != null ? r.gst.toFixed(2).padStart(7) : '     - '} ` +
      `total=${r.total != null ? r.total.toFixed(2).padStart(9) : '      -  '} ` +
      `cheque=${(r.payments[0] && r.payments[0].ref) || '-'}${warn}`
    );
    if (r.warnings.length) issues.push({ po: r.po, warnings: r.warnings });
  }

  const total = records.reduce((a, r) => a + (r.total || 0), 0);
  console.log(`\ngrand total: $${total.toFixed(2)}`);

  if (refPath && fs.existsSync(refPath)) {
    const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
    const refMap = new Map(ref.map(r => [String(r.po), r]));
    let diffs = 0;
    console.log('\n--- diff vs reference ---');
    for (const r of records) {
      const rr = refMap.get(String(r.po));
      if (!rr) { console.log(`  PO ${r.po}: NOT IN REFERENCE`); diffs++; continue; }
      const cmp = (a, b, label, tol = 0.011) => {
        if (a == null && b == null) return;
        if (a == null || b == null) { console.log(`  PO ${r.po}: ${label} ${a} vs ${b}`); diffs++; return; }
        if (Math.abs(a - b) > tol) { console.log(`  PO ${r.po}: ${label} ${a} vs ${b}`); diffs++; }
      };
      cmp(r.subtotal, rr.subtotal, 'subtotal');
      cmp(r.gst, rr.gst, 'gst');
      cmp(r.total, rr.total, 'total');
      if (r.items.length !== rr.items.length) { console.log(`  PO ${r.po}: items ${r.items.length} vs ${rr.items.length}`); diffs++; }
      else {
        for (let i = 0; i < r.items.length; i++) {
          if (Math.abs((r.items[i].total || 0) - (rr.items[i].total || 0)) > 0.011) {
            console.log(`  PO ${r.po}: item ${i} total ${r.items[i].total} vs ${rr.items[i].total}`); diffs++;
          }
        }
      }
      const rRef = r.payments[0] && r.payments[0].ref;
      const xRef = rr.payments[0] && rr.payments[0].ref;
      if (String(rRef) !== String(xRef)) { console.log(`  PO ${r.po}: cheque ${rRef} vs ${xRef}`); diffs++; }
    }
    console.log(diffs === 0 ? '✓ zero differences vs reference' : `✗ ${diffs} differences`);
    process.exitCode = diffs === 0 && issues.length === 0 ? 0 : 1;
  } else if (issues.length) {
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
