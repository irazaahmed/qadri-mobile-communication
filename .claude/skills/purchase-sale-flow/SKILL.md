---
name: purchase-sale-flow
description: The multi-line purchase and sale transaction pattern for Qadri Mobile Communication — mixed phone/accessory line items, stock mutation, invoice numbering, and the single ledger write per header. Read before writing Purchase or Sale entry code or UI.
---

# Purchase & Sale flow (multi-line, mixed phone + accessory)

One `Purchase` or `Sale` is a header row with N `PurchaseItem`/`SaleItem` lines, each line independently typed `PHONE` or `ACCESSORY` via `itemType`. A single invoice can mix both (e.g. one phone + a case + a charger sold together).

## Purchase

Form: optionally pick a `Supplier` (search-existing UX like the customer picker), add lines. A PHONE line captures the full per-unit form (IMEI, brand, model, storage, color, condition, warrantyMonths, cost) — this line CREATES the `Phone` row. An ACCESSORY line picks/creates an accessory and enters quantity + rate.

Supplier is optional overall, same shape as `Sale.customerId`: a CASH purchase may have no supplier record (e.g. a one-off street purchase); a CREDIT purchase always requires one, since a payable balance must be tracked against somebody. Validate this server-side, not just in the UI.

In one `prisma.$transaction`:
1. For each PHONE line: create the `Phone` row (`status: IN_STOCK`, `supplierId` from the header, may be null), then the `PurchaseItem` referencing it via `phoneId` (`quantity` stays null on phone lines — always exactly 1 unit).
2. For each ACCESSORY line: upsert per [[accessory-inventory]], increment `quantity`, create the `PurchaseItem` with `accessoryId` + `quantity`.
3. Sum all `lineTotal`s into `Purchase.totalAmount`.
4. `paymentType = CREDIT`: `dueDate = createdAt + creditDays`, `SupplierLedgerEntry(type: "PURCHASE", +totalAmount)`, update running payable.
5. `paymentType = CASH` with a supplier picked: still log the `SupplierLedgerEntry` for history (net payable effect zero — log a matching payment entry at the same timestamp so the ledger reads clean). `CASH` with no supplier: skip both `SupplierLedgerEntry` writes and the `Payment` row (nothing to track them against). Either way, `CashLedgerEntry(-totalAmount, sourceType: "PURCHASE")` always fires.

Invoice number: `PUR-0001`, sequential, generated server-side inside the same transaction (never client-supplied, never reused if the transaction rolls back).

## Sale

Form: search/pick phones (only `status: IN_STOCK` selectable) and/or accessories (search + quantity), optional customer (search by phone or inline-add — upsert by phone number, see [[credit-and-ledger]]).

In one `prisma.$transaction`:
1. **Hard guard**: re-check inside the transaction that every accessory line's quantity subtraction keeps `Accessory.quantity >= 0`, and every phone line's `Phone.status` is still `IN_STOCK` at write time. Abort the whole sale if either check fails — never partially commit a multi-line sale.
2. For each PHONE line: `status: SOLD`, `soldAt: now()`, `warrantyStartDate: now()`. Snapshot `SaleItem.costAtSale = phone.costPrice`.
3. For each ACCESSORY line: decrement `Accessory.quantity` by the sold amount. Snapshot `SaleItem.costAtSale = accessory.costPrice`.
4. Sum into `Sale.totalAmount`.
5. `CASH`: `paidAmount = totalAmount`, `status = PAID`, `CashLedgerEntry(+totalAmount, sourceType: "SALE")`.
6. `CREDIT`: admin enters `paidAmount` (may be 0, must be `<= totalAmount`), `dueDate = createdAt + creditDays`, `status` = `PARTIAL`/`UNPAID`, `CustomerLedgerEntry(type: "SALE", +amountDue)`, `CashLedgerEntry(+paidAmount, sourceType: "SALE")` for whatever was collected upfront (the unpaid portion is NOT cash yet).

Invoice number: `INV-0001`, same sequential/server-side/transactional rule as purchases.

## Notes

- `itemType` on `PurchaseItem`/`SaleItem` is the branch point for every list/detail view — never assume all lines on an invoice are the same type.
- See [[cash-ledger-and-profit]] for the ledger entry rules and [[credit-and-ledger]] for payment settlement against these headers.
