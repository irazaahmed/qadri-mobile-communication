---
name: credit-and-ledger
description: Supplier payable and customer receivable double-ledger pattern for Qadri Mobile Communication — the shared Payment model, balanceAfter math, and customer upsert-by-phone. Read before writing payment recording or ledger-view code.
---

# Credit tracking — payable & receivable ledgers

Two independent ledgers, same shape, settled through one shared `Payment` model with a `direction`:

- `SupplierLedgerEntry` — what Qadri owes suppliers (`Purchase` credit lines add to it).
- `CustomerLedgerEntry` — what customers owe Qadri (`Sale` credit lines add to it).

Both have a `balanceAfter` running snapshot: `balanceAfter = previous balanceAfter (for that same supplier/customer) + amount`, computed inside the same transaction as the insert, exactly like [[cash-ledger-and-profit]]'s rule but scoped per-party instead of shop-wide.

## Recording a payment (either direction)

One shared server action, branching only on `direction`:

- **`PAYABLE`** (paying a supplier against a `Purchase`): create `Payment`, increase `Purchase.paidAmount` by `amount` (validate `amount <= Purchase.totalAmount - Purchase.paidAmount`, never overpay), recompute `Purchase.status` (`PAID` if fully settled, else `PARTIAL`), append `SupplierLedgerEntry(type: "PAYMENT", -amount)`, `CashLedgerEntry(-amount, sourceType: "CREDIT_PAYMENT_OUT")`.
- **`RECEIVABLE`** (customer paying down a `Sale`): create `Payment`, increase `Sale.paidAmount` by `amount` (same overpay guard), recompute `Sale.status`, append `CustomerLedgerEntry(type: "PAYMENT", -amount)`, `CashLedgerEntry(+amount, sourceType: "CREDIT_PAYMENT_IN")`.

All steps in one `prisma.$transaction`.

## Customer upsert-by-phone

Inline-add on the sale screen upserts by `Customer.phone` (`prisma.customer.upsert({ where: { phone } })`) — never create a duplicate customer row for a phone number that already exists. Suppliers have no unique phone constraint in the schema; dedupe inline-add flows by name+phone at the UI level before creating.

## Dashboard views

"Payable to Suppliers" and "Receivable from Customers": list parties with an outstanding balance (derived as the live sum of that party's ledger, or equivalently the latest `balanceAfter`), sorted oldest-due-first by the earliest unpaid `Purchase`/`Sale.dueDate`, with overdue entries (`dueDate < now()`) visually flagged. Computed at query time — no cron, no stored "overdue" boolean.

See [[purchase-sale-flow]] for how credit purchases/sales originate the first ledger entry, and [[cash-ledger-and-profit]] for the shop-wide cash ledger these payments also feed.
