"use server";

import { createPurchase, type CreatePurchaseInput } from "@/lib/actions/purchases";
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
    return { id: purchase.id, invoiceNumber: purchase.invoiceNumber };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record purchase." };
  }
}
