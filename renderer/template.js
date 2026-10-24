'use strict';
/**
 * Treasure Mountain PDF document template.
 * Brand-faithful reproduction of the delivered client format (navy #1e3a5f,
 * Arial/Helvetica, two-panel header, ruled item table) rendered through
 * Chromium print-to-PDF at exact US Letter size for pixel-stable output.
 */

const MONTHS = ['January','February','March','April','May','June','July',
  'August','September','October','November','December'];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function money(v) {
  const n = Number(v || 0);
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${MONTHS[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]}`;
  return d;
}
function invoiceNumber(rec) {
  // Delivered-batch convention: TMJ-YYYY-MMDD  (e.g. TMJ-2024-1003 for 3 Oct 2024)
  if (rec.dateISO) {
    const m = String(rec.dateISO).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `TMJ-${m[1]}-${m[2]}${m[3]}`;
  }
  if (rec.dateLong) {
    const m = rec.dateLong.match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (m) {
      const mo = String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0');
      return `TMJ-${m[3]}-${mo}${String(parseInt(m[2], 10)).padStart(2, '0')}`;
    }
  }
  return 'TMJ-' + (rec.po || 'DRAFT');
}

/**
 * @param {object} rec parsed record
 * @param {'invoice'|'po'} kind  invoice = Treasure Mountain invoice, po = Treasure Mountain purchase order
 */
function renderDocument(rec, kind = 'invoice') {
  const isPO = kind === 'po';
  const title = isPO ? 'PURCHASE ORDER' : 'INVOICE';
  const docNo = isPO ? (rec.ownPo ? String(rec.ownPo).padStart(6, '0') : (rec.po || '')) : invoiceNumber(rec);
  const refLabel = isPO ? 'Albern PO Ref #:' : 'PO Ref #:';
  const refValue = isPO ? (rec.po || '') : (rec.po || '');
  const pay = (rec.payments && rec.payments[0]) || {};
  const total = rec.total != null ? rec.total : 0;
  const subtotal = rec.subtotal != null ? rec.subtotal : (rec.items || []).reduce((a, i) => a + (i.total || 0), 0);
  const gst = rec.gst != null ? rec.gst : Math.round(subtotal * 0.05 * 100) / 100;
  const paid = rec.paidTotal != null ? rec.paidTotal : total;
  const owing = Math.max(0, Math.round((total - paid) * 100) / 100);

  const rows = (rec.items || []).map((it, i) => `
      <tr>
        <td class="c num">${i + 1}</td>
        <td class="desc">${esc(it.description)}</td>
        <td class="c">${it.qty}</td>
        <td class="r">${money(it.unit_price)}</td>
        <td class="r">${money(it.total)}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)} ${esc(docNo)} — ${esc(rec.po || '')}</title>
<style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    color: #222;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet {
    width: 8.5in; min-height: 11in;
    padding: 0.62in 0.75in 0.7in 0.75in;
    display: flex; flex-direction: column;
  }
  /* ---------- header ---------- */
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .seller .name { font-size: 12.6pt; font-weight: 700; color: #1a1a2e; letter-spacing: .1px; }
  .seller .line  { font-size: 9.9pt; line-height: 13.4pt; color: #222; }
  .meta { text-align: right; }
  .meta .doc-title {
    font-size: 21pt; font-weight: 700; color: #1e3a5f; letter-spacing: .6px; line-height: 1;
  }
  .meta .meta-rows { margin-top: 7px; font-size: 9.9pt; line-height: 13.4pt; }
  .meta .meta-rows b { font-weight: 700; }
  .rule { border: 0; border-top: 2px solid #1e3a5f; margin: 13px 0 0; }

  /* ---------- parties ---------- */
  .parties { display: flex; margin-top: 20px; gap: 26px; }
  .party { flex: 1 1 50%; }
  .party h3 {
    font-size: 10.5pt; margin: 0 0 8px; color: #111; font-weight: 700;
  }
  .party .cust-name { font-weight: 700; font-size: 10pt; }
  .party .l { font-size: 9.9pt; line-height: 13.4pt; }
  .kv { display: grid; grid-template-columns: max-content 1fr; column-gap: 8px; font-size: 9.9pt; line-height: 13.4pt; }
  .kv dt { font-weight: 700; margin: 0; white-space: nowrap; }
  .kv dd { margin: 0; white-space: nowrap; }

  /* ---------- table ---------- */
  table.items { width: 100%; border-collapse: collapse; margin-top: 20px; }
  table.items thead th {
    background: #1e3a5f; color: #fff; font-size: 9.2pt; font-weight: 700;
    padding: 8px 6px; text-align: left;
  }
  table.items thead th.c { text-align: center; }
  table.items thead th.r { text-align: right; }
  table.items td {
    font-size: 9.9pt; padding: 9px 6px; border-bottom: 1px solid #e3e8ee; vertical-align: top;
  }
  table.items tbody tr:nth-child(even) { background: #f6f9fc; }
  table.items td.c { text-align: center; }
  table.items td.r { text-align: right; white-space: nowrap; }
  table.items td.num { width: 8%; }
  table.items td.desc { width: 54%; }
  table.items thead th:nth-child(3) { width: 9%; }
  table.items thead th:nth-child(4) { width: 14%; }
  table.items thead th:nth-child(5) { width: 15%; }

  /* ---------- totals ---------- */
  .totals { margin-left: auto; width: 42%; margin-top: 22px; }
  .totals .row { display: flex; justify-content: space-between; font-size: 9.9pt; padding: 3px 0; }
  .totals .row.total {
    margin-top: 7px; padding-top: 8px; border-top: 2px solid #1e3a5f;
    border-bottom: 1px solid #1e3a5f; font-weight: 700; font-size: 10.2pt;
  }
  .totals .row .amt { font-variant-numeric: tabular-nums; }

  /* ---------- terms ---------- */
  .terms { margin-top: 34px; font-size: 9.9pt; }
  .terms h4 { margin: 0 0 5px; font-size: 10pt; font-weight: 700; }
  .terms p { margin: 0; line-height: 13.4pt; }
  .foot {
    margin-top: auto; padding-top: 18px; font-size: 8.2pt; color: #6b7280;
    border-top: 1px solid #e8edf3; display:flex; justify-content: space-between;
  }
</style>
</head>
<body>
  <div class="sheet">
    <header class="hdr">
      <div class="seller">
        <div class="name">Treasure Mountain Jewelshop Limited</div>
        <div class="line">(Jami Ann Hughes)</div>
        <div class="line">906 23 Ave NW</div>
        <div class="line">Calgary, AB T2M 1T4</div>
        <div class="line">Ph: 587-893-5343</div>
        <div class="line">GST#: 79768 5419 RT 0001</div>
      </div>
      <div class="meta">
        <div class="doc-title">${title}</div>
        <div class="meta-rows">
          <div><b>${isPO ? 'PO #:' : 'Invoice #:'}</b> ${esc(docNo)}</div>
          <div><b>${refLabel}</b> ${esc(refValue)}</div>
          <div><b>Date:</b> ${esc(fmtDate(rec.dateISO) || rec.dateLong || '')}</div>
        </div>
      </div>
    </header>
    <hr class="rule">

    <section class="parties">
      <div class="party">
        <h3>Billed To (Customer):</h3>
        <div class="cust-name">Albern Coin &amp; Foreign Exchange Ltd.</div>
        <div class="l">1615 Centre Street NW</div>
        <div class="l">Calgary, AB T2E 2S2</div>
        <div class="l"><b>Customer #:</b> 309290827</div>
      </div>
      <div class="party">
        <h3>Payment &amp; Status Details:</h3>
        <dl class="kv">
          <dt>Payment Type:</dt><dd>${esc(pay.ptype || 'Cheque')}</dd>
          <dt>Reference #:</dt><dd>${esc(pay.ref || '—')}</dd>
          <dt>Currency:</dt><dd>Canadian (CAD)</dd>
          <dt>Amount Paid:</dt><dd>${money(paid)}</dd>
          <dt>Payment Status:</dt><dd>${owing <= 0.005 ? 'Paid in Full' : 'Balance Owing'}</dd>
        </dl>
      </div>
    </section>

    <table class="items">
      <thead>
        <tr>
          <th class="c">Item #</th>
          <th>Description</th>
          <th class="c">Qty</th>
          <th class="r">Unit Price</th>
          <th class="r">Total</th>
        </tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Sub-Total:</span><span class="amt">${money(subtotal)}</span></div>
      <div class="row"><span>GST (5.00%):</span><span class="amt">${money(gst)}</span></div>
      <div class="row total"><span>${isPO ? 'Purchase Total:' : 'Total Due:'}</span><span class="amt">${money(isPO ? total : owing)}</span></div>
    </div>

    <section class="terms">
      <h4>Terms &amp; Conditions:</h4>
      <p>ALL PURCHASES ARE FINAL.</p>
      <p>Items certified clear of all liens and notes.</p>
    </section>

    <footer class="foot">
      <span>Treasure Mountain Jewelshop Limited · GST# 79768 5419 RT 0001</span>
      <span>${esc(isPO ? 'Purchase Order' : 'Invoice')} ${esc(docNo)}</span>
    </footer>
  </div>
</body>
</html>`;
}

module.exports = { renderDocument, invoiceNumber, money, fmtDate, esc };
