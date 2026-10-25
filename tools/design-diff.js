'use strict';
/**
 * Pixel-level design diff: compare the app's rendered invoice against the
 * REFERENCE invoice we previously delivered to the client.
 *
 * Both PDFs are reduced to a comparable "line list" (label/value pairs and
 * their vertical order), then compared line by line.
 *
 *   node tools/design-diff.js <reference.pdf> <generated.pdf>
 */
const fs = require('fs');
const { extractPdfText } = require('../parser/extractPdf');

async function lines(p) {
  const { text } = await extractPdfText(fs.readFileSync(p), p);
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

(async () => {
  const [refPath, minePath] = process.argv.slice(2);
  const ref = await lines(refPath);
  const mine = await lines(minePath);

  console.log(`REFERENCE : ${ref.length} lines`);
  console.log(`GENERATED : ${mine.length} lines`);

  const max = Math.max(ref.length, mine.length);
  let diffs = 0;
  console.log('\nline-by-line:');
  for (let i = 0; i < max; i++) {
    const a = ref[i] === undefined ? '—' : ref[i];
    const b = mine[i] === undefined ? '—' : mine[i];
    if (a !== b) {
      diffs++;
      console.log(`  ${String(i).padStart(3)} REF: ${a}`);
      console.log(`      GEN: ${b}`);
    }
  }
  console.log(diffs === 0 ? '\n✓ IDENTICAL line-for-line' : `\n${diffs} differing lines`);
})();
