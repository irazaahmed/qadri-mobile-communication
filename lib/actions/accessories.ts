"use server";

import { prisma } from "@/lib/prisma";
import { Prisma, type Accessory } from "@prisma/client";
import { upsertAccessoryStock } from "@/lib/stock";

/**
 * lib/actions/accessories.ts
 *
 * Accessory inventory server actions. Per the accessory-inventory skill:
 * - Aggregate quantity stock, matched on (name, brand, variant).
 * - Restocking (via a purchase) increments quantity and refreshes costPrice
 *   to the latest rate — see `restockAccessory` / `lib/stock.ts`.
 * - The plain `updateAccessory` edit action changes price/specs and never
 *   touches `quantity` unless the admin explicitly passes a manual
 *   quantity correction.
 */

export interface CreateAccessoryInput {
  name: string;
  brand: string;
  category: string;
  variant?: string | null;
  costPrice: number | string;
  salePrice: number | string;
  quantity?: number; // initial quantity, defaults to 0 (manual creation, not a restock)
  lowStockThreshold?: number | null;
}

export async function createAccessory(input: CreateAccessoryInput): Promise<Accessory> {
  // "" is the canonical "no variant" value — see lib/stock.ts for why this
  // is used instead of `null` (Prisma compound-unique + SQL NULL-equality).
  const variant = input.variant?.trim() ? input.variant.trim() : "";

  const existing = await prisma.accessory.findUnique({
    where: { name_brand_variant: { name: input.name, brand: input.brand, variant } },
  });

  if (existing) {
    throw new Error(
      `Accessory already exists for (name=${input.name}, brand=${input.brand}, variant=${variant || "none"}). Use restockAccessory or updateAccessory instead.`
    );
  }

  return prisma.accessory.create({
    data: {
      name: input.name,
      brand: input.brand,
      category: input.category,
      variant,
      costPrice: new Prisma.Decimal(input.costPrice),
      salePrice: new Prisma.Decimal(input.salePrice),
      quantity: input.quantity ?? 0,
      lowStockThreshold: input.lowStockThreshold ?? null,
    },
  });
}

export interface AccessorySearchFilters {
  name?: string;
  brand?: string;
  category?: string;
  lowStockOnly?: boolean;
}

export async function listAccessories(filters: AccessorySearchFilters = {}): Promise<Accessory[]> {
  const accessories = await prisma.accessory.findMany({
    where: {
      ...(filters.name ? { name: { contains: filters.name, mode: "insensitive" } } : {}),
      ...(filters.brand ? { brand: { contains: filters.brand, mode: "insensitive" } } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    },
    orderBy: { name: "asc" },
  });

  if (!filters.lowStockOnly) {
    return accessories;
  }

  // lowStockThreshold comparison computed at query time, never stored.
  return accessories.filter(
    (a) => a.lowStockThreshold !== null && a.quantity <= a.lowStockThreshold
  );
}

export async function getAccessoryById(id: string): Promise<Accessory | null> {
  return prisma.accessory.findUnique({ where: { id } });
}

export interface UpdateAccessoryInput {
  category?: string;
  salePrice?: number | string;
  lowStockThreshold?: number | null;
  /**
   * Manual stock correction only — set explicitly by the admin, never as a
   * side effect of a purchase/sale. Omit this field for a normal price/spec
   * edit.
   */
  quantity?: number;
}

/**
 * Edits accessory price/specs. Does NOT touch `quantity` unless the caller
 * explicitly passes it (a manual stock correction, not a purchase/sale).
 */
export async function updateAccessory(id: string, input: UpdateAccessoryInput): Promise<Accessory> {
  return prisma.accessory.update({
    where: { id },
    data: {
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.salePrice !== undefined ? { salePrice: new Prisma.Decimal(input.salePrice) } : {}),
      ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: input.lowStockThreshold } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
    },
  });
}

export interface RestockAccessoryInput {
  name: string;
  brand: string;
  variant?: string | null;
  category: string;
  quantity: number;
  costPrice: number | string;
  salePrice?: number | string | null;
  lowStockThreshold?: number | null;
}

/**
 * Standalone restock outside of a full multi-line purchase invoice (rare —
 * normal restocking happens inside `createPurchase`). Runs the same
 * upsert-on-(name,brand,variant) rule in its own transaction. NOT a cash
 * event by itself, matching the skill's note that stock changes and cash
 * effects are independent (cash moves at the Purchase header level).
 */
export async function restockAccessory(input: RestockAccessoryInput): Promise<Accessory> {
  return prisma.$transaction((tx) => upsertAccessoryStock(tx, input));
}

export interface AccessoryStockSummary {
  itemCount: number;
  totalQuantity: number;
  totalCostValue: string;
}

/** Total accessory stock (all rows — quantity itself IS the stock) for the inventory tab header. */
export async function getAccessoryStockSummary(): Promise<AccessoryStockSummary> {
  const accessories = await prisma.accessory.findMany({ select: { quantity: true, costPrice: true } });

  const totalQuantity = accessories.reduce((sum, a) => sum + a.quantity, 0);
  const totalCostValue = accessories.reduce(
    (sum, a) => sum.plus(a.costPrice.times(a.quantity)),
    new Prisma.Decimal(0)
  );

  return { itemCount: accessories.length, totalQuantity, totalCostValue: totalCostValue.toString() };
}

/** Distinct brands present in accessory inventory, for the brand quick-filter buttons. */
export async function getAccessoryBrands(): Promise<string[]> {
  const rows = await prisma.accessory.findMany({
    distinct: ["brand"],
    select: { brand: true },
    orderBy: { brand: "asc" },
  });

  return rows.map((r) => r.brand);
}

/** Total quantity in stock per brand, for the brand quick-filter buttons. */
export async function getAccessoryBrandQuantities(): Promise<Record<string, number>> {
  const rows = await prisma.accessory.groupBy({
    by: ["brand"],
    _sum: { quantity: true },
  });

  return Object.fromEntries(rows.map((r) => [r.brand, r._sum.quantity ?? 0]));
}

/**
 * Deletes an accessory catalog row added by mistake (wrong name/brand typo,
 * duplicate row, wrong initial quantity). Accessories are aggregate stock
 * shared across every purchase/sale that ever touched them, so there's no
 * safe way to "undo just one entry" once any transaction has happened —
 * only a completely untouched row (no purchase, sale, or claim history at
 * all) can be deleted outright. Anything already transacted must go through
 * `deletePurchase` / `deleteSale` / `deleteClaim` instead, or a manual
 * quantity correction via the existing Edit form.
 */
export async function deleteAccessory(id: string): Promise<void> {
  const accessory = await prisma.accessory.findUnique({ where: { id } });
  if (!accessory) {
    throw new Error("Accessory not found.");
  }

  const [purchaseItemCount, saleItemCount, claimCount] = await Promise.all([
    prisma.purchaseItem.count({ where: { accessoryId: id } }),
    prisma.saleItem.count({ where: { accessoryId: id } }),
    prisma.claim.count({ where: { accessoryId: id } }),
  ]);

  if (purchaseItemCount > 0 || saleItemCount > 0 || claimCount > 0) {
    throw new Error(
      "This accessory has purchase/sale/claim history — it can't be deleted directly. Correct the quantity via Edit instead."
    );
  }

  await prisma.accessory.delete({ where: { id } });
}

/** Whether `deleteAccessory` would currently succeed for this row — for the Edit page to decide whether to show the option. */
export async function canDeleteAccessory(id: string): Promise<boolean> {
  const [purchaseItemCount, saleItemCount, claimCount] = await Promise.all([
    prisma.purchaseItem.count({ where: { accessoryId: id } }),
    prisma.saleItem.count({ where: { accessoryId: id } }),
    prisma.claim.count({ where: { accessoryId: id } }),
  ]);

  return purchaseItemCount === 0 && saleItemCount === 0 && claimCount === 0;
}
