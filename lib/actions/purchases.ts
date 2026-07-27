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
 * Supplier is optional — a cash purchase may have no supplier record (e.g.
 * a one-off street purchase). Required for CREDIT, since a payable balance
 * must be tracked against somebody.
 *
 * Cash vs credit:
 * - CASH: if a supplier was picked, SupplierLedgerEntry(PURCHASE, +total)
 *   then a matching SupplierLedgerEntry(PAYMENT, -total) — net payable
 *   effect zero, logged for a clean history — backed by a real Payment row
 *   (direction PAYABLE). If no supplier, skip both ledger entries and the
 *   Payment row (nothing to track them against). Either way,
 *   CashLedgerEntry(-total, sourceType "PURCHASE") always fires — cash left
 *   the shop regardless of whether a supplier was named.
 * - CREDIT: requires a supplierId. dueDate = createdAt + creditDays,
 *   SupplierLedgerEntry(PURCHASE, +total) only (running payable increases).
 *   No CashLedgerEntry — no cash has moved yet.
 */

export interface PurchasePhoneLineInput {
  itemType: "PHONE";
  /** Optional — leave blank to bulk-add `quantity` identical units with no per-piece IMEI. */
  imei?: string | null;
  brand: string;
  model: string;
  storage?: string | null;
  color?: string | null;
  condition: PhoneCondition;
  warrantyMonths?: number | null;
  rate: number | string; // cost per unit (this line's cost)
  /** Bulk-add count for identical units. Ignored (forced to 1) when `imei` is set. Defaults to 1. */
  quantity?: number;
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
  /** Optional — a cash purchase may have no supplier record. Required for CREDIT. */
  supplierId?: string | null;
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

  if (input.paymentType === PaymentType.CREDIT) {
    if (!input.creditDays) {
      throw new Error("creditDays is required for a CREDIT purchase.");
    }
    if (!input.supplierId) {
      throw new Error("supplierId is required for a CREDIT purchase (payable must be tracked against a supplier).");
    }
  }

  for (const line of input.items) {
    if (line.itemType === "ACCESSORY" && line.quantity <= 0) {
      throw new Error(`Accessory line for "${line.name}" must have quantity > 0.`);
    }
    if (line.itemType === "PHONE") {
      const imei = line.imei?.trim() ? line.imei.trim() : null;
      const quantity = line.quantity && line.quantity > 0 ? Math.floor(line.quantity) : 1;
      if (imei && quantity > 1) {
        throw new Error(
          `Phone line for "${line.brand} ${line.model}" has a specific IMEI — quantity must be 1. Leave IMEI blank to bulk-add.`
        );
      }
    }
  }

  const computedLines = input.items.map((line) => {
    const rate = new Prisma.Decimal(line.rate);
    if (line.itemType === "PHONE") {
      const quantity = line.quantity && line.quantity > 0 ? Math.floor(line.quantity) : 1;
      return { line, rate, lineTotal: rate.mul(quantity), quantity };
    }
    return { line, rate, lineTotal: rate.mul(line.quantity), quantity: line.quantity };
  });

  const totalAmount = computedLines.reduce(
    (sum, c) => sum.plus(c.lineTotal),
    new Prisma.Decimal(0)
  );

  return prisma.$transaction(async (tx) => {
    const invoiceNumber = await generatePurchaseInvoiceNumber(tx);
    const now = new Date();
    const isCash = input.paymentType === PaymentType.CASH;
    const supplierId = input.supplierId || null;
    const dueDate =
      !isCash && input.creditDays ? new Date(now.getTime() + input.creditDays * 86_400_000) : null;

    const purchase = await tx.purchase.create({
      data: {
        invoiceNumber,
        supplierId: supplierId ?? undefined,
        paymentType: input.paymentType,
        creditDays: isCash ? null : input.creditDays ?? null,
        dueDate,
        totalAmount,
        paidAmount: isCash ? totalAmount : new Prisma.Decimal(0),
        status: isCash ? PaymentStatus.PAID : PaymentStatus.UNPAID,
      },
    });

    for (const { line, rate, lineTotal, quantity } of computedLines) {
      if (line.itemType === "PHONE") {
        // A phone PurchaseItem always represents exactly one physical unit
        // (schema invariant — quantity is PHONE-line-only, for bulk entry
        // convenience) so a bulk line fans out into `quantity` separate
        // Phone + PurchaseItem pairs, each with imei: null.
        const imei = line.imei?.trim() ? line.imei.trim() : null;
        for (let i = 0; i < quantity; i++) {
          const phone = await createPhoneStock(tx, {
            imei: quantity === 1 ? imei : null,
            brand: line.brand,
            model: line.model,
            storage: line.storage,
            color: line.color,
            condition: line.condition,
            warrantyMonths: line.warrantyMonths,
            costPrice: rate,
            supplierId,
          });

          await tx.purchaseItem.create({
            data: {
              purchaseId: purchase.id,
              itemType: PurchaseItemType.PHONE,
              phoneId: phone.id,
              rate,
              lineTotal: rate,
            },
          });
        }
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
      if (supplierId) {
        const payment = await tx.payment.create({
          data: {
            direction: PaymentDirection.PAYABLE,
            supplierId,
            purchaseId: purchase.id,
            amount: totalAmount,
            method: PaymentMethod.CASH,
            note: `Immediate cash settlement for purchase ${invoiceNumber}`,
          },
        });

        await appendSupplierLedger(tx, {
          supplierId,
          purchaseId: purchase.id,
          type: "PURCHASE",
          amount: totalAmount,
          note: `Purchase ${invoiceNumber}`,
        });

        await appendSupplierLedger(tx, {
          supplierId,
          purchaseId: purchase.id,
          paymentId: payment.id,
          type: "PAYMENT",
          amount: totalAmount.negated(),
          note: `Cash payment for purchase ${invoiceNumber}`,
        });
      }

      await appendCashLedger(tx, {
        sourceType: "PURCHASE",
        sourceId: purchase.id,
        amount: totalAmount.negated(),
        note: `Purchase ${invoiceNumber}`,
      });
    } else {
      // Validated above: CREDIT always has a supplierId.
      await appendSupplierLedger(tx, {
        supplierId: supplierId!,
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
