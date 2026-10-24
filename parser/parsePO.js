'use strict';
/**
 * Albern / Treasure Mountain purchase-order parser.
 * Port of the validated Python extractor: recovers PO number, date, line items,
 * sub-total, GST, total and payment rows, then cross-checks the arithmetic.
 * Layout-dependent line shapes are handled with tolerant, anchored patterns so
 * both real portal PDFs and text-reflowed variants parse correctly.
 */

const MONTHS = ['January','February','March','April','May','June','July',
  'August','September','October','November','December'];

function num(s) {
  if (s == null) return null;
  return parseFloat(String(s).replace(/[$,\s]/g, ''));
}
function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }

/** Normalise whitespace while keeping single spaces. */
function norm(s) { return String(s).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim(); }

/**
 * Locate the Albern purchase-order number.
 * Order of trust:
 *   1. the portal URL parameter (poNumber=144119)
 *   2. the source file name ("... Purchase Order # 144119.pdf")
 *   3. the printed "Purchase Order #" label — the number sits on one of the
 *      following lines in the Albern layout, so we scan forward and take the
 *      first standalone 5-7 digit token that is not part of an address,
 *      phone number or money amount.
 */
function findPONumber(raw, fileName) {
  let m = raw.match(/poNumber=(\d{4,8})/i);
  if (m) return m[1];

  if (fileName) {
    m = fileName.match(/Purchase\s*Order\s*#?\s*(\d{4,8})/i);
    if (m) return m[1];
  }

  const lines = raw.split('\n');
  const labelIdx = lines.findIndex(l => /Purchase\s*Order\s*#/i.test(l));
  const skip = /Centre\s+Street|Calgary|Calgary|Ph:\s|Fax:|GST#|Web:|Calgary|Ave\s+NW|\$\s*\d/;

  if (labelIdx >= 0) {
    for (let i = labelIdx; i < Math.min(labelIdx + 8, lines.length); i++) {
      if (skip.test(lines[i])) {
        // a skipped line may still carry the number (e.g. "Ph: 403-276-8938   128804")
        const inline = lines[i].match(/(?:^|\s)(\d{5,7})(?=\s|$)/);
        if (inline && !/Phone|\d{3}-\d{3}-\d{4}/.test(lines[i])) return inline[1];
        continue;
      }
      const cand = lines[i].match(/(?:^|\s)(\d{5,7})(?=\s|$)/);
      if (cand) return cand[1];
    }
  }

  // last resort: any standalone 6-digit token that looks like a PO number
  const fallback = raw.match(/(?:^|\s)(\d{6})(?=\s|$)/);
  return fallback ? fallback[1] : null;
}

function parsePO(text, fileName) {
  const raw = String(text || '').replace(/\r/g, '');
  const flat = norm(raw.replace(/\n/g, ' '));
  const rec = {
    po: null, albernPo: null, ownPo: null,
    dateLong: null, dateISO: null,
    items: [], subtotal: null, gst: null, total: null,
    payments: [], paidTotal: null, owing: null,
    temp: false, source: fileName || null, warnings: []
  };

  // ---------- PO number ----------
  rec.po = findPONumber(raw, fileName);
  if (!rec.po) rec.warnings.push('PO number not found');

  // ---------- Date ----------
  let m = raw.match(/(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,\s*([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (m) {
    rec.dateLong = `${m[1]} ${parseInt(m[2], 10)}, ${m[3]}`;
  } else {
    m = flat.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (m) {
      let [_, mo, da, yr] = m;
      yr = yr.length === 2 ? '20' + yr : yr;
      rec.dateLong = `${MONTHS[parseInt(mo, 10) - 1]} ${parseInt(da, 10)}, ${yr}`;
    }
  }
  if (rec.dateLong) {
    const dm = rec.dateLong.match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (dm) {
      const mo = MONTHS.indexOf(dm[1]) + 1;
      rec.dateISO = `${dm[3]}-${String(mo).padStart(2, '0')}-${String(parseInt(dm[2], 10)).padStart(2, '0')}`;
    }
  } else rec.warnings.push('Date not found');

  // ---------- Items ----------
  // Each item: "<description> <qty> $ <unit> $ <total>"
  const itemRe = /^(.+?)\s+(\d{1,3})\s+\$?\s*([\d,]+\.\d{2})\s+\$?\s*([\d,]+\.\d{2})\s*$/gm;
  const lines = raw.split('\n');
  let inItems = false;
  const stopWords = /^(Purchase Total|Item Sub-Total|GST|Items being purchased|Item\b|#|Comments\/Notes)/i;
  for (const line of lines) {
    const t = line.trim();
    if (/Items being purchased/i.test(t)) { inItems = true; continue; }
    if (!inItems) continue;
    if (/^Purchase Total/i.test(t) || /^\s*Item Sub-Total/i.test(t)) break;
    if (!t || stopWords.test(t)) continue;
    // Only accept lines that end with two money amounts and contain a qty before them
    const lm = t.match(/^(.+?)\s{1,}(\d{1,3})\s+\$?\s*([\d,]+\.\d{2})\s+\$?\s*([\d,]+\.\d{2})\s*$/);
    if (lm) {
      rec.items.push({
        description: norm(lm[1]),
        qty: parseFloat(lm[2]),
        unit_price: r2(num(lm[3])),
        total: r2(num(lm[4]))
      });
    }
  }
  if (!rec.items.length) rec.warnings.push('No line items parsed');

  // ---------- Totals ----------
  m = raw.match(/Item Sub-Total:\s*\$?\s*([\d,]+\.\d{2})/);
  if (m) rec.subtotal = r2(num(m[1]));

  m = raw.match(/GST\s*\(5\.00%\):\s*\$?\s*([\d,]+\.\d{2})/);
  if (!m) {
    // GST value can sit on the following line in some layouts
    m = raw.match(/GST\s*\(5\.00%\):\s*\n\s*\$?\s*([\d,]+\.\d{2})/);
  }
  if (m) rec.gst = r2(num(m[1]));

  m = raw.match(/Purchase Total:\s*\$?\s*([\d,]+\.\d{2})/);
  if (m) rec.total = r2(num(m[1]));

  // ---------- Payments ----------
  const payRe = /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+([A-Za-z]+)\s+\$?\s*([\d,]+\.\d{2})\s+([A-Za-z]+)\s+(\d{3,})\s*$/gm;
  let pm;
  while ((pm = payRe.exec(raw)) !== null) {
    rec.payments.push({
      date: pm[1], ptype: pm[2], amount: r2(num(pm[3])),
      currency: pm[4], ref: pm[5]
    });
  }
  m = raw.match(/Total of all payments:\s*\$?\s*([\d,]+\.\d{2})/);
  if (m) rec.paidTotal = r2(num(m[1]));
  else if (rec.payments.length) rec.paidTotal = r2(rec.payments.reduce((s, p) => s + p.amount, 0));

  if (rec.total != null && rec.paidTotal != null) {
    rec.owing = r2(Math.max(0, rec.total - rec.paidTotal));
  }

  // ---------- Validation ----------
  if (rec.items.length && rec.subtotal != null) {
    const s = r2(rec.items.reduce((a, i) => a + i.total, 0));
    if (Math.abs(s - rec.subtotal) > 0.011) {
      rec.warnings.push(`Items sum ${s.toFixed(2)} != Sub-Total ${rec.subtotal.toFixed(2)}`);
    }
  }
  for (const i of rec.items) {
    if (i.qty && Math.abs(r2(i.qty * i.unit_price) - i.total) > 0.011) {
      rec.warnings.push(`Qty x price mismatch on "${i.description.slice(0, 32)}"`);
    }
  }
  if (rec.subtotal != null && rec.gst != null && rec.total != null) {
    if (Math.abs(r2(rec.subtotal + rec.gst) - rec.total) > 0.011) {
      rec.warnings.push('Sub-Total + GST != Purchase Total');
    }
  }
  if (rec.total != null && rec.paidTotal != null && Math.abs(rec.paidTotal - rec.total) > 0.011) {
    rec.warnings.push('Payment total does not equal Purchase Total');
  }
  if (!rec.payments.length) rec.warnings.push('No payment row found');

  rec.ok = rec.items.length > 0 && rec.total != null && rec.po != null;
  return rec;
}

module.exports = { parsePO, num, r2, MONTHS };
