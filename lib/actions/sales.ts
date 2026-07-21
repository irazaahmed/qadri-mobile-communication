"use server";

import { prisma } from "@/lib/prisma";
import { appendCashLedger, appendCustomerLedger } from "@/lib/ledger";
import { markPhoneSold, decrementAccessoryStock } from "@/lib/stock";
import { generateSaleInvoiceNumber } from "@/lib/invoice";
import {
  Prisma,
  PaymentType,
  PaymentStatus,
  PurchaseItemType,
  type Sale,
  type SaleItem,
} from "@prisma/client";

/**
 * lib/actions/sales.ts
 *
 * Multi-line sale creation exactly per the purchase-sale-flow skill
 * (mirrors CLAUDE.md §4.4): mixed PHONE/ACCESSORY lines, stock guards
 * re-checked inside the transaction, `costAtSale` snapshot on every line,
 * `warrantyStartDate` set to sale time for phone lines, sequential
 * "INV-0001" invoice numbers, CustomerLedgerEntry + CashLedgerEntry writes.
 *
 * Cash vs credit:
 * - CASH: paidAmount = totalAmount, status = PAID,
 *   CashLedgerEntry(+totalAmount, sourceType "SALE"). No CustomerLedgerEntry.
 * - CREDIT: requires a customerId. Admin-entered paidAmount (may be 0, must
 *   be <= totalAmount), dueDate = createdAt + creditDays, status recomputed
 *   from paid vs total, CustomerLedgerEntry(type: "SALE", +amountDue) where
 *   amountDue = totalAmount - paidAmount, CashLedgerEntry(+paidAmount,
 *   sourceType "SALE") for whatever was collected upfront (0 if none).
 */

export interface SalePhoneLineInput {
  itemType: "PHONE";
  phoneId: string; // must be status IN_STOCK at write time
  rate: number | string; // sale price for this unit
}

export interface SaleAccessoryLineInput {
  itemType: "ACCESSORY";
  accessoryId: string;
  quantity: number;
  rate: number | string; // sale price per unit
}

export type SaleLineInput = SalePhoneLineInput | SaleAccessoryLineInput;

export interface CreateSaleInput {
  /** Optional — a cash sale may have no customer record (walk-in). Required for CREDIT. */
  customerId?: string | null;
  paymentType: PaymentType;
  /** Required (and used) only when paymentType === "CREDIT". */
  creditDays?: number | null;
  /** Only used for CREDIT — amount collected upfront, may be 0. Ignored for CASH. */
  paidAmount?: number | string;
  items: SaleLineInput[];
}

export type SaleWithItems = Sale & { items: SaleItem[] };

export async function createSale(input: CreateSaleInput): Promise<SaleWithItems> {
  if (!input.items || input.items.length === 0) {
    throw new Error("Sale must have at least one line item.");
  }

  const isCash = input.paymentType === PaymentType.CASH;

  if (!isCash) {
    if (!input.creditDays) {
      throw new Error("creditDays is required for a CREDIT sale.");
    }
    if (!input.customerId) {
      throw new Error("customerId is required for a CREDIT sale (receivable must be tracked against a customer).");
    }
  }

  for (const line of input.items) {
    if (line.itemType === "ACCESSORY" && line.quantity <= 0) {
      throw new Error(`Accessory line ${line.accessoryId} must have quantity > 0.`);
    }
  }

  const computedLines = input.items.map((line) => {
    const rate = new Prisma.Decimal(line.rate);
    const lineTotal = line.itemType === "PHONE" ? rate : rate.mul(line.quantity);
    return { line, rate, lineTotal };
  });

  const totalAmount = computedLines.reduce(
    (sum, c) => sum.plus(c.lineTotal),
    new Prisma.Decimal(0)
  );

  let paidAmount = isCash ? totalAmount : new Prisma.Decimal(input.paidAmount ?? 0);

  if (!isCash) {
    if (paidAmount.isNegative()) {
      throw new Error("paidAmount cannot be negative.");
    }
    if (paidAmount.greaterThan(totalAmount)) {
      throw new Error("paidAmount cannot exceed the sale's totalAmount.");
    }
  }

  return prisma.$transaction(async (tx) => {
    // Hard guards re-checked inside the transaction — abort the whole sale
    // (throwing rolls back the transaction) if any line is no longer valid.
    for (const { line } of computedLines) {
      if (line.itemType === "PHONE") {
        const phone = await tx.phone.findUnique({ where: { id: line.phoneId } });
        if (!phone) {
          throw new Error(`Phone ${line.phoneId} not found.`);
        }
        if (phone.status !== "IN_STOCK") {
          throw new Error(`Phone ${phone.imei} is not IN_STOCK (current status: ${phone.status}).`);
        }
      } else {
        const accessory = await tx.accessory.findUnique({ where: { id: line.accessoryId } });
        if (!accessory) {
          throw new Error(`Accessory ${line.accessoryId} not found.`);
        }
        if (accessory.quantity - line.quantity < 0) {
          throw new Error(
            `Insufficient stock for accessory "${accessory.name}" (have ${accessory.quantity}, need ${line.quantity}).`
          );
        }
      }
    }

    const invoiceNumber = await generateSaleInvoiceNumber(tx);
    const now = new Date();
    const dueDate = !isCash && input.creditDays ? new Date(now.getTime() + input.creditDays * 86_400_000) : null;

    const status = isCash
      ? PaymentStatus.PAID
      : paidAmount.greaterThanOrEqualTo(totalAmount)
        ? PaymentStatus.PAID
        : paidAmount.greaterThan(0)
          ? PaymentStatus.PARTIAL
          : PaymentStatus.UNPAID;

    const sale = await tx.sale.create({
      data: {
        invoiceNumber,
        customerId: input.customerId ?? null,
        paymentType: input.paymentType,
        creditDays: isCash ? null : input.creditDays ?? null,
        dueDate,
        totalAmount,
        paidAmount,
        status,
      },
    });

    for (const { line, rate, lineTotal } of computedLines) {
      if (line.itemType === "PHONE") {
        const { costAtSale } = await markPhoneSold(tx, line.phoneId, now, rate);

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            itemType: PurchaseItemType.PHONE,
            phoneId: line.phoneId,
            rate,
            costAtSale,
            lineTotal,
          },
        });
      } else {
        const accessory = await decrementAccessoryStock(tx, line.accessoryId, line.quantity);

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            itemType: PurchaseItemType.ACCESSORY,
            accessoryId: line.accessoryId,
            quantity: line.quantity,
            rate,
            costAtSale: accessory.costPrice,
            lineTotal,
          },
        });
      }
    }

    if (isCash) {
      await appendCashLedger(tx, {
        sourceType: "SALE",
        sourceId: sale.id,
        amount: totalAmount,
        note: `Sale ${invoiceNumber}`,
      });
    } else {
      const amountDue = totalAmount.minus(paidAmount);

      await appendCustomerLedger(tx, {
        customerId: input.customerId!,
        saleId: sale.id,
        type: "SALE",
        amount: amountDue,
        note: `Sale ${invoiceNumber} (due ${dueDate?.toISOString() ?? "n/a"})`,
      });

      await appendCashLedger(tx, {
        sourceType: "SALE",
        sourceId: sale.id,
        amount: paidAmount,
        note: `Sale ${invoiceNumber} — upfront payment`,
      });
    }

    return tx.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { items: true },
    });
  });
}

export interface SaleSearchFilters {
  customerId?: string;
  status?: PaymentStatus;
}

export async function listSales(filters: SaleSearchFilters = {}): Promise<SaleWithItems[]> {
  return prisma.sale.findMany({
    where: {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSaleById(id: string): Promise<SaleWithItems | null> {
  return prisma.sale.findUnique({ where: { id }, include: { items: true } });
}
