'use strict';
/** PDF text extraction via pdf.js (legacy CommonJS build, works in Electron + plain Node). */
const { itemsToLayoutText } = require('./layoutText');

// pdf.js probes for DOMMatrix/Path2D and tries to load the optional `canvas`
// package. We only need text extraction, so stub them to keep the console clean.
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrix {};
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D {};

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    // pdfjs-dist@3 legacy build is CommonJS
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.js').then((m) => (m.default && m.default.getDocument ? m.default : m));
  }
  return pdfjsPromise;
}

async function extractPdfText(buffer, fileName) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    verbosity: 0
  }).promise;

  const pages = [];
  const numPages = doc.numPages;
  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(itemsToLayoutText(content.items));
    page.cleanup();
  }
  const text = pages.join('\n\f\n');
  await doc.destroy();
  return { text, pages: numPages, fileName };
}

module.exports = { extractPdfText };
