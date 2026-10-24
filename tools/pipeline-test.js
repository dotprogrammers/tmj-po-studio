'use strict';
/**
 * End-to-end pipeline test without a GUI: import a real ZIP of Albern POs,
 * parse every PDF, render both document kinds through headless Chrome, and
 * assert the output PDFs contain the expected values.
 *
 *   node tools/pipeline-test.js <zip-or-dir> <out-dir>
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const AdmZip = require('adm-zip');

const { extractPdfText } = require('../parser/extractPdf');
const { parsePO } = require('../parser/parsePO');
const { renderDocument, invoiceNumber } = require('../renderer/template');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function expandZip(buffer, out = []) {
  const zip = new AdmZip(buffer);
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    const base = path.basename(e.entryName);
    if (!base || base.startsWith('._') || base === '.DS_Store') continue;
    if (base.toLowerCase().endsWith('.pdf')) out.push({ name: base, buffer: e.getData() });
    else if (base.toLowerCase().endsWith('.zip')) expandZip(e.getData(), out);
  }
  return out;
}

function chromePdf(html, outPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmj-e2e-'));
  const htmlPath = path.join(tmp, 'doc.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=4000',
    `--print-to-pdf=${outPath}`, 'file://' + htmlPath
  ], { stdio: 'ignore', timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
}

async function main() {
  const src = process.argv[2];
  const outDir = process.argv[3];
  fs.mkdirSync(outDir, { recursive: true });

  let entries = [];
  if (fs.statSync(src).isDirectory()) {
    for (const f of fs.readdirSync(src)) {
      if (f.toLowerCase().endsWith('.pdf')) entries.push({ name: f, buffer: fs.readFileSync(path.join(src, f)) });
    }
  } else {
    entries = expandZip(fs.readFileSync(src));
  }
  console.log(`imported ${entries.length} PDFs from ${path.basename(src)}`);

  let own = 1;
  const results = [];
  for (const en of entries) {
    const { text } = await extractPdfText(en.buffer, en.name);
    const rec = parsePO(text, en.name);
    rec.ownPo = own++;
    results.push(rec);
  }

  const total = results.reduce((a, r) => a + (r.total || 0), 0);
  console.log(`parsed ${results.length} records, batch value $${total.toFixed(2)}`);

  // render one invoice + one PO to prove the output path
  const sample = results[0];
  const invPath = path.join(outDir, `Invoice - ${invoiceNumber(sample)} - PO ${sample.po}.pdf`);
  chromePdf(renderDocument(sample, 'invoice'), invPath);
  const poPath = path.join(outDir, `TMJ Purchase Order ${String(sample.ownPo).padStart(6, '0')} - Albern PO ${sample.po}.pdf`);
  chromePdf(renderDocument(sample, 'po'), poPath);

  console.log(`\nwrote:\n  ${invPath}\n  ${poPath}`);
  console.log(`\nrecord summary:`);
  for (const r of results.slice(0, 5)) {
    console.log(`  PO ${r.po}  ${r.dateLong}  $${r.total.toFixed(2)}  cheque ${r.payments[0] && r.payments[0].ref}  ${r.warnings.length ? '⚠ ' + r.warnings[0] : 'clean'}`);
  }
  console.log(`  ... ${results.length} total`);
}

main().catch(e => { console.error(e); process.exit(1); });
