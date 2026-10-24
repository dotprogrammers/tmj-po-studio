# TMJ PO Studio v1.0.0

Desktop app for **Windows** and **macOS** that turns Albern Coin purchase orders into
brand-faithful Treasure Mountain documents — automatically.

## Installers

| Platform | File | Notes |
|---|---|---|
| Windows (x64) | `TMJ PO Studio Setup 1.0.0.exe` | NSIS installer, per-user, choose install folder |
| macOS (Apple Silicon) | `TMJ PO Studio-1.0.0-arm64.dmg` | M1/M2/M3/M4 |
| macOS (Intel) | `TMJ PO Studio-1.0.0.dmg` | x64 |

> Unsigned builds — macOS will show "cannot verify developer" on first launch
> (right-click → Open), Windows SmartScreen will warn (More info → Run anyway).

## What it does

1. **Import** — drag & drop a PDF, a ZIP of PDFs (nested ZIPs are flattened),
   or scanned images. Everything is processed locally; nothing is uploaded.
2. **Parse** — a layout-aware pure-JS engine reads the Albern portal PDF and
   extracts PO number, date, line items (description / qty / unit price / total),
   Sub-Total, GST 5%, Purchase Total and the payment row (type, amount, cheque ref).
3. **Validate** — every record is arithmetic-checked:
   qty × price = line total, Σ items = Sub-Total, Sub-Total + GST = Total,
   payments = Total. Anything that doesn't reconcile is flagged for review.
4. **Review** — edit any field, add/remove line items, watch totals recompute,
   and preview the live document (identical to the output PDF).
5. **Generate** — produce the full batch as US-Letter PDFs and drop them in
   Downloads (or any folder you choose).

## Two document types

**Invoice** — matching the delivered batch naming (`TMJ-YYYY-MMDD`):

```
Invoice - TMJ-2024-1003 - PO 134355.pdf
```

**Purchase Order** — carrying your own sequential Treasure Mountain number,
independent of Albern's numbering, with cheque reference, amount and GST:

```
TMJ Purchase Order 000002 - Albern PO 144119.pdf
```

## Design

Brand-faithful to the client's existing format: Treasure Mountain header block,
navy `#1e3a5f` INVOICE / PURCHASE ORDER title, two-panel Billed To + Payment &
Status layout, ruled item table with zebra rows, Sub-Total → GST (5.00%) →
Total Due block, and the standard Terms & Conditions footer.

The app shell uses a premium dark interface — deep navy with a warm gold accent,
Inter/system typography, responsive down to 640px, keyboard shortcuts
(⌘O / Ctrl+O to import, ⌘Enter / Ctrl+Enter to generate).

## Verification

- Parser: 31/31 real Albern POs parsed, **zero differences** against the
  independently validated reference extraction (sub-total, GST, total, item
  totals, cheque refs all match).
- Layout: 62 rendered documents audited — every one single-page, exact
  8.50 × 11.00 in Letter, no clipped content, all required fields present.
- Packaging: `ui/` and `pdfjs-dist` confirmed present in both the macOS and
  Windows asar bundles.

## Build from source

```bash
npm install
npm start          # run locally
npm run dist:mac   # dmg + zip (arm64 + x64)
npm run dist:win   # NSIS installer (x64)
```

## Privacy & security

Fully offline. `contextIsolation` on, `nodeIntegration` off, no remote scripts,
no telemetry. Filesystem access only through explicit user-triggered actions.

MIT licensed.
