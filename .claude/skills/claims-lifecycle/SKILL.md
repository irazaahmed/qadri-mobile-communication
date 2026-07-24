---
name: claims-lifecycle
description: The full customer return/warranty claim lifecycle for Qadri Mobile Communication — four-stage tracking from customer through supplier and back, status transitions, and the refund/reject terminal states. Read before writing any Claim code or UI.
---

# Claims / Returns — full lifecycle tracking

A `Claim` tracks a returned/warranty-complaint item (a sold `Phone` or a quantity of an `Accessory`) through its entire round trip: customer → shop → supplier → shop → customer.

## Stages (in order)

1. **`RECEIVED_FROM_CUSTOMER`** (default on create) — admin logs the claim: `customerId`, `itemType`, the specific `phoneId` (must be a `Phone` with `status: SOLD`) or `accessoryId` + `quantity`, `reason`. `receivedFromCustomerAt` defaults to now. If `itemType = PHONE`: set `Phone.status = CLAIMED`.
2. **`SENT_TO_SUPPLIER`** — admin records `supplierId` (which supplier/company it was forwarded to) and `sentToSupplierAt`. If `itemType = PHONE`: set `Phone.status = WITH_SUPPLIER`.
3. **`RECEIVED_FROM_SUPPLIER`** — supplier returns a replacement or repaired unit; `receivedFromSupplierAt` recorded. If `itemType = PHONE`: set `Phone.status = CLAIMED` (item is back in the shop's hands, held for redelivery to the original customer). A claimed item always goes back to the same customer — there is no "release the supplier's replacement into general stock" path.
4. **`DELIVERED_TO_CUSTOMER`** — resolved item (repaired original or supplier replacement) handed back to the *same* customer; `deliveredToCustomerAt` recorded. If `itemType = PHONE`: set `Phone.status = SOLD` — it's exactly the same situation as any other sold, in-warranty unit. Terminal, successful path.

## Alternate terminal states (reachable from any stage)

- **`REFUNDED`** — money returned instead of item. Creates `CustomerLedgerEntry(type: "CLAIM_REFUND", -amount)` and `CashLedgerEntry(-amount, sourceType: "CLAIM_REFUND")` in one transaction. If `itemType = PHONE` and the unit is physically in hand (`Phone.status = CLAIMED`), set `Phone.status = IN_STOCK` — the customer took money instead of the item, so it becomes sellable again. If the unit is still `WITH_SUPPLIER` (refunded before it came back), leave the status alone — resolve manually once it's physically returned.
- **`REJECTED`** — claim denied, item handed back to the customer exactly as it was. No financial effect; just records the outcome with `resolutionNote`. If `itemType = PHONE` and `Phone.status = CLAIMED`, set it back to `SOLD` (same `WITH_SUPPLIER` caveat as REFUNDED).

## Rules

- Status only ever moves **forward** through 1→2→3→4, or jumps to a terminal state (`REFUNDED`/`REJECTED`) from wherever it currently sits. Never allow moving backward.
- Each stage's timestamp field is set exactly once, the first time that stage is reached — never overwritten by re-visiting a stage.
- `Phone.status` transitions for `CLAIMED`/`WITH_SUPPLIER` belong exclusively to claim actions — purchase/sale code must never set these values. See [[phone-inventory]].
- Claims list view surfaces, per claim: current stage, full timestamp trail, and a "stuck" flag for anything sitting at `SENT_TO_SUPPLIER` past a configurable window (e.g. 14 days) with no `receivedFromSupplierAt` yet.

See [[cash-ledger-and-profit]] for the refund's cash-ledger effect and [[credit-and-ledger]] for how customer balances are otherwise tracked.
