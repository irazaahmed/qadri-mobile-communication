"use server";

import { recordCustomerBulkPayment } from "@/lib/actions/payments";
import type { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";

export type CustomerBulkPaymentState = { error?: string; success?: string } | undefined;

export async function recordCustomerBulkPaymentAction(
  customerId: string,
  _prevState: CustomerBulkPaymentState,
  formData: FormData
): Promise<CustomerBulkPaymentState> {
  const amount = String(formData.get("amount") || "").trim();
  const method = String(formData.get("method") || "") as PaymentMethod;
  const note = String(formData.get("note") || "").trim();

  if (!amount || Number(amount) <= 0) {
    return { error: "Amount must be a positive number." };
  }

  try {
    const result = await recordCustomerBulkPayment({
      customerId,
      amount,
      method,
      note: note || null,
    });

    revalidatePath(`/admin/customers/${customerId}`);
    revalidatePath("/admin/sales");
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
