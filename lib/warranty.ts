/**
 * lib/warranty.ts
 *
 * Pure warranty-status computation — never stored, always derived at
 * read/render time from `warrantyStartDate + warrantyMonths` vs `now()`.
 * See skill: phone-inventory.
 *
 * Kept in its own plain (non "use server") module so it can be imported by
 * both server actions (lib/actions/phones.ts) and client/server UI code
 * without going through a server-action round trip — a "use server" file may
 * only export async functions, and this is a synchronous pure function.
 */

export type WarrantyStatus = "IN_WARRANTY" | "EXPIRED" | "N/A";

export function computeWarrantyStatus(phone: {
  warrantyStartDate: Date | null;
  warrantyMonths: number | null;
}): WarrantyStatus {
  if (!phone.warrantyStartDate || !phone.warrantyMonths) {
    return "N/A";
  }

  const expiry = new Date(phone.warrantyStartDate);
  expiry.setMonth(expiry.getMonth() + phone.warrantyMonths);

  return expiry.getTime() >= Date.now() ? "IN_WARRANTY" : "EXPIRED";
}
