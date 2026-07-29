"use server";

import { prisma } from "@/lib/prisma";
import { Prisma, PhoneCondition, PhoneStatus, type Phone } from "@prisma/client";
import { computeWarrantyStatus, type WarrantyStatus } from "@/lib/warranty";

/**
 * lib/actions/phones.ts
 *
 * Phone inventory server actions. Per the phone-inventory skill:
 * - Each phone is its own row, unique on `imei`, never aggregated.
 * - `status` is NEVER touched by these actions — only the sale action
 *   (IN_STOCK -> SOLD) and claim actions (SOLD onward) may change it.
 * - Warranty status is computed at read time, never stored — see
 *   lib/warranty.ts (kept out of this "use server" file since it's a plain
 *   synchronous helper, and a "use server" file may only export async
 *   functions).
 *
 * Note: the primary path for phones entering stock is `createPurchase`
 * (lib/actions/purchases.ts), which creates the Phone row + PurchaseItem +
 * supplier ledger inside one transaction. `createPhone` here is a plain,
 * lower-level create for cases outside an invoiced purchase (e.g. manual
 * stock corrections) — it is NOT a cash event and never should be, per the
 * skill note "adding a phone to stock is NOT a cash event by itself".
 */

export type PhoneWithWarranty = Phone & { warrantyStatus: WarrantyStatus };

function withWarranty(phone: Phone): PhoneWithWarranty {
  return { ...phone, warrantyStatus: computeWarrantyStatus(phone) };
}

export interface CreatePhoneInput {
  imei?: string | null;
  brand: string;
  model: string;
  storage?: string | null;
  color?: string | null;
  condition: PhoneCondition;
  warrantyMonths?: number | null;
  costPrice: number | string;
  supplierId?: string | null;
  /** Bulk-add count for identical units with no per-piece IMEI. Ignored (forced to 1) when `imei` is set. */
  quantity?: number;
  /** True when costPrice is only a rough estimate because the supplier's bill hasn't arrived yet. */
  costPending?: boolean;
}

export interface CreatePhoneResult {
  count: number;
  /** Only present when exactly one unit was created (the IMEI-tracked path). */
  phone?: PhoneWithWarranty;
}

/**
 * Creates one or more Phone rows. IMEI is optional: leave it blank to
 * bulk-add `quantity` identical units (same brand/model/cost/etc, each its
 * own row with `imei: null`) — Postgres allows multiple NULLs under a
 * unique index, so this doesn't collide with the IMEI uniqueness constraint.
 * A specific IMEI always means exactly one physical unit, so `quantity` is
 * rejected in that case rather than silently ignored.
 */
export async function createPhone(input: CreatePhoneInput): Promise<CreatePhoneResult> {
  const imei = input.imei?.trim() ? input.imei.trim() : null;
  const quantity = input.quantity && input.quantity > 0 ? Math.floor(input.quantity) : 1;

  if (imei && quantity > 1) {
    throw new Error("Enter a specific IMEI per unit, or leave IMEI blank to bulk-add multiple units.");
  }

  if (imei) {
    const existing = await prisma.phone.findUnique({ where: { imei } });
    if (existing) {
      throw new Error(`IMEI already exists: ${imei}`);
    }
  }

  const baseData = {
    brand: input.brand,
    model: input.model,
    storage: input.storage ?? null,
    color: input.color ?? null,
    condition: input.condition,
    warrantyMonths: input.warrantyMonths ?? null,
    costPrice: new Prisma.Decimal(input.costPrice),
    supplierId: input.supplierId ?? null,
    status: PhoneStatus.IN_STOCK,
    costPending: input.costPending ?? false,
  };

  if (quantity === 1) {
    const phone = await prisma.phone.create({ data: { ...baseData, imei } });
    return { count: 1, phone: withWarranty(phone) };
  }

  await prisma.phone.createMany({
    data: Array.from({ length: quantity }, () => ({ ...baseData, imei: null })),
  });

  return { count: quantity };
}

export interface PhoneSearchFilters {
  imei?: string;
  brand?: string;
  model?: string;
  status?: PhoneStatus;
}

export async function listPhones(filters: PhoneSearchFilters = {}): Promise<PhoneWithWarranty[]> {
  const phones = await prisma.phone.findMany({
    where: {
      ...(filters.imei ? { imei: { contains: filters.imei, mode: "insensitive" } } : {}),
      ...(filters.brand ? { brand: { contains: filters.brand, mode: "insensitive" } } : {}),
      ...(filters.model ? { model: { contains: filters.model, mode: "insensitive" } } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return phones.map(withWarranty);
}

export async function getPhoneById(id: string): Promise<PhoneWithWarranty | null> {
  const phone = await prisma.phone.findUnique({ where: { id } });
  return phone ? withWarranty(phone) : null;
}

export async function getPhoneByImei(imei: string): Promise<PhoneWithWarranty | null> {
  const phone = await prisma.phone.findUnique({ where: { imei } });
  return phone ? withWarranty(phone) : null;
}

export interface UpdatePhoneInput {
  imei?: string | null;
  brand?: string;
  model?: string;
  storage?: string | null;
  color?: string | null;
  condition?: PhoneCondition;
  warrantyMonths?: number | null;
  costPrice?: number | string;
  supplierId?: string | null;
  /**
   * Plain manual toggle for correcting a mistaken entry — flips the flag
   * only. Does NOT touch any already-snapshotted SaleItem.costAtSale; the
   * only path that corrects costAtSale is reconcilePendingBillPurchase
   * (lib/actions/purchases.ts), which also creates the real Purchase/bill.
   */
  costPending?: boolean;
}

/**
 * Updates phone specs, including IMEI (now editable — e.g. to fill in the
 * IMEI on a bulk-added unit later). Never touches `status`, `soldAt`, or
 * `warrantyStartDate` — those are owned by the sale/claim actions (status
 * machine).
 */
export async function updatePhone(id: string, input: UpdatePhoneInput): Promise<PhoneWithWarranty> {
  let imei: string | null | undefined = undefined;
  if (input.imei !== undefined) {
    imei = input.imei?.trim() ? input.imei.trim() : null;
    if (imei) {
      const existing = await prisma.phone.findUnique({ where: { imei } });
      if (existing && existing.id !== id) {
        throw new Error(`IMEI already exists: ${imei} (already in stock as ${existing.brand} ${existing.model}).`);
      }
    }
  }

  const phone = await prisma.phone.update({
    where: { id },
    data: {
      ...(imei !== undefined ? { imei } : {}),
      ...(input.brand !== undefined ? { brand: input.brand } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.storage !== undefined ? { storage: input.storage } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.condition !== undefined ? { condition: input.condition } : {}),
      ...(input.warrantyMonths !== undefined ? { warrantyMonths: input.warrantyMonths } : {}),
      ...(input.costPrice !== undefined ? { costPrice: new Prisma.Decimal(input.costPrice) } : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      ...(input.costPending !== undefined ? { costPending: input.costPending } : {}),
    },
  });

  return withWarranty(phone);
}

export interface PhoneStockSummary {
  count: number;
  totalCostValue: string;
}

/** Current in-stock phone count + total cost value (investment), for the inventory tab header. */
export async function getPhoneStockSummary(): Promise<PhoneStockSummary> {
  const phones = await prisma.phone.findMany({
    where: { status: PhoneStatus.IN_STOCK },
    select: { costPrice: true },
  });

  const total = phones.reduce((sum, p) => sum.plus(p.costPrice), new Prisma.Decimal(0));
  return { count: phones.length, totalCostValue: total.toString() };
}

/**
 * Phones whose cost is still a rough estimate (supplier bill hasn't arrived
 * yet) — includes both IN_STOCK and already-SOLD units, since a phone can be
 * sold before its bill shows up. Oldest first, matching the order the actual
 * bill is likely to reconcile them in. Feeds the "Reconcile bill" picker.
 */
export async function listPendingBillPhones(): Promise<PhoneWithWarranty[]> {
  const phones = await prisma.phone.findMany({
    where: { costPending: true },
    orderBy: { createdAt: "asc" },
  });

  return phones.map(withWarranty);
}

export async function getPendingBillCount(): Promise<number> {
  return prisma.phone.count({ where: { costPending: true } });
}

/** Distinct brands present in phone inventory, for the brand quick-filter buttons. */
export async function getPhoneBrands(): Promise<string[]> {
  const rows = await prisma.phone.findMany({
    distinct: ["brand"],
    select: { brand: true },
    orderBy: { brand: "asc" },
  });

  return rows.map((r) => r.brand);
}

/**
 * Deletes a phone that was added by mistake via manual stock entry. Never a
 * cash/ledger event (matching createPhone's own note that adding a phone to
 * stock isn't one), so nothing to reverse there — but only safe to delete
 * outright if it's still IN_STOCK and was never part of an invoiced
 * Purchase (those have their own `deletePurchase`, which also reverses the
 * supplier ledger/cash effect this path never created).
 */
export async function deletePhone(id: string): Promise<void> {
  const phone = await prisma.phone.findUnique({
    where: { id },
    include: { purchaseItem: true },
  });
  if (!phone) {
    throw new Error("Phone not found.");
  }
  if (phone.status !== PhoneStatus.IN_STOCK) {
    throw new Error(`Only an in-stock phone can be deleted (current status: ${phone.status}).`);
  }
  if (phone.purchaseItem) {
    throw new Error("This phone was added via a Purchase invoice — delete that purchase instead.");
  }

  await prisma.phone.delete({ where: { id } });
}

/** Whether `deletePhone` would currently succeed for this phone — for the Edit page to decide whether to show the option. */
export async function canDeletePhone(id: string): Promise<boolean> {
  const phone = await prisma.phone.findUnique({
    where: { id },
    include: { purchaseItem: true },
  });
  if (!phone) return false;
  return phone.status === PhoneStatus.IN_STOCK && !phone.purchaseItem;
}
