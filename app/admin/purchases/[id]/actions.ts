"use server";

import { recordPayment, deletePayment, type RecordPaymentInput } from "@/lib/actions/payments";
import { deletePurchase } from "@/lib/actions/purchases";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
    revalidatePath("/admin/bank");
    return { id: payment.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record payment." };
  }
}

export async function deletePurchasePaymentAction(
  paymentId: string,
  purchaseId: string
): Promise<{ error: string } | void> {
  try {
    await deletePayment(paymentId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to delete payment." };
  }
  revalidatePath(`/admin/purchases/${purchaseId}`);
  revalidatePath("/admin/purchases");
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin");
  revalidatePath("/admin/bank");
}

export async function deletePurchaseAction(purchaseId: string): Promise<{ error: string } | void> {
  try {
    await deletePurchase(purchaseId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to delete purchase." };
  }
  revalidatePath("/admin/purchases");
  revalidatePath("/admin/inventory/phones");
  revalidatePath("/admin/inventory/accessories");
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin");
  revalidatePath("/admin/bank");
  redirect("/admin/purchases?deleted=1");
}
