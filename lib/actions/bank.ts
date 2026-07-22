"use server";

import { prisma } from "@/lib/prisma";
import { appendBankLedger } from "@/lib/ledger";
import { Prisma, type BankLedgerEntry } from "@prisma/client";

/**
 * lib/actions/bank.ts
 *
 * A bank balance tracker fully independent of the shop's cash ledger — see
 * the BankLedgerEntry model comment in schema.prisma. Nothing here reads or
 * writes CashLedgerEntry, and nothing in lib/actions/{purchases,sales,
 * payments,expenses,claims}.ts may import from this file.
 */

export interface RecordBankEntryInput {
  direction: "IN" | "OUT";
  type: string;
  amount: number | string;
  note?: string | null;
}

export async function recordBankEntry(input: RecordBankEntryInput): Promise<BankLedgerEntry> {
  const magnitude = new Prisma.Decimal(input.amount);
  if (magnitude.lessThanOrEqualTo(0)) {
    throw new Error("Amount must be greater than zero.");
  }
  if (!input.type.trim()) {
    throw new Error("Type is required.");
  }

  const signedAmount = input.direction === "OUT" ? magnitude.negated() : magnitude;

  return prisma.$transaction((tx) =>
    appendBankLedger(tx, {
      type: input.type.trim(),
      amount: signedAmount,
      note: input.note?.trim() || null,
    })
  );
}

export async function getBankBalance(): Promise<string> {
  const latest = await prisma.bankLedgerEntry.findFirst({
    orderBy: { createdAt: "desc" },
    select: { balanceAfter: true },
  });

  return (latest?.balanceAfter ?? new Prisma.Decimal(0)).toString();
}

export async function listBankEntries(): Promise<BankLedgerEntry[]> {
  return prisma.bankLedgerEntry.findMany({ orderBy: { createdAt: "desc" } });
}
