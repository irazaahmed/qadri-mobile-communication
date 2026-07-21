"use server";

import { createAccessory } from "@/lib/actions/accessories";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type AccessoryFormState = { error?: string } | undefined;

export async function createAccessoryAction(
  _prevState: AccessoryFormState,
  formData: FormData
): Promise<AccessoryFormState> {
  const name = String(formData.get("name") || "").trim();
  const brand = String(formData.get("brand") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const variant = String(formData.get("variant") || "").trim();
  const costPrice = String(formData.get("costPrice") || "").trim();
  const salePrice = String(formData.get("salePrice") || "").trim();
  const quantityRaw = String(formData.get("quantity") || "").trim();
  const lowStockThresholdRaw = String(formData.get("lowStockThreshold") || "").trim();

  if (!name || !brand || !category || !costPrice || !salePrice) {
    return { error: "Name, brand, category, cost price and sale price are required." };
  }

  try {
    await createAccessory({
      name,
      brand,
      category,
      variant: variant || null,
      costPrice,
      salePrice,
      quantity: quantityRaw ? Number(quantityRaw) : 0,
      lowStockThreshold: lowStockThresholdRaw ? Number(lowStockThresholdRaw) : null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to add accessory." };
  }

  revalidatePath("/admin/inventory/accessories");
  redirect("/admin/inventory/accessories?created=1");
}
