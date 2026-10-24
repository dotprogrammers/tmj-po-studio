'use strict';
/**
 * Layout-aware text extraction for PDFs in Node (no native deps).
 * Converts pdf.js text items into a pdftotext -layout style string by
 * clustering items into visual lines (y tolerance) and inserting spacing
 * for large x-gaps so column data stays machine-parseable.
 */
function itemsToLayoutText(items) {
  const parts = [];
  for (const it of items) {
    const str = (it.str || '').replace(/\s+$/,'');
    if (!str.trim()) continue;
    const t = it.transform || [0,0,0,0,0,0];
    parts.push({ str, x: t[4], y: t[5], w: typeof it.width === 'number' ? it.width : str.length * 4 });
  }
  // PDF y grows upward -> visual order is y descending; ties by x ascending
  parts.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const lines = [];
  let cur = null;
  for (const p of parts) {
    if (cur && Math.abs(p.y - cur.y) <= 2.2) {
      const gap = p.x - (cur.x + cur.w);
      const pad = gap > 18 ? '   ' : (gap > 0.8 ? ' ' : '');
      cur.str += pad + p.str;
      cur.x = p.x;
      cur.w = p.w;
      cur.y = (cur.y + p.y) / 2;
    } else {
      if (cur) lines.push(cur.str.replace(/\s+$/, ''));
      cur = { str: p.str, x: p.x, y: p.y, w: p.w };
    }
  }
  if (cur) lines.push(cur.str.replace(/\s+$/, ''));
  return lines.join('\n');
}

module.exports = { itemsToLayoutText };
