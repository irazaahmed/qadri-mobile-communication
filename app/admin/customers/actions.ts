"use server";

import { deleteCustomer } from "@/lib/actions/customers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function deleteCustomerAction(id: string) {
  try {
    await deleteCustomer(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete customer.";
    redirect(`/admin/customers?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/customers");
  redirect("/admin/customers?deleted=1");
}
