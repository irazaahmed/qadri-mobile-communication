"use server";

import { prisma } from "@/lib/prisma";
import { appendCashLedger } from "@/lib/ledger";
import { Prisma, type Expense } from "@prisma/client";

/**
 * lib/actions/expenses.ts
 *
 * Expense tracking wired into the cash ledger per the cash-ledger-and-profit
 * skill: every expense writes exactly one CashLedgerEntry(-amount,
 * sourceType "EXPENSE") in the same transaction as the Expense row.
 */

export interface RecordExpenseInput {
  category: string;
  amount: number | string;
  note?: string | null;
}

export async function recordExpense(input: RecordExpenseInput): Promise<Expense> {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Expense amount must be greater than zero.");
  }
  if (!input.category.trim()) {
    throw new Error("Category is required.");
  }

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: { category: input.category.trim(), amount, note: input.note?.trim() || null },
    });

    await appendCashLedger(tx, {
      sourceType: "EXPENSE",
      sourceId: expense.id,
      amount: amount.negated(),
      note: `${expense.category}${expense.note ? ` — ${expense.note}` : ""}`,
    });

    return expense;
  });
}

export interface ExpenseSearchFilters {
  from?: Date;
  to?: Date;
}

export async function listExpenses(filters: ExpenseSearchFilters = {}): Promise<Expense[]> {
  return prisma.expense.findMany({
    where:
      filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {},
    orderBy: { createdAt: "desc" },
  });
}
