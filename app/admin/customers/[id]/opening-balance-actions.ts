"use server";

import { recordCustomerOpeningBalance, deleteCustomerOpeningBalance, type OpeningBalanceKind } from "@/lib/actions/customers";
import { revalidatePath } from "next/cache";

export type OpeningBalanceState = { error?: string; success?: string } | undefined;

export async function addCustomerOpeningBalanceAction(
  customerId: string,
  _prevState: OpeningBalanceState,
  formData: FormData
): Promise<OpeningBalanceState> {
  const amount = String(formData.get("amount") || "").trim();
  const kind = String(formData.get("kind") || "") as OpeningBalanceKind;
  const note = String(formData.get("note") || "").trim();

  if (!amount || Number(amount) <= 0) {
    return { error: "Amount must be a positive number." };
  }

  try {
    await recordCustomerOpeningBalance(customerId, { kind, amount, note: note || null });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record opening balance." };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { success: "Opening balance recorded." };
}

export async function deleteCustomerOpeningBalanceAction(
  customerId: string,
  ledgerEntryId: string
): Promise<{ error: string } | { success: true }> {
  try {
    await deleteCustomerOpeningBalance(ledgerEntryId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to undo opening balance." };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { success: true };
}
