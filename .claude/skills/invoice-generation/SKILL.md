---
name: invoice-generation
description: Print-optimized branded invoice rendering for Qadri Mobile Communication sales, plus the Download and Share (WhatsApp deep link) buttons. Read before writing invoice view/print/share code.
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
- **Share** — opens an inline panel asking which WhatsApp number to send to (prefilled from the customer's saved phone if present, but always editable, since the admin may send it to a different number — e.g. a relative picking up the phone). On confirm it opens `https://wa.me/<number>?text=<message>` directly in that number's chat with the full message prefilled: a thank-you line, every purchased line item, the total, and a payment-method breakdown (cash / bank transfer / JazzCash / EasyPaisa / remaining credit — only the methods actually used are shown). The admin only has to press Send inside WhatsApp.
  This is deliberately text-only (`wa.me` deep link), not a PDF attachment: true file-attach share (`navigator.canShare({ files: [pdfFile] })`) needs an actual `File`/`Blob`, which requires a canvas/PDF-rendering library — and this skill explicitly rules that out (see the note above on why: text-shaping correctness if Urdu/complex scripts are ever added, and avoiding an extra dependency now). If a future phase decides one-tap PDF+WhatsApp attach is worth it, that decision must revisit the "no PDF library" rule first — don't silently add one just to satisfy this button.
  The payment breakdown is reconstructed at read time, not stored on `Sale`: the upfront cash/bank split comes from the `CashLedgerEntry`/`BankLedgerEntry` rows `createSale` wrote (`sourceType: "SALE"`, `sourceId: sale.id`), plus any later top-up `Payment` rows (which carry `method` directly) — summed together so the message reflects everything collected so far, not just the initial payment.

See [[purchase-sale-flow]] for where `Sale`/`SaleItem` data comes from.
