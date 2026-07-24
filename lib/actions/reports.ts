"use server";

import { prisma } from "@/lib/prisma";
import { Prisma, PaymentStatus } from "@prisma/client";

/**
 * lib/actions/reports.ts
 *
 * Read-only reporting queries per the cash-ledger-and-profit skill:
 * - Profit = revenue (sum SaleItem.lineTotal) - COGS (sum
 *   SaleItem.costAtSale * quantity) for sales in range. costAtSale is the
 *   permanent snapshot taken at sale time — never substitute current
 *   Phone/Accessory cost prices here.
 * - Cash report is a plain date-scoped slice of CashLedgerEntry — the
 *   ledger itself is the only source of truth for cash position.
 * - Credit report is a live snapshot of every outstanding Purchase/Sale
 *   (not date-scoped — "outstanding" is a current-state concept), mirroring
 *   the dashboard's payable/receivable widgets but unpaginated.
 */

export interface DateRangeInput {
  from: Date;
  to: Date;
}

export interface ProfitReport {
  revenue: string;
  cogs: string;
  profit: string;
  totalPurchased: string;
  totalSold: string;
  expenses: string;
  netCashMovement: string;
}

export async function getProfitReport({ from, to }: DateRangeInput): Promise<ProfitReport> {
  const saleItems = await prisma.saleItem.findMany({
    where: { sale: { createdAt: { gte: from, lte: to } } },
    select: { lineTotal: true, costAtSale: true, quantity: true },
  });

  const revenue = saleItems.reduce((sum, i) => sum.plus(i.lineTotal), new Prisma.Decimal(0));
  const cogs = saleItems.reduce(
    (sum, i) => sum.plus(i.costAtSale.mul(i.quantity ?? 1)),
    new Prisma.Decimal(0)
  );
  const profit = revenue.minus(cogs);

  const [purchases, sales, expenses, cashEntries] = await Promise.all([
    prisma.purchase.aggregate({ where: { createdAt: { gte: from, lte: to } }, _sum: { totalAmount: true } }),
    prisma.sale.aggregate({ where: { createdAt: { gte: from, lte: to } }, _sum: { totalAmount: true } }),
    prisma.expense.aggregate({ where: { createdAt: { gte: from, lte: to } }, _sum: { amount: true } }),
    prisma.cashLedgerEntry.aggregate({ where: { createdAt: { gte: from, lte: to } }, _sum: { amount: true } }),
  ]);

  return {
    revenue: revenue.toString(),
    cogs: cogs.toString(),
    profit: profit.toString(),
    totalPurchased: (purchases._sum.totalAmount ?? new Prisma.Decimal(0)).toString(),
    totalSold: (sales._sum.totalAmount ?? new Prisma.Decimal(0)).toString(),
    expenses: (expenses._sum.amount ?? new Prisma.Decimal(0)).toString(),
    netCashMovement: (cashEntries._sum.amount ?? new Prisma.Decimal(0)).toString(),
  };
}

export interface CashReportRow {
  id: string;
  sourceType: string;
  amount: string;
  balanceAfter: string;
  note: string | null;
  createdAt: string;
}

export async function getCashReport({ from, to }: DateRangeInput): Promise<CashReportRow[]> {
  const entries = await prisma.cashLedgerEntry.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "asc" },
  });

  return entries.map((e) => ({
    id: e.id,
    sourceType: e.sourceType,
    amount: e.amount.toString(),
    balanceAfter: e.balanceAfter.toString(),
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  }));
}

export interface CreditReportRow {
  id: string;
  direction: "PAYABLE" | "RECEIVABLE";
  invoiceNumber: string;
  partyName: string;
  totalAmount: string;
  paidAmount: string;
  amountDue: string;
  dueDate: string | null;
  status: PaymentStatus;
}

/** Live snapshot of every outstanding Purchase/Sale, oldest due first (undated last). */
export async function getCreditReport(): Promise<CreditReportRow[]> {
  const [purchases, sales] = await Promise.all([
    prisma.purchase.findMany({
      where: { status: { not: PaymentStatus.PAID } },
      include: { supplier: { select: { name: true } } },
    }),
    prisma.sale.findMany({
      where: { status: { not: PaymentStatus.PAID } },
      include: { customer: { select: { name: true } } },
    }),
  ]);

  const rows: CreditReportRow[] = [
    ...purchases.map((p) => ({
      id: p.id,
      direction: "PAYABLE" as const,
      invoiceNumber: p.invoiceNumber,
      partyName: p.supplier?.name ?? "Unknown supplier",
      totalAmount: p.totalAmount.toString(),
      paidAmount: p.paidAmount.toString(),
      amountDue: p.totalAmount.minus(p.paidAmount).toString(),
      dueDate: p.dueDate ? p.dueDate.toISOString() : null,
      status: p.status,
    })),
    ...sales.map((s) => ({
      id: s.id,
      direction: "RECEIVABLE" as const,
      invoiceNumber: s.invoiceNumber,
      partyName: s.customer?.name ?? "Walk-in",
      totalAmount: s.totalAmount.toString(),
      paidAmount: s.paidAmount.toString(),
      amountDue: s.totalAmount.minus(s.paidAmount).toString(),
      dueDate: s.dueDate ? s.dueDate.toISOString() : null,
      status: s.status,
    })),
  ];

  return rows.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}
