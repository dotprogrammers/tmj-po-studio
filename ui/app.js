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
  info: null
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
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 3600);
}
function logLine(level, text) {
  const li = document.createElement('li');
  const map = { ok: 'ok', warn: 'warn', err: 'err', info: '' };
  li.innerHTML = `<span class="lvl ${map[level] || ''}">${level.toUpperCase()}</span><span>${text}</span>`;
  $('#importLog').appendChild(li);
  $('#importLogPanel').hidden = false;
}
function uid() { return Math.random().toString(36).slice(2, 9); }

/* ---------------- view routing ---------------- */
const VIEWS = {
  import: ['Import purchase orders', 'Drop Albern PDFs, a ZIP of PDFs, or images. Everything is parsed on this device.'],
  review: ['Review & correct', 'Verify parsed fields, adjust line items, then preview the exact PDF that will be produced.'],
  documents: ['Output', 'Generate the full batch as Treasure Mountain PDFs and open the folder.'],
  settings: ['Settings', 'Numbering, output location and build information.']
};
function showView(name) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  const [t, s] = VIEWS[name];
  $('#viewTitle').textContent = t;
  $('#viewSub').textContent = s;
}

/* ---------------- records ---------------- */
function normalizeRecord(r) {
  const rec = { ...r };
  rec.id = rec.id || uid();
  rec.items = (rec.items || []).map(i => ({ ...i }));
  rec.payments = rec.payments || [];
  rec.warnings = rec.warnings || [];

  if (rec.dateISO) {
    // ok
  } else if (rec.dateLong) {
    const m = rec.dateLong.match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    if (m) rec.dateISO = `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
  }
  if (rec.subtotal == null) rec.subtotal = rec.items.reduce((a, i) => a + (Number(i.total) || 0), 0);
  if (rec.gst == null) rec.gst = Math.round(rec.subtotal * 0.05 * 100) / 100;
  if (rec.total == null) rec.total = Math.round((rec.subtotal + rec.gst) * 100) / 100;
  if (rec.paidTotal == null) rec.paidTotal = rec.total;
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

function renderList() {
  const ul = $('#recList');
  let list = state.records;
  if (state.filter === 'ok') list = list.filter(isClean);
  if (state.filter === 'review') list = list.filter(r => !isClean(r));

  if (!list.length) {
    ul.innerHTML = `<li class="empty">${state.records.length ? 'No records match this filter.' : 'Import files to see records.'}</li>`;
    return;
  }
  ul.innerHTML = list.map(r => {
    const clean = isClean(r);
    const po = r.po || '—';
    const own = r.ownPo ? `TMJ #${String(r.ownPo).padStart(6, '0')}` : 'TMJ #auto';
    const date = r.dateISO || '';
    const amt = r.total != null ? money(r.total) : '—';
    return `<li class="rec ${r.id === state.activeId ? 'active' : ''}" data-id="${r.id}">
      <div class="rec-top">
        <span class="rec-po">PO ${po}</span>
        <span class="chip ${clean ? 'ok' : 'warn'}">${clean ? 'Clean' : 'Review'}</span>
      </div>
      <div class="rec-meta"><span>${own}</span><span>${date}</span><span>${r.items.length} item${r.items.length === 1 ? '' : 's'}</span></div>
      <div class="rec-amt">${amt}</div>
    </li>`;
  }).join('');

  $$('.rec').forEach(el => el.addEventListener('click', () => {
    state.activeId = el.dataset.id;
    renderList();
    renderEditor();
  }));
}

/* ---------------- editor ---------------- */
function renderEditor() {
  const rec = activeRecord();
  $('#emptyEditor').hidden = !!rec;
  $('#editorBody').hidden = !rec;
  if (!rec) return;

  $('#edTitle').textContent = rec.ownPo ? `TMJ PO ${String(rec.ownPo).padStart(6, '0')}` : 'New record';
  const clean = isClean(rec);
  const badge = $('#edBadge');
  badge.textContent = clean ? 'Clean' : 'Needs review';
  badge.className = 'badge ' + (clean ? 'ok' : 'warn');

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

  renderItemRows(rec);
  refreshPreview();
}

function renderItemRows(rec) {
  const tb = $('#itemRows');
  tb.innerHTML = '';
  rec.items.forEach((it, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-k="description" data-i="${i}" value="${String(it.description || '').replace(/"/g, '&quot;')}"></td>
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
    const f = $('#previewFrame');
    f.srcdoc = html;
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

/* ---------------- import ---------------- */
async function ingest(records, sourceLabel) {
  if (!records || !records.length) { toast('Nothing recognised in that drop.', 'err'); return; }
  let added = 0, bad = 0;
  for (const raw of records) {
    if (raw.error) { bad++; logLine('err', `${raw.name}: ${raw.error}`); continue; }
    if (raw.needsManual) { logLine('warn', `${raw.name}: image needs manual entry`); }
    const rec = normalizeRecord(raw);
    rec.sourceName = raw.name;
    state.records.push(rec);
    if (isClean(rec)) logLine('ok', `${raw.name}: PO ${rec.po} · ${money(rec.total)}`);
    else logLine('warn', `${raw.name}: ${rec.warnings[0] || 'check fields'}`);
    added++;
  }
  // assign own numbers for records lacking one
  let n = Number(state.nextOwnPo) || 1;
  for (const r of state.records) {
    if (!r.ownPo) { r.ownPo = n++; }
    else n = Math.max(n, Number(r.ownPo) + 1);
  }
  state.nextOwnPo = n;

  refreshCounts();
  renderList();
  if (!state.activeId && state.records[0]) { state.activeId = state.records[0].id; renderList(); renderEditor(); }
  showView('review');
  toast(`${added} file${added === 1 ? '' : 's'} parsed${bad ? `, ${bad} failed` : ''}.`, bad ? 'err' : 'ok');
}

async function pickFiles() {
  const res = await window.api.pickFiles();
  if (res.canceled) return;
  await ingest(res.records, 'dialog');
}

/* ---------------- generation ---------------- */
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
    renderDocs(res.written);
    refreshCounts();
    toast(`${res.written.length} PDF${res.written.length === 1 ? '' : 's'} written to ${res.dir}`, 'ok');
    showView('documents');
  } catch (e) {
    toast('Generation failed: ' + (e.message || e), 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Generate all →';
  }
}

function renderDocs(list) {
  const ul = $('#docList');
  if (!list || !list.length) { ul.innerHTML = '<li class="empty">No documents generated yet.</li>'; return; }
  ul.innerHTML = list.map(d => `
    <li class="doc">
      <span class="doc-ico">PDF</span>
      <div class="doc-main">
        <div class="doc-name">${d.file}</div>
        <div class="doc-path">${d.path}</div>
      </div>
      <div class="doc-actions">
        <button class="btn tiny ghost" data-open="${encodeURIComponent(d.path)}">Open</button>
        <button class="btn tiny ghost" data-reveal="${encodeURIComponent(d.path)}">Reveal</button>
      </div>
    </li>`).join('');
  ul.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => window.api.openPath(decodeURIComponent(b.dataset.open))));
  ul.querySelectorAll('[data-reveal]').forEach(b => b.addEventListener('click', () => window.api.reveal(decodeURIComponent(b.dataset.reveal))));
}

/* ---------------- wiring ---------------- */
function bind() {
  $$('.nav-item').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v === 'review') { renderList(); }
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
    const paths = files.map(f => window.api.pathForFile(f)).filter(Boolean);
    if (paths.length) {
      const res = await window.api.importPaths(paths);
      await ingest(res.records, 'drop');
    } else {
      toast('Could not read dropped items — use “Choose files”.', 'err');
    }
  });

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFiles(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); generateAll(); }
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
    rec.items.push({ description: 'Lot of jewellery. See attached.', qty: 1, unit_price: 0, total: 0 });
    renderItemRows(rec); recalcTotals(rec); renderList(); schedulePreview();
  });

  $('#btnRefreshPreview').addEventListener('click', refreshPreview);
  $('#btnSaveRec').addEventListener('click', () => {
    const rec = activeRecord(); if (!rec) return;
    Object.assign(rec, syncRecord(rec));
    rec.ok = rec.items.length > 0 && rec.total != null;
    rec.warnings = [];
    // recompute validation display
    renderList(); renderEditor(); refreshCounts();
    toast('Record saved.', 'ok');
  });
  $('#btnReset').addEventListener('click', () => { renderEditor(); toast('Editor reloaded from stored values.'); });

  $('#btnPickDir').addEventListener('click', async () => {
    const dir = await window.api.pickFolder();
    if (dir) { state.outDir = dir; $('#outDir').value = dir; $('#setOutDir').value = dir; await window.api.setSettings({ outputDir: dir }); }
  });
  $('#btnOpenDir').addEventListener('click', () => window.api.openPath(state.outDir));
  $('#btnGenerateAll').addEventListener('click', generateAll);
  $('#btnSettings').addEventListener('click', () => showView('settings'));

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
}

document.addEventListener('DOMContentLoaded', boot);
