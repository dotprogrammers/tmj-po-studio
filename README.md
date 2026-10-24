# TMJ PO Studio

**Treasure Mountain Jewelshop — Purchase Order & Invoice Studio** (Windows + macOS)

Import Albern Coin purchase orders (single PDFs, whole ZIP batches, or scanned images),
auto-extract every field, review/correct in a premium dark workspace, and generate
brand-faithful Treasure Mountain **Invoices** or **Purchase Orders** as print-perfect
US-Letter PDFs — with your own sequential TMJ PO numbering independent of Albern's.

---

## Why

Jami needed to turn Albern PO PDFs into matching Treasure Mountain documents at batch
scale. The Albern "upload tool" can only overwrite existing POs — it cannot mint new
Treasure Mountain-numbered documents. This app does exactly that, offline, on both
Windows and macOS.

## Features

- **Import anything**: drag & drop PDFs, ZIP archives (nested OK), or images
  - ZIP entries are flattened automatically; macOS `._*` / `.DS_Store` junk skipped
  - Images land as "manual entry" cards with thumbnail context
- **Layout-aware parsing engine** (pure JS, zero native dependencies)
  - pdf.js text items are clustered into visual lines with x-gap spacing — the same
    approach as the battle-tested `pdftotext -layout` parser used for the delivered batches
  - Extracts: Albern PO #, date, line items (description/qty/unit/total), Sub-Total,
    GST 5%, Purchase Total, payment rows (type/amount/currency/cheque ref)
  - **Arithmetic cross-validation**: items × price, Σ items = Sub-Total,
    Sub-Total + GST = Total, payments = Total — anything off is flagged for review
- **Review workspace**: edit every field, add/remove lines, totals auto-recompute,
  live document preview that is pixel-identical to the output PDF
- **Two document kinds**
  - *Invoice* — `Invoice - TMJ-YYYY-MMDD - PO NNNNNN.pdf` (matches delivered batches)
  - *Purchase Order* — `TMJ Purchase Order NNNNNN - Albern PO NNNNNN.pdf` with Jami's
    own sequential numbering (`000002`, `000003`, …), cheque ref, amount + GST + total
- **Batch generation** → US-Letter PDFs via Chromium print engine (exact brand layout,
  navy `#1e3a5f`, Arial/Helvetica, zebra table, ruled totals) written to Downloads
  (or any folder you pick), with collision-safe filenames
- **Premium responsive UI**: deep-navy + gold jewellery-house palette, Inter/system
  fonts, keyboard shortcuts (⌘O / Ctrl+O import, ⌘Enter / Ctrl+Enter generate),
  toasts, segmented filters, fully usable at 1000px and 640px breakpoints

## Run from source

```bash
cd tmj-po-studio
npm install
npm start
```

Requires Node 18+. First run downloads Electron (~100 MB).

## Build installers

```bash
npm run dist:mac    # dmg + zip (arm64 + x64)  -> dist/
npm run dist:win    # NSIS installer (x64)      -> dist/
npm run dist:all    # both
```

> Cross-compiling the Windows installer from macOS works out of the box with
> electron-builder (NSIS). Code-signing is optional; unsigned builds show the
> usual OS warning on first launch.

## Output layout

Documents are written to the configured output folder (default: your Downloads):

```
Invoice - TMJ-2024-1003 - PO 134355.pdf
TMJ Purchase Order 000002 - Albern PO 144119.pdf
```

## Document fields (Purchase Order mode)

| Field | Source |
|---|---|
| PO # | Your sequential TMJ number (`000002`, …) — auto-assigned, editable |
| Albern PO Ref # | Parsed from the source PDF |
| Item lines | Parsed from the source PDF (editable) |
| Cheque / Reference # | Parsed payment row |
| Amount Paid / GST / Purchase Total | Parsed + auto-validated |

## Architecture

```
tmj-po-studio/
├─ main.js               Electron main: import pipeline, PDF print engine, IPC
├─ preload.js            contextBridge API surface (no nodeIntegration in UI)
├─ parser/
│  ├─ extractPdf.js      pdf.js (legacy build) text extraction
│  ├─ layoutText.js      text items → layout-aware lines (x-gap clustering)
│  └─ parsePO.js         field extraction + arithmetic validation
├─ renderer/
│  └─ template.js        brand-faithful HTML/CSS document (Letter, print CSS)
└─ ui/                   premium dark workspace (HTML/CSS/JS, no frameworks)
```

Security: `contextIsolation: on`, `nodeIntegration: off`, sandboxed renderer,
filesystem access only via explicit IPC handlers. Nothing leaves the machine.

## License

MIT
