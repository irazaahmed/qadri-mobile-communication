"use server";

import { recordSupplierBulkPayment } from "@/lib/actions/payments";
import type { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { formatCurrency } from "../../_lib/format";

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

    const base =
      result.invoiceNumbers.length === 0
        ? "Payment recorded."
        : result.invoiceNumbers.length === 1
          ? `Payment recorded against ${result.invoiceNumbers[0]}.`
          : `Payment recorded, covering ${result.invoiceNumbers.join(", ")}.`;
    const advance = Number(result.advanceAmount);
    const advanceNote =
      advance > 0
        ? ` ${formatCurrency(result.advanceAmount)} was extra — saved as advance credit for this supplier's next credit purchase.`
        : "";

    return { success: `${base}${advanceNote}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record payment." };
  }
}
