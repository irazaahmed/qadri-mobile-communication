---
name: claims-lifecycle
description: The full customer return/warranty claim lifecycle for Qadri Mobile Communication — four-stage tracking from customer through supplier and back, status transitions, and the refund/reject terminal states. Read before writing any Claim code or UI.
---

# Claims / Returns — full lifecycle tracking

A `Claim` tracks a returned/warranty-complaint item (a sold `Phone` or a quantity of an `Accessory`) through its entire round trip: customer → shop → supplier → shop → customer.

## Stages (in order)

1. **`RECEIVED_FROM_CUSTOMER`** (default on create) — admin logs the claim: `customerId`, `itemType`, the specific `phoneId` (must be a `Phone` with `status: SOLD`) or `accessoryId` + `quantity`, `reason`. `receivedFromCustomerAt` defaults to now. If `itemType = PHONE`: set `Phone.status = CLAIMED`.
2. **`SENT_TO_SUPPLIER`** — admin records `supplierId` (which supplier/company it was forwarded to) and `sentToSupplierAt`. If `itemType = PHONE`: set `Phone.status = WITH_SUPPLIER`.
3. **`RECEIVED_FROM_SUPPLIER`** — supplier returns a replacement or repaired unit; `receivedFromSupplierAt` recorded. If `itemType = PHONE`: set `Phone.status = RETURNED_TO_STOCK` (it becomes sellable again) — unless the resolution is "redeliver this exact unit to the original customer," in which case leave it `CLAIMED` until stage 4. This is a judgment call surfaced in the UI, not automatic.
4. **`DELIVERED_TO_CUSTOMER`** — resolved item handed back to the customer; `deliveredToCustomerAt` recorded. Terminal, successful path.

## Alternate terminal states (reachable from any stage)

- **`REFUNDED`** — money returned instead of item. Creates `CustomerLedgerEntry(type: "CLAIM_REFUND", -amount)` and `CashLedgerEntry(-amount, sourceType: "CLAIM_REFUND")` in one transaction.
- **`REJECTED`** — claim denied. No financial or stock effect; just records the outcome with `resolutionNote`.

## Rules

- Status only ever moves **forward** through 1→2→3→4, or jumps to a terminal state (`REFUNDED`/`REJECTED`) from wherever it currently sits. Never allow moving backward.
- Each stage's timestamp field is set exactly once, the first time that stage is reached — never overwritten by re-visiting a stage.
- `Phone.status` transitions for `CLAIMED`/`WITH_SUPPLIER`/`RETURNED_TO_STOCK` belong exclusively to claim actions — purchase/sale code must never set these three values. See [[phone-inventory]].
- Claims list view surfaces, per claim: current stage, full timestamp trail, and a "stuck" flag for anything sitting at `SENT_TO_SUPPLIER` past a configurable window (e.g. 14 days) with no `receivedFromSupplierAt` yet.

See [[cash-ledger-and-profit]] for the refund's cash-ledger effect and [[credit-and-ledger]] for how customer balances are otherwise tracked.
