import type { Claim } from "@prisma/client";

/**
 * lib/claim-status.ts
 *
 * Pure "stuck" computation for claims — never stored, always derived at
 * read/render time from `sentToSupplierAt` vs `now()`. See skill:
 * claims-lifecycle. Kept out of lib/actions/claims.ts ("use server") for the
 * same reason lib/warranty.ts is separate: a "use server" file may only
 * export async functions, and this is a synchronous pure function.
 */
export function isClaimStuck(claim: Pick<Claim, "status" | "sentToSupplierAt">, days = 14): boolean {
  if (claim.status !== "SENT_TO_SUPPLIER" || !claim.sentToSupplierAt) return false;
  const elapsedMs = Date.now() - new Date(claim.sentToSupplierAt).getTime();
  return elapsedMs > days * 86_400_000;
}
