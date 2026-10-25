'use strict';
/**
 * Design conformance test.
 *
 * Renders the app's documents for a sample of real Albern POs, then compares
 * every field against the DESIGN REFERENCE (the invoices we previously
 * delivered to the client, in ../tmj_2024_pdf_invoices/) and the SOURCE PO
 * (the Albern PDF itself).
 *
 *   node tools/design-conformance.js <pdf-dir> <reference-dir> <out-dir>
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { extractPdfText } = require('../parser/extractPdf');
const { parsePO } = require('../parser/parsePO');
const { renderDocument, invoiceNumber } = require('../renderer/template');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function chromePdf(html, outPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmj-conf-'));
  const htmlPath = path.join(tmp, 'doc.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=4000',
    `--print-to-pdf=${outPath}`, 'file://' + htmlPath
  ], { stdio: 'ignore', timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Pull text out of a rendered PDF using the same pdf.js engine the app uses.
async function pdfText(p) {
  const { text } = await extractPdfText(fs.readFileSync(p), path.basename(p));
  return text;
}

async function main() {
  const [srcDir, refDir, outDir] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
  const report = { checked: 0, pass: 0, fail: 0, issues: [], samples: [] };

  for (const f of files) {
    const buf = fs.readFileSync(path.join(srcDir, f));
    const { text: srcText } = await extractPdfText(buf, f);
    const rec = parsePO(srcText, f);

    // ---- the SOURCE PO must contain these facts ----
    const srcChecks = [
      ['po number', rec.po, srcText.includes(rec.po)],
      ['cheque ref', rec.payments[0] && rec.payments[0].ref,
        srcText.includes(String((rec.payments[0] || {}).ref || ''))],
      ['sub-total', rec.subtotal, hasAmount(srcText, rec.subtotal)],
      ['total', rec.total, hasAmount(srcText, rec.total)]
    ];

    // ---- render both document kinds ----
    const docs = {};
    for (const kind of ['invoice', 'po']) {
      const out = path.join(outDir, `${kind}-${rec.po}.pdf`);
      chromePdf(renderDocument(rec, kind), out);
      docs[kind] = { path: out, text: await pdfText(out) };
    }

    // ---- field conformance on the INVOICE ----
    const inv = docs.invoice.text;
    const invChecks = [
      ['company name', 'Treasure Mountain Jewelshop', inv.includes('Treasure Mountain Jewelshop')],
      ['owner', 'Jami Ann Hughes', inv.includes('Jami Ann Hughes')],
      ['address', '906 23 Ave NW', inv.includes('906 23 Ave NW')],
      ['city', 'Calgary, AB T2M 1T4', inv.includes('Calgary, AB T2M 1T4')],
      ['phone', '587-893-5343', inv.includes('587-893-5343')],
      ['gst no', '79768 5419 RT 0001', inv.includes('79768 5419 RT 0001')],
      ['title INVOICE', 'INVOICE', inv.includes('INVOICE')],
      ['invoice # label', 'Invoice #:', inv.includes('Invoice #:')],
      ['invoice # value', invoiceNumber(rec), inv.includes(invoiceNumber(rec))],
      ['PO ref label', 'PO Ref #:', inv.includes('PO Ref #:')],
      ['PO ref value', rec.po, inv.includes(rec.po)],
      ['date label', 'Date:', inv.includes('Date:')],
      ['date value', rec.dateLong, inv.includes(rec.dateLong)],
      ['billed to', 'Billed To (Customer):', inv.includes('Billed To (Customer):')],
      ['customer', 'Albern Coin & Foreign Exchange Ltd.', inv.includes('Albern Coin')],
      ['customer street', '1615 Centre Street NW', inv.includes('1615 Centre Street NW')],
      ['customer city', 'Calgary, AB T2E 2S2', inv.includes('Calgary, AB T2E 2S2')],
      ['customer #', '309290827', inv.includes('309290827')],
      ['payment block', 'Payment & Status Details:', inv.includes('Payment & Status Details:')],
      ['payment type', 'Payment Type:', inv.includes('Payment Type:')],
      ['payment type value', 'Cheque', inv.includes('Cheque')],
      ['reference #', 'Reference #:', inv.includes('Reference #:')],
      ['reference value', String((rec.payments[0] || {}).ref || ''), inv.includes(String((rec.payments[0] || {}).ref || ''))],
      ['currency', 'Canadian (CAD)', inv.includes('Canadian (CAD)')],
      ['amount paid', 'Amount Paid:', inv.includes('Amount Paid:')],
      ['payment status', 'Paid in Full', inv.includes('Paid in Full')],
      ['item # col', 'Item #', inv.includes('Item #')],
      ['description col', 'Description', inv.includes('Description')],
      ['qty col', 'Qty', inv.includes('Qty')],
      ['unit price col', 'Unit Price', inv.includes('Unit Price')],
      ['total col', 'Total', inv.includes('Total')],
      ['sub-total label', 'Sub-Total:', inv.includes('Sub-Total:')],
      ['sub-total value', money(rec.subtotal), hasAmount(inv, rec.subtotal)],
      ['gst label', 'GST (5.00%):', inv.includes('GST (5.00%):')],
      ['gst value', money(rec.gst), inv.includes(money(rec.gst))],
      ['total due label', 'Total Due:', inv.includes('Total Due:')],
      ['total due value', money(rec.total), hasAmount(inv, rec.total)],
      ['terms header', 'Terms & Conditions:', inv.includes('Terms & Conditions:')],
      ['terms 1', 'ALL PURCHASES ARE FINAL.', inv.includes('ALL PURCHASES ARE FINAL.')],
      ['terms 2', 'Items certified clear of all liens and notes.', inv.includes('Items certified clear of all liens and notes.')],
      ['footer line', 'Treasure Mountain Jewelshop Limited', inv.includes('Treasure Mountain Jewelshop Limited')]
    ];

    // item descriptions must survive
    for (const it of rec.items) {
      const head = String(it.description || '').slice(0, 24);
      if (head) invChecks.push([`item "${head.slice(0, 18)}…"`, head, inv.includes(head.replace(/\s+/g, ' '))]);
    }

    // ---- the PURCHASE ORDER doc ----
    const po = docs.po.text;
    const poChecks = [
      ['title PURCHASE ORDER', 'PURCHASE ORDER', po.includes('PURCHASE ORDER')],
      ['own PO number', 'PO #:', po.includes('PO #:')],
      ['albern ref', 'Albern PO Ref #:', po.includes('Albern PO Ref #:')],
      ['purchase total label', 'Purchase Total:', po.includes('Purchase Total:')],
      ['company', 'Treasure Mountain Jewelshop', po.includes('Treasure Mountain Jewelshop')],
      ['gst', '79768 5419 RT 0001', po.includes('79768 5419 RT 0001')]
    ];

    const all = [
      ...srcChecks.map(c => ({ group: 'source', po: rec.po, label: c[0], ok: !!c[2] })),
      ...invChecks.map(c => ({ group: 'invoice', po: rec.po, label: c[0], ok: !!c[2] })),
      ...poChecks.map(c => ({ group: 'purchase-order', po: rec.po, label: c[0], ok: !!c[2] }))
    ];
    const bad = all.filter(x => !x.ok);
    report.checked += all.length;
    report.pass += all.length - bad.length;
    report.fail += bad.length;
    for (const b of bad) report.issues.push(b);

    report.samples.push({
      po: rec.po,
      date: rec.dateLong,
      invoice: path.basename(docs.invoice.path),
      purchaseOrder: path.basename(docs.po.path),
      invoiceNumber: invoiceNumber(rec),
      subtotal: rec.subtotal, gst: rec.gst, total: rec.total,
      cheque: (rec.payments[0] || {}).ref,
      checks: all.length,
      failed: bad.length
    });
  }

  fs.writeFileSync(path.join(outDir, 'conformance.json'), JSON.stringify(report, null, 2));
  console.log(`\nconformance: ${report.pass}/${report.checked} checks passed`);
  if (report.issues.length) {
    console.log('\nfailures:');
    for (const i of report.issues.slice(0, 30)) console.log(`  [${i.group}] PO ${i.po}: ${i.label}`);
  }
  console.log(`\nrendered ${report.samples.length * 2} documents into ${outDir}`);
  process.exitCode = report.fail ? 1 : 0;
}

function money(n) {
  return '$' + Number(n || 0).toFixed(2);
}

// A document may render an amount as "1213.69" or "1,213.69" (thousands
// separator). Compare numerically so both forms are accepted.
function hasAmount(text, n) {
  const want = Number(n || 0).toFixed(2);
  const re = new RegExp('\\$?' + want.replace(/\./g, '\\.') + '|\\$?' +
    Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .replace(/\./g, '\\.'));
  return re.test(text);
}

main().catch(e => { console.error(e); process.exit(1); });
