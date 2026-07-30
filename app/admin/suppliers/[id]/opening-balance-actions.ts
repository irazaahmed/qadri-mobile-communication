"use server";

import { recordSupplierOpeningBalance, deleteSupplierOpeningBalance, type OpeningBalanceKind } from "@/lib/actions/suppliers";
import { revalidatePath } from "next/cache";

export type OpeningBalanceState = { error?: string; success?: string } | undefined;

export async function addSupplierOpeningBalanceAction(
  supplierId: string,
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
    await recordSupplierOpeningBalance(supplierId, { kind, amount, note: note || null });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record opening balance." };
  }

  revalidatePath(`/admin/suppliers/${supplierId}`);
  revalidatePath("/admin/suppliers");
  return { success: "Opening balance recorded." };
}

export async function deleteSupplierOpeningBalanceAction(
  supplierId: string,
  ledgerEntryId: string
): Promise<{ error: string } | { success: true }> {
  try {
    await deleteSupplierOpeningBalance(ledgerEntryId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to undo opening balance." };
  }

  revalidatePath(`/admin/suppliers/${supplierId}`);
  revalidatePath("/admin/suppliers");
  return { success: true };
}
