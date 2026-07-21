"use server";

import { prisma } from "@/lib/prisma";
import { Prisma, PaymentStatus } from "@prisma/client";

/**
 * lib/actions/dashboard.ts
 *
 * Read-only query helpers for the admin dashboard. No stock mutation, no
 * ledger writes — every value here is either a direct aggregate/read of
 * existing rows, or (cash balance) the latest `CashLedgerEntry.balanceAfter`
 * snapshot per the cash-ledger-and-profit skill ("the live balance is
 * sum(amount) over all entries, equivalently the balanceAfter of the most
 * recent entry — never store a running balance anywhere else").
 *
 * Decimal fields are converted to strings before returning so these are safe
 * to call from Client Components too (Prisma.Decimal instances don't survive
 * the Server Function serialization boundary).
 */

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface TodayStats {
  purchasesTotal: string;
  purchasesCount: number;
  salesTotal: string;
  salesCount: number;
}

export async function getTodayStats(): Promise<TodayStats> {
  const since = startOfToday();

  const [purchases, sales] = await Promise.all([
    prisma.purchase.findMany({
      where: { createdAt: { gte: since } },
      select: { totalAmount: true },
    }),
    prisma.sale.findMany({
      where: { createdAt: { gte: since } },
      select: { totalAmount: true },
    }),
  ]);

  const purchasesTotal = purchases.reduce(
    (sum, p) => sum.plus(p.totalAmount),
    new Prisma.Decimal(0)
  );
  const salesTotal = sales.reduce((sum, s) => sum.plus(s.totalAmount), new Prisma.Decimal(0));

  return {
    purchasesTotal: purchasesTotal.toString(),
    purchasesCount: purchases.length,
    salesTotal: salesTotal.toString(),
    salesCount: sales.length,
  };
}

export async function getCashBalance(): Promise<string> {
  const latest = await prisma.cashLedgerEntry.findFirst({
    orderBy: { createdAt: "desc" },
    select: { balanceAfter: true },
  });

  return (latest?.balanceAfter ?? new Prisma.Decimal(0)).toString();
}

export interface LowStockAccessoryRow {
  id: string;
  name: string;
  brand: string;
  variant: string | null;
  quantity: number;
  lowStockThreshold: number | null;
}

export async function getLowStockAccessories(): Promise<LowStockAccessoryRow[]> {
  const accessories = await prisma.accessory.findMany({
    where: { lowStockThreshold: { not: null } },
    orderBy: { quantity: "asc" },
  });

  return accessories
    .filter((a) => a.lowStockThreshold !== null && a.quantity <= a.lowStockThreshold)
    .map((a) => ({
      id: a.id,
      name: a.name,
      brand: a.brand,
      variant: a.variant,
      quantity: a.quantity,
      lowStockThreshold: a.lowStockThreshold,
    }));
}

export interface OutstandingPayableRow {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  amountDue: string;
  dueDate: string | null;
  createdAt: string;
}

export async function getOutstandingPayables(limit = 10): Promise<OutstandingPayableRow[]> {
  const purchases = await prisma.purchase.findMany({
    where: { status: { not: PaymentStatus.PAID } },
    include: { supplier: { select: { name: true } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: limit,
  });

  return purchases.map((p) => ({
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    supplierName: p.supplier.name,
    amountDue: p.totalAmount.minus(p.paidAmount).toString(),
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  }));
}

export interface OutstandingReceivableRow {
  id: string;
  invoiceNumber: string;
  customerName: string;
  amountDue: string;
  dueDate: string | null;
  createdAt: string;
}

export async function getOutstandingReceivables(limit = 10): Promise<OutstandingReceivableRow[]> {
  const sales = await prisma.sale.findMany({
    where: { status: { not: PaymentStatus.PAID } },
    include: { customer: { select: { name: true } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: limit,
  });

  return sales.map((s) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    customerName: s.customer?.name ?? "Walk-in",
    amountDue: s.totalAmount.minus(s.paidAmount).toString(),
    dueDate: s.dueDate ? s.dueDate.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  }));
}

export interface PayableTotalRow {
  totalPayable: string;
  totalReceivable: string;
}

export async function getOutstandingTotals(): Promise<PayableTotalRow> {
  const [purchases, sales] = await Promise.all([
    prisma.purchase.findMany({
      where: { status: { not: PaymentStatus.PAID } },
      select: { totalAmount: true, paidAmount: true },
    }),
    prisma.sale.findMany({
      where: { status: { not: PaymentStatus.PAID } },
      select: { totalAmount: true, paidAmount: true },
    }),
  ]);

  const totalPayable = purchases.reduce(
    (sum, p) => sum.plus(p.totalAmount.minus(p.paidAmount)),
    new Prisma.Decimal(0)
  );
  const totalReceivable = sales.reduce(
    (sum, s) => sum.plus(s.totalAmount.minus(s.paidAmount)),
    new Prisma.Decimal(0)
  );

  return { totalPayable: totalPayable.toString(), totalReceivable: totalReceivable.toString() };
}
