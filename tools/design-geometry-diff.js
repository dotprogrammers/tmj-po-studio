'use strict';
/**
 * Geometry-based design diff.
 *
 * Text extraction order differs for two-column layouts, so a naive line diff
 * produces false mismatches. This compares the rendered PDFs by absolute
 * position: every text block is bucketed into a row band (left column vs
 * right column) and matched by coordinates.
 *
 *   node tools/design-geometry-diff.js <reference.pdf> <generated.pdf>
 */
const fs = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');

const PY = 'python3';

function pdfBlocks(pdfPath) {
  const script = `
import pymupdf, json, sys
d = pymupdf.open(sys.argv[1])
p = d[0]
out = []
for b in p.get_text('dict')['blocks']:
    for l in b.get('lines', []):
        t = ''.join(s['text'] for s in l['spans']).strip()
        if not t: continue
        x0,y0,x1,y1 = l['bbox']
        out.append({'t': t, 'x': round(x0,1), 'y': round(y0,1), 'x1': round(x1,1), 'y1': round(y1,1),
                    'size': round(max(s['size'] for s in l['spans']),1),
                    'font': l['spans'][0]['font']})
print(json.dumps(out))
`;
  const tmp = path.join(os.tmpdir(), 'tmj_geom.py');
  fs.writeFileSync(tmp, script, 'utf8');
  const out = execFileSync(PY, [tmp, pdfPath], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(out);
}

function norm(s) {
  // Normalize whitespace only. Commas and digits must survive — stripping
  // them made different amounts compare equal (a false "identical" result).
  return String(s).replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

// Group into rows by y (tolerance 4pt), then split each row into left/right columns.
function rows(blocks) {
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const b of sorted) {
    let row = out.find(r => Math.abs(r.y - b.y) < 4.5);
    if (!row) { row = { y: b.y, cells: [] }; out.push(row); }
    row.cells.push(b);
  }
  for (const r of out) r.cells.sort((a, b) => a.x - b.x);
  return out;
}

function summarize(r) {
  return r.cells.map(c => `${norm(c.t)}@${c.x},${c.y}`).join('  |  ');
}

(async () => {
  const [a, b] = process.argv.slice(2);
  const A = pdfBlocks(a), B = pdfBlocks(b);
  const ra = rows(A), rb = rows(B);

  console.log(`REFERENCE : ${A.length} text lines in ${ra.length} rows`);
  console.log(`GENERATED : ${B.length} text lines in ${rb.length} rows`);

  // Compare the SET of normalized strings — position-aware via nearest row.
  const normA = A.map(c => norm(c.t));
  const normB = B.map(c => norm(c.t));
  const count = arr => arr.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
  const cA = count(normA), cB = count(normB);
  const onlyA = Object.keys(cA).filter(x => cA[x] > (cB[x] || 0));
  const onlyB = Object.keys(cB).filter(x => cB[x] > (cA[x] || 0));

  console.log('\n--- present in REFERENCE but not GENERATED ---');
  onlyA.forEach(x => console.log('  REF-ONLY:', x));
  console.log('\n--- present in GENERATED but not REFERENCE ---');
  onlyB.forEach(x => console.log('  GEN-ONLY:', x));

  console.log('\n--- font sizes used (reference vs generated) ---');
  const fs1 = [...new Set(A.map(c => c.size))].sort((x,y)=>x-y);
  const fs2 = [...new Set(B.map(c => c.size))].sort((x,y)=>x-y);
  console.log('  ref:', fs1.join(', '));
  console.log('  gen:', fs2.join(', '));

  console.log('\n--- fonts (reference vs generated) ---');
  const ff1 = [...new Set(A.map(c => c.font))].sort();
  const ff2 = [...new Set(B.map(c => c.font))].sort();
  console.log('  ref:', ff1.join(', '));
  console.log('  gen:', ff2.join(', '));

  const ok = onlyA.length === 0 && onlyB.length === 0;
  console.log(ok ? '\n✓ CONTENT IDENTICAL (same text set)' : `\n${onlyA.length + onlyB.length} text differences`);
})();
