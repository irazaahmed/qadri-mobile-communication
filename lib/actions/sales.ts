"use server";

import { prisma } from "@/lib/prisma";
import { appendCashLedger, appendCustomerLedger, appendBankLedger } from "@/lib/ledger";
import { markPhoneSold, decrementAccessoryStock, createUnbilledSoldPhoneStock } from "@/lib/stock";
import { generateSaleInvoiceNumber } from "@/lib/invoice";
import {
  Prisma,
  PaymentType,
  PaymentStatus,
  PurchaseItemType,
  PhoneStatus,
  PhoneCondition,
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
 *
 * Split payment (cash / bank transfer / credit, all in one sale): `paidAmount`
 * is "how much was collected right now" (cash + bank combined, same as
 * before); `bankAmount` is the slice of that which actually came in via bank
 * transfer rather than the cash drawer. The bank slice writes to
 * BankLedgerEntry instead of CashLedgerEntry (sourceType "SALE", so it's
 * traceable back to this invoice) — the two never overlap for the same
 * rupee. Whatever isn't covered by paidAmount is still the ordinary credit
 * amountDue, unaffected by how the paid portion was split.
 *
 * Unbilled phone line ("PHONE_UNBILLED"): sells a phone that was never
 * IN_STOCK — e.g. a supplier drops off units with no invoice yet and one is
 * sold same-day. Creates the Phone row (costPending: true, an admin-entered
 * estimated cost) and marks it SOLD in the very same transaction as this
 * sale, instead of requiring a separate trip through Inventory first. Shows
 * up on the same "awaiting supplier bill" list as any other estimate-priced
 * phone; reconcilePendingBillPurchase (lib/actions/purchases.ts) later
 * attaches the real invoice and corrects costPrice + this SaleItem's
 * costAtSale.
 *
 * Bulk phone line ("PHONE_BULK"): sells several identical no-IMEI IN_STOCK
 * units (same brand/model/storage/color/condition) as one cart line with a
 * single per-unit rate and a quantity, instead of one line per physical
 * unit. Fans out into `quantity` separate SaleItems server-side (phoneId is
 * unique per SaleItem — schema invariant, a PHONE line is always 1 unit),
 * each snapshotting its own phone's costAtSale individually. The specific
 * units are picked inside the transaction (oldest first), not by the
 * client, since any matching unit is fungible.
 */

export interface SalePhoneLineInput {
  itemType: "PHONE";
  phoneId: string; // must be status IN_STOCK at write time
  rate: number | string; // sale price for this unit
}

export interface SaleUnbilledPhoneLineInput {
  itemType: "PHONE_UNBILLED";
  imei?: string | null;
  brand: string;
  model: string;
  storage?: string | null;
  color?: string | null;
  condition: PhoneCondition;
  warrantyMonths?: number | null;
  supplierId?: string | null;
  estimatedCost: number | string;
  rate: number | string; // sale price for this unit
}

export interface SaleBulkPhoneLineInput {
  itemType: "PHONE_BULK";
  brand: string;
  model: string;
  storage?: string | null;
  color?: string | null;
  condition: PhoneCondition;
  quantity: number; // how many identical no-IMEI units to sell
  rate: number | string; // sale price per unit
}

export interface SaleAccessoryLineInput {
  itemType: "ACCESSORY";
  accessoryId: string;
  quantity: number;
  rate: number | string; // sale price per unit
}

export type SaleLineInput =
  | SalePhoneLineInput
  | SaleUnbilledPhoneLineInput
  | SaleBulkPhoneLineInput
  | SaleAccessoryLineInput;

export interface CreateSaleInput {
  /** Optional — a cash sale may have no customer record (walk-in). Required for CREDIT. */
  customerId?: string | null;
  paymentType: PaymentType;
  /** Required (and used) only when paymentType === "CREDIT". */
  creditDays?: number | null;
  /** Amount collected right now (cash + bank combined). For CASH this is always totalAmount; for CREDIT it may be 0. */
  paidAmount?: number | string;
  /** Slice of `paidAmount` received via bank transfer rather than the cash drawer — must be between 0 and paidAmount. Defaults to 0 (fully cash). */
  bankAmount?: number | string;
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
    if (line.itemType === "PHONE_BULK" && line.quantity <= 0) {
      throw new Error(`Bulk phone line for "${line.brand} ${line.model}" must have quantity > 0.`);
    }
    if (line.itemType === "PHONE_UNBILLED" && (!line.brand.trim() || !line.model.trim())) {
      throw new Error("Brand and model are required for an unbilled (bill-pending) phone line.");
    }
  }

  const computedLines = input.items.map((line) => {
    const rate = new Prisma.Decimal(line.rate);
    const lineTotal =
      line.itemType === "PHONE" || line.itemType === "PHONE_UNBILLED" ? rate : rate.mul(line.quantity);
    return { line, rate, lineTotal };
  });

  const totalAmount = computedLines.reduce(
    (sum, c) => sum.plus(c.lineTotal),
    new Prisma.Decimal(0)
  );

  const paidAmount = isCash ? totalAmount : new Prisma.Decimal(input.paidAmount ?? 0);

  if (!isCash) {
    if (paidAmount.isNegative()) {
      throw new Error("paidAmount cannot be negative.");
    }
    if (paidAmount.greaterThan(totalAmount)) {
      throw new Error("paidAmount cannot exceed the sale's totalAmount.");
    }
  }

  const bankAmount = new Prisma.Decimal(input.bankAmount ?? 0);
  if (bankAmount.isNegative()) {
    throw new Error("bankAmount cannot be negative.");
  }
  if (bankAmount.greaterThan(paidAmount)) {
    throw new Error("bankAmount cannot exceed paidAmount (the amount collected right now).");
  }
  const cashAmount = paidAmount.minus(bankAmount);

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
          throw new Error(`Phone ${phone.imei ?? phone.id} is not IN_STOCK (current status: ${phone.status}).`);
        }
      } else if (line.itemType === "PHONE_UNBILLED") {
        const imei = line.imei?.trim() ? line.imei.trim() : null;
        if (imei) {
          const existing = await tx.phone.findUnique({ where: { imei } });
          if (existing) {
            throw new Error(`IMEI already exists: ${imei} (already in stock as ${existing.brand} ${existing.model}).`);
          }
        }
      } else if (line.itemType === "PHONE_BULK") {
        const available = await tx.phone.count({
          where: {
            status: PhoneStatus.IN_STOCK,
            imei: null,
            brand: line.brand,
            model: line.model,
            storage: line.storage ?? null,
            color: line.color ?? null,
            condition: line.condition,
          },
        });
        if (available < line.quantity) {
          throw new Error(
            `Only ${available} unit(s) of ${line.brand} ${line.model} left in stock (need ${line.quantity}).`
          );
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

    // Advance credit auto-adjustment (credit-and-ledger skill): if this
    // customer overpaid a previous bulk settlement, their CustomerLedgerEntry
    // balance is negative — that negative amount IS their available advance
    // (recordCustomerBulkPayment). Draw it down against whatever's still due
    // on this new credit sale after `paidAmount` (today's upfront cash, if
    // any). This only changes the Sale's own paidAmount/status (so it
    // doesn't sit on the dashboard as outstanding when it's already covered)
    // — the ledger/cash entries below still use the original `paidAmount`
    // unchanged, since no new cash moves for the advance-covered portion;
    // the ledger's own cumulative balanceAfter math is what actually "uses
    // up" the advance.
    let advanceApplied = new Prisma.Decimal(0);
    if (!isCash && input.customerId) {
      const latestLedger = await tx.customerLedgerEntry.findFirst({
        where: { customerId: input.customerId },
        orderBy: { createdAt: "desc" },
      });
      const currentBalance = latestLedger?.balanceAfter ?? new Prisma.Decimal(0);
      if (currentBalance.isNegative()) {
        const advanceAvailable = currentBalance.negated();
        const stillDue = totalAmount.minus(paidAmount);
        if (stillDue.greaterThan(0)) {
          advanceApplied = Prisma.Decimal.min(advanceAvailable, stillDue);
        }
      }
    }
    const effectivePaidAmount = paidAmount.plus(advanceApplied);

    const status = isCash
      ? PaymentStatus.PAID
      : effectivePaidAmount.greaterThanOrEqualTo(totalAmount)
        ? PaymentStatus.PAID
        : effectivePaidAmount.greaterThan(0)
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
        paidAmount: effectivePaidAmount,
        status,
      },
    });

    const itemDescriptions: string[] = [];

    for (const { line, rate, lineTotal } of computedLines) {
      if (line.itemType === "PHONE") {
        const { phone, costAtSale } = await markPhoneSold(tx, line.phoneId, now, rate);
        itemDescriptions.push(`${phone.brand} ${phone.model}${phone.imei ? ` (${phone.imei})` : ""}`);

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
      } else if (line.itemType === "PHONE_UNBILLED") {
        const { phone, costAtSale } = await createUnbilledSoldPhoneStock(tx, {
          imei: line.imei,
          brand: line.brand,
          model: line.model,
          storage: line.storage,
          color: line.color,
          condition: line.condition,
          warrantyMonths: line.warrantyMonths,
          estimatedCost: line.estimatedCost,
          supplierId: line.supplierId,
          soldAt: now,
          salePrice: rate,
        });
        itemDescriptions.push(`${phone.brand} ${phone.model}${phone.imei ? ` (${phone.imei})` : ""} (bill pending)`);

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            itemType: PurchaseItemType.PHONE,
            phoneId: phone.id,
            rate,
            costAtSale,
            lineTotal,
          },
        });
      } else if (line.itemType === "PHONE_BULK") {
        const candidates = await tx.phone.findMany({
          where: {
            status: PhoneStatus.IN_STOCK,
            imei: null,
            brand: line.brand,
            model: line.model,
            storage: line.storage ?? null,
            color: line.color ?? null,
            condition: line.condition,
          },
          orderBy: { createdAt: "asc" },
          take: line.quantity,
        });
        if (candidates.length < line.quantity) {
          throw new Error(
            `Only ${candidates.length} unit(s) of ${line.brand} ${line.model} left in stock (need ${line.quantity}).`
          );
        }

        for (const candidate of candidates) {
          const { costAtSale } = await markPhoneSold(tx, candidate.id, now, rate);
          await tx.saleItem.create({
            data: {
              saleId: sale.id,
              itemType: PurchaseItemType.PHONE,
              phoneId: candidate.id,
              rate,
              costAtSale,
              lineTotal: rate,
            },
          });
        }
        itemDescriptions.push(`${line.brand} ${line.model} x${line.quantity}`);
      } else {
        const accessory = await decrementAccessoryStock(tx, line.accessoryId, line.quantity);
        itemDescriptions.push(`${accessory.name} x${line.quantity}`);

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

    // Bank-transfer portion of the amount collected right now writes
    // directly to BankLedgerEntry instead of CashLedgerEntry — see the
    // bankAmount doc comment on CreateSaleInput. Applies the same way
    // whether this is a CASH sale (fully paid) or a CREDIT sale (partly
    // paid now, rest due later).
    if (bankAmount.greaterThan(0)) {
      await appendBankLedger(tx, {
        type: "SALE",
        sourceType: "SALE",
        sourceId: sale.id,
        amount: bankAmount,
        note: `Sale ${invoiceNumber} — ${itemDescriptions.join(", ")} — Rs ${bankAmount.toString()} received via bank transfer`,
      });
    }

    if (isCash) {
      if (cashAmount.greaterThan(0)) {
        await appendCashLedger(tx, {
          sourceType: "SALE",
          sourceId: sale.id,
          amount: cashAmount,
          note: `Sale ${invoiceNumber}`,
        });
      }
    } else {
      const amountDue = totalAmount.minus(paidAmount);

      await appendCustomerLedger(tx, {
        customerId: input.customerId!,
        saleId: sale.id,
        type: "SALE",
        amount: amountDue,
        note: `Sale ${invoiceNumber} (due ${dueDate?.toISOString() ?? "n/a"})${
          advanceApplied.greaterThan(0)
            ? ` — Rs ${advanceApplied.toString()} covered by this customer's existing advance credit`
            : ""
        }`,
      });

      if (cashAmount.greaterThan(0)) {
        await appendCashLedger(tx, {
          sourceType: "SALE",
          sourceId: sale.id,
          amount: cashAmount,
          note: `Sale ${invoiceNumber} — upfront payment`,
        });
      }
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

/**
 * Deletes a wrongly-entered Sale invoice and reverses everything it did:
 * phones it sold go back to IN_STOCK (never deleted — they're real physical
 * units, just un-sold), accessory quantity it took out is added back, and
 * the customer/cash ledger effect it logged is reversed via a new
 * offsetting entry (never by editing history).
 *
 * Blocked entirely if any Payment has been recorded against this sale
 * (delete those first via `deletePayment`), or if any of its phones is no
 * longer SOLD — meaning a claim is in progress on it, which must be
 * resolved or deleted first.
 */
export async function deleteSale(saleId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });
    if (!sale) {
      throw new Error("Sale not found.");
    }

    const paymentCount = await tx.payment.count({ where: { saleId } });
    if (paymentCount > 0) {
      throw new Error(`${sale.invoiceNumber} has payments recorded against it — delete those payments first.`);
    }

    for (const item of sale.items) {
      if (item.itemType === "PHONE" && item.phoneId) {
        const phone = await tx.phone.findUniqueOrThrow({ where: { id: item.phoneId } });
        if (phone.status !== PhoneStatus.SOLD) {
          throw new Error(
            `Can't delete ${sale.invoiceNumber} — a phone from it (${phone.imei ?? phone.model}) has an active claim (status: ${phone.status}). Resolve or delete that claim first.`
          );
        }
      }
    }

    // Reverse stock effects.
    for (const item of sale.items) {
      if (item.itemType === "PHONE" && item.phoneId) {
        await tx.phone.update({
          where: { id: item.phoneId },
          data: { status: PhoneStatus.IN_STOCK, soldAt: null, warrantyStartDate: null, salePrice: null },
        });
      } else if (item.itemType === "ACCESSORY" && item.accessoryId && item.quantity) {
        await tx.accessory.update({
          where: { id: item.accessoryId },
          data: { quantity: { increment: item.quantity } },
        });
      }
    }

    await tx.saleItem.deleteMany({ where: { saleId } });

    // Reverse the money side with offsetting entries — never by touching
    // historical rows, so every balanceAfter chain before this point stays
    // correct. Reverse exactly what was actually logged at creation (looked
    // up by sourceId/saleId), not a recomputation from sale.paidAmount/
    // totalAmount — those can now diverge from what was really logged,
    // since advance-credit auto-adjustment can inflate sale.paidAmount
    // without a new CashLedgerEntry, and a bank-transfer split means the
    // "paid" amount may be spread across CashLedgerEntry and
    // BankLedgerEntry rather than sitting entirely in one. The
    // payment-count guard above guarantees these are still exactly the
    // entries createSale itself wrote, since any later Payment would have
    // blocked this delete already.
    if (sale.customerId) {
      const originalSaleEntry = await tx.customerLedgerEntry.findFirst({
        where: { saleId: sale.id, type: "SALE" },
      });
      const amountToReverse = originalSaleEntry?.amount ?? sale.totalAmount.minus(sale.paidAmount);
      await appendCustomerLedger(tx, {
        customerId: sale.customerId,
        type: "VOID",
        amount: amountToReverse.negated(),
        note: `Deleted sale ${sale.invoiceNumber}`,
      });
    }

    const originalCashEntry = await tx.cashLedgerEntry.findFirst({
      where: { sourceType: "SALE", sourceId: sale.id },
    });
    if (originalCashEntry && originalCashEntry.amount.greaterThan(0)) {
      await appendCashLedger(tx, {
        sourceType: "SALE",
        sourceId: sale.id,
        amount: originalCashEntry.amount.negated(),
        note: `Deleted sale ${sale.invoiceNumber}`,
      });
    }

    const originalBankEntry = await tx.bankLedgerEntry.findFirst({
      where: { sourceType: "SALE", sourceId: sale.id },
    });
    if (originalBankEntry) {
      await appendBankLedger(tx, {
        type: "SALE",
        sourceType: "SALE",
        sourceId: sale.id,
        amount: originalBankEntry.amount.negated(),
        note: `Deleted sale ${sale.invoiceNumber} — reversing bank transfer`,
      });
    }

    await tx.sale.delete({ where: { id: saleId } });
  });
}
