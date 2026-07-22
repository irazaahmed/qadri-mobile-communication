"use server";

import { prisma } from "@/lib/prisma";
import { appendCashLedger, appendSupplierLedger, appendCustomerLedger } from "@/lib/ledger";
import { Prisma, PaymentDirection, PaymentStatus, type PaymentMethod, type Payment } from "@prisma/client";

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
 */

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

      const payment = await tx.payment.create({
        data: {
          direction: PaymentDirection.PAYABLE,
          supplierId: purchase.supplierId,
          purchaseId: purchase.id,
          amount,
          method: input.method,
          note: input.note ?? null,
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
        note: `Payment for ${purchase.invoiceNumber}`,
      });

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

    if (!sale.customerId) {
      throw new Error("This sale has no customer on record — cannot record a receivable payment.");
    }

    const remaining = sale.totalAmount.minus(sale.paidAmount);

    if (amount.greaterThan(remaining)) {
      throw new Error(`Payment of ${amount.toString()} exceeds the outstanding balance of ${remaining.toString()}.`);
    }

    const payment = await tx.payment.create({
      data: {
        direction: PaymentDirection.RECEIVABLE,
        customerId: sale.customerId,
        saleId: sale.id,
        amount,
        method: input.method,
        note: input.note ?? null,
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
      note: `Payment for ${sale.invoiceNumber}`,
    });

    await appendCashLedger(tx, {
      sourceType: "CREDIT_PAYMENT_IN",
      sourceId: payment.id,
      amount,
      note: `Payment for ${sale.invoiceNumber}`,
    });

    return payment;
  });
}

export async function listPaymentsForPurchase(purchaseId: string): Promise<Payment[]> {
  return prisma.payment.findMany({ where: { purchaseId }, orderBy: { createdAt: "desc" } });
}

export async function listPaymentsForSale(saleId: string): Promise<Payment[]> {
  return prisma.payment.findMany({ where: { saleId }, orderBy: { createdAt: "desc" } });
}
