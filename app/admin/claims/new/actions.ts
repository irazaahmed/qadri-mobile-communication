"use server";

import { createClaim, type CreateClaimInput } from "@/lib/actions/claims";
import { upsertCustomerByPhone } from "@/lib/actions/customers";
import { revalidatePath } from "next/cache";

export type CreateClaimResult = { id: string; claimNumber: string } | { error: string };

export async function createClaimAction(input: CreateClaimInput): Promise<CreateClaimResult> {
  try {
    const claim = await createClaim(input);
    revalidatePath("/admin/claims");
    revalidatePath("/admin/inventory/phones");
    return { id: claim.id, claimNumber: claim.claimNumber };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record claim." };
  }
}

export type UpsertCustomerResult = { id: string; name: string; phone: string } | { error: string };

export async function upsertCustomerAction(input: { name: string; phone: string }): Promise<UpsertCustomerResult> {
  if (!input.name.trim() || !input.phone.trim()) {
    return { error: "Name and phone are required." };
  }

  try {
    const customer = await upsertCustomerByPhone({ name: input.name.trim(), phone: input.phone.trim() });
    revalidatePath("/admin/customers");
    return { id: customer.id, name: customer.name, phone: customer.phone };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save customer." };
  }
}
