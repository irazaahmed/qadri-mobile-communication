"use server";

import { updateSupplier } from "@/lib/actions/suppliers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type SupplierEditState = { error?: string } | undefined;

export async function updateSupplierAction(
  id: string,
  _prevState: SupplierEditState,
  formData: FormData
): Promise<SupplierEditState> {
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const address = String(formData.get("address") || "").trim();

  if (!name) {
    return { error: "Name is required." };
  }

  try {
    await updateSupplier(id, { name, phone: phone || null, address: address || null });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update supplier." };
  }

  revalidatePath("/admin/suppliers");
  redirect(`/admin/suppliers/${id}?updated=1`);
}
