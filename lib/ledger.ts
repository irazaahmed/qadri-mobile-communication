import { Prisma } from "@prisma/client";

/**
 * lib/ledger.ts
 *
 * Shared ledger helpers — balanceAfter math lives here, nowhere else.
 * Every cash-affecting or credit-affecting write must go through one of
 * these helpers, inside the same `prisma.$transaction` as the domain write.
 * See skills: cash-ledger-and-profit, credit-and-ledger.
 */

type Tx = Prisma.TransactionClient;

/**
 * sourceType values in use (exact strings per skill):
 * "SALE" | "PURCHASE" | "CREDIT_PAYMENT_IN" | "CREDIT_PAYMENT_OUT" | "EXPENSE" | "CLAIM_REFUND" | "MANUAL"
 * Only SALE and PURCHASE are wired up in Phase 1; the helper itself is generic.
 */
export interface AppendCashLedgerInput {
  sourceType: string;
  sourceId?: string | null;
  amount: Prisma.Decimal | number | string;
  note?: string | null;
}

/**
 * Appends exactly one CashLedgerEntry inside the given transaction.
 * `amount` is signed: positive = cash in, negative = cash out.
 * `balanceAfter = previous balanceAfter + amount` (0 if no previous entry).
 */
export async function appendCashLedger(
  tx: Tx,
  { sourceType, sourceId, amount, note }: AppendCashLedgerInput
) {
  const signedAmount = new Prisma.Decimal(amount);

  const latest = await tx.cashLedgerEntry.findFirst({
    orderBy: { createdAt: "desc" },
  });

  const previousBalance = latest ? latest.balanceAfter : new Prisma.Decimal(0);
  const balanceAfter = previousBalance.plus(signedAmount);

  return tx.cashLedgerEntry.create({
    data: {
      sourceType,
      sourceId: sourceId ?? null,
      amount: signedAmount,
      balanceAfter,
      note: note ?? null,
    },
  });
}

/**
 * Bank ledger — entirely independent of CashLedgerEntry (see the model
 * comment in schema.prisma). No shop purchase/sale/payment/expense/claim
 * code may call this, and this must never call appendCashLedger.
 */
export interface AppendBankLedgerInput {
  type: string;
  amount: Prisma.Decimal | number | string;
  note?: string | null;
}

/**
 * Appends exactly one BankLedgerEntry inside the given transaction.
 * `amount` is signed: positive = money in, negative = money out.
 * `balanceAfter = previous balanceAfter + amount` (0 if no previous entry).
 */
export async function appendBankLedger(tx: Tx, { type, amount, note }: AppendBankLedgerInput) {
  const signedAmount = new Prisma.Decimal(amount);

  const latest = await tx.bankLedgerEntry.findFirst({
    orderBy: { createdAt: "desc" },
  });

  const previousBalance = latest ? latest.balanceAfter : new Prisma.Decimal(0);
  const balanceAfter = previousBalance.plus(signedAmount);

  return tx.bankLedgerEntry.create({
    data: {
      type,
      amount: signedAmount,
      balanceAfter,
      note: note ?? null,
    },
  });
}

export interface AppendSupplierLedgerInput {
  supplierId: string;
  purchaseId?: string | null;
  paymentId?: string | null;
  type: string; // "PURCHASE" | "PAYMENT"
  amount: Prisma.Decimal | number | string;
  note?: string | null;
}

/**
 * Appends exactly one SupplierLedgerEntry inside the given transaction.
 * `balanceAfter` is scoped per-supplier (previous balanceAfter for THIS
 * supplier + amount).
 */
export async function appendSupplierLedger(
  tx: Tx,
  { supplierId, purchaseId, paymentId, type, amount, note }: AppendSupplierLedgerInput
) {
  const signedAmount = new Prisma.Decimal(amount);

  const latest = await tx.supplierLedgerEntry.findFirst({
    where: { supplierId },
    orderBy: { createdAt: "desc" },
  });

  const previousBalance = latest ? latest.balanceAfter : new Prisma.Decimal(0);
  const balanceAfter = previousBalance.plus(signedAmount);

  return tx.supplierLedgerEntry.create({
    data: {
      supplierId,
      purchaseId: purchaseId ?? null,
      paymentId: paymentId ?? null,
      type,
      amount: signedAmount,
      balanceAfter,
      note: note ?? null,
    },
  });
}

export interface AppendCustomerLedgerInput {
  customerId: string;
  saleId?: string | null;
  paymentId?: string | null;
  claimId?: string | null;
  type: string; // "SALE" | "PAYMENT" | "CLAIM_CREDIT" | "CLAIM_REFUND"
  amount: Prisma.Decimal | number | string;
  note?: string | null;
}

/**
 * Appends exactly one CustomerLedgerEntry inside the given transaction.
 * `balanceAfter` is scoped per-customer (previous balanceAfter for THIS
 * customer + amount).
 */
export async function appendCustomerLedger(
  tx: Tx,
  { customerId, saleId, paymentId, claimId, type, amount, note }: AppendCustomerLedgerInput
) {
  const signedAmount = new Prisma.Decimal(amount);

  const latest = await tx.customerLedgerEntry.findFirst({
    where: { customerId },
    orderBy: { createdAt: "desc" },
  });

  const previousBalance = latest ? latest.balanceAfter : new Prisma.Decimal(0);
  const balanceAfter = previousBalance.plus(signedAmount);

  return tx.customerLedgerEntry.create({
    data: {
      customerId,
      saleId: saleId ?? null,
      paymentId: paymentId ?? null,
      claimId: claimId ?? null,
      type,
      amount: signedAmount,
      balanceAfter,
      note: note ?? null,
    },
  });
}
