"use server";

import { restockAccessory } from "@/lib/actions/accessories";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type RestockFormState = { error?: string } | undefined;

export async function restockAccessoryAction(
  ctx: { name: string; brand: string; variant: string | null; category: string },
  _prevState: RestockFormState,
  formData: FormData
): Promise<RestockFormState> {
  const quantityRaw = String(formData.get("quantity") || "").trim();
  const costPrice = String(formData.get("costPrice") || "").trim();

  const quantity = Number(quantityRaw);
  if (!quantityRaw || !Number.isFinite(quantity) || quantity <= 0) {
    return { error: "Quantity must be a positive number." };
  }
  if (!costPrice) {
    return { error: "Cost price (this restock's rate) is required." };
  }

  try {
    await restockAccessory({
      name: ctx.name,
      brand: ctx.brand,
      variant: ctx.variant,
      category: ctx.category,
      quantity,
      costPrice,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to restock accessory." };
  }

  revalidatePath("/admin/inventory/accessories");
  redirect("/admin/inventory/accessories?restocked=1");
}
