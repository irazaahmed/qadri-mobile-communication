"use server";

import { upsertCustomerByPhone } from "@/lib/actions/customers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type CustomerFormState = { error?: string } | undefined;

export async function createCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const address = String(formData.get("address") || "").trim();

  if (!name || !phone) {
    return { error: "Name and phone are required." };
  }

  try {
    await upsertCustomerByPhone({ name, phone, address: address || null });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to add customer." };
  }

  revalidatePath("/admin/customers");
  redirect("/admin/customers?created=1");
}
