"use server";

import { prisma } from "@/lib/prisma";
import { appendCustomerLedger } from "@/lib/ledger";
import { Prisma, type Customer } from "@prisma/client";

/**
 * lib/actions/customers.ts — plain CRUD. `Customer.phone` is unique in the
 * schema; create/upsert must dedupe by phone per the credit-and-ledger
 * skill's "customer upsert-by-phone" rule (used by the inline-add-on-sale
 * flow).
 */

export interface UpsertCustomerInput {
  name: string;
  phone: string;
  address?: string | null;
}

/**
 * Opening balance: for a customer who already had a running balance with the
 * shop before this system was adopted (no software receipts to re-key as
 * dated sales). "CREDIT" = the customer owed the shop money (adds to their
 * receivable, same sign as a SALE entry). "ADVANCE" = the customer had
 * already overpaid/deposited money with the shop (reduces their receivable,
 * same sign as a PAYMENT entry — can push the balance negative, which the
 * rest of the system already reads as available advance credit that
 * auto-applies to their next credit sale).
 */
export type OpeningBalanceKind = "CREDIT" | "ADVANCE";

export interface OpeningBalanceInput {
  kind: OpeningBalanceKind;
  amount: number | string;
  note?: string | null;
}

async function appendCustomerOpeningBalance(
  tx: Prisma.TransactionClient,
  customerId: string,
  input: OpeningBalanceInput
) {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Opening balance amount must be greater than zero.");
  }
  const signedAmount = input.kind === "CREDIT" ? amount : amount.negated();

  await appendCustomerLedger(tx, {
    customerId,
    type: "OPENING_BALANCE",
    amount: signedAmount,
    note:
      input.note ||
      (input.kind === "CREDIT"
        ? "Opening balance — credit owed from before this system was in use"
        : "Opening balance — advance/deposit already held from before this system was in use"),
  });
}

/**
 * Upserts a customer keyed on `phone` — never creates a duplicate row for a
 * phone number that already exists. If found, refreshes name/address to
 * whatever was just entered (keeps existing behavior predictable for the
 * inline-add-on-sale flow). When `openingBalance` is supplied (only used by
 * the manual "Add customer" form), the upsert and the opening ledger entry
 * happen together in one transaction.
 */
export async function upsertCustomerByPhone(
  input: UpsertCustomerInput,
  openingBalance?: OpeningBalanceInput
): Promise<Customer> {
  const data = {
    update: {
      name: input.name,
      ...(input.address !== undefined ? { address: input.address } : {}),
    },
    create: {
      name: input.name,
      phone: input.phone,
      address: input.address ?? null,
    },
  };

  if (!openingBalance) {
    return prisma.customer.upsert({ where: { phone: input.phone }, ...data });
  }

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({ where: { phone: input.phone }, ...data });
    await appendCustomerOpeningBalance(tx, customer.id, openingBalance);
    return customer;
  });
}

/** Records an opening balance against an already-existing customer (e.g. one added before this feature existed, or via the inline-add-on-sale flow). */
export async function recordCustomerOpeningBalance(customerId: string, input: OpeningBalanceInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await appendCustomerOpeningBalance(tx, customerId, input);
  });
}

/**
 * Undoes an opening balance entered by mistake. Ledger rows are never
 * edited, only offset — this appends a VOID entry reversing the exact
 * amount. Only allowed while it's still the customer's latest ledger entry,
 * same guard as reversing an advance payment (see deletePayment): once
 * something later has been computed against the running balance it created
 * (e.g. a credit sale that auto-applied it as advance), undoing it out from
 * under that would leave that sale's paidAmount unbacked.
 */
export async function deleteCustomerOpeningBalance(ledgerEntryId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.customerLedgerEntry.findUnique({ where: { id: ledgerEntryId } });
    if (!entry) throw new Error("Opening balance entry not found.");
    if (entry.type !== "OPENING_BALANCE") {
      throw new Error("This ledger entry isn't an opening balance — nothing to undo here.");
    }

    const latest = await tx.customerLedgerEntry.findFirst({
      where: { customerId: entry.customerId },
      orderBy: { createdAt: "desc" },
    });
    if (latest && latest.id !== entry.id) {
      throw new Error(
        "Other ledger activity has happened for this customer since this was entered — it can no longer be undone cleanly. Enter an offsetting opening balance instead."
      );
    }

    await appendCustomerLedger(tx, {
      customerId: entry.customerId,
      type: "VOID",
      amount: entry.amount.negated(),
      note: "Removed opening balance entry",
    });
  });
}

export interface CustomerSearchFilters {
  name?: string;
  phone?: string;
}

export async function listCustomers(filters: CustomerSearchFilters = {}): Promise<Customer[]> {
  return prisma.customer.findMany({
    where: {
      ...(filters.name ? { name: { contains: filters.name, mode: "insensitive" } } : {}),
      ...(filters.phone ? { phone: { contains: filters.phone } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  return prisma.customer.findUnique({ where: { id } });
}

export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  return prisma.customer.findUnique({ where: { phone } });
}

export interface UpdateCustomerInput {
  name?: string;
  address?: string | null;
  /** Changing phone re-keys the dedupe identity — validated against the unique constraint. */
  phone?: string;
}

export async function updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer> {
  return prisma.customer.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
  });
}

export async function deleteCustomer(id: string): Promise<Customer> {
  return prisma.customer.delete({ where: { id } });
}

/**
 * Current receivable balance per customer (their ledger's latest
 * balanceAfter), for the Customers list — one query instead of one-per-row.
 * Customers with no ledger activity yet are simply absent from the map
 * (treat as "0").
 */
export async function getCustomerBalances(): Promise<Map<string, string>> {
  const entries = await prisma.customerLedgerEntry.findMany({
    orderBy: { createdAt: "asc" },
    select: { customerId: true, balanceAfter: true },
  });

  const balances = new Map<string, string>();
  for (const entry of entries) {
    balances.set(entry.customerId, entry.balanceAfter.toString());
  }
  return balances;
}
