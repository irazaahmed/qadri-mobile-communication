---
name: cash-ledger-and-profit
description: Single-source-of-truth cash rules for Qadri Mobile Communication — exactly one CashLedgerEntry per cash-affecting action, balanceAfter math, and profit reporting via the costAtSale snapshot. Read before writing any code that moves cash or computes profit.
---

# Cash ledger & profit reporting

`CashLedgerEntry` is the ONLY record of the shop's cash position. The live balance is `sum(amount)` over all entries (equivalently, the `balanceAfter` of the most recent entry). Never store a running balance anywhere else.

## The one rule

Every cash-affecting write creates **exactly one** `CashLedgerEntry`, inside the **same** `prisma.$transaction` as the domain write. Never in a second code path, never conditionally skipped, never duplicated. `balanceAfter = previous balanceAfter + amount` (0 if no previous entry), computed inside the transaction.

Use a shared helper `appendCashLedger(tx, { sourceType, sourceId, amount, note })` in `lib/ledger.ts` — do not hand-roll ledger inserts.

`amount` is signed: **positive = cash in**, **negative = cash out**.

## sourceType values (exact strings)

`SALE`, `PURCHASE`, `CREDIT_PAYMENT_IN`, `CREDIT_PAYMENT_OUT`, `EXPENSE`, `CLAIM_REFUND`, `MANUAL`.

## Amount signs per action

| Action | amount |
|---|---|
| Cash sale | `+totalAmount` |
| Credit sale | `+paidAmount` (whatever was collected upfront, 0 if none) |
| Cash purchase | `-totalAmount` |
| Credit purchase | 0 net effect logged as a matching purchase+payment pair (see [[purchase-sale-flow]]) |
| Payment received from customer | `+amount` |
| Payment made to supplier | `-amount` |
| Expense | `-amount` |
| Claim refund | `-amount` |

## Ledger rows are append-only

Never edit or delete a `CashLedgerEntry`, `SupplierLedgerEntry`, or `CustomerLedgerEntry` — every `balanceAfter` after it depends on it. To undo a cash-affecting action, write a **new** entry with the opposite sign (same `sourceType`, `sourceId` = the original record's id, a note like `"Reversal: ..."`), then soft-cancel the domain record if it needs to disappear from its own list.

## Profit reporting (daily/weekly/monthly, filterable by date range)

- Revenue = `sum(SaleItem.lineTotal)` for sales in range.
- Cost of goods sold = `sum(SaleItem.costAtSale × quantity)` for the same range (`quantity` treated as 1 for phone lines, since phones don't carry a `quantity` field).
- Profit = Revenue − COGS.
- **`costAtSale` is a permanent snapshot taken at the moment of sale** (see [[purchase-sale-flow]]) — never substitute the current `Phone.costPrice`/`Accessory.costPrice` when computing a past period's profit, since cost prices drift over time and doing so silently corrupts historical reports.
- Also report per period: total purchased amount, total sold amount, `Expense` sum, and net cash position (`CashLedgerEntry` sum) — these are independent numbers, don't conflate "profit" with "cash position" (a credit sale adds to profit before any cash arrives).
