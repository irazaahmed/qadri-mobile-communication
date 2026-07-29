"use server";

import { reconcilePendingBillPurchase, type ReconcilePendingBillInput } from "@/lib/actions/purchases";
import { revalidatePath } from "next/cache";

export type ReconcilePendingBillResult = { id: string; invoiceNumber: string } | { error: string };

/**
 * Thin client-callable wrapper around reconcilePendingBillPurchase. Returns
 * only plain serializable fields — the Purchase row itself carries
 * Prisma.Decimal instances that can't cross the Server Function response
 * boundary to a Client Component (same pattern as createPurchaseAction).
 */
export async function reconcilePendingBillAction(
  input: ReconcilePendingBillInput
): Promise<ReconcilePendingBillResult> {
  try {
    const purchase = await reconcilePendingBillPurchase(input);
    revalidatePath("/admin/purchases");
    revalidatePath("/admin/inventory/phones");
    revalidatePath("/admin");
    return { id: purchase.id, invoiceNumber: purchase.invoiceNumber };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to reconcile bill." };
  }
}
