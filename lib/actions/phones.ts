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
  imei: string;
  brand: string;
  model: string;
  storage?: string | null;
  color?: string | null;
  condition: PhoneCondition;
  warrantyMonths?: number | null;
  costPrice: number | string;
  supplierId?: string | null;
}

export async function createPhone(input: CreatePhoneInput): Promise<PhoneWithWarranty> {
  const existing = await prisma.phone.findUnique({ where: { imei: input.imei } });
  if (existing) {
    throw new Error(`IMEI already exists: ${input.imei}`);
  }

  const phone = await prisma.phone.create({
    data: {
      imei: input.imei,
      brand: input.brand,
      model: input.model,
      storage: input.storage ?? null,
      color: input.color ?? null,
      condition: input.condition,
      warrantyMonths: input.warrantyMonths ?? null,
      costPrice: new Prisma.Decimal(input.costPrice),
      supplierId: input.supplierId ?? null,
      status: PhoneStatus.IN_STOCK,
    },
  });

  return withWarranty(phone);
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
  brand?: string;
  model?: string;
  storage?: string | null;
  color?: string | null;
  condition?: PhoneCondition;
  warrantyMonths?: number | null;
  costPrice?: number | string;
  supplierId?: string | null;
}

/**
 * Updates phone specs only. Never touches `status`, `soldAt`,
 * `warrantyStartDate`, or `imei` — those are owned by the sale/claim
 * actions (status machine) or are immutable identifiers.
 */
export async function updatePhone(id: string, input: UpdatePhoneInput): Promise<PhoneWithWarranty> {
  const phone = await prisma.phone.update({
    where: { id },
    data: {
      ...(input.brand !== undefined ? { brand: input.brand } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.storage !== undefined ? { storage: input.storage } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.condition !== undefined ? { condition: input.condition } : {}),
      ...(input.warrantyMonths !== undefined ? { warrantyMonths: input.warrantyMonths } : {}),
      ...(input.costPrice !== undefined ? { costPrice: new Prisma.Decimal(input.costPrice) } : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
    },
  });

  return withWarranty(phone);
}
