"use server";

import { createSupplier } from "@/lib/actions/suppliers";
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

  if (!name) {
    return { error: "Name is required." };
  }

  try {
    await createSupplier({ name, phone: phone || null, address: address || null });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to add supplier." };
  }

  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers?created=1");
}
