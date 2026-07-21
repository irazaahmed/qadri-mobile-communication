---
name: phone-inventory
description: Per-unit IMEI-tracked phone stock for Qadri Mobile Communication — purchase creates a row, sale marks it sold, warranty is computed at read time, and status transitions during claims. Read before writing any Phone add/sell/claim code or UI.
---

# Phone inventory (IMEI-tracked units)

Each physical phone is its own `Phone` row — never aggregated, never a "quantity" field. `imei` is the unique key.

## Fields captured at purchase

`brand`, `model`, `storage`, `color`, `condition` (`NEW`/`USED`), `warrantyMonths`, `costPrice`, `supplierId`. `status` starts `IN_STOCK`. `salePrice` stays null until sold (it's the actual price it sold for, not a listed price — use a separate quote/listing field on the UI if needed, don't conflate with this column).

## Status machine

`IN_STOCK → SOLD → CLAIMED → WITH_SUPPLIER → RETURNED_TO_STOCK` (back to sellable) or terminal at any claim stage via `REFUNDED`/`REJECTED` (see [[claims-lifecycle]]). Only two places may change `Phone.status`:
- The sale action (`IN_STOCK → SOLD`). See [[purchase-sale-flow]].
- Claim actions (everything from `CLAIMED` onward). Never let a purchase or sale action touch `CLAIMED`/`WITH_SUPPLIER`/`RETURNED_TO_STOCK`.

A phone can only be selected in a new sale if `status = IN_STOCK`. A phone can only be claimed if `status = SOLD`.

## Warranty — never stored as a stale status

`warrantyStartDate` is set to `soldAt` (sale time), not purchase time — the warranty clock starts when the customer buys it, not when the shop bought it. `warrantyMonths` is entered at purchase (typically 12 for NEW, null/0 for USED).

Warranty status (`IN_WARRANTY` / `EXPIRED` / `N/A`) is **computed at query/render time** from `warrantyStartDate + warrantyMonths` vs `now()` — never store it as a column, never refresh it via a cron job. If `warrantyStartDate` is null (still in stock), warranty status is `N/A`.

## Notes

- Adding a phone to stock is NOT a cash event by itself — the cash effect happens at the `Purchase` header level (see [[purchase-sale-flow]]), not per-phone-row.
- IMEI must be unique across the whole table — enforce at the database level (`@unique`) and surface a clear "IMEI already exists" error rather than a raw constraint violation.
- Never share fields or write paths with `Accessory` — see [[accessory-inventory]].
