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
    /* Match the client's reference PDF exactly: Helvetica, 10pt body. */
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10pt;
    color: #222;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet {
    width: 8.5in; min-height: 11in;
    /* Reference margins: 72pt left (1.0in), content starts at 72pt. */
    padding: 0.385in 1.0in 0.55in 1.0in;
    display: flex; flex-direction: column;
  }
  /* ---------- header ---------- */
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .seller .name { font-size: 12.5pt; font-weight: 700; color: #1a1a2e; }
  .seller .line  { font-size: 10pt; line-height: 14pt; color: #222; }
  .meta { text-align: right; }
  .meta .doc-title {
    font-size: 21pt; font-weight: 700; color: #1e3a5f; line-height: 1;
  }
  .meta .meta-rows { margin-top: 7px; font-size: 10pt; line-height: 14pt; }
  .meta .meta-rows b { font-weight: 700; }
  .rule { border: 0; border-top: 2px solid #1e3a5f; margin: 13px 0 0; }

  /* ---------- parties ---------- */
  .parties { display: flex; margin-top: 20px; gap: 26px; }
  .party { flex: 1 1 50%; }
  .party h3 {
    font-size: 10pt; margin: 0 0 8px; color: #111; font-weight: 700;
  }
  .party .cust-name { font-weight: 700; font-size: 10pt; }
  .party .l { font-size: 10pt; line-height: 14pt; }
  .kv { display: grid; grid-template-columns: max-content 1fr; column-gap: 8px; font-size: 10pt; line-height: 14pt; }
  /* Reference renders labels in regular weight, values in bold. */
  .kv dt { font-weight: 400; margin: 0; white-space: nowrap; }
  .kv dd { font-weight: 700; }
  .kv dd { margin: 0; white-space: nowrap; }

  /* ---------- table ---------- */
  table.items { border-collapse: collapse; margin-top: 6px; }
  table.items thead th {
    background: #1e3a5f; color: #fff; font-size: 9.5pt; font-weight: 700;
    padding: 8px 6px; text-align: left;
  }
  table.items thead th.c { text-align: center; }
  table.items thead th.r { text-align: right; }
  table.items td {
    font-size: 10pt; padding: 9px 6px; border-bottom: 1px solid #e3e8ee; vertical-align: top;
  }
  table.items tbody tr:nth-child(even) { background: #f6f9fc; }
  table.items td.c { text-align: center; }
  table.items td.r { text-align: right; white-space: nowrap; }

  /* ---------- totals ---------- */
  /* Reference: totals table is 45% wide, right-aligned (label at x=278). */
  .totals { margin-left: auto; width: 45%; margin-top: 22px; }
  .totals .row { display: flex; justify-content: space-between; font-size: 10pt; padding: 3px 0; }
  .totals .row.total {
    margin-top: 7px; padding-top: 8px; border-top: 2px solid #1e3a5f;
    border-bottom: 1px solid #1e3a5f; font-weight: 700; font-size: 10.5pt;
  }
  .totals .row .amt { font-variant-numeric: tabular-nums; }

  /* ---------- terms ---------- */
  .terms { margin-top: 12px; font-size: 10pt; }
  .terms ul { margin: 5px 0 0; padding-left: 18px; }
  .terms li { margin: 0; line-height: 14pt; }
  .terms h4 { margin: 0 0 5px; font-size: 10pt; font-weight: 700; }
  .terms p { margin: 0; line-height: 14pt; }

  /* ---------- client-matched table layout ---------- */
  .header-table { width: 100%; margin-bottom: 25px; border-collapse: collapse; }
  .header-table td { vertical-align: top; }
  .company-name { font-size: 12.5pt; font-weight: 700; color: #1a1a2e; margin: 8.5pt 0 5px; }
  .company-info { font-size: 10pt; line-height: 14pt; color: #222; }
  .header-table td.title { text-align: right; }
  .doc-title { font-size: 21pt; font-weight: 700; color: #1e3a5f; margin: 0; text-align: right; line-height: 1; }
  .header-table .meta-rows { font-size: 10pt; line-height: 14pt; color: #222; margin-top: 11.8pt; }
  .header-table .meta-rows strong { font-weight: 700; }

  .party-info { width: 100%; margin-bottom: 25px; border-collapse: collapse; }
  .party-info td {
    width: 50%; vertical-align: top;
    font-size: 10pt; line-height: 14pt; color: #222;
  }
  .party-header {
    font-weight: 700; font-size: 10.5pt; color: #2d3748; margin-bottom: 5px;
    border-bottom: 1px solid #cbd5e0; padding-bottom: 3px;
  }
  /* Reference: labels bold, values regular weight. */
  .party-info td strong { font-weight: 700; }
  .party-info td span { font-weight: 400; }
  /* Reference right column: labels at x=306, values right-aligned to x=540. */
  .party-info td:last-child span { display: inline-block; min-width: 134pt; text-align: right; }

  /* Reference header block: title row baseline y=31.5, right block is a
     right-aligned list whose label+value share one line. */
  .header-table td.title { width: 50%; }
  .header-table .meta-rows div { text-align: right; }
  .header-table .meta-rows strong { font-weight: 400; }

  /* Client template: totals-table width 45%, margin-left auto. */
  .totals-table { width: 58.1%; margin-left: 41.9%; border-collapse: collapse; margin-bottom: 18px; margin-top: 21.5px; }
  .totals-table td { padding: 4.5px 0; text-align: right; font-size: 10pt; }
  .totals-table td:first-child { padding-left: 12.4px; }
  .totals-table td:first-child { text-align: left; }
  .totals-table td:last-child { text-align: right; }
  .totals-table .grand-total {
    font-weight: 700; font-size: 10pt; border-top: 2px solid #1a365d; background-color: #f7fafc;
  }
  .totals-table .grand-total td { font-weight: 700; font-size: 10pt; }

  /* Reference item-table geometry, solved from the client's own PDF
     (content band x=72..540 = 468pt, cell padding 6pt):
       col 1  Item #       54.0pt   header centred, data centred
       col 2  Description 242.3pt   header centred, data left
       col 3  Qty         64.4pt   header centred, data centred
       col 4  Unit Price  44.3pt   header right,  data right
       col 5  Total       63.0pt   header right,  data right
     The last column's text ends at x=534 (540 - 6pt padding). */
  table.items { table-layout: fixed; width: 468pt; }
  table.items col.c-item { width: 54pt; }
  table.items col.c-desc { width: 254.3pt; }
  table.items col.c-qty  { width: 40.4pt; }
  table.items col.c-unit { width: 56.3pt; }
  table.items col.c-total{ width: 63pt; }
  table.items thead th { padding: 6px; text-align: center; white-space: nowrap; }
  table.items thead th.r { text-align: right; }
  table.items tbody td { padding: 6px; }
  table.items tbody td.c { text-align: center; }
  table.items tbody td.r { text-align: right; }
  table.items tbody td.desc { text-align: left; }

  /* Reference totals labels are regular weight; only Total Due is bold. */
  .totals-table td strong { font-weight: 400; }
  .totals-table .grand-total td strong { font-weight: 700; }
  .foot {
    margin-top: auto; padding-top: 18px; font-size: 8.2pt; color: #6b7280;
    border-top: 1px solid #e8edf3; display:flex; justify-content: space-between;
  }
</style>
</head>
<body>
  <div class="sheet">
    <table class="header-table">
      <tr>
        <td>
          <h2 class="company-name">Treasure Mountain Jewelshop Limited</h2>
          <div class="company-info">(Jami Ann Hughes)<br>906 23 Ave NW<br>Calgary, AB T2M 1T4<br>Ph: 587-893-5343<br>GST#: 79768 5419 RT 0001</div>
        </td>
        <td class="title">
          <h2 class="doc-title">${title}</h2>
          <div class="meta-rows">
            <strong>${isPO ? 'PO #:' : 'Invoice #:'}</strong> ${esc(docNo)}<br>
            <strong>Date:</strong> ${esc(fmtDate(rec.dateISO) || rec.dateLong || '')}<br>
            <strong>${refLabel}</strong> ${esc(refValue)}
          </div>
        </td>
      </tr>
    </table>

    <table class="party-info">
      <tr>
        <td>
          <div class="party-header">Billed To (Customer):</div>
          <strong>Albern Coin &amp; Foreign Exchange Ltd.</strong><br>
          <span>1615 Centre Street NW</span><br>
          <span>Calgary, AB T2E 2S2</span><br>
          <strong>Customer #:</strong>309290827
        </td>
        <td>
          <div class="party-header">Payment &amp; Status Details:</div>
          <strong>Payment Type:</strong> <span>${esc(pay.ptype || 'Cheque')}</span><br>
          <strong>Reference #:</strong> <span>${esc(pay.ref || '—')}</span><br>
          <strong>Currency:</strong> <span>Canadian (CAD)</span><br>
          <strong>Amount Paid:</strong> <span>${money(paid)}</span><br>
          <strong>Payment Status:</strong> <span>${owing <= 0.005 ? 'Paid in Full' : 'Balance Owing'}</span>
        </td>
      </tr>
    </table>

    <table class="items">
      <colgroup>
        <col class="c-item"><col class="c-desc"><col class="c-qty"><col class="c-unit"><col class="c-total">
      </colgroup>
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

    <table class="totals-table">
      <tr><td><strong>Sub-Total:</strong></td><td>${money(subtotal)}</td></tr>
      <tr><td><strong>GST (5.00%):</strong></td><td>${money(gst)}</td></tr>
      <tr class="grand-total"><td><strong>${isPO ? 'Purchase Total:' : 'Total Due:'}</strong></td><td>${money(total)}</td></tr>
    </table>

    <section class="terms">
      <h4>Terms &amp; Conditions:</h4>
      <p>ALL PURCHASES ARE FINAL.</p>
      <p>Items certified clear of all liens and notes.</p>
    </section>

  </div>
</body>
</html>`;
}

module.exports = { renderDocument, invoiceNumber, money, fmtDate, esc };
