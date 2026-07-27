"use server";

import { updateAccessory, deleteAccessory } from "@/lib/actions/accessories";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type AccessoryEditState = { error?: string } | undefined;

export async function updateAccessoryAction(
  id: string,
  _prevState: AccessoryEditState,
  formData: FormData
): Promise<AccessoryEditState> {
  const category = String(formData.get("category") || "").trim();
  const salePrice = String(formData.get("salePrice") || "").trim();
  const lowStockThresholdRaw = String(formData.get("lowStockThreshold") || "").trim();

  if (!category || !salePrice) {
    return { error: "Category and sale price are required." };
  }

  try {
    await updateAccessory(id, {
      category,
      salePrice,
      lowStockThreshold: lowStockThresholdRaw ? Number(lowStockThresholdRaw) : null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update accessory." };
  }

  revalidatePath("/admin/inventory/accessories");
  redirect("/admin/inventory/accessories?updated=1");
}

export async function deleteAccessoryAction(id: string): Promise<{ error: string } | void> {
  try {
    await deleteAccessory(id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to delete accessory." };
  }
  revalidatePath("/admin/inventory/accessories");
  revalidatePath("/admin");
  redirect("/admin/inventory/accessories?deleted=1");
}
