"use server";

import { prisma } from "@/lib/prisma";
import type { Customer } from "@prisma/client";

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
 * Upserts a customer keyed on `phone` — never creates a duplicate row for a
 * phone number that already exists. If found, refreshes name/address to
 * whatever was just entered (keeps existing behavior predictable for the
 * inline-add-on-sale flow).
 */
export async function upsertCustomerByPhone(input: UpsertCustomerInput): Promise<Customer> {
  return prisma.customer.upsert({
    where: { phone: input.phone },
    update: {
      name: input.name,
      ...(input.address !== undefined ? { address: input.address } : {}),
    },
    create: {
      name: input.name,
      phone: input.phone,
      address: input.address ?? null,
    },
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
