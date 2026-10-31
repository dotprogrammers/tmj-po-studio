'use strict';
/* TMJ PO Studio — renderer logic */

const state = {
  records: [],
  activeId: null,
  filter: 'all',
  kind: 'invoice',
  genKind: 'invoice',
  outDir: '',
  nextOwnPo: 1,
  info: null,
  docs: []
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ---------------- utilities ---------------- */
function money(v) {
  return '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span class="t-dot"></span><span>${msg}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 4200);
}
function logLine(level, text) {
  const li = document.createElement('li');
  const map = { ok: 'ok', warn: 'warn', err: 'err', info: '' };
  li.innerHTML = `<span class="lvl ${map[level] || ''}">${level.toUpperCase()}</span><span>${text}</span>`;
  $('#importLog').appendChild(li);
  $('#importLogPanel').hidden = false;
}
function uid() { return Math.random().toString(36).slice(2, 9); }
async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* ---------------- view routing ---------------- */
const VIEWS = {
  import: ['Import purchase orders', 'Drop Albern PDFs, a ZIP of PDFs, or images. Everything is parsed on this device.'],
  review: ['Review & correct', 'Verify parsed fields, adjust line items, approve, then preview the exact PDF that will be produced.'],
  documents: ['Output', 'Generate the batch as Treasure Mountain PDFs and manage the files.'],
  gallery: ['Gallery', 'Every generated document, with thumbnails. Preview, approve, open or delete.'],
  settings: ['Settings', 'Numbering, output location and build information.']
};
function showView(name) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  const [t, s] = VIEWS[name];
  $('#viewTitle').textContent = t;
  $('#viewSub').textContent = s;
  if (name === 'gallery' || name === 'documents') refreshDocs();
}

/* ---------------- records ---------------- */
function normalizeRecord(r) {
  const rec = { ...r };
  rec.id = rec.id || uid();
  rec.items = (rec.items || []).map(i => ({ ...i }));
  rec.payments = rec.payments || [];
  rec.warnings = rec.warnings || [];
  rec.approved = rec.approved === true;

  if (!rec.dateISO && rec.dateLong) {
    const m = rec.dateLong.match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    if (m) rec.dateISO = `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
  }
  if (rec.subtotal == null) rec.subtotal = rec.items.reduce((a, i) => a + (Number(i.total) || 0), 0);
  if (rec.gst == null) rec.gst = Math.round(rec.subtotal * 0.05 * 100) / 100;
  if (rec.total == null) rec.total = Math.round((rec.subtotal + rec.gst) * 100) / 100;
  if (rec.paidTotal == null) rec.paidTotal = rec.total;

  // Harden: if the parser produced totals but no line items, synthesize one
  // so the invoice is never emitted with an empty item table.
  if (!rec.items.length && (Number(rec.total) > 0 || Number(rec.subtotal) > 0)) {
    const base = Number(rec.subtotal) > 0
      ? Number(rec.subtotal)
      : Math.round((Number(rec.total) / 1.05) * 100) / 100;
    rec.items = [{ description: 'Lot of jewellery. See attached.', qty: 1, unit_price: base, total: base }];
    rec.warnings.push('Line items could not be read from this file — a single line was created from the totals. Please verify or edit it.');
  }
  return rec;
}

function activeRecord() { return state.records.find(r => r.id === state.activeId) || null; }

function isClean(rec) {
  return rec.ok !== false && rec.warnings.length === 0 && rec.items.length > 0 && rec.total != null;
}

function refreshCounts() {
  $('#countPill').textContent = state.records.length;
  $('#recCount').textContent = `(${state.records.length})`;
  const clean = state.records.filter(isClean).length;
  $('#kpiFiles').textContent = state.records.length;
  $('#kpiOk').textContent = clean;
  $('#kpiReview').textContent = state.records.length - clean;
  const val = state.records.reduce((a, r) => a + (Number(r.total) || 0), 0);
  $('#kpiValue').textContent = money(val);
}

function statusChip(r) {
  if (r.approved) return '<span class="chip approved">Approved</span>';
  return isClean(r) ? '<span class="chip ok">Clean</span>' : '<span class="chip warn">Review</span>';
}

function renderList() {
  const ul = $('#recList');
  let list = state.records;
  if (state.filter === 'ok') list = list.filter(r => isClean(r) || r.approved);
  if (state.filter === 'review') list = list.filter(r => !isClean(r) && !r.approved);

  if (!list.length) {
    ul.innerHTML = `<li class="empty">${state.records.length ? 'No records match this filter.' : 'Import files to see records.'}</li>`;
    return;
  }
  ul.innerHTML = list.map(r => {
    const po = r.po || '—';
    const own = r.ownPo ? `TMJ #${String(r.ownPo).padStart(6, '0')}` : 'TMJ #auto';
    const date = r.dateISO || '';
    const amt = r.total != null ? money(r.total) : '—';
    return `<li class="rec ${r.id === state.activeId ? 'active' : ''}" data-id="${r.id}">
      <div class="rec-top">
        <span class="rec-po">PO ${po}</span>
        <span class="rec-actions">
          ${statusChip(r)}
          <button class="icon-btn del" data-delrec="${r.id}" title="Delete this record">×</button>
        </span>
      </div>
      <div class="rec-meta"><span>${own}</span><span>${date}</span><span>${r.items.length} item${r.items.length === 1 ? '' : 's'}</span></div>
      <div class="rec-amt">${amt}</div>
    </li>`;
  }).join('');

  $$('.rec').forEach(el => el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-delrec]')) return;
    state.activeId = el.dataset.id;
    renderList();
    renderEditor();
  }));
  $$('[data-delrec]').forEach(b => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    deleteRecord(b.dataset.delrec);
  }));
}

function deleteRecord(id) {
  const i = state.records.findIndex(r => r.id === id);
  if (i < 0) return;
  const r = state.records[i];
  if (!confirm(`Delete the record for PO ${r.po || '(no PO)'}?\n\nThis only removes it from the current batch — your files are untouched.`)) return;
  state.records.splice(i, 1);
  if (state.activeId === id) {
    state.activeId = state.records.length ? state.records[0].id : null;
    renderEditor();
  }
  renderList();
  refreshCounts();
  toast('Record deleted.', 'ok');
}

/* ---------------- editor ---------------- */
function renderEditor() {
  const rec = activeRecord();
  $('#emptyEditor').hidden = !!rec;
  $('#editorBody').hidden = !rec;
  if (!rec) return;

  $('#edTitle').textContent = rec.ownPo ? `TMJ PO ${String(rec.ownPo).padStart(6, '0')}` : 'New record';
  const badge = $('#edBadge');
  badge.textContent = rec.approved ? 'Approved' : (isClean(rec) ? 'Clean' : 'Needs review');
  badge.className = 'badge ' + (rec.approved ? 'approved' : (isClean(rec) ? 'ok' : 'warn'));

  $('#fOwnPo').value = rec.ownPo || '';
  $('#fPo').value = rec.po || '';
  $('#fDate').value = rec.dateISO || '';
  $('#fPayType').value = (rec.payments[0] && rec.payments[0].ptype) || 'Cheque';
  $('#fPayRef').value = (rec.payments[0] && rec.payments[0].ref) || '';
  $('#fPaid').value = rec.paidTotal != null ? rec.paidTotal : '';
  $('#fSubtotal').value = rec.subtotal != null ? rec.subtotal : '';
  $('#fGst').value = rec.gst != null ? rec.gst : '';
  $('#fTotal').value = rec.total != null ? rec.total : '';

  if (rec.warnings.length) {
    $('#edWarnings').hidden = false;
    $('#edWarnList').innerHTML = rec.warnings.map(w => `<li>${w}</li>`).join('');
  } else {
    $('#edWarnings').hidden = true;
  }

  // Never render an empty item table — always offer at least one row.
  if (!rec.items.length) rec.items.push({ description: '', qty: 1, unit_price: 0, total: 0 });
  renderItemRows(rec);
  setLocked(rec.approved);
  refreshPreview();
}

function setLocked(locked) {
  const rec = activeRecord();
  $('#editorBody').classList.toggle('locked', !!locked);
  $$('#editorBody input').forEach(i => { i.disabled = !!locked; });
  $$('#editorBody .icon-btn').forEach(b => { b.disabled = !!locked; });
  $('#btnAddItem').disabled = !!locked;
  $('#btnSaveRec').disabled = !!locked;
  $('#btnApprove').textContent = locked ? 'Revoke approval' : 'Approve invoice';
  $('#btnApprove').classList.toggle('approved-btn', !!locked);
  if (rec) rec.approved = !!locked;
}

function renderItemRows(rec) {
  const tb = $('#itemRows');
  tb.innerHTML = '';
  rec.items.forEach((it, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-k="description" data-i="${i}" placeholder="Item description" value="${String(it.description || '').replace(/"/g, '&quot;')}"></td>
      <td><input data-k="qty" data-i="${i}" type="number" step="1" value="${it.qty ?? 1}"></td>
      <td><input data-k="unit_price" data-i="${i}" type="number" step="0.01" value="${it.unit_price ?? 0}"></td>
      <td><input data-k="total" data-i="${i}" type="number" step="0.01" value="${it.total ?? 0}"></td>
      <td><button class="icon-btn" data-del="${i}" title="Remove line">×</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.i; const k = inp.dataset.k;
      const v = (k === 'description') ? inp.value : parseFloat(inp.value || '0');
      rec.items[i][k] = v;
      if (k === 'qty' || k === 'unit_price') {
        rec.items[i].total = Math.round((Number(rec.items[i].qty) || 0) * (Number(rec.items[i].unit_price) || 0) * 100) / 100;
        const tEl = tb.querySelector(`input[data-i="${i}"][data-k="total"]`);
        if (tEl) tEl.value = rec.items[i].total;
        recalcTotals(rec);
      }
      if (k === 'total') recalcTotals(rec);
      schedulePreview();
    });
  });
  tb.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    rec.items.splice(+b.dataset.del, 1);
    if (!rec.items.length) rec.items.push({ description: '', qty: 1, unit_price: 0, total: 0 });
    renderItemRows(rec); recalcTotals(rec); renderList(); schedulePreview();
  }));
}

function recalcTotals(rec) {
  rec.subtotal = Math.round(rec.items.reduce((a, i) => a + (Number(i.total) || 0), 0) * 100) / 100;
  rec.gst = Math.round(rec.subtotal * 0.05 * 100) / 100;
  rec.total = Math.round((rec.subtotal + rec.gst) * 100) / 100;
  $('#fSubtotal').value = rec.subtotal;
  $('#fGst').value = rec.gst;
  $('#fTotal').value = rec.total;
}

let previewTimer = null;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 220);
}
async function refreshPreview() {
  const rec = activeRecord();
  if (!rec) return;
  try {
    const html = await window.api.preview(syncRecord(rec), state.kind);
    $('#previewFrame').srcdoc = html;
  } catch (e) { console.warn('preview failed', e); }
}

function syncRecord(rec) {
  const pay = rec.payments[0] || {};
  return {
    ...rec,
    ownPo: $('#fOwnPo').value ? Number($('#fOwnPo').value) : rec.ownPo,
    po: $('#fPo').value.trim(),
    dateISO: $('#fDate').value,
    subtotal: parseFloat($('#fSubtotal').value || '0'),
    gst: parseFloat($('#fGst').value || '0'),
    total: parseFloat($('#fTotal').value || '0'),
    paidTotal: parseFloat($('#fPaid').value || '0'),
    payments: [{
      ...pay,
      ptype: $('#fPayType').value || 'Cheque',
      ref: $('#fPayRef').value.trim(),
      amount: parseFloat($('#fPaid').value || '0'),
      currency: pay.currency || 'Canadian'
    }]
  };
}

/* ---------------- preview modal ---------------- */
let modalPdf = null; // { path } when previewing a generated PDF file
function openPreviewHtml(html, title) {
  modalPdf = null;
  $('#pmTitle').textContent = title || 'Preview';
  $('#pmPrint').hidden = false;
  const body = $('#pmBody');
  body.innerHTML = '<iframe id="pmFrame" title="Document preview"></iframe>';
  $('#pmFrame').srcdoc = html;
  $('#previewModal').hidden = false;
}
async function openPreviewPdf(p, title) {
  modalPdf = { path: p };
  $('#pmTitle').textContent = title || p.split('/').pop();
  $('#pmPrint').hidden = false;
  const body = $('#pmBody');
  body.innerHTML = '<div class="pm-loading">Rendering…</div>';
  $('#previewModal').hidden = false;
  try {
    const res = await window.api.docRead(p);
    const bytes = Uint8Array.from(atob(res.base64), ch => ch.charCodeAt(0));
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(1);
    const scale = Math.min(1.6, ($('#pmBody').clientWidth - 48) / 612);
    const vp = page.getViewport({ scale: Math.max(0.9, scale) });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.className = 'pm-canvas';
    body.innerHTML = ''; body.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    await doc.destroy();
  } catch (e) {
    body.innerHTML = `<div class="pm-loading">Could not render this PDF (${String(e && e.message || e)}).<br>Use “Open” to view it in your PDF viewer.</div>`;
  }
}
function closePreview() {
  $('#previewModal').hidden = true;
  $('#pmBody').innerHTML = '';
  modalPdf = null;
}

/* ---------------- import ---------------- */
async function ingest(records) {
  if (!records || !records.length) { toast('Nothing recognised in that drop.', 'err'); return; }
  let added = 0, bad = 0;
  for (const raw of records) {
    if (raw.error) { bad++; logLine('err', `${raw.name}: ${raw.error}`); continue; }
    if (raw.needsManual) logLine('warn', `${raw.name}: image needs manual entry`);
    const rec = normalizeRecord(raw);
    rec.sourceName = raw.name;
    state.records.push(rec);
    if (isClean(rec)) logLine('ok', `${raw.name}: PO ${rec.po} · ${money(rec.total)}`);
    else logLine('warn', `${raw.name}: ${rec.warnings[0] || 'check fields'}`);
    added++;
  }
  let n = Number(state.nextOwnPo) || 1;
  for (const r of state.records) {
    if (!r.ownPo) { r.ownPo = n++; }
    else n = Math.max(n, Number(r.ownPo) + 1);
  }
  state.nextOwnPo = n;
  window.api.setSettings({ nextOwnPo: n }).catch(() => {});

  refreshCounts();
  renderList();
  if (state.records[0]) {
    state.activeId = state.records[state.records.length - 1].id;
    renderList();
    renderEditor();
    showView('review');
  }
  toast(`${added} file${added === 1 ? '' : 's'} parsed${bad ? `, ${bad} failed` : ''}.`, bad ? 'err' : 'ok');
}

async function pickFiles() {
  const res = await window.api.pickFiles();
  if (res.canceled) return;
  await ingest(res.records);
}

async function handleFiles(files) {
  if (!files || !files.length) return;
  const payload = [];
  for (const f of files) {
    try { payload.push({ name: f.name || 'upload.pdf', base64: await fileToBase64(f) }); }
    catch (e) { logLine('err', `${f.name}: could not read (${e.message})`); }
  }
  if (!payload.length) return;
  const res = await window.api.importBuffers(payload);
  await ingest(res.records);
}

/* ---------------- documents & gallery ---------------- */
async function refreshDocs() {
  state.docs = await window.api.docsList();
  const pill = $('#galPill');
  if (pill) pill.textContent = state.docs.length;
  const gc = $('#galCount');
  if (gc) gc.textContent = `(${state.docs.length})`;
  if ($('#viewTitle').textContent === VIEWS.gallery[0]) renderGallery();
  renderDocList();
}

function renderDocList() {
  const ul = $('#docList');
  if (!state.docs.length) { ul.innerHTML = '<li class="empty">No documents generated yet.</li>'; return; }
  ul.innerHTML = state.docs.map(d => `
    <li class="doc">
      <span class="doc-ico">PDF</span>
      <div class="doc-main">
        <div class="doc-name">${d.file} ${d.approved ? '<span class="chip approved">Approved</span>' : ''}</div>
        <div class="doc-path">${d.path}</div>
      </div>
      <div class="doc-actions">
        ${d.exists ? `<button class="btn tiny ghost" data-prev="${encodeURIComponent(d.path)}" data-name="${encodeURIComponent(d.file)}">Preview</button>` : ''}
        <button class="btn tiny ghost" data-appr="${encodeURIComponent(d.path)}">${d.approved ? 'Unapprove' : 'Approve'}</button>
        ${d.exists ? `<button class="btn tiny ghost" data-open="${encodeURIComponent(d.path)}">Open</button>` : ''}
        <button class="btn tiny ghost" data-reveal="${encodeURIComponent(d.path)}">Reveal</button>
        <button class="btn tiny danger" data-deldoc="${encodeURIComponent(d.path)}">Delete</button>
      </div>
    </li>`).join('');
  wireDocActions(ul);
}

function renderGallery() {
  const grid = $('#galGrid');
  if (!state.docs.length) {
    grid.innerHTML = '<div class="empty gal-empty">No documents yet. Import purchase orders and press Generate.</div>';
    return;
  }
  grid.innerHTML = state.docs.map((d, i) => `
    <div class="gal-card" data-i="${i}">
      <div class="gal-thumb" id="galthumb-${i}">${d.exists ? '' : '<div class="gal-missing">File moved</div>'}</div>
      <div class="gal-name" title="${d.file}">${d.file}</div>
      <div class="gal-meta">${d.approved ? '<span class="chip approved">Approved</span>' : '<span class="chip warn">Not approved</span>'} · ${d.po ? 'PO ' + d.po : ''}</div>
      <div class="gal-actions">
        ${d.exists ? `<button class="btn tiny" data-prev="${encodeURIComponent(d.path)}" data-name="${encodeURIComponent(d.file)}">Preview</button>` : ''}
        <button class="btn tiny ghost" data-appr="${encodeURIComponent(d.path)}">${d.approved ? 'Unapprove' : 'Approve'}</button>
        ${d.exists ? `<button class="btn tiny ghost" data-open="${encodeURIComponent(d.path)}">Open</button>` : ''}
        <button class="btn tiny danger" data-deldoc="${encodeURIComponent(d.path)}">Delete</button>
      </div>
    </div>`).join('');
  wireDocActions(grid);
  // render thumbnails
  state.docs.forEach((d, i) => {
    if (!d.exists) return;
    renderThumb(d.path, `galthumb-${i}`);
  });
}

async function renderThumb(p, elId) {
  const host = document.getElementById(elId);
  if (!host) return;
  try {
    const res = await window.api.docRead(p);
    const bytes = Uint8Array.from(atob(res.base64), ch => ch.charCodeAt(0));
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(1);
    const targetW = host.clientWidth || 260;
    const vp0 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: targetW / vp0.width });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    host.innerHTML = ''; host.appendChild(canvas);
    await doc.destroy();
  } catch (e) {
    host.innerHTML = '<div class="gal-missing">No preview</div>';
  }
}

function wireDocActions(root) {
  root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => window.api.openPath(decodeURIComponent(b.dataset.open))));
  root.querySelectorAll('[data-reveal]').forEach(b => b.addEventListener('click', () => window.api.reveal(decodeURIComponent(b.dataset.reveal))));
  root.querySelectorAll('[data-prev]').forEach(b => b.addEventListener('click', () => openPreviewPdf(decodeURIComponent(b.dataset.prev), decodeURIComponent(b.dataset.name || 'Preview'))));
  root.querySelectorAll('[data-appr]').forEach(b => b.addEventListener('click', async () => {
    const p = decodeURIComponent(b.dataset.appr);
    const d = state.docs.find(x => x.path === p);
    const approved = !(d && d.approved);
    await window.api.docApprove({ path: p, approved });
    await refreshDocs();
    toast(approved ? 'Document approved.' : 'Approval revoked.', 'ok');
  }));
  root.querySelectorAll('[data-deldoc]').forEach(b => b.addEventListener('click', async () => {
    const p = decodeURIComponent(b.dataset.deldoc);
    if (!confirm('Move this PDF to the Trash?')) return;
    await window.api.docDelete(p);
    await refreshDocs();
    toast('Document moved to Trash.', 'ok');
  }));
}

function syncAllFromEditor() {
  const rec = activeRecord();
  if (rec) Object.assign(rec, syncRecord(rec));
}

async function generateAll() {
  syncAllFromEditor();
  const usable = state.records.filter(r => r.items.length && r.total != null);
  if (!usable.length) { toast('No complete records to generate.', 'err'); return; }
  const btn = $('#btnGenerateAll');
  btn.disabled = true; btn.textContent = 'Generating…';
  try {
    const res = await window.api.generate({
      records: usable,
      kind: state.genKind,
      outDir: state.outDir || undefined,
      startNumber: state.nextOwnPo
    });
    state.outDir = res.dir;
    $('#outDir').value = res.dir;
    await refreshDocs();
    renderDocList();
    toast(`${res.written.length} PDF${res.written.length === 1 ? '' : 's'} written to ${res.dir}`, 'ok');
    showView('documents');
  } catch (e) {
    toast('Generation failed: ' + (e.message || e), 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Generate all →';
  }
}

/* ---------------- wiring ---------------- */
function bind() {
  $$('.nav-item').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v === 'review') renderList();
    showView(v);
  }));

  $('#btnBrowse').addEventListener('click', (e) => { e.stopPropagation(); pickFiles(); });
  const dz = $('#dropzone');
  dz.addEventListener('click', pickFiles);
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFiles(); } });

  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', async (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    await handleFiles(files);
  });

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFiles(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); generateAll(); }
    if (e.key === 'Escape' && !$('#previewModal').hidden) closePreview();
  });

  $('#clearLog').addEventListener('click', () => { $('#importLog').innerHTML = ''; $('#importLogPanel').hidden = true; });

  $$('.seg-btn[data-filter]').forEach(b => b.addEventListener('click', () => {
    $$('.seg-btn[data-filter]').forEach(x => x.classList.toggle('active', x === b));
    state.filter = b.dataset.filter;
    renderList();
  }));

  $$('#kindSeg .seg-btn').forEach(b => b.addEventListener('click', () => {
    $$('#kindSeg .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    state.kind = b.dataset.kind;
    refreshPreview();
  }));

  $$('#genKind .seg-btn').forEach(b => b.addEventListener('click', () => {
    $$('#genKind .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    state.genKind = b.dataset.kind;
  }));

  ['#fOwnPo', '#fPo', '#fDate', '#fPayType', '#fPayRef', '#fPaid'].forEach(sel => {
    $(sel).addEventListener('input', () => {
      const rec = activeRecord(); if (!rec) return;
      Object.assign(rec, syncRecord(rec));
      renderList(); schedulePreview();
    });
  });

  $('#fSubtotal').addEventListener('input', () => {
    const rec = activeRecord(); if (!rec) return;
    rec.subtotal = parseFloat($('#fSubtotal').value || '0');
    rec.gst = Math.round(rec.subtotal * 0.05 * 100) / 100;
    rec.total = Math.round((rec.subtotal + rec.gst) * 100) / 100;
    $('#fGst').value = rec.gst; $('#fTotal').value = rec.total;
    schedulePreview();
  });

  $('#btnAddItem').addEventListener('click', () => {
    const rec = activeRecord(); if (!rec) return;
    rec.items.push({ description: '', qty: 1, unit_price: 0, total: 0 });
    renderItemRows(rec); recalcTotals(rec); renderList(); schedulePreview();
  });

  $('#btnRefreshPreview').addEventListener('click', refreshPreview);
  $('#btnSaveRec').addEventListener('click', () => {
    const rec = activeRecord(); if (!rec) return;
    Object.assign(rec, syncRecord(rec));
    rec.ok = rec.items.length > 0 && rec.total != null;
    rec.warnings = rec.warnings.filter(w => w.startsWith('Line items could not be read'));
    renderList(); renderEditor(); refreshCounts();
    toast('Record saved.', 'ok');
  });
  $('#btnReset').addEventListener('click', () => { renderEditor(); toast('Editor reloaded from stored values.'); });
  $('#btnDeleteRec').addEventListener('click', () => {
    const rec = activeRecord(); if (rec) deleteRecord(rec.id);
  });
  $('#btnApprove').addEventListener('click', () => {
    const rec = activeRecord(); if (!rec) return;
    if (!rec.approved) Object.assign(rec, syncRecord(rec));
    setLocked(!rec.approved);
    renderList(); refreshCounts();
    toast(rec.approved ? 'Invoice approved — fields locked.' : 'Approval revoked — fields editable again.', 'ok');
  });
  $('#btnPreviewRec').addEventListener('click', async () => {
    const rec = activeRecord(); if (!rec) return;
    Object.assign(rec, syncRecord(rec));
    const html = await window.api.preview(rec, state.kind);
    openPreviewHtml(html, `${state.kind === 'po' ? 'Purchase order' : 'Invoice'} preview — ${rec.po || ''}`);
  });

  $('#pmClose').addEventListener('click', closePreview);
  $('#previewModal').addEventListener('click', (e) => { if (e.target === $('#previewModal')) closePreview(); });
  $('#pmPrint').addEventListener('click', async () => {
    const btn = $('#pmPrint');
    try {
      btn.disabled = true; btn.textContent = 'Preparing PDF…';
      if (modalPdf && modalPdf.path) {
        // Previewing an existing generated file — just reveal it
        await window.api.openPath(modalPdf.path);
        return;
      }
      const f = $('#pmFrame');
      const html = f && f.srcdoc ? f.srcdoc : null;
      if (!html) { toast('Nothing to print — open a preview first.', 'err'); return; }
      const rec = activeRecord();
      const name = rec
        ? `${state.kind === 'po' ? 'TMJ Purchase Order' : 'Invoice'} - ${(state.kind === 'po' ? String(rec.ownPo || '').padStart(6, '0') : '')}${state.kind === 'po' ? ' - Albern PO ' + (rec.po || '') : ''}`
        : 'Document';
      const res = await window.api.printDoc({ html, filename: name });
      if (res.ok) toast('PDF saved to Downloads: ' + res.path.split('/').pop(), 'ok');
      else toast('Print failed: ' + res.error, 'err');
    } catch (e) {
      toast('Print failed: ' + (e.message || e), 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'Print / Save PDF';
    }
  });

  const pickOutputDir = async () => {
    const dir = await window.api.pickFolder();
    if (!dir) return;
    state.outDir = dir;
    $('#outDir').value = dir;
    $('#setOutDir').value = dir;
    await window.api.setSettings({ outputDir: dir });
    toast('Output folder set to ' + dir, 'ok');
  };
  $('#btnPickDir').addEventListener('click', pickOutputDir);
  $('#btnSetOutDir').addEventListener('click', pickOutputDir);

  $('#btnOpenDir').addEventListener('click', () => window.api.openPath(state.outDir));
  $('#btnGenerateAll').addEventListener('click', generateAll);
  $('#btnSettings').addEventListener('click', () => showView('settings'));
  $('#btnGalleryRefresh').addEventListener('click', refreshDocs);

  $('#setNextPo').addEventListener('change', async () => {
    state.nextOwnPo = Number($('#setNextPo').value) || 1;
    await window.api.setSettings({ nextOwnPo: state.nextOwnPo });
    toast('Next PO number updated.', 'ok');
  });
}

async function boot() {
  bind();
  const info = await window.api.info();
  state.info = info;
  const st = info.settings || {};
  state.outDir = st.outputDir || info.downloads;
  state.nextOwnPo = st.nextOwnPo || 1;
  $('#outDir').value = state.outDir;
  $('#setOutDir').value = state.outDir;
  $('#setNextPo').value = state.nextOwnPo;
  $('#aboutList').innerHTML = `
    <dt>Platform</dt><dd>${info.platform}</dd>
    <dt>Electron</dt><dd>${info.versions.electron}</dd>
    <dt>Chromium</dt><dd>${info.versions.chrome}</dd>
    <dt>Node</dt><dd>${info.versions.node}</dd>`;
  $('#engineDot').style.background = 'var(--ok)';
  $('#engineLabel').textContent = 'Engine ready';
  renderList();
  refreshCounts();
  refreshDocs();
}

document.addEventListener('DOMContentLoaded', boot);
