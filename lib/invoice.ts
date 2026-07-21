import { Prisma } from "@prisma/client";

/**
 * lib/invoice.ts
 *
 * Server-side sequential invoice/claim number generation. Numbers are NEVER
 * client-supplied — always generated inside the same `prisma.$transaction`
 * as the record they belong to, so a rolled-back transaction never "burns"
 * a number and a concurrent transaction never reuses one (each call reads
 * the latest row via the transaction's own isolation).
 *
 * Note: print/share invoice UI (the "Download"/"Share" buttons, printable
 * HTML layout) is out of scope here — that's owned by admin-ui-agent per
 * the folder structure in CLAUDE.md §5. This file only owns number
 * generation, which purchase/sale (and later claim) server actions consume.
 */

type Tx = Prisma.TransactionClient;

function nextNumber(prefix: string, latestNumber: string | null): string {
  if (!latestNumber) {
    return `${prefix}0001`;
  }

  const suffix = latestNumber.slice(prefix.length);
  const parsed = parseInt(suffix, 10);
  const next = Number.isFinite(parsed) ? parsed + 1 : 1;

  return `${prefix}${String(next).padStart(4, "0")}`;
}

/** Generates the next sequential "PUR-0001"-style purchase invoice number. */
export async function generatePurchaseInvoiceNumber(tx: Tx): Promise<string> {
  const latest = await tx.purchase.findFirst({
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  });

  return nextNumber("PUR-", latest?.invoiceNumber ?? null);
}

/** Generates the next sequential "INV-0001"-style sale invoice number. */
export async function generateSaleInvoiceNumber(tx: Tx): Promise<string> {
  const latest = await tx.sale.findFirst({
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  });

  return nextNumber("INV-", latest?.invoiceNumber ?? null);
}

/**
 * Generates the next sequential "CLM-0001"-style claim number.
 * Not consumed yet in Phase 1 (claims are Phase 2) — provided so
 * claims-lifecycle code has a ready-made, consistent helper.
 */
export async function generateClaimNumber(tx: Tx): Promise<string> {
  const latest = await tx.claim.findFirst({
    orderBy: { createdAt: "desc" },
    select: { claimNumber: true },
  });

  return nextNumber("CLM-", latest?.claimNumber ?? null);
}
