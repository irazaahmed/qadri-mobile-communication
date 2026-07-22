"use server";

import { recordPayment, type RecordPaymentInput } from "@/lib/actions/payments";
import { revalidatePath } from "next/cache";

export type RecordPurchasePaymentResult = { id: string } | { error: string };

/**
 * Thin client-callable wrapper around recordPayment, scoped to the payable
 * direction. Returns only plain serializable fields — the Payment row
 * itself carries a Prisma.Decimal amount that cannot cross the Server
 * Function response boundary to a Client Component.
 */
export async function recordPurchasePaymentAction(
  input: Omit<RecordPaymentInput, "direction">
): Promise<RecordPurchasePaymentResult> {
  try {
    const payment = await recordPayment({ ...input, direction: "PAYABLE" });
    revalidatePath(`/admin/purchases/${input.purchaseId}`);
    revalidatePath("/admin/purchases");
    revalidatePath("/admin");
    revalidatePath("/admin/suppliers");
    return { id: payment.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record payment." };
  }
}
