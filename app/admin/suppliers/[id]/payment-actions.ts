"use server";

import { recordSupplierBulkPayment } from "@/lib/actions/payments";
import type { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";

export type SupplierBulkPaymentState = { error?: string; success?: string } | undefined;

export async function recordSupplierBulkPaymentAction(
  supplierId: string,
  _prevState: SupplierBulkPaymentState,
  formData: FormData
): Promise<SupplierBulkPaymentState> {
  const amount = String(formData.get("amount") || "").trim();
  const method = String(formData.get("method") || "") as PaymentMethod;
  const note = String(formData.get("note") || "").trim();

  if (!amount || Number(amount) <= 0) {
    return { error: "Amount must be a positive number." };
  }

  try {
    const result = await recordSupplierBulkPayment({
      supplierId,
      amount,
      method,
      note: note || null,
    });

    revalidatePath(`/admin/suppliers/${supplierId}`);
    revalidatePath("/admin/purchases");
    revalidatePath("/admin");

    return {
      success:
        result.invoiceNumbers.length === 1
          ? `Payment recorded against ${result.invoiceNumbers[0]}.`
          : `Payment recorded, covering ${result.invoiceNumbers.join(", ")}.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record payment." };
  }
}
