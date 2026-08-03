"use server";

import { recordCashOpeningBalance, deleteCashOpeningBalance, listCashEntries } from "@/lib/actions/cash";
import { revalidatePath } from "next/cache";

export type CashOpeningBalanceState = { error?: string; success?: string } | undefined;

export async function addCashOpeningBalanceAction(
  _prevState: CashOpeningBalanceState,
  formData: FormData
): Promise<CashOpeningBalanceState> {
  const amount = String(formData.get("amount") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const direction = formData.get("direction") === "OUT" ? "OUT" : "IN";

  if (!amount || Number(amount) <= 0) {
    return { error: "Amount must be a positive number." };
  }

  const isFirstEntry = (await listCashEntries()).length === 0;

  try {
    await recordCashOpeningBalance({ amount, direction, note: note || null });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record opening balance." };
  }

  revalidatePath("/admin/cash");
  revalidatePath("/admin");
  return {
    success: isFirstEntry
      ? "Opening cash balance recorded."
      : direction === "OUT"
        ? "Cash out recorded."
        : "Cash in recorded.",
  };
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
