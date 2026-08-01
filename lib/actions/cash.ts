"use server";

import { prisma } from "@/lib/prisma";
import { appendCashLedger } from "@/lib/ledger";
import { Prisma, type CashLedgerEntry } from "@prisma/client";

/**
 * lib/actions/cash.ts
 *
 * Manual cash-balance entries — the cash equivalent of a customer/supplier
 * "opening balance": lets the admin write down what's actually in the
 * drawer (typically once, when starting to use this system) without it
 * being tied to a real sale/purchase/payment. sourceType "MANUAL" per the
 * reserved value in lib/ledger.ts. Everything after this entry keeps
 * auto-adjusting through the normal appendCashLedger call sites exactly as
 * before — this file only adds the one missing manual entry point.
 */

export interface CashOpeningBalanceInput {
  amount: number | string;
  note?: string | null;
}

export async function recordCashOpeningBalance(input: CashOpeningBalanceInput): Promise<void> {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Amount must be greater than zero.");
  }

  await prisma.$transaction(async (tx) => {
    await appendCashLedger(tx, {
      sourceType: "MANUAL",
      amount,
      note: input.note || "Opening cash balance — cash on hand when this system went into use",
    });
  });
}

/**
 * Reverses a manual cash entry — only while it's still the single most
 * recent CashLedgerEntry (global, not per-party, since cash has no owner to
 * scope by). Once any sale/purchase/payment/expense has happened since, it
 * can no longer be undone cleanly; enter a new manual adjustment instead.
 * Mirrors deleteCustomerOpeningBalance/deleteSupplierOpeningBalance.
 */
export async function deleteCashOpeningBalance(ledgerEntryId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.cashLedgerEntry.findUnique({ where: { id: ledgerEntryId } });
    if (!entry) {
      throw new Error("Cash ledger entry not found.");
    }
    if (entry.sourceType !== "MANUAL") {
      throw new Error("This isn't a manual entry — nothing to undo here.");
    }

    const latest = await tx.cashLedgerEntry.findFirst({ orderBy: { createdAt: "desc" } });
    if (latest && latest.id !== entry.id) {
      throw new Error(
        "Other cash activity has happened since this was entered — it can no longer be undone cleanly. Enter a new adjustment instead."
      );
    }

    await appendCashLedger(tx, {
      sourceType: "MANUAL",
      amount: entry.amount.negated(),
      note: "Removed manual cash balance entry",
    });
  });
}

export async function listCashEntries(): Promise<CashLedgerEntry[]> {
  return prisma.cashLedgerEntry.findMany({ orderBy: { createdAt: "desc" } });
}
