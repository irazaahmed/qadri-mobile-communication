"use server";

import { upsertCustomerByPhone, type OpeningBalanceKind } from "@/lib/actions/customers";
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
  const openingBalanceAmount = String(formData.get("openingBalanceAmount") || "").trim();
  const openingBalanceKind = String(formData.get("openingBalanceKind") || "CREDIT") as OpeningBalanceKind;
  const openingBalanceNote = String(formData.get("openingBalanceNote") || "").trim();

  if (!name || !phone) {
    return { error: "Name and phone are required." };
  }

  const openingBalance =
    openingBalanceAmount && Number(openingBalanceAmount) > 0
      ? { kind: openingBalanceKind, amount: openingBalanceAmount, note: openingBalanceNote || null }
      : undefined;

  try {
    await upsertCustomerByPhone({ name, phone, address: address || null }, openingBalance);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to add customer." };
  }

  revalidatePath("/admin/customers");
  redirect("/admin/customers?created=1");
}
