"use server";

import { recordPayment, deletePayment, type RecordPaymentInput } from "@/lib/actions/payments";
import { deleteSale } from "@/lib/actions/sales";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
    revalidatePath("/admin/bank");
    return { id: payment.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record payment." };
  }
}

export async function deleteSalePaymentAction(paymentId: string, saleId: string): Promise<{ error: string } | void> {
  try {
    await deletePayment(paymentId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to delete payment." };
  }
  revalidatePath(`/admin/sales/${saleId}/invoice`);
  revalidatePath("/admin/sales");
  revalidatePath("/admin/customers");
  revalidatePath("/admin");
  revalidatePath("/admin/bank");
}

export async function deleteSaleAction(saleId: string): Promise<{ error: string } | void> {
  try {
    await deleteSale(saleId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to delete sale." };
  }
  revalidatePath("/admin/sales");
  revalidatePath("/admin/inventory/phones");
  revalidatePath("/admin/inventory/accessories");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/bank");
  revalidatePath("/admin");
  redirect("/admin/sales?deleted=1");
}
