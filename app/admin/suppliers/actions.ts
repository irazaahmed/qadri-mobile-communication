"use server";

import { deleteSupplier } from "@/lib/actions/suppliers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function deleteSupplierAction(id: string) {
  try {
    await deleteSupplier(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete supplier.";
    redirect(`/admin/suppliers?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers?deleted=1");
}
