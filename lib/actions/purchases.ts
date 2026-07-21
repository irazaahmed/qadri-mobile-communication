"use server";

import { prisma } from "@/lib/prisma";
import { appendCashLedger, appendSupplierLedger } from "@/lib/ledger";
import { createPhoneStock, upsertAccessoryStock } from "@/lib/stock";
import { generatePurchaseInvoiceNumber } from "@/lib/invoice";
import {
  Prisma,
  PaymentType,
  PaymentStatus,
  PaymentDirection,
  PaymentMethod,
  PurchaseItemType,
  PhoneCondition,
  type Purchase,
  type PurchaseItem,
} from "@prisma/client";

/**
 * lib/actions/purchases.ts
 *
 * Multi-line purchase creation exactly per the purchase-sale-flow skill
 * (mirrors CLAUDE.md §4.3): mixed PHONE/ACCESSORY lines, one
 * `prisma.$transaction`, sequential server-generated "PUR-0001" invoice
 * numbers, SupplierLedgerEntry + CashLedgerEntry writes.
 *
 * Cash vs credit:
 * - CASH: SupplierLedgerEntry(PURCHASE, +total) then a matching
 *   SupplierLedgerEntry(PAYMENT, -total) — net payable effect zero, logged
 *   for a clean history — backed by a real Payment row (direction PAYABLE),
 *   plus CashLedgerEntry(-total, sourceType "PURCHASE").
 * - CREDIT: dueDate = createdAt + creditDays, SupplierLedgerEntry(PURCHASE,
 *   +total) only (running payable increases). No CashLedgerEntry — no cash
 *   has moved yet.
 */

export interface PurchasePhoneLineInput {
  itemType: "PHONE";
  imei: string;
  brand: string;
  model: string;
  storage?: string | null;
  color?: string | null;
  condition: PhoneCondition;
  warrantyMonths?: number | null;
  rate: number | string; // cost per unit (this line's cost)
}

export interface PurchaseAccessoryLineInput {
  itemType: "ACCESSORY";
  name: string;
  brand: string;
  variant?: string | null;
  category: string;
  quantity: number;
  rate: number | string; // cost per unit
  /** Only used if this accessory doesn't exist yet and must be created. */
  salePrice?: number | string | null;
  lowStockThreshold?: number | null;
}

export type PurchaseLineInput = PurchasePhoneLineInput | PurchaseAccessoryLineInput;

export interface CreatePurchaseInput {
  supplierId: string;
  paymentType: PaymentType;
  /** Required (and used) only when paymentType === "CREDIT". */
  creditDays?: number | null;
  items: PurchaseLineInput[];
}

export type PurchaseWithItems = Purchase & { items: PurchaseItem[] };

export async function createPurchase(input: CreatePurchaseInput): Promise<PurchaseWithItems> {
  if (!input.items || input.items.length === 0) {
    throw new Error("Purchase must have at least one line item.");
  }

  if (input.paymentType === PaymentType.CREDIT && !input.creditDays) {
    throw new Error("creditDays is required for a CREDIT purchase.");
  }

  for (const line of input.items) {
    if (line.itemType === "ACCESSORY" && line.quantity <= 0) {
      throw new Error(`Accessory line for "${line.name}" must have quantity > 0.`);
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

  return prisma.$transaction(async (tx) => {
    const invoiceNumber = await generatePurchaseInvoiceNumber(tx);
    const now = new Date();
    const isCash = input.paymentType === PaymentType.CASH;
    const dueDate =
      !isCash && input.creditDays ? new Date(now.getTime() + input.creditDays * 86_400_000) : null;

    const purchase = await tx.purchase.create({
      data: {
        invoiceNumber,
        supplierId: input.supplierId,
        paymentType: input.paymentType,
        creditDays: isCash ? null : input.creditDays ?? null,
        dueDate,
        totalAmount,
        paidAmount: isCash ? totalAmount : new Prisma.Decimal(0),
        status: isCash ? PaymentStatus.PAID : PaymentStatus.UNPAID,
      },
    });

    for (const { line, rate, lineTotal } of computedLines) {
      if (line.itemType === "PHONE") {
        const phone = await createPhoneStock(tx, {
          imei: line.imei,
          brand: line.brand,
          model: line.model,
          storage: line.storage,
          color: line.color,
          condition: line.condition,
          warrantyMonths: line.warrantyMonths,
          costPrice: rate,
          supplierId: input.supplierId,
        });

        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            itemType: PurchaseItemType.PHONE,
            phoneId: phone.id,
            rate,
            lineTotal,
          },
        });
      } else {
        const accessory = await upsertAccessoryStock(tx, {
          name: line.name,
          brand: line.brand,
          variant: line.variant,
          category: line.category,
          quantity: line.quantity,
          costPrice: rate,
          salePrice: line.salePrice,
          lowStockThreshold: line.lowStockThreshold,
        });

        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            itemType: PurchaseItemType.ACCESSORY,
            accessoryId: accessory.id,
            quantity: line.quantity,
            rate,
            lineTotal,
          },
        });
      }
    }

    if (isCash) {
      const payment = await tx.payment.create({
        data: {
          direction: PaymentDirection.PAYABLE,
          supplierId: input.supplierId,
          purchaseId: purchase.id,
          amount: totalAmount,
          method: PaymentMethod.CASH,
          note: `Immediate cash settlement for purchase ${invoiceNumber}`,
        },
      });

      await appendSupplierLedger(tx, {
        supplierId: input.supplierId,
        purchaseId: purchase.id,
        type: "PURCHASE",
        amount: totalAmount,
        note: `Purchase ${invoiceNumber}`,
      });

      await appendSupplierLedger(tx, {
        supplierId: input.supplierId,
        purchaseId: purchase.id,
        paymentId: payment.id,
        type: "PAYMENT",
        amount: totalAmount.negated(),
        note: `Cash payment for purchase ${invoiceNumber}`,
      });

      await appendCashLedger(tx, {
        sourceType: "PURCHASE",
        sourceId: purchase.id,
        amount: totalAmount.negated(),
        note: `Purchase ${invoiceNumber}`,
      });
    } else {
      await appendSupplierLedger(tx, {
        supplierId: input.supplierId,
        purchaseId: purchase.id,
        type: "PURCHASE",
        amount: totalAmount,
        note: `Purchase ${invoiceNumber} (credit, due ${dueDate?.toISOString() ?? "n/a"})`,
      });
    }

    return tx.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
      include: { items: true },
    });
  });
}

export interface PurchaseSearchFilters {
  supplierId?: string;
  status?: PaymentStatus;
}

export async function listPurchases(filters: PurchaseSearchFilters = {}): Promise<PurchaseWithItems[]> {
  return prisma.purchase.findMany({
    where: {
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPurchaseById(id: string): Promise<PurchaseWithItems | null> {
  return prisma.purchase.findUnique({ where: { id }, include: { items: true } });
}
