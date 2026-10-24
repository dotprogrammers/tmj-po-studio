'use strict';
/**
 * Template validation using headless Chrome (same Chromium engine Electron
 * uses for printToPDF). Produces real PDFs so the layout can be inspected.
 *
 *   node tools/chrome-render.js <pdf-dir> <out-dir>
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { extractPdfText } = require('../parser/extractPdf');
const { parsePO } = require('../parser/parsePO');
const { renderDocument } = require('../renderer/template');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const srcDir = process.argv[2];
const outDir = process.argv[3];

async function main() {
  if (!fs.existsSync(CHROME)) { console.error('Chrome not found at ' + CHROME); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
  let pass = 0, fail = 0;

  for (const f of files) {
    const buf = fs.readFileSync(path.join(srcDir, f));
    const { text } = await extractPdfText(buf, f);
    const rec = parsePO(text, f);

    for (const kind of ['invoice', 'po']) {
      const html = renderDocument(rec, kind);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmj-chrome-'));
      const htmlPath = path.join(tmp, 'doc.html');
      const pdfPath = path.join(outDir, `${kind}-${rec.po || 'x'}.pdf`);
      fs.writeFileSync(htmlPath, html, 'utf8');

      execFileSync(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--no-pdf-header-footer',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=4000',
        `--print-to-pdf=${pdfPath}`,
        'file://' + htmlPath
      ], { stdio: 'ignore', timeout: 60000 });

      const ok = fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 2000;
      if (!ok) { console.log(`FAIL ${kind} ${f}`); fail++; }
      else pass++;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  console.log(`rendered ${pass} ok / ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
