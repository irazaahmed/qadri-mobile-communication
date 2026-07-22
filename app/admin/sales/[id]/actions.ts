"use server";

import { recordPayment, type RecordPaymentInput } from "@/lib/actions/payments";
import { revalidatePath } from "next/cache";

export type RecordSalePaymentResult = { id: string } | { error: string };

/**
 * Thin client-callable wrapper around recordPayment, scoped to the
 * receivable direction. Returns only plain serializable fields — the
 * Payment row itself carries a Prisma.Decimal amount that cannot cross the
 * Server Function response boundary to a Client Component.
 */
export async function recordSalePaymentAction(
  input: Omit<RecordPaymentInput, "direction">
): Promise<RecordSalePaymentResult> {
  try {
    const payment = await recordPayment({ ...input, direction: "RECEIVABLE" });
    revalidatePath(`/admin/sales/${input.saleId}/invoice`);
    revalidatePath("/admin/sales");
    revalidatePath("/admin");
    revalidatePath("/admin/customers");
    return { id: payment.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record payment." };
  }
}
