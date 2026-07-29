import { Prisma, PhoneCondition, PhoneStatus } from "@prisma/client";

/**
 * lib/stock.ts
 *
 * Phone/accessory stock mutation helpers. Phones are individually serialized
 * by IMEI (never aggregated); accessories are aggregate quantity stock
 * upserted on (name, brand, variant). The two never share fields or write
 * paths — see skills: phone-inventory, accessory-inventory.
 *
 * All functions here are meant to be called from inside an existing
 * `prisma.$transaction` callback (purchase/sale actions own the transaction
 * boundary, ledger writes, and invoice totals).
 */

type Tx = Prisma.TransactionClient;

export interface CreatePhoneStockInput {
  imei?: string | null;
  brand: string;
  model: string;
  storage?: string | null;
  color?: string | null;
  condition: PhoneCondition;
  warrantyMonths?: number | null;
  costPrice: Prisma.Decimal | number | string;
  supplierId?: string | null;
}

/**
 * Creates a new Phone row for a PHONE purchase line. Always `status: IN_STOCK`.
 * IMEI is optional — leave it blank for a bulk-purchased unit with no
 * per-piece IMEI on file yet (Postgres allows multiple NULLs under a unique
 * index, so this never collides). When an IMEI is given, uniqueness is
 * enforced at the DB level, but we pre-check inside the transaction and
 * throw a friendly error rather than letting a raw unique constraint
 * violation surface to the UI.
 */
export async function createPhoneStock(tx: Tx, input: CreatePhoneStockInput) {
  const imei = input.imei?.trim() ? input.imei.trim() : null;

  if (imei) {
    const existing = await tx.phone.findUnique({ where: { imei } });
    if (existing) {
      throw new Error(`IMEI already exists: ${imei} (already in stock as ${existing.brand} ${existing.model}, status ${existing.status}).`);
    }
  }

  return tx.phone.create({
    data: {
      imei,
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
}

export interface UpsertAccessoryStockInput {
  name: string;
  brand: string;
  variant?: string | null;
  category: string;
  quantity: number; // quantity being added via this purchase line
  costPrice: Prisma.Decimal | number | string; // latest purchase rate
  salePrice?: Prisma.Decimal | number | string | null; // only used if creating new row
  lowStockThreshold?: number | null; // only used if creating new row
}

/**
 * Upserts an accessory on restock per the accessory-inventory skill:
 * matched on (name, brand, variant) — "no variant" collapses to a single
 * canonical value so a blank/omitted variant always dedupes to the same
 * row.
 *
 * Deviation note: the skill says to treat this canonical value as `null`,
 * but Prisma's generated compound-unique input for `@@unique([name, brand,
 * variant])` types `variant` as non-nullable `string` even though the
 * column itself is nullable — this is intentional on Prisma's part, since
 * SQL `NULL = NULL` is never true, so a `null` in a compound `where` could
 * never match an existing `NULL` row and would silently create duplicates
 * instead of restocking. We use `""` (empty string) as the canonical
 * "no variant" value instead — same dedupe behavior, no `null`-equality
 * pitfall. See lib/actions/phones.ts for phones (unaffected, imei has no
 * such compound key).
 */
export async function upsertAccessoryStock(tx: Tx, input: UpsertAccessoryStockInput) {
  const variant = input.variant?.trim() ? input.variant.trim() : "";
  const costPrice = new Prisma.Decimal(input.costPrice);

  return tx.accessory.upsert({
    where: {
      name_brand_variant: {
        name: input.name,
        brand: input.brand,
        variant,
      },
    },
    update: {
      quantity: { increment: input.quantity },
      costPrice,
    },
    create: {
      name: input.name,
      brand: input.brand,
      variant,
      category: input.category,
      quantity: input.quantity,
      costPrice,
      salePrice: new Prisma.Decimal(input.salePrice ?? costPrice),
      lowStockThreshold: input.lowStockThreshold ?? null,
    },
  });
}

/**
 * Decrements accessory quantity for a sale line. Re-checks the current
 * quantity inside the transaction and throws if it would go negative —
 * callers must let this abort the whole enclosing transaction.
 */
export async function decrementAccessoryStock(tx: Tx, accessoryId: string, quantity: number) {
  const accessory = await tx.accessory.findUnique({ where: { id: accessoryId } });

  if (!accessory) {
    throw new Error(`Accessory ${accessoryId} not found.`);
  }

  if (accessory.quantity - quantity < 0) {
    throw new Error(
      `Insufficient stock for accessory "${accessory.name}" (have ${accessory.quantity}, need ${quantity}).`
    );
  }

  return tx.accessory.update({
    where: { id: accessoryId },
    data: { quantity: { decrement: quantity } },
  });
}

export interface CreateUnbilledSoldPhoneStockInput {
  imei?: string | null;
  brand: string;
  model: string;
  storage?: string | null;
  color?: string | null;
  condition: PhoneCondition;
  warrantyMonths?: number | null;
  estimatedCost: Prisma.Decimal | number | string;
  supplierId?: string | null;
  soldAt: Date;
  salePrice: Prisma.Decimal | number | string;
}

/**
 * Creates a phone that's being sold before its supplier bill has arrived —
 * e.g. a company drops off units with no invoice yet, and a customer buys
 * one the same day. Unlike createPhoneStock, this creates the Phone row AND
 * marks it SOLD in one step (it was never IN_STOCK — it left with this same
 * sale), with `costPending: true` so it shows up on the "awaiting supplier
 * bill" list alongside estimate-priced phones added the normal way.
 * reconcilePendingBillPurchase later attaches the real invoice and corrects
 * both costPrice and this sale's costAtSale snapshot.
 */
export async function createUnbilledSoldPhoneStock(tx: Tx, input: CreateUnbilledSoldPhoneStockInput) {
  const imei = input.imei?.trim() ? input.imei.trim() : null;

  if (imei) {
    const existing = await tx.phone.findUnique({ where: { imei } });
    if (existing) {
      throw new Error(`IMEI already exists: ${imei} (already in stock as ${existing.brand} ${existing.model}, status ${existing.status}).`);
    }
  }

  const estimatedCost = new Prisma.Decimal(input.estimatedCost);

  const phone = await tx.phone.create({
    data: {
      imei,
      brand: input.brand,
      model: input.model,
      storage: input.storage ?? null,
      color: input.color ?? null,
      condition: input.condition,
      warrantyMonths: input.warrantyMonths ?? null,
      costPrice: estimatedCost,
      supplierId: input.supplierId ?? null,
      status: PhoneStatus.SOLD,
      costPending: true,
      soldAt: input.soldAt,
      warrantyStartDate: input.soldAt,
      salePrice: new Prisma.Decimal(input.salePrice),
    },
  });

  return { phone, costAtSale: estimatedCost };
}

/**
 * Marks a phone SOLD as part of a sale line. Re-checks status is still
 * IN_STOCK inside the transaction and throws otherwise. Sets soldAt and
 * warrantyStartDate to sale time (warranty clock starts at sale, not
 * purchase), records the actual sale price on the Phone row (per the
 * phone-inventory skill: `salePrice` is the price it actually sold for,
 * not a listed/quote price), and snapshots costAtSale for the caller to
 * use on the SaleItem.
 */
export async function markPhoneSold(
  tx: Tx,
  phoneId: string,
  soldAt: Date,
  salePrice: Prisma.Decimal | number | string
) {
  const phone = await tx.phone.findUnique({ where: { id: phoneId } });

  if (!phone) {
    throw new Error(`Phone ${phoneId} not found.`);
  }

  if (phone.status !== PhoneStatus.IN_STOCK) {
    throw new Error(`Phone ${phone.imei} is not IN_STOCK (current status: ${phone.status}).`);
  }

  const updated = await tx.phone.update({
    where: { id: phoneId },
    data: {
      status: PhoneStatus.SOLD,
      soldAt,
      warrantyStartDate: soldAt,
      salePrice: new Prisma.Decimal(salePrice),
    },
  });

  return { phone: updated, costAtSale: phone.costPrice };
}
