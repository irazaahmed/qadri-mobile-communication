"use server";

import { createSale, type CreateSaleInput } from "@/lib/actions/sales";
import { upsertCustomerByPhone } from "@/lib/actions/customers";
import { revalidatePath } from "next/cache";

export type CreateSaleResult = { id: string; invoiceNumber: string } | { error: string };

/**
 * Thin client-callable wrapper around createSale. Returns only plain
 * serializable fields — never the Sale/SaleItem rows themselves (Decimal
 * fields can't cross the Server Function boundary to a Client Component).
 */
export async function createSaleAction(input: CreateSaleInput): Promise<CreateSaleResult> {
  try {
    const sale = await createSale(input);
    revalidatePath("/admin/sales");
    revalidatePath("/admin/inventory/phones");
    revalidatePath("/admin/inventory/accessories");
    revalidatePath("/admin/bank");
    return { id: sale.id, invoiceNumber: sale.invoiceNumber };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record sale." };
  }
}

export type UpsertCustomerResult =
  | { id: string; name: string; phone: string }
  | { error: string };

export async function upsertCustomerAction(input: {
  name: string;
  phone: string;
}): Promise<UpsertCustomerResult> {
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
