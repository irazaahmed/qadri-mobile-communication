"use server";

import { prisma } from "@/lib/prisma";
import { Prisma, PaymentStatus, PhoneStatus } from "@prisma/client";
import { daysUntilWarrantyExpiry } from "@/lib/warranty";
import { getSupplierBalances } from "@/lib/actions/suppliers";
import { getCustomerBalances } from "@/lib/actions/customers";

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

/**
 * Today's profit = revenue (sum of SaleItem.lineTotal) minus COGS (sum of
 * costAtSale x quantity), for SaleItems whose Sale was created today. Uses
 * the costAtSale snapshot per the cash-ledger-and-profit skill — never the
 * current Phone/Accessory cost, which can drift after the sale.
 */
export async function getTodayProfit(): Promise<string> {
  const since = startOfToday();

  const items = await prisma.saleItem.findMany({
    where: { sale: { createdAt: { gte: since } } },
    select: { lineTotal: true, costAtSale: true, quantity: true },
  });

  const profit = items.reduce((sum, item) => {
    const cost = item.costAtSale.times(item.quantity ?? 1);
    return sum.plus(item.lineTotal.minus(cost));
  }, new Prisma.Decimal(0));

  return profit.toString();
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

export interface WarrantyExpiringRow {
  id: string;
  imei: string | null;
  brand: string;
  model: string;
  daysLeft: number;
}

/** Sold phones whose warranty expires within `withinDays` (default 30) — computed at read time, never stored. */
export async function getWarrantyExpiringPhones(withinDays = 30): Promise<WarrantyExpiringRow[]> {
  const phones = await prisma.phone.findMany({
    where: {
      status: PhoneStatus.SOLD,
      warrantyStartDate: { not: null },
      warrantyMonths: { not: null },
    },
  });

  return phones
    .map((p) => ({ phone: p, daysLeft: daysUntilWarrantyExpiry(p) }))
    .filter((p): p is { phone: (typeof phones)[number]; daysLeft: number } => p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map((p) => ({
      id: p.phone.id,
      imei: p.phone.imei,
      brand: p.phone.brand,
      model: p.phone.model,
      daysLeft: p.daysLeft,
    }));
}

export interface PendingBillPhoneRow {
  id: string;
  imei: string | null;
  brand: string;
  model: string;
  status: string;
  costPrice: string;
}

/** Phones already in stock (or already sold) on an estimated cost, still awaiting the supplier's real bill. */
export async function getPendingBillPhones(limit = 8): Promise<{ rows: PendingBillPhoneRow[]; total: number }> {
  const phones = await prisma.phone.findMany({
    where: { costPending: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    total: phones.length,
    rows: phones.slice(0, limit).map((p) => ({
      id: p.id,
      imei: p.imei,
      brand: p.brand,
      model: p.model,
      status: p.status,
      costPrice: p.costPrice.toString(),
    })),
  };
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
    supplierName: p.supplier?.name ?? "Unknown supplier",
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

/**
 * Totals come from each party's own ledger balance (the same numbers shown
 * on the Suppliers/Customers list pages and their detail pages), not from
 * summing Purchase/Sale rows directly — this is the only way the total
 * picks up opening balances (previous credit/advance carried over from
 * before this system, entered directly against a Customer/Supplier with no
 * backing invoice — see lib/actions/customers.ts / suppliers.ts). A
 * negative ledger balance is an advance, not a payable/receivable, so only
 * positive balances are summed.
 */
export async function getOutstandingTotals(): Promise<PayableTotalRow> {
  const [supplierBalances, customerBalances] = await Promise.all([
    getSupplierBalances(),
    getCustomerBalances(),
  ]);

  const totalPayable = Array.from(supplierBalances.values()).reduce(
    (sum, balance) => sum.plus(Prisma.Decimal.max(0, new Prisma.Decimal(balance))),
    new Prisma.Decimal(0)
  );
  const totalReceivable = Array.from(customerBalances.values()).reduce(
    (sum, balance) => sum.plus(Prisma.Decimal.max(0, new Prisma.Decimal(balance))),
    new Prisma.Decimal(0)
  );

  return { totalPayable: totalPayable.toString(), totalReceivable: totalReceivable.toString() };
}
