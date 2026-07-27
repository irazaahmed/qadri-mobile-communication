"use server";

import { updatePhone } from "@/lib/actions/phones";
import { PhoneCondition } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type PhoneEditState = { error?: string } | undefined;

export async function updatePhoneAction(
  id: string,
  _prevState: PhoneEditState,
  formData: FormData
): Promise<PhoneEditState> {
  const imei = String(formData.get("imei") || "").trim();
  const brand = String(formData.get("brand") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const storage = String(formData.get("storage") || "").trim();
  const color = String(formData.get("color") || "").trim();
  const condition = String(formData.get("condition") || "") as PhoneCondition;
  const warrantyMonthsRaw = String(formData.get("warrantyMonths") || "").trim();
  const costPrice = String(formData.get("costPrice") || "").trim();
  const supplierId = String(formData.get("supplierId") || "").trim();

  if (!brand || !model || !condition || !costPrice) {
    return { error: "Brand, model, condition and cost price are required." };
  }

  try {
    await updatePhone(id, {
      imei: imei || null,
      brand,
      model,
      storage: storage || null,
      color: color || null,
      condition,
      warrantyMonths: warrantyMonthsRaw ? Number(warrantyMonthsRaw) : null,
      costPrice,
      supplierId: supplierId || null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update phone." };
  }

  revalidatePath("/admin/inventory/phones");
  revalidatePath(`/admin/inventory/phones/${id}/edit`);
  redirect("/admin/inventory/phones?updated=1");
}
