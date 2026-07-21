"use server";

import { updateCustomer } from "@/lib/actions/customers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type CustomerEditState = { error?: string } | undefined;

export async function updateCustomerAction(
  id: string,
  _prevState: CustomerEditState,
  formData: FormData
): Promise<CustomerEditState> {
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const address = String(formData.get("address") || "").trim();

  if (!name || !phone) {
    return { error: "Name and phone are required." };
  }

  try {
    await updateCustomer(id, { name, phone, address: address || null });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update customer." };
  }

  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${id}?updated=1`);
}
