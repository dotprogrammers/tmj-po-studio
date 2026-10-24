'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const AdmZip = require('adm-zip');

const { extractPdfText } = require('./parser/extractPdf');
const { parsePO } = require('./parser/parsePO');
const { renderDocument, invoiceNumber } = require('./renderer/template');

let mainWindow = null;
let printWindow = null;

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')); }
  catch { return { nextOwnPo: 1, outputDir: app.getPath('downloads'), lastDocs: [] }; }
}
function writeSettings(s) {
  try { fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true }); fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(s, null, 2)); }
  catch (e) { console.error('settings write failed', e); }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1040, minHeight: 700,
    backgroundColor: '#0b1220',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  });
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function ensurePrintWindow() {
  if (printWindow && !printWindow.isDestroyed()) return printWindow;
  printWindow = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: true, contextIsolation: true, nodeIntegration: false }
  });
  return printWindow;
}

/** Extract text + parse one PDF buffer. */
async function handlePdfBuffer(buf, name) {
  const { text, pages } = await extractPdfText(buf, name);
  const rec = parsePO(text, name);
  rec.pages = pages;
  rec.rawText = text;
  rec.kind = 'pdf';
  return rec;
}

/** Expand a zip into a flat list of {name, buffer} entries (nested zips supported one level). */
async function expandZip(buffer, zipName, out = []) {
  let zip;
  try { zip = new AdmZip(buffer); } catch (e) {
    out.push({ name: zipName, error: `Unreadable zip: ${e.message}` });
    return out;
  }
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const base = path.basename(entry.entryName);
    if (!base || base.startsWith('._') || base === '.DS_Store') continue;
    const lower = base.toLowerCase();
    const data = entry.getData();
    if (lower.endsWith('.zip')) {
      await expandZip(data, base, out);
    } else if (lower.endsWith('.pdf')) {
      out.push({ name: base, buffer: data });
    } else if (/\.(png|jpe?g|webp|tif?f)$/i.test(lower)) {
      out.push({ name: base, buffer: data, image: true });
    }
  }
  return out;
}

async function importPaths(paths) {
  const results = [];
  for (const p of paths) {
    let stat;
    try { stat = await fsp.stat(p); } catch { continue; }
    if (stat.isDirectory()) {
      const entries = await fsp.readdir(p);
      const nested = await importPaths(entries.map(e => path.join(p, e)));
      results.push(...nested);
      continue;
    }
    const name = path.basename(p);
    const lower = name.toLowerCase();
    const buf = await fsp.readFile(p);
    if (lower.endsWith('.pdf')) {
      try { results.push(await handlePdfBuffer(buf, name)); }
      catch (e) { results.push({ name, ok: false, error: `PDF read failed: ${e.message}`, warnings: [] }); }
    } else if (lower.endsWith('.zip')) {
      const entries = await expandZip(buf, name);
      for (const en of entries) {
        if (en.error) { results.push({ name: en.name, ok: false, error: en.error, warnings: [] }); continue; }
        if (en.image) { results.push({ name: en.name, ok: false, kind: 'image', needsManual: true, warnings: ['Image needs manual entry'], items: [], payments: [] }); continue; }
        try { results.push(await handlePdfBuffer(en.buffer, en.name)); }
        catch (e) { results.push({ name: en.name, ok: false, error: `PDF read failed: ${e.message}`, warnings: [] }); }
      }
    } else if (/\.(png|jpe?g|webp|tif?f)$/i.test(lower)) {
      results.push({
        name, ok: false, kind: 'image', needsManual: true,
        warnings: ['Image imported — fill in the fields manually'],
        items: [], payments: [], dataUrl: `data:image/${lower.endsWith('.png') ? 'png' : 'jpeg'};base64,${buf.toString('base64')}`
      });
    } else {
      results.push({ name, ok: false, error: 'Unsupported file type (PDF, ZIP or image expected)', warnings: [] });
    }
  }
  return results;
}

/** Assign sequential Treasure Mountain PO numbers to records that lack one. */
function assignOwnNumbers(records, startAt) {
  let n = Number(startAt) || 1;
  for (const r of records) {
    if (!r.ownPo) { r.ownPo = n; n += 1; }
    else n = Math.max(n, Number(r.ownPo) + 1);
  }
  return n;
}

async function renderPdf(rec, kind, outPath) {
  const html = renderDocument(rec, kind);
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tmj-'));
  const htmlPath = path.join(tmpDir, 'doc.html');
  await fsp.writeFile(htmlPath, html, 'utf8');

  const win = ensurePrintWindow();
  await win.loadFile(htmlPath);
  // give fonts/layout one frame to settle
  await new Promise(r => setTimeout(r, 180));

  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'Letter',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    preferCSSPageSize: true
  });
  await fsp.writeFile(outPath, pdf);
  await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  return outPath;
}

function safeName(s) {
  return String(s || '').replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function fileNameFor(rec, kind) {
  if (kind === 'po') {
    const own = String(rec.ownPo || '').padStart(6, '0');
    return safeName(`TMJ Purchase Order ${own} - Albern PO ${rec.po || ''}.pdf`);
  }
  return safeName(`Invoice - ${invoiceNumber(rec)} - PO ${rec.po || ''}.pdf`);
}

ipcMain.handle('app:info', () => ({
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  downloads: app.getPath('downloads'),
  settings: readSettings()
}));

ipcMain.handle('dialog:pickFiles', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import purchase orders',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Purchase orders', extensions: ['pdf', 'zip', 'png', 'jpg', 'jpeg'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (res.canceled) return { canceled: true, records: [] };
  const records = await importPaths(res.filePaths);
  return { canceled: false, records, paths: res.filePaths };
});

ipcMain.handle('import:paths', async (_e, paths) => {
  const records = await importPaths(paths);
  return { records };
});

ipcMain.handle('dialog:pickFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('render:preview', async (_e, rec, kind) => renderDocument(rec, kind));

ipcMain.handle('pdf:generate', async (_e, payload) => {
  const { records = [], kind = 'invoice', outDir, startNumber } = payload || {};
  const dir = outDir || app.getPath('downloads');
  await fsp.mkdir(dir, { recursive: true });

  if (kind === 'po') assignOwnNumbers(records, startNumber);

  const written = [];
  for (const rec of records) {
    const target = path.join(dir, fileNameFor(rec, kind));
    let finalPath = target;
    let i = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(target);
      finalPath = target.slice(0, -ext.length) + ` (${i})` + ext;
      i += 1;
    }
    await renderPdf(rec, kind, finalPath);
    written.push({ path: finalPath, po: rec.po, ownPo: rec.ownPo, file: path.basename(finalPath) });
  }

  const st = readSettings();
  st.lastDocs = written.slice(0, 60);
  if (kind === 'po') st.nextOwnPo = assignOwnNumbers(records, startNumber ?? st.nextOwnPo ?? 1);
  writeSettings(st);
  return { dir, written };
});

ipcMain.handle('pdf:single', async (_e, rec, kind) => {
  const dir = app.getPath('downloads');
  const target = path.join(dir, fileNameFor(rec, kind));
  await renderPdf(rec, kind, target);
  return target;
});

ipcMain.handle('shell:open', async (_e, target) => { await shell.openPath(target); return true; });
ipcMain.handle('shell:reveal', async (_e, target) => { shell.showItemInFolder(target); return true; });

ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_e, patch) => {
  const st = { ...readSettings(), ...(patch || {}) };
  writeSettings(st);
  return st;
});

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (printWindow && !printWindow.isDestroyed()) printWindow.destroy(); });
