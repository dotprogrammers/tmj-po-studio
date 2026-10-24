'use strict';
/**
 * Layout audit: render every PO and confirm the document stays on a single
 * US-Letter page with no clipped content.
 *
 *   node tools/layout-audit.js <pdf-dir> <out-dir>
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { extractPdfText } = require('../parser/extractPdf');
const { parsePO } = require('../parser/parsePO');
const { renderDocument } = require('../renderer/template');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main() {
  const srcDir = process.argv[2];
  const outDir = process.argv[3];
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
  const report = [];

  for (const f of files) {
    const buf = fs.readFileSync(path.join(srcDir, f));
    const { text } = await extractPdfText(buf, f);
    const rec = parsePO(text, f);

    for (const kind of ['invoice', 'po']) {
      const html = renderDocument(rec, kind);
      const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tmj-audit-'));
      const htmlPath = path.join(tmp, 'doc.html');
      const pdfPath = path.join(outDir, `${kind}-${rec.po}.pdf`);
      fs.writeFileSync(htmlPath, html, 'utf8');
      execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
        '--run-all-compositor-stages-before-draw', '--virtual-time-budget=4000',
        `--print-to-pdf=${pdfPath}`, 'file://' + htmlPath
      ], { stdio: 'ignore', timeout: 60000 });
      fs.rmSync(tmp, { recursive: true, force: true });
      report.push({ kind, po: rec.po, pdf: pdfPath, html });
    }
  }

  fs.writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify(report.map(r => ({ kind: r.kind, po: r.po })), null, 2));
  console.log(`rendered ${report.length} documents into ${outDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });
