"use server";

import { recordExpense, type RecordExpenseInput } from "@/lib/actions/expenses";
import { revalidatePath } from "next/cache";

export type RecordExpenseResult = { id: string } | { error: string };

export async function recordExpenseAction(input: RecordExpenseInput): Promise<RecordExpenseResult> {
  try {
    const expense = await recordExpense(input);
    revalidatePath("/admin/expenses");
    revalidatePath("/admin");
    return { id: expense.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record expense." };
  }
}
