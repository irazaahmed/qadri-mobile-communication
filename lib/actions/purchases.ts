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
  PhoneStatus,
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

    // Advance credit auto-adjustment (credit-and-ledger skill): if we
    // overpaid this supplier on a previous bulk settlement, their
    // SupplierLedgerEntry balance is negative — that negative amount IS our
    // available advance with them (recordSupplierBulkPayment). Draw it down
    // against this new CREDIT purchase's total. Only affects the Purchase's
    // own paidAmount/status (so it doesn't sit as outstanding payable when
    // it's already covered) — the SupplierLedgerEntry below still logs the
    // full totalAmount unchanged, since no new cash moves here; the ledger's
    // own cumulative balanceAfter math is what actually "uses up" the
    // advance.
    let advanceApplied = new Prisma.Decimal(0);
    if (!isCash && supplierId) {
      const latestLedger = await tx.supplierLedgerEntry.findFirst({
        where: { supplierId },
        orderBy: { createdAt: "desc" },
      });
      const currentBalance = latestLedger?.balanceAfter ?? new Prisma.Decimal(0);
      if (currentBalance.isNegative()) {
        advanceApplied = Prisma.Decimal.min(currentBalance.negated(), totalAmount);
      }
    }
    const effectivePaidAmount = isCash ? totalAmount : advanceApplied;

    const purchase = await tx.purchase.create({
      data: {
        invoiceNumber,
        supplierId: supplierId ?? undefined,
        paymentType: input.paymentType,
        creditDays: isCash ? null : input.creditDays ?? null,
        dueDate,
        totalAmount,
        paidAmount: effectivePaidAmount,
        status: isCash
          ? PaymentStatus.PAID
          : effectivePaidAmount.greaterThanOrEqualTo(totalAmount)
            ? PaymentStatus.PAID
            : effectivePaidAmount.greaterThan(0)
              ? PaymentStatus.PARTIAL
              : PaymentStatus.UNPAID,
      },
    });

    // Set to true the moment any PHONE line below reuses an existing
    // costPending phone instead of creating a fresh row — see the
    // "auto-reconcile" block just below. Applied to the whole purchase after
    // the loop (isReconciliation), same flag reconcilePendingBillPurchase
    // uses, since deletePurchase's normal reversal (hard-delete every phone
    // this invoice touched) would otherwise erase a real phone that existed
    // — and was possibly already sold — before this purchase arrived.
    let touchedPendingPhone = false;

    for (const { line, rate, lineTotal, quantity } of computedLines) {
      if (line.itemType === "PHONE") {
        // A phone PurchaseItem always represents exactly one physical unit
        // (schema invariant — quantity is PHONE-line-only, for bulk entry
        // convenience) so a bulk line fans out into `quantity` separate
        // Phone + PurchaseItem pairs, each with imei: null.
        const imei = line.imei?.trim() ? line.imei.trim() : null;

        // Auto-reconcile: this batch may be the real bill for a phone that
        // was already sold (or is still sitting in stock) on an estimated
        // cost — see the "sell it before the bill arrives" (costPending)
        // flow. Rather than adding a brand-new duplicate unit for every
        // piece in this line, first soak up any matching costPending phones
        // (same brand/model/condition, oldest first, up to this line's
        // quantity): reuse the real phone row, correct its cost, clear
        // costPending, and correct its SaleItem snapshot if it was already
        // sold — exactly what reconcilePendingBillPurchase does, just
        // triggered automatically instead of requiring a separate manual
        // trip. Only the remaining (quantity - matched) pieces get brand-new
        // Phone rows.
        const pendingMatches =
          imei && quantity === 1
            ? await tx.phone.findMany({
                where: { imei, costPending: true, purchaseItem: null },
                include: { saleItem: true },
              })
            : await tx.phone.findMany({
                where: {
                  costPending: true,
                  purchaseItem: null,
                  brand: line.brand,
                  model: line.model,
                  condition: line.condition,
                },
                include: { saleItem: true },
                orderBy: { createdAt: "asc" },
                take: quantity,
              });

        for (const pending of pendingMatches) {
          touchedPendingPhone = true;

          await tx.phone.update({
            where: { id: pending.id },
            data: { costPrice: rate, costPending: false, ...(supplierId ? { supplierId } : {}) },
          });

          if (pending.saleItem) {
            await tx.saleItem.update({ where: { id: pending.saleItem.id }, data: { costAtSale: rate } });
          }

          await tx.purchaseItem.create({
            data: {
              purchaseId: purchase.id,
              itemType: PurchaseItemType.PHONE,
              phoneId: pending.id,
              rate,
              lineTotal: rate,
            },
          });
        }

        const newUnitsNeeded = quantity - pendingMatches.length;
        for (let i = 0; i < newUnitsNeeded; i++) {
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

    if (touchedPendingPhone) {
      await tx.purchase.update({ where: { id: purchase.id }, data: { isReconciliation: true } });
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
        note: `Purchase ${invoiceNumber} (credit, due ${dueDate?.toISOString() ?? "n/a"})${
          advanceApplied.greaterThan(0)
            ? ` — Rs ${advanceApplied.toString()} covered by our existing advance credit with this supplier`
            : ""
        }`,
      });
    }

    return tx.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
      include: { items: true },
    });
  });
}

export interface ReconcilePendingBillLineInput {
  phoneId: string;
  /** The actual per-unit cost from the supplier's real bill. */
  rate: number | string;
}

export interface ReconcilePendingBillInput {
  /** Always required — a real bill always names a specific company, unlike a cash purchase which may not. */
  supplierId: string;
  paymentType: PaymentType;
  /** Required (and used) only when paymentType === "CREDIT". */
  creditDays?: number | null;
  phones: ReconcilePendingBillLineInput[];
}

/**
 * Records the supplier's actual bill for phone(s) that were already added to
 * stock (and possibly already sold) on an estimated cost, because the real
 * invoice arrived days later than the phone itself. Unlike createPurchase,
 * this never creates a new Phone row — it attaches a real Purchase/PurchaseItem
 * to phones that already exist, corrects their costPrice to the real rate,
 * clears costPending, and — this is the one deliberate exception to "never
 * recompute historical profit from current cost" — corrects the SaleItem
 * snapshot too if the phone was already sold on the estimate, so profit
 * reports reflect the true number once the bill is known.
 */
export async function reconcilePendingBillPurchase(input: ReconcilePendingBillInput): Promise<PurchaseWithItems> {
  if (!input.supplierId) {
    throw new Error("Supplier is required — a bill always comes from a specific company.");
  }
  if (!input.phones || input.phones.length === 0) {
    throw new Error("Select at least one pending-bill phone to reconcile.");
  }
  if (input.paymentType === PaymentType.CREDIT && !input.creditDays) {
    throw new Error("creditDays is required for a CREDIT bill.");
  }

  const computed = input.phones.map((p) => ({ phoneId: p.phoneId, rate: new Prisma.Decimal(p.rate) }));
  const totalAmount = computed.reduce((sum, c) => sum.plus(c.rate), new Prisma.Decimal(0));

  return prisma.$transaction(async (tx) => {
    const invoiceNumber = await generatePurchaseInvoiceNumber(tx);
    const now = new Date();
    const isCash = input.paymentType === PaymentType.CASH;
    const dueDate = !isCash && input.creditDays ? new Date(now.getTime() + input.creditDays * 86_400_000) : null;

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
        isReconciliation: true,
      },
    });

    for (const { phoneId, rate } of computed) {
      const phone = await tx.phone.findUnique({
        where: { id: phoneId },
        include: { purchaseItem: true, saleItem: true },
      });
      if (!phone) {
        throw new Error(`Phone ${phoneId} not found.`);
      }
      if (!phone.costPending) {
        throw new Error(`${phone.brand} ${phone.model} (${phone.imei ?? "no IMEI"}) isn't marked as awaiting a bill.`);
      }
      if (phone.purchaseItem) {
        throw new Error(`${phone.brand} ${phone.model} already has a purchase invoice linked — can't reconcile it again.`);
      }

      await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          itemType: PurchaseItemType.PHONE,
          phoneId,
          rate,
          lineTotal: rate,
        },
      });

      await tx.phone.update({
        where: { id: phoneId },
        data: { costPrice: rate, costPending: false, supplierId: input.supplierId },
      });

      if (phone.saleItem) {
        await tx.saleItem.update({ where: { id: phone.saleItem.id }, data: { costAtSale: rate } });
      }
    }

    // Ledger — mirrors createPurchase's CASH/CREDIT branches. Supplier is
    // always present here (validated above), unlike a plain cash purchase.
    if (isCash) {
      const payment = await tx.payment.create({
        data: {
          direction: PaymentDirection.PAYABLE,
          supplierId: input.supplierId,
          purchaseId: purchase.id,
          amount: totalAmount,
          method: PaymentMethod.CASH,
          note: `Immediate cash settlement for bill reconciliation ${invoiceNumber}`,
        },
      });

      await appendSupplierLedger(tx, {
        supplierId: input.supplierId,
        purchaseId: purchase.id,
        type: "PURCHASE",
        amount: totalAmount,
        note: `Bill reconciliation ${invoiceNumber}`,
      });

      await appendSupplierLedger(tx, {
        supplierId: input.supplierId,
        purchaseId: purchase.id,
        paymentId: payment.id,
        type: "PAYMENT",
        amount: totalAmount.negated(),
        note: `Cash payment for bill reconciliation ${invoiceNumber}`,
      });

      await appendCashLedger(tx, {
        sourceType: "PURCHASE",
        sourceId: purchase.id,
        amount: totalAmount.negated(),
        note: `Bill reconciliation ${invoiceNumber}`,
      });
    } else {
      await appendSupplierLedger(tx, {
        supplierId: input.supplierId,
        purchaseId: purchase.id,
        type: "PURCHASE",
        amount: totalAmount,
        note: `Bill reconciliation ${invoiceNumber} (credit, due ${dueDate?.toISOString() ?? "n/a"})`,
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

/**
 * Deletes a wrongly-entered Purchase invoice and reverses everything it did:
 * phones it added to stock (if still IN_STOCK — deleted outright, they never
 * had independent history), accessory quantity it added (decremented back —
 * blocked if some has already been sold elsewhere, since that stock is no
 * longer this invoice's to take back), and the supplier/cash ledger effect
 * it logged (reversed via a new offsetting entry, never by editing history,
 * so every other supplier's/day's running balance stays intact).
 *
 * Blocked entirely if any Payment has been recorded against this purchase —
 * those must be deleted first (`deletePayment`) so the payable balance this
 * invoice contributed is fully and correctly unwound before the invoice
 * itself disappears.
 */
export async function deletePurchase(purchaseId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({
      where: { id: purchaseId },
      include: { items: true },
    });
    if (!purchase) {
      throw new Error("Purchase not found.");
    }
    if (purchase.isReconciliation) {
      throw new Error(
        `${purchase.invoiceNumber} is a bill-reconciliation purchase for phones that already existed in stock — deleting it isn't supported, since the normal reversal would hard-delete those real phone records. If a rate was entered wrong, correct the phone's cost directly on its Edit page instead.`
      );
    }

    const paymentCount = await tx.payment.count({ where: { purchaseId } });
    if (paymentCount > 0) {
      throw new Error(
        `${purchase.invoiceNumber} has payments recorded against it — delete those payments first.`
      );
    }

    const phoneIds: string[] = [];
    for (const item of purchase.items) {
      if (item.itemType === "PHONE" && item.phoneId) {
        const phone = await tx.phone.findUniqueOrThrow({ where: { id: item.phoneId } });
        if (phone.status !== PhoneStatus.IN_STOCK) {
          throw new Error(
            `Can't delete ${purchase.invoiceNumber} — a phone from it (${phone.imei ?? phone.model}) is no longer in stock (status: ${phone.status}). Undo that sale/claim first.`
          );
        }
        phoneIds.push(phone.id);
      } else if (item.itemType === "ACCESSORY" && item.accessoryId && item.quantity) {
        const accessory = await tx.accessory.findUniqueOrThrow({ where: { id: item.accessoryId } });
        if (accessory.quantity < item.quantity) {
          throw new Error(
            `Can't delete ${purchase.invoiceNumber} — only ${accessory.quantity} of "${accessory.name}" remain in stock, but this invoice added ${item.quantity} (some has already been sold elsewhere).`
          );
        }
      }
    }

    // Reverse stock effects.
    await tx.purchaseItem.deleteMany({ where: { purchaseId } });
    if (phoneIds.length > 0) {
      await tx.phone.deleteMany({ where: { id: { in: phoneIds } } });
    }
    for (const item of purchase.items) {
      if (item.itemType === "ACCESSORY" && item.accessoryId && item.quantity) {
        await tx.accessory.update({
          where: { id: item.accessoryId },
          data: { quantity: { decrement: item.quantity } },
        });
      }
    }

    // Reverse the money side with offsetting entries — never by touching
    // historical rows, so every balanceAfter chain before this point stays
    // correct.
    if (purchase.supplierId) {
      if (purchase.paymentType === PaymentType.CREDIT) {
        await appendSupplierLedger(tx, {
          supplierId: purchase.supplierId,
          type: "VOID",
          amount: purchase.totalAmount.negated(),
          note: `Deleted purchase ${purchase.invoiceNumber}`,
        });
      }
      // CASH purchases with a supplier already net to zero on the supplier
      // ledger (matching PURCHASE/PAYMENT pair) — nothing to reverse there.
    }

    if (purchase.paymentType === PaymentType.CASH) {
      await appendCashLedger(tx, {
        sourceType: "PURCHASE",
        sourceId: purchase.id,
        amount: purchase.totalAmount,
        note: `Deleted purchase ${purchase.invoiceNumber}`,
      });
    }

    await tx.purchase.delete({ where: { id: purchaseId } });
  });
}
