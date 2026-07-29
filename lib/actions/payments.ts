"use server";

import { prisma } from "@/lib/prisma";
import { appendCashLedger, appendSupplierLedger, appendCustomerLedger, appendBankLedger } from "@/lib/ledger";
import {
  Prisma,
  PaymentDirection,
  PaymentStatus,
  PaymentMethod,
  PaymentType,
  type Payment,
  type Purchase,
  type Sale,
} from "@prisma/client";

/**
 * lib/actions/payments.ts
 *
 * One shared action for settling credit, branching only on `direction`, per
 * the credit-and-ledger skill (mirrors CLAUDE.md §4.5):
 * - PAYABLE: pays down a Purchase. Increases Purchase.paidAmount, recomputes
 *   status, SupplierLedgerEntry(PAYMENT, -amount), CashLedgerEntry(-amount,
 *   CREDIT_PAYMENT_OUT).
 * - RECEIVABLE: pays down a Sale. Increases Sale.paidAmount, recomputes
 *   status, CustomerLedgerEntry(PAYMENT, -amount), CashLedgerEntry(+amount,
 *   CREDIT_PAYMENT_IN).
 * All in one prisma.$transaction. A single-invoice payment (this file's
 * `recordPayment`) never exceeds that one invoice's own outstanding balance —
 * it's explicitly scoped to one invoice, so overpaying it wouldn't mean
 * anything.
 *
 * `recordSupplierBulkPayment` / `recordCustomerBulkPayment` below cover the
 * other half of this: a party may owe across several credit invoices at
 * once, and a single cash collection/payout often clears more than one of
 * them. Those apply one payment amount across a supplier's/customer's
 * oldest-due-first outstanding invoices, but still log exactly one
 * CashLedgerEntry — the actual single cash movement — per the
 * cash-ledger-and-profit skill's "one entry per cash-affecting action" rule.
 *
 * Unlike the single-invoice path, the bulk path DOES allow the amount to
 * exceed the party's total outstanding balance (or to be recorded with zero
 * outstanding at all) — e.g. "customer owes 30,000 but hands over 50,000 and
 * says settle the rest later." Whatever is left after every outstanding
 * invoice is fully paid is recorded as a standalone advance: one more
 * Payment row (purchaseId/saleId left null — it isn't for any specific
 * invoice) plus a ledger entry that pushes the party's running balance
 * negative. A negative balance IS the advance — `getSupplierBalances` /
 * `getCustomerBalances` already expose it via the same balanceAfter number,
 * no separate field needed. `createPurchase` / `createSale` automatically
 * draw down that negative balance on the party's next CREDIT invoice (see
 * the "advance" comments there) — again via the ledger's own cumulative
 * math, not a separate mechanism, so there is nothing here that needs to
 * "know" about that later step.
 */

type Tx = Prisma.TransactionClient;

function methodLabel(method: PaymentMethod): string {
  return { CASH: "Cash", BANK_TRANSFER: "Bank transfer", JAZZCASH: "JazzCash", EASYPAISA: "EasyPaisa" }[method];
}

/**
 * Routes the physical-money side of a payment to the right ledger: CASH
 * goes to CashLedgerEntry same as always; BANK_TRANSFER/JAZZCASH/EASYPAISA
 * all land in the one shared BankLedgerEntry instead (per CLAUDE.md §10,
 * these settlement methods have no separate wallet ledger of their own —
 * they're combined with real bank transfers in this one balance). The
 * supplier/customer ledger entries (payable/receivable) are unaffected by
 * this — those always fire regardless of how the cash physically moved.
 */
async function appendSettlementLedger(
  tx: Tx,
  {
    method,
    sourceType,
    sourceId,
    amount,
    note,
  }: { method: PaymentMethod; sourceType: string; sourceId?: string | null; amount: Prisma.Decimal; note: string }
) {
  if (method === PaymentMethod.CASH) {
    return appendCashLedger(tx, { sourceType, sourceId, amount, note });
  }
  return appendBankLedger(tx, {
    type: sourceType,
    sourceType,
    sourceId,
    amount,
    note: `${note} (via ${methodLabel(method)})`,
  });
}

/** Applies part (or all) of a payment to one Purchase. Shared by the single-invoice and bulk paths. */
async function applyPurchasePayment(
  tx: Tx,
  purchase: Purchase,
  amount: Prisma.Decimal,
  method: PaymentMethod,
  note: string | null
): Promise<Payment> {
  if (!purchase.supplierId) {
    throw new Error(`Purchase ${purchase.invoiceNumber} has no supplier to pay — this shouldn't happen for a CREDIT purchase.`);
  }

  const payment = await tx.payment.create({
    data: {
      direction: PaymentDirection.PAYABLE,
      supplierId: purchase.supplierId,
      purchaseId: purchase.id,
      amount,
      method,
      note,
    },
  });

  const newPaidAmount = purchase.paidAmount.plus(amount);

  await tx.purchase.update({
    where: { id: purchase.id },
    data: { paidAmount: newPaidAmount, status: recomputeStatus(newPaidAmount, purchase.totalAmount) },
  });

  await appendSupplierLedger(tx, {
    supplierId: purchase.supplierId,
    purchaseId: purchase.id,
    paymentId: payment.id,
    type: "PAYMENT",
    amount: amount.negated(),
    note: note ?? `Payment for ${purchase.invoiceNumber}`,
  });

  return payment;
}

/** Applies part (or all) of a payment to one Sale. Shared by the single-invoice and bulk paths. */
async function applySalePayment(
  tx: Tx,
  sale: Sale,
  amount: Prisma.Decimal,
  method: PaymentMethod,
  note: string | null
): Promise<Payment> {
  if (!sale.customerId) {
    throw new Error("This sale has no customer on record — cannot record a receivable payment.");
  }

  const payment = await tx.payment.create({
    data: {
      direction: PaymentDirection.RECEIVABLE,
      customerId: sale.customerId,
      saleId: sale.id,
      amount,
      method,
      note,
    },
  });

  const newPaidAmount = sale.paidAmount.plus(amount);

  await tx.sale.update({
    where: { id: sale.id },
    data: { paidAmount: newPaidAmount, status: recomputeStatus(newPaidAmount, sale.totalAmount) },
  });

  await appendCustomerLedger(tx, {
    customerId: sale.customerId,
    saleId: sale.id,
    paymentId: payment.id,
    type: "PAYMENT",
    amount: amount.negated(),
    note: note ?? `Payment for ${sale.invoiceNumber}`,
  });

  return payment;
}

export interface RecordPaymentInput {
  direction: PaymentDirection;
  /** Required when direction === "PAYABLE". */
  purchaseId?: string;
  /** Required when direction === "RECEIVABLE". */
  saleId?: string;
  amount: number | string;
  method: PaymentMethod;
  note?: string | null;
}

function recomputeStatus(paidAmount: Prisma.Decimal, totalAmount: Prisma.Decimal): PaymentStatus {
  if (paidAmount.greaterThanOrEqualTo(totalAmount)) return PaymentStatus.PAID;
  if (paidAmount.greaterThan(0)) return PaymentStatus.PARTIAL;
  return PaymentStatus.UNPAID;
}

export async function recordPayment(input: RecordPaymentInput): Promise<Payment> {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Payment amount must be greater than zero.");
  }

  return prisma.$transaction(async (tx) => {
    if (input.direction === PaymentDirection.PAYABLE) {
      if (!input.purchaseId) {
        throw new Error("purchaseId is required for a payable payment.");
      }

      const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: input.purchaseId } });
      const remaining = purchase.totalAmount.minus(purchase.paidAmount);

      if (amount.greaterThan(remaining)) {
        throw new Error(`Payment of ${amount.toString()} exceeds the outstanding balance of ${remaining.toString()}.`);
      }

      const payment = await applyPurchasePayment(tx, purchase, amount, input.method, input.note ?? null);

      await appendSettlementLedger(tx, {
        method: input.method,
        sourceType: "CREDIT_PAYMENT_OUT",
        sourceId: payment.id,
        amount: amount.negated(),
        note: `Payment for ${purchase.invoiceNumber}`,
      });

      return payment;
    }

    if (!input.saleId) {
      throw new Error("saleId is required for a receivable payment.");
    }

    const sale = await tx.sale.findUniqueOrThrow({ where: { id: input.saleId } });
    const remaining = sale.totalAmount.minus(sale.paidAmount);

    if (amount.greaterThan(remaining)) {
      throw new Error(`Payment of ${amount.toString()} exceeds the outstanding balance of ${remaining.toString()}.`);
    }

    const payment = await applySalePayment(tx, sale, amount, input.method, input.note ?? null);

    await appendSettlementLedger(tx, {
      method: input.method,
      sourceType: "CREDIT_PAYMENT_IN",
      sourceId: payment.id,
      amount,
      note: `Payment for ${sale.invoiceNumber}`,
    });

    return payment;
  });
}

export interface RecordSupplierBulkPaymentInput {
  supplierId: string;
  amount: number | string;
  method: PaymentMethod;
  note?: string | null;
}

export interface BulkPaymentResult {
  amount: string;
  invoiceNumbers: string[];
  /** Portion of `amount` left over after every outstanding invoice was fully paid — recorded as a standalone advance. "0" when nothing was left over. */
  advanceAmount: string;
}

/**
 * Settles a supplier's overall payable balance in one go — e.g. one cash
 * payout that covers several separate credit purchases at once. Allocates
 * the amount across that supplier's outstanding purchases oldest-due-first
 * (same ordering as the dashboard payable widget), same as paying each
 * invoice one by one would, but as a single cash movement.
 *
 * Amount is allowed to exceed the total outstanding (or to be paid with zero
 * outstanding) — any leftover becomes a standalone advance credit for this
 * supplier (see file header comment).
 */
export async function recordSupplierBulkPayment(input: RecordSupplierBulkPaymentInput): Promise<BulkPaymentResult> {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Payment amount must be greater than zero.");
  }

  return prisma.$transaction(async (tx) => {
    const outstanding = await tx.purchase.findMany({
      where: { supplierId: input.supplierId, status: { not: PaymentStatus.PAID } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });

    let leftover = amount;
    const invoiceNumbers: string[] = [];

    for (const purchase of outstanding) {
      if (leftover.lessThanOrEqualTo(0)) break;

      const purchaseRemaining = purchase.totalAmount.minus(purchase.paidAmount);
      const allocation = purchaseRemaining.lessThanOrEqualTo(leftover) ? purchaseRemaining : leftover;
      if (allocation.lessThanOrEqualTo(0)) continue;

      await applyPurchasePayment(tx, purchase, allocation, input.method, input.note ?? null);
      invoiceNumbers.push(purchase.invoiceNumber);
      leftover = leftover.minus(allocation);
    }

    if (leftover.greaterThan(0)) {
      const advancePayment = await tx.payment.create({
        data: {
          direction: PaymentDirection.PAYABLE,
          supplierId: input.supplierId,
          amount: leftover,
          method: input.method,
          note: input.note || null,
        },
      });

      await appendSupplierLedger(tx, {
        supplierId: input.supplierId,
        paymentId: advancePayment.id,
        type: "PAYMENT",
        amount: leftover.negated(),
        note: `Advance credit beyond outstanding invoices — auto-adjusts against this supplier's next credit purchase${input.note ? ` (${input.note})` : ""}`,
      });
    }

    await appendSettlementLedger(tx, {
      method: input.method,
      sourceType: "CREDIT_PAYMENT_OUT",
      sourceId: input.supplierId,
      amount: amount.negated(),
      note:
        invoiceNumbers.length > 0
          ? `Bulk payment covering ${invoiceNumbers.join(", ")}${input.note ? ` — ${input.note}` : ""}`
          : `Advance payment to supplier${input.note ? ` — ${input.note}` : ""}`,
    });

    return { amount: amount.toString(), invoiceNumbers, advanceAmount: leftover.toString() };
  });
}

export interface RecordCustomerBulkPaymentInput {
  customerId: string;
  amount: number | string;
  method: PaymentMethod;
  note?: string | null;
}

/**
 * Settles a customer's overall receivable balance in one go — e.g. one cash
 * collection that covers several separate credit sales at once. Allocates
 * the amount across that customer's outstanding sales oldest-due-first,
 * same ordering as the dashboard receivable widget.
 *
 * Amount is allowed to exceed the total outstanding (or to be paid with zero
 * outstanding) — any leftover becomes a standalone advance credit for this
 * customer (see file header comment).
 */
export async function recordCustomerBulkPayment(input: RecordCustomerBulkPaymentInput): Promise<BulkPaymentResult> {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Payment amount must be greater than zero.");
  }

  return prisma.$transaction(async (tx) => {
    const outstanding = await tx.sale.findMany({
      where: { customerId: input.customerId, status: { not: PaymentStatus.PAID } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });

    let leftover = amount;
    const invoiceNumbers: string[] = [];

    for (const sale of outstanding) {
      if (leftover.lessThanOrEqualTo(0)) break;

      const saleRemaining = sale.totalAmount.minus(sale.paidAmount);
      const allocation = saleRemaining.lessThanOrEqualTo(leftover) ? saleRemaining : leftover;
      if (allocation.lessThanOrEqualTo(0)) continue;

      await applySalePayment(tx, sale, allocation, input.method, input.note ?? null);
      invoiceNumbers.push(sale.invoiceNumber);
      leftover = leftover.minus(allocation);
    }

    if (leftover.greaterThan(0)) {
      const advancePayment = await tx.payment.create({
        data: {
          direction: PaymentDirection.RECEIVABLE,
          customerId: input.customerId,
          amount: leftover,
          method: input.method,
          note: input.note || null,
        },
      });

      await appendCustomerLedger(tx, {
        customerId: input.customerId,
        paymentId: advancePayment.id,
        type: "PAYMENT",
        amount: leftover.negated(),
        note: `Advance credit beyond outstanding invoices — auto-adjusts against this customer's next credit sale${input.note ? ` (${input.note})` : ""}`,
      });
    }

    await appendSettlementLedger(tx, {
      method: input.method,
      sourceType: "CREDIT_PAYMENT_IN",
      sourceId: input.customerId,
      amount,
      note:
        invoiceNumbers.length > 0
          ? `Bulk payment covering ${invoiceNumbers.join(", ")}${input.note ? ` — ${input.note}` : ""}`
          : `Advance payment from customer${input.note ? ` — ${input.note}` : ""}`,
    });

    return { amount: amount.toString(), invoiceNumbers, advanceAmount: leftover.toString() };
  });
}

/**
 * Deletes a single Payment row entered by mistake (wrong amount, wrong
 * invoice) and reverses exactly what it did: knocks its amount back off the
 * Purchase's/Sale's paidAmount (recomputing status), and appends offsetting
 * supplier/customer-ledger and cash-ledger entries — never edits historical
 * rows, so every balance before this point stays correct.
 *
 * Also handles a standalone advance payment (purchaseId/saleId both null —
 * see recordSupplierBulkPayment/recordCustomerBulkPayment): there's no
 * invoice paidAmount to knock down, just the ledger/cash reversal.
 */
export async function deletePayment(paymentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new Error("Payment not found.");
    }

    if (payment.direction === PaymentDirection.PAYABLE) {
      if (!payment.supplierId) {
        throw new Error("This payment has no supplier on record — cannot reverse it.");
      }

      if (!payment.purchaseId) {
        // An advance sits as a pool of future credit rather than being tied
        // to one invoice, so unlike a per-invoice payment it can't be
        // reversed once something has drawn it down (e.g. a later credit
        // purchase auto-applied part of it — see createPurchase's "advance"
        // comment) — that purchase's paidAmount has no other record backing
        // it, so undoing the advance out from under it would silently make
        // that purchase look paid when nothing actually paid for it.
        const advanceLedgerEntry = await tx.supplierLedgerEntry.findFirst({ where: { paymentId: payment.id } });
        const latestLedgerEntry = await tx.supplierLedgerEntry.findFirst({
          where: { supplierId: payment.supplierId },
          orderBy: { createdAt: "desc" },
        });
        if (advanceLedgerEntry && latestLedgerEntry && advanceLedgerEntry.id !== latestLedgerEntry.id) {
          throw new Error(
            "This advance credit has already been (at least partly) applied to a later credit purchase — it can no longer be deleted cleanly. Correct that purchase directly instead."
          );
        }

        await appendSupplierLedger(tx, {
          supplierId: payment.supplierId,
          type: "VOID",
          amount: payment.amount,
          note: "Deleted advance payment",
        });
        await appendSettlementLedger(tx, {
          method: payment.method,
          sourceType: "CREDIT_PAYMENT_OUT",
          sourceId: payment.id,
          amount: payment.amount,
          note: "Deleted advance payment",
        });
        await tx.payment.delete({ where: { id: paymentId } });
        return;
      }

      const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: payment.purchaseId } });

      // A CASH purchase's Payment row(s) are created at the same moment as
      // the purchase itself, purely for the supplier's audit trail (see
      // createPurchase) — their cash/bank effect is the single movement
      // deletePurchase's own reversal covers, so they aren't independently
      // reversible here (doing so would double-reverse once the purchase is
      // later deleted too). A reconciliation purchase is the one exception —
      // it can never be deleted itself, so undoing its settlement payment
      // here is the only way to correct a wrongly-marked "already paid".
      if (purchase.paymentType === PaymentType.CASH && !purchase.isReconciliation) {
        throw new Error(
          `${purchase.invoiceNumber} was settled in cash/bank at the time of purchase — its payment record can't be deleted on its own. Delete the whole purchase from its detail page instead if it was entered by mistake.`
        );
      }

      const newPaidAmount = purchase.paidAmount.minus(payment.amount);

      await tx.purchase.update({
        where: { id: purchase.id },
        data: { paidAmount: newPaidAmount, status: recomputeStatus(newPaidAmount, purchase.totalAmount) },
      });

      await appendSupplierLedger(tx, {
        supplierId: payment.supplierId,
        purchaseId: purchase.id,
        type: "VOID",
        amount: payment.amount,
        note: `Deleted payment for ${purchase.invoiceNumber}`,
      });

      await appendSettlementLedger(tx, {
        method: payment.method,
        sourceType: "CREDIT_PAYMENT_OUT",
        sourceId: payment.id,
        amount: payment.amount,
        note: `Deleted payment for ${purchase.invoiceNumber}`,
      });
    } else {
      if (!payment.customerId) {
        throw new Error("This payment has no customer on record — cannot reverse it.");
      }

      if (!payment.saleId) {
        // Same reasoning as the PAYABLE advance branch above: block deletion
        // once a later credit sale has drawn the advance down, since that
        // sale's paidAmount would then have no payment record backing it.
        const advanceLedgerEntry = await tx.customerLedgerEntry.findFirst({ where: { paymentId: payment.id } });
        const latestLedgerEntry = await tx.customerLedgerEntry.findFirst({
          where: { customerId: payment.customerId },
          orderBy: { createdAt: "desc" },
        });
        if (advanceLedgerEntry && latestLedgerEntry && advanceLedgerEntry.id !== latestLedgerEntry.id) {
          throw new Error(
            "This advance credit has already been (at least partly) applied to a later credit sale — it can no longer be deleted cleanly. Correct that sale directly instead."
          );
        }

        await appendCustomerLedger(tx, {
          customerId: payment.customerId,
          type: "VOID",
          amount: payment.amount,
          note: "Deleted advance payment",
        });
        await appendSettlementLedger(tx, {
          method: payment.method,
          sourceType: "CREDIT_PAYMENT_IN",
          sourceId: payment.id,
          amount: payment.amount.negated(),
          note: "Deleted advance payment",
        });
        await tx.payment.delete({ where: { id: paymentId } });
        return;
      }

      const sale = await tx.sale.findUniqueOrThrow({ where: { id: payment.saleId } });
      const newPaidAmount = sale.paidAmount.minus(payment.amount);

      await tx.sale.update({
        where: { id: sale.id },
        data: { paidAmount: newPaidAmount, status: recomputeStatus(newPaidAmount, sale.totalAmount) },
      });

      await appendCustomerLedger(tx, {
        customerId: payment.customerId,
        saleId: sale.id,
        type: "VOID",
        amount: payment.amount,
        note: `Deleted payment for ${sale.invoiceNumber}`,
      });

      await appendSettlementLedger(tx, {
        method: payment.method,
        sourceType: "CREDIT_PAYMENT_IN",
        sourceId: payment.id,
        amount: payment.amount.negated(),
        note: `Deleted payment for ${sale.invoiceNumber}`,
      });
    }

    await tx.payment.delete({ where: { id: paymentId } });
  });
}

export async function listPaymentsForPurchase(purchaseId: string): Promise<Payment[]> {
  return prisma.payment.findMany({ where: { purchaseId }, orderBy: { createdAt: "desc" } });
}

export async function listPaymentsForSale(saleId: string): Promise<Payment[]> {
  return prisma.payment.findMany({ where: { saleId }, orderBy: { createdAt: "desc" } });
}
