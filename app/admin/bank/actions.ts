"use server";

import { recordBankEntry, type RecordBankEntryInput } from "@/lib/actions/bank";
import { revalidatePath } from "next/cache";

export type RecordBankEntryResult = { id: string } | { error: string };

export async function recordBankEntryAction(input: RecordBankEntryInput): Promise<RecordBankEntryResult> {
  try {
    const entry = await recordBankEntry(input);
    revalidatePath("/admin/bank");
    return { id: entry.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record bank entry." };
  }
}
