---
name: invoice-generation
description: Print-optimized branded invoice rendering for Qadri Mobile Communication sales, plus the Download and Share (Web Share API) buttons. Read before writing invoice view/print/share code.
---

# Invoice generation

One invoice per `Sale` (multi-line — lists every phone and accessory line on that sale). Rendered as a print-optimized HTML page (`@media print` CSS, browser print-to-PDF) — **not** a canvas/vector PDF library (`@react-pdf/renderer`, `pdf-lib`, etc.). Browser-native printing keeps text shaping correct if Urdu or any complex script is ever added later, and needs no extra dependency now.

## Invoice contents

- Logo: full lockup `public/QMC logo 2.0.png` at the top.
- `Sale.invoiceNumber`, `createdAt` (date).
- Customer name/phone if present, else "Walk-in".
- Line items: phone lines show brand/model/storage/color/IMEI; accessory lines show name/brand/variant/quantity. Each line: rate, line total.
- Subtotal, total.
- Payment type, `paidAmount`, amount due (`totalAmount - paidAmount`), `status`.

## Actions

Two buttons on the invoice view, both client-side, no server round-trip beyond the initial page render:

- **Download** — triggers the browser print dialog (`window.print()`), which the user saves as PDF.
- **Share** — Web Share API **Level 1** (`navigator.share({ title, text, url })`), not Level 2 file-attach. This is a deliberate trade-off, not an oversight: true file-attach share (`navigator.canShare({ files: [pdfFile] })`) needs an actual `File`/`Blob` to hand over, which requires a canvas/PDF-rendering library — and this skill explicitly rules that out (see the note above on why: text-shaping correctness if Urdu/complex scripts are ever added, and avoiding an extra dependency now). So there is no PDF `File` object to attach. If a future phase decides one-tap PDF+WhatsApp attach is worth it, that decision must revisit the "no PDF library" rule first — don't silently add one just to satisfy this button.
  Feature-detect `navigator.share` support; if unsupported (or on desktop where the share sheet can't attach a file anyway), fall back to: trigger `window.print()` AND open `https://wa.me/<customerPhone>` in a new tab with a short prefilled text noting the invoice needs to be attached manually after printing/saving as PDF.
- If there's no customer phone number on the sale (walk-in with no phone captured), disable/hide the Share button rather than showing a broken wa.me link.

See [[purchase-sale-flow]] for where `Sale`/`SaleItem` data comes from.
