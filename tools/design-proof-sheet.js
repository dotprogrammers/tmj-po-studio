'use strict';
/**
 * Side-by-side visual proof sheet.
 *
 * Renders the client's reference invoice and our generated invoice at the
 * same scale onto one page so a human can eyeball the design match.
 *
 *   node tools/design-proof-sheet.js <reference.pdf> <generated.pdf> <out.png>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function pdfToPng(pdfPath, outPrefix) {
  execFileSync('/opt/homebrew/bin/python3', ['-c', `
import pymupdf, sys
d = pymupdf.open(sys.argv[1])
p = d[0]
p.get_pixmap(dpi=110).save(sys.argv[2])
`, pdfPath, outPrefix]);
}

(async () => {
  const [refPath, genPath, outPath] = process.argv.slice(2);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmj-sheet-'));
  const refPng = path.join(tmp, 'ref.png');
  const genPng = path.join(tmp, 'gen.png');
  pdfToPng(refPath, refPng);
  pdfToPng(genPath, genPng);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: 17in 11in; margin: 0; }
    body { margin:0; font-family: Helvetica, Arial, sans-serif; background:#eef1f5; }
    .wrap { display:flex; gap:0.35in; padding:0.35in; }
    .col { flex:1; }
    .cap { font-size:15pt; font-weight:700; color:#1e3a5f; margin:0 0 6pt; }
    .cap small { font-weight:400; color:#555; font-size:10.5pt; }
    img { width:100%; border:1px solid #cbd5e0; background:#fff;
          box-shadow:0 2px 10px rgba(0,0,0,.14); }
  </style></head><body><div class="wrap">
    <div class="col">
      <p class="cap">CLIENT REFERENCE<br><small>urgent_final.pdf — the file the client supplied</small></p>
      <img src="file://${refPng}">
    </div>
    <div class="col">
      <p class="cap">TMJ PO STUDIO OUTPUT<br><small>generated from a new purchase order</small></p>
      <img src="file://${genPng}">
    </div>
  </div></body></html>`;

  const htmlPath = path.join(tmp, 'sheet.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=5000',
    `--screenshot=${outPath}`, '--window-size=1632,1056', 'file://' + htmlPath
  ], { stdio: 'ignore', timeout: 90000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('proof sheet ->', outPath);
})();
