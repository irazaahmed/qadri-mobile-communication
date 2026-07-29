"use server";

import { createPurchase, type CreatePurchaseInput } from "@/lib/actions/purchases";
import { createSupplier } from "@/lib/actions/suppliers";
import { revalidatePath } from "next/cache";

export type CreatePurchaseResult = { id: string; invoiceNumber: string } | { error: string };

/**
 * Thin client-callable wrapper around createPurchase. Returns only plain
 * serializable fields (never the Purchase/PurchaseItem rows themselves,
 * which carry Prisma.Decimal instances that cannot cross the Server
 * Function response boundary to a Client Component).
 */
export async function createPurchaseAction(input: CreatePurchaseInput): Promise<CreatePurchaseResult> {
  try {
    const purchase = await createPurchase(input);
    revalidatePath("/admin/purchases");
    revalidatePath("/admin/inventory/phones");
    revalidatePath("/admin/inventory/accessories");
    revalidatePath("/admin/bank");
    revalidatePath("/admin");
    return { id: purchase.id, invoiceNumber: purchase.invoiceNumber };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record purchase." };
  }
}

export type CreateSupplierResult = { id: string; name: string; phone: string | null } | { error: string };

export async function createSupplierAction(input: {
  name: string;
  phone?: string | null;
}): Promise<CreateSupplierResult> {
  if (!input.name.trim()) {
    return { error: "Supplier name is required." };
  }

  try {
    const supplier = await createSupplier({ name: input.name.trim(), phone: input.phone?.trim() || null });
    revalidatePath("/admin/suppliers");
    return { id: supplier.id, name: supplier.name, phone: supplier.phone };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save supplier." };
  }
}
