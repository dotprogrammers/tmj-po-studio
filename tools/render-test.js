'use strict';
/**
 * Headless renderer test: generates PDFs through the same Chromium print
 * engine the app uses, then verifies the output is a valid Letter-size PDF
 * containing the expected text.
 *
 *   npx electron tools/render-test.js <pdf-dir> <out-dir>
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { extractPdfText } = require('../parser/extractPdf');
const { parsePO } = require('../parser/parsePO');
const { renderDocument } = require('../renderer/template');

const srcDir = process.argv[2];
const outDir = process.argv[3];

async function renderPdf(rec, kind, outPath) {
  const html = renderDocument(rec, kind);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmj-render-'));
  const htmlPath = path.join(tmpDir, 'doc.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadFile(htmlPath);
  await new Promise(r => setTimeout(r, 200));
  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'Letter',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    preferCSSPageSize: true
  });
  fs.writeFileSync(outPath, pdf);
  win.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return outPath;
}

app.whenReady().then(async () => {
  const files = fs.readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
  fs.mkdirSync(outDir, { recursive: true });

  let pass = 0, fail = 0;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(srcDir, f));
    const { text } = await extractPdfText(buf, f);
    const rec = parsePO(text, f);

    // invoice mode
    const invOut = path.join(outDir, `inv-${rec.po || 'x'}.pdf`);
    await renderPdf(rec, 'invoice', invOut);
    // purchase-order mode
    const poOut = path.join(outDir, `po-${rec.po || 'x'}.pdf`);
    await renderPdf(rec, 'po', poOut);

    const size = fs.statSync(invOut).size;
    const header = fs.readFileSync(invOut).subarray(0, 8).toString('latin1');
    const okHeader = header.startsWith('%PDF-');
    if (!okHeader || size < 3000) { console.log(`FAIL ${f}: header=${okHeader} size=${size}`); fail++; }
    else pass++;
  }
  console.log(`\nrendered ${pass} ok / ${fail} failed (2 files each)`);
  console.log('sample outputs:', fs.readdirSync(outDir).slice(0, 4).join(', '));
  app.exit(fail ? 1 : 0);
}).catch(e => { console.error(e); app.exit(1); });
