"use server";

import { recordCashOpeningBalance, deleteCashOpeningBalance } from "@/lib/actions/cash";
import { revalidatePath } from "next/cache";

export type CashOpeningBalanceState = { error?: string; success?: string } | undefined;

export async function addCashOpeningBalanceAction(
  _prevState: CashOpeningBalanceState,
  formData: FormData
): Promise<CashOpeningBalanceState> {
  const amount = String(formData.get("amount") || "").trim();
  const note = String(formData.get("note") || "").trim();

  if (!amount || Number(amount) <= 0) {
    return { error: "Amount must be a positive number." };
  }

  try {
    await recordCashOpeningBalance({ amount, note: note || null });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record opening balance." };
  }

  revalidatePath("/admin/cash");
  revalidatePath("/admin");
  return { success: "Opening cash balance recorded." };
}

export async function deleteCashOpeningBalanceAction(
  ledgerEntryId: string
): Promise<{ error: string } | { success: true }> {
  try {
    await deleteCashOpeningBalance(ledgerEntryId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to undo opening balance." };
  }

  revalidatePath("/admin/cash");
  revalidatePath("/admin");
  return { success: true };
}
