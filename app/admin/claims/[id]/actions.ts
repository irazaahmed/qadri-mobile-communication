"use server";

import {
  sendClaimToSupplier,
  receiveClaimFromSupplier,
  deliverClaimToCustomer,
  refundClaim,
  rejectClaim,
} from "@/lib/actions/claims";
import { revalidatePath } from "next/cache";

export type ClaimActionResult = { ok: true } | { error: string };

function revalidateClaim(claimId: string) {
  revalidatePath(`/admin/claims/${claimId}`);
  revalidatePath("/admin/claims");
  revalidatePath("/admin/inventory/phones");
}

export async function sendClaimToSupplierAction(claimId: string, supplierId: string): Promise<ClaimActionResult> {
  try {
    await sendClaimToSupplier(claimId, { supplierId });
    revalidateClaim(claimId);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to send claim to supplier." };
  }
}

export async function receiveClaimFromSupplierAction(claimId: string): Promise<ClaimActionResult> {
  try {
    await receiveClaimFromSupplier(claimId);
    revalidateClaim(claimId);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to record receipt from supplier." };
  }
}

export async function deliverClaimToCustomerAction(claimId: string): Promise<ClaimActionResult> {
  try {
    await deliverClaimToCustomer(claimId);
    revalidateClaim(claimId);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to mark claim delivered." };
  }
}

export async function refundClaimAction(claimId: string, amount: string): Promise<ClaimActionResult> {
  try {
    await refundClaim(claimId, { amount });
    revalidateClaim(claimId);
    revalidatePath("/admin/customers");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to refund claim." };
  }
}

export async function rejectClaimAction(claimId: string, resolutionNote: string): Promise<ClaimActionResult> {
  try {
    await rejectClaim(claimId, { resolutionNote });
    revalidateClaim(claimId);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to reject claim." };
  }
}
