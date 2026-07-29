"use server";

import { recordCustomerBulkPayment } from "@/lib/actions/payments";
import type { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { formatCurrency } from "../../_lib/format";

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

    const base =
      result.invoiceNumbers.length === 0
        ? "Payment recorded."
        : result.invoiceNumbers.length === 1
          ? `Payment recorded against ${result.invoiceNumbers[0]}.`
          : `Payment recorded, covering ${result.invoiceNumbers.join(", ")}.`;
    const advance = Number(result.advanceAmount);
    const advanceNote =
      advance > 0
        ? ` ${formatCurrency(result.advanceAmount)} was extra — saved as advance credit for this customer's next credit sale.`
        : "";

    return { success: `${base}${advanceNote}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record payment." };
  }
}
