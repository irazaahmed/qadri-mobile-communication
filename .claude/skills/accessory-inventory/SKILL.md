---
name: accessory-inventory
description: Aggregate quantity stock for accessories (chargers, cases, cables) for Qadri Mobile Communication — the upsert match on name+brand+variant, and when to increment quantity vs only edit price/specs. Read before writing Accessory add/update code or UI.
---

# Accessory inventory (aggregate stock)

Accessories are matched by the composite unique key **`@@unique([name, brand, variant])`**. `variant` is nullable; treat empty string as `null` so "no variant" collapses to a single row.

## On purchase (restock)

Look up an existing accessory by `(name, brand, variant)`:
- **Found** → increment `quantity` by the purchased amount (`prisma.accessory.upsert(...)` keyed on the composite unique, `update: { quantity: { increment: qty } }`), and update `costPrice` to the latest purchase rate (cost basis should always reflect the most recent buy).
- **Not found** → create a new accessory row with the given quantity and rate as `costPrice`.

Money fields are `Decimal`, never `Float`.

## Update action (separate from purchase)

Editing an existing accessory changes price/specs (`salePrice`, `category`, `lowStockThreshold`, etc.) and must **not** touch `quantity` unless the admin explicitly edits the quantity field directly (a manual stock correction, not a purchase).

## Notes

- Adding stock is NOT a cash event by itself — cash moves at the `Purchase` header level. See [[purchase-sale-flow]].
- Selling decrements `quantity` and is guarded against going negative — see [[purchase-sale-flow]].
- `lowStockThreshold` (nullable) drives the dashboard's low-stock flag — computed at query time (`quantity <= lowStockThreshold`), never a stored boolean.
- Never share fields or write paths with `Phone` — accessories are fungible aggregate stock, phones are individually serialized units. See [[phone-inventory]].
