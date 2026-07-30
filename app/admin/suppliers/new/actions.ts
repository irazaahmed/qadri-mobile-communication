"use server";

import { createSupplier, type OpeningBalanceKind } from "@/lib/actions/suppliers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type SupplierFormState = { error?: string } | undefined;

export async function createSupplierAction(
  _prevState: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const openingBalanceAmount = String(formData.get("openingBalanceAmount") || "").trim();
  const openingBalanceKind = String(formData.get("openingBalanceKind") || "CREDIT") as OpeningBalanceKind;
  const openingBalanceNote = String(formData.get("openingBalanceNote") || "").trim();

  if (!name) {
    return { error: "Name is required." };
  }

  const openingBalance =
    openingBalanceAmount && Number(openingBalanceAmount) > 0
      ? { kind: openingBalanceKind, amount: openingBalanceAmount, note: openingBalanceNote || null }
      : undefined;

  try {
    await createSupplier({ name, phone: phone || null, address: address || null }, openingBalance);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to add supplier." };
  }

  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers?created=1");
}
