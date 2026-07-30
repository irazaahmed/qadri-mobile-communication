"use server";

import { prisma } from "@/lib/prisma";
import { appendSupplierLedger } from "@/lib/ledger";
import { Prisma, type Supplier } from "@prisma/client";

/**
 * lib/actions/suppliers.ts — plain CRUD. Suppliers have no unique phone
 * constraint in the schema; dedupe of inline-add flows is a UI-level
 * concern per the credit-and-ledger skill.
 */

export interface CreateSupplierInput {
  name: string;
  phone?: string | null;
  address?: string | null;
}

/**
 * Opening balance: for a supplier the shop already had a running balance
 * with before this system was adopted. "CREDIT" = the shop owed the
 * supplier money (adds to payable, same sign as a PURCHASE entry).
 * "ADVANCE" = the shop had already paid the supplier ahead (reduces
 * payable, same sign as a PAYMENT entry — can push the balance negative,
 * which the rest of the system already reads as available advance credit
 * that auto-applies to the supplier's next credit purchase).
 */
export type OpeningBalanceKind = "CREDIT" | "ADVANCE";

export interface OpeningBalanceInput {
  kind: OpeningBalanceKind;
  amount: number | string;
  note?: string | null;
}

async function appendSupplierOpeningBalance(
  tx: Prisma.TransactionClient,
  supplierId: string,
  input: OpeningBalanceInput
) {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Opening balance amount must be greater than zero.");
  }
  const signedAmount = input.kind === "CREDIT" ? amount : amount.negated();

  await appendSupplierLedger(tx, {
    supplierId,
    type: "OPENING_BALANCE",
    amount: signedAmount,
    note:
      input.note ||
      (input.kind === "CREDIT"
        ? "Opening balance — credit owed from before this system was in use"
        : "Opening balance — advance/deposit already paid from before this system was in use"),
  });
}

/**
 * Creates a supplier. When `openingBalance` is supplied (only used by the
 * manual "Add supplier" form), the create and the opening ledger entry
 * happen together in one transaction.
 */
export async function createSupplier(
  input: CreateSupplierInput,
  openingBalance?: OpeningBalanceInput
): Promise<Supplier> {
  const data = {
    name: input.name,
    phone: input.phone ?? null,
    address: input.address ?? null,
  };

  if (!openingBalance) {
    return prisma.supplier.create({ data });
  }

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({ data });
    await appendSupplierOpeningBalance(tx, supplier.id, openingBalance);
    return supplier;
  });
}

/** Records an opening balance against an already-existing supplier (e.g. one added before this feature existed). */
export async function recordSupplierOpeningBalance(supplierId: string, input: OpeningBalanceInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await appendSupplierOpeningBalance(tx, supplierId, input);
  });
}

/**
 * Undoes an opening balance entered by mistake. Ledger rows are never
 * edited, only offset — this appends a VOID entry reversing the exact
 * amount. Only allowed while it's still the supplier's latest ledger entry,
 * same guard as reversing an advance payment (see deletePayment).
 */
export async function deleteSupplierOpeningBalance(ledgerEntryId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.supplierLedgerEntry.findUnique({ where: { id: ledgerEntryId } });
    if (!entry) throw new Error("Opening balance entry not found.");
    if (entry.type !== "OPENING_BALANCE") {
      throw new Error("This ledger entry isn't an opening balance — nothing to undo here.");
    }

    const latest = await tx.supplierLedgerEntry.findFirst({
      where: { supplierId: entry.supplierId },
      orderBy: { createdAt: "desc" },
    });
    if (latest && latest.id !== entry.id) {
      throw new Error(
        "Other ledger activity has happened for this supplier since this was entered — it can no longer be undone cleanly. Enter an offsetting opening balance instead."
      );
    }

    await appendSupplierLedger(tx, {
      supplierId: entry.supplierId,
      type: "VOID",
      amount: entry.amount.negated(),
      note: "Removed opening balance entry",
    });
  });
}

export interface SupplierSearchFilters {
  name?: string;
  phone?: string;
}

export async function listSuppliers(filters: SupplierSearchFilters = {}): Promise<Supplier[]> {
  return prisma.supplier.findMany({
    where: {
      ...(filters.name ? { name: { contains: filters.name, mode: "insensitive" } } : {}),
      ...(filters.phone ? { phone: { contains: filters.phone } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  return prisma.supplier.findUnique({ where: { id } });
}

export interface UpdateSupplierInput {
  name?: string;
  phone?: string | null;
  address?: string | null;
}

export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<Supplier> {
  return prisma.supplier.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
    },
  });
}

export async function deleteSupplier(id: string): Promise<Supplier> {
  return prisma.supplier.delete({ where: { id } });
}

/**
 * Current payable balance per supplier (their ledger's latest balanceAfter),
 * for the Suppliers list — one query instead of one-per-row. Suppliers with
 * no ledger activity yet are simply absent from the map (treat as "0").
 */
export async function getSupplierBalances(): Promise<Map<string, string>> {
  const entries = await prisma.supplierLedgerEntry.findMany({
    orderBy: { createdAt: "asc" },
    select: { supplierId: true, balanceAfter: true },
  });

  const balances = new Map<string, string>();
  for (const entry of entries) {
    balances.set(entry.supplierId, entry.balanceAfter.toString());
  }
  return balances;
}
