"use server";

import { prisma } from "@/lib/prisma";
import { appendCashLedger, appendSupplierLedger, appendCustomerLedger } from "@/lib/ledger";
import {
  Prisma,
  PaymentDirection,
  PaymentStatus,
  type PaymentMethod,
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
 * All in one prisma.$transaction. Never allows overpaying past the
 * outstanding balance.
 *
 * `recordSupplierBulkPayment` / `recordCustomerBulkPayment` below cover the
 * other half of this: a party may owe across several credit invoices at
 * once, and a single cash collection/payout often clears more than one of
 * them. Those apply one payment amount across a supplier's/customer's
 * oldest-due-first outstanding invoices, but still log exactly one
 * CashLedgerEntry — the actual single cash movement — per the
 * cash-ledger-and-profit skill's "one entry per cash-affecting action" rule.
 */

type Tx = Prisma.TransactionClient;

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

      await appendCashLedger(tx, {
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

    await appendCashLedger(tx, {
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
}

/**
 * Settles a supplier's overall payable balance in one go — e.g. one cash
 * payout that covers several separate credit purchases at once. Allocates
 * the amount across that supplier's outstanding purchases oldest-due-first
 * (same ordering as the dashboard payable widget), same as paying each
 * invoice one by one would, but as a single cash movement.
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

    const totalOutstanding = outstanding.reduce(
      (sum, p) => sum.plus(p.totalAmount.minus(p.paidAmount)),
      new Prisma.Decimal(0)
    );

    if (outstanding.length === 0) {
      throw new Error("This supplier has no outstanding balance to pay.");
    }
    if (amount.greaterThan(totalOutstanding)) {
      throw new Error(
        `Payment of ${amount.toString()} exceeds this supplier's total outstanding balance of ${totalOutstanding.toString()}.`
      );
    }

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

    await appendCashLedger(tx, {
      sourceType: "CREDIT_PAYMENT_OUT",
      sourceId: input.supplierId,
      amount: amount.negated(),
      note: `Bulk payment covering ${invoiceNumbers.join(", ")}${input.note ? ` — ${input.note}` : ""}`,
    });

    return { amount: amount.toString(), invoiceNumbers };
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

    const totalOutstanding = outstanding.reduce(
      (sum, s) => sum.plus(s.totalAmount.minus(s.paidAmount)),
      new Prisma.Decimal(0)
    );

    if (outstanding.length === 0) {
      throw new Error("This customer has no outstanding balance to pay.");
    }
    if (amount.greaterThan(totalOutstanding)) {
      throw new Error(
        `Payment of ${amount.toString()} exceeds this customer's total outstanding balance of ${totalOutstanding.toString()}.`
      );
    }

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

    await appendCashLedger(tx, {
      sourceType: "CREDIT_PAYMENT_IN",
      sourceId: input.customerId,
      amount,
      note: `Bulk payment covering ${invoiceNumbers.join(", ")}${input.note ? ` — ${input.note}` : ""}`,
    });

    return { amount: amount.toString(), invoiceNumbers };
  });
}

export async function listPaymentsForPurchase(purchaseId: string): Promise<Payment[]> {
  return prisma.payment.findMany({ where: { purchaseId }, orderBy: { createdAt: "desc" } });
}

export async function listPaymentsForSale(saleId: string): Promise<Payment[]> {
  return prisma.payment.findMany({ where: { saleId }, orderBy: { createdAt: "desc" } });
}
