"use server";

import { createPhone } from "@/lib/actions/phones";
import { PhoneCondition } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type PhoneFormState = { error?: string } | undefined;

export async function createPhoneAction(
  _prevState: PhoneFormState,
  formData: FormData
): Promise<PhoneFormState> {
  const imei = String(formData.get("imei") || "").trim();
  const brand = String(formData.get("brand") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const storage = String(formData.get("storage") || "").trim();
  const color = String(formData.get("color") || "").trim();
  const condition = String(formData.get("condition") || "") as PhoneCondition;
  const warrantyMonthsRaw = String(formData.get("warrantyMonths") || "").trim();
  const costPrice = String(formData.get("costPrice") || "").trim();
  const supplierId = String(formData.get("supplierId") || "").trim();
  const quantityRaw = String(formData.get("quantity") || "").trim();
  const quantity = quantityRaw ? Number(quantityRaw) : 1;

  if (!brand || !model || !condition || !costPrice) {
    return { error: "Brand, model, condition and cost price are required." };
  }
  if (!Number.isFinite(quantity) || quantity < 1) {
    return { error: "Quantity must be a positive whole number." };
  }
  if (imei && quantity > 1) {
    return { error: "Enter a specific IMEI per unit, or leave IMEI blank to bulk-add by quantity." };
  }

  let count: number;

  try {
    const result = await createPhone({
      imei: imei || null,
      brand,
      model,
      storage: storage || null,
      color: color || null,
      condition,
      warrantyMonths: warrantyMonthsRaw ? Number(warrantyMonthsRaw) : null,
      costPrice,
      supplierId: supplierId || null,
      quantity,
    });
    count = result.count;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to add phone." };
  }

  revalidatePath("/admin/inventory/phones");
  redirect(`/admin/inventory/phones/new?added=${count}`);
}
