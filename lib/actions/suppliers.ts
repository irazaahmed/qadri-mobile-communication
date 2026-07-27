"use server";

import { prisma } from "@/lib/prisma";
import type { Supplier } from "@prisma/client";

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

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  return prisma.supplier.create({
    data: {
      name: input.name,
      phone: input.phone ?? null,
      address: input.address ?? null,
    },
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
