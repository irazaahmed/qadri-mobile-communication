"use server";

import { prisma } from "@/lib/prisma";
import { appendCustomerLedger, appendCashLedger } from "@/lib/ledger";
import { generateClaimNumber } from "@/lib/invoice";
import { Prisma, PhoneStatus, PurchaseItemType, type Claim, type Customer, type Phone, type Accessory, type Supplier } from "@prisma/client";

/**
 * lib/actions/claims.ts
 *
 * Full customer return/warranty claim lifecycle per the claims-lifecycle
 * skill (mirrors CLAUDE.md §4.6): status only ever moves forward through
 * RECEIVED_FROM_CUSTOMER -> SENT_TO_SUPPLIER -> RECEIVED_FROM_SUPPLIER ->
 * DELIVERED_TO_CUSTOMER, or jumps to a terminal state (REFUNDED/REJECTED)
 * from wherever it currently sits. Each stage's timestamp is set exactly
 * once. Phone.status transitions for CLAIMED/WITH_SUPPLIER belong
 * exclusively here — purchase/sale code never sets them.
 *
 * A claimed item always goes back to the customer who claimed it — there is
 * no "return the supplier's replacement to general stock" path. The only
 * ways a claim resolves:
 *   - DELIVERED_TO_CUSTOMER: item (repaired original or supplier
 *     replacement) handed back to the same customer -> Phone.status = SOLD
 *     (it's exactly the same situation as any other sold, in-warranty unit).
 *   - REFUNDED: customer took money instead of the item -> the physical
 *     unit stays with the shop and becomes sellable again -> Phone.status
 *     = IN_STOCK. Only applies if the phone is currently CLAIMED (i.e.
 *     physically in hand); if it's still WITH_SUPPLIER at refund time, the
 *     status is left alone since we don't have the unit yet — resolve it
 *     manually once it's back.
 *   - REJECTED: claim denied, item handed back to the customer exactly as
 *     it was -> Phone.status = SOLD. Same WITH_SUPPLIER caveat as REFUNDED.
 */

export interface CreateClaimInput {
  customerId: string;
  itemType: "PHONE" | "ACCESSORY";
  phoneId?: string;
  accessoryId?: string;
  quantity?: number; // ACCESSORY only
  reason: string;
}

export async function createClaim(input: CreateClaimInput): Promise<Claim> {
  if (input.itemType === "PHONE" && !input.phoneId) {
    throw new Error("phoneId is required for a phone claim.");
  }
  if (input.itemType === "ACCESSORY" && (!input.accessoryId || !input.quantity || input.quantity <= 0)) {
    throw new Error("accessoryId and a positive quantity are required for an accessory claim.");
  }
  if (!input.reason.trim()) {
    throw new Error("A reason is required.");
  }

  return prisma.$transaction(async (tx) => {
    if (input.itemType === "PHONE") {
      const phone = await tx.phone.findUniqueOrThrow({ where: { id: input.phoneId! } });
      if (phone.status !== PhoneStatus.SOLD) {
        throw new Error(
          `Phone ${phone.imei} is not SOLD (current status: ${phone.status}) — only a sold phone can be claimed.`
        );
      }
    }

    const claimNumber = await generateClaimNumber(tx);

    const claim = await tx.claim.create({
      data: {
        claimNumber,
        customerId: input.customerId,
        itemType: input.itemType === "PHONE" ? PurchaseItemType.PHONE : PurchaseItemType.ACCESSORY,
        phoneId: input.itemType === "PHONE" ? input.phoneId : null,
        accessoryId: input.itemType === "ACCESSORY" ? input.accessoryId : null,
        quantity: input.itemType === "ACCESSORY" ? input.quantity : null,
        reason: input.reason.trim(),
        status: "RECEIVED_FROM_CUSTOMER",
      },
    });

    if (input.itemType === "PHONE") {
      await tx.phone.update({ where: { id: input.phoneId! }, data: { status: PhoneStatus.CLAIMED } });
    }

    return claim;
  });
}

export interface SendClaimToSupplierInput {
  supplierId: string;
}

export async function sendClaimToSupplier(claimId: string, input: SendClaimToSupplierInput): Promise<Claim> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId } });

    if (claim.status !== "RECEIVED_FROM_CUSTOMER") {
      throw new Error(`Claim ${claim.claimNumber} is at ${claim.status}, not RECEIVED_FROM_CUSTOMER.`);
    }

    const updated = await tx.claim.update({
      where: { id: claimId },
      data: { status: "SENT_TO_SUPPLIER", supplierId: input.supplierId, sentToSupplierAt: new Date() },
    });

    if (claim.itemType === "PHONE" && claim.phoneId) {
      await tx.phone.update({ where: { id: claim.phoneId }, data: { status: PhoneStatus.WITH_SUPPLIER } });
    }

    return updated;
  });
}

export async function receiveClaimFromSupplier(claimId: string): Promise<Claim> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId } });

    if (claim.status !== "SENT_TO_SUPPLIER") {
      throw new Error(`Claim ${claim.claimNumber} is at ${claim.status}, not SENT_TO_SUPPLIER.`);
    }

    const updated = await tx.claim.update({
      where: { id: claimId },
      data: { status: "RECEIVED_FROM_SUPPLIER", receivedFromSupplierAt: new Date() },
    });

    // Item is back in the shop's hands, held for redelivery to the original customer.
    if (claim.itemType === "PHONE" && claim.phoneId) {
      await tx.phone.update({ where: { id: claim.phoneId }, data: { status: PhoneStatus.CLAIMED } });
    }

    return updated;
  });
}

export async function deliverClaimToCustomer(claimId: string): Promise<Claim> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId } });

    if (claim.status !== "RECEIVED_FROM_SUPPLIER") {
      throw new Error(`Claim ${claim.claimNumber} is at ${claim.status}, not RECEIVED_FROM_SUPPLIER.`);
    }

    const updated = await tx.claim.update({
      where: { id: claimId },
      data: { status: "DELIVERED_TO_CUSTOMER", deliveredToCustomerAt: new Date() },
    });

    // Item is back with the customer — same as any other sold unit.
    if (claim.itemType === "PHONE" && claim.phoneId) {
      await tx.phone.update({ where: { id: claim.phoneId }, data: { status: PhoneStatus.SOLD } });
    }

    return updated;
  });
}

const TERMINAL_STATES = new Set(["DELIVERED_TO_CUSTOMER", "REFUNDED", "REJECTED"]);

export interface RefundClaimInput {
  amount: number | string;
}

export async function refundClaim(claimId: string, input: RefundClaimInput): Promise<Claim> {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Refund amount must be greater than zero.");
  }

  return prisma.$transaction(async (tx) => {
    const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId } });

    if (TERMINAL_STATES.has(claim.status)) {
      throw new Error(`Claim ${claim.claimNumber} is already ${claim.status} — cannot refund.`);
    }

    const updated = await tx.claim.update({
      where: { id: claimId },
      data: { status: "REFUNDED", resolutionNote: `Refunded ${amount.toString()}` },
    });

    // Customer took money instead of the item — if the unit is physically in
    // hand (CLAIMED), it becomes sellable again. If it's still WITH_SUPPLIER
    // we don't have it yet, so leave the status alone and resolve manually
    // once it's back.
    if (claim.itemType === "PHONE" && claim.phoneId) {
      const phone = await tx.phone.findUniqueOrThrow({ where: { id: claim.phoneId } });
      if (phone.status === PhoneStatus.CLAIMED) {
        await tx.phone.update({ where: { id: claim.phoneId }, data: { status: PhoneStatus.IN_STOCK } });
      }
    }

    await appendCustomerLedger(tx, {
      customerId: claim.customerId,
      claimId: claim.id,
      type: "CLAIM_REFUND",
      amount: amount.negated(),
      note: `Refund for claim ${claim.claimNumber}`,
    });

    await appendCashLedger(tx, {
      sourceType: "CLAIM_REFUND",
      sourceId: claim.id,
      amount: amount.negated(),
      note: `Refund for claim ${claim.claimNumber}`,
    });

    return updated;
  });
}

export interface RejectClaimInput {
  resolutionNote: string;
}

export async function rejectClaim(claimId: string, input: RejectClaimInput): Promise<Claim> {
  if (!input.resolutionNote.trim()) {
    throw new Error("A resolution note is required to reject a claim.");
  }

  return prisma.$transaction(async (tx) => {
    const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId } });

    if (TERMINAL_STATES.has(claim.status)) {
      throw new Error(`Claim ${claim.claimNumber} is already ${claim.status} — cannot reject.`);
    }

    const updated = await tx.claim.update({
      where: { id: claimId },
      data: { status: "REJECTED", resolutionNote: input.resolutionNote.trim() },
    });

    // Claim denied — item handed back to the customer exactly as it was. If
    // it's still WITH_SUPPLIER we don't have it yet, so leave the status
    // alone and resolve manually once it's back.
    if (claim.itemType === "PHONE" && claim.phoneId) {
      const phone = await tx.phone.findUniqueOrThrow({ where: { id: claim.phoneId } });
      if (phone.status === PhoneStatus.CLAIMED) {
        await tx.phone.update({ where: { id: claim.phoneId }, data: { status: PhoneStatus.SOLD } });
      }
    }

    return updated;
  });
}

export type ClaimWithRelations = Claim & {
  customer: Customer;
  phone: Phone | null;
  accessory: Accessory | null;
  supplier: Supplier | null;
};

const CLAIM_RELATIONS = { customer: true, phone: true, accessory: true, supplier: true } as const;

export async function listClaims(): Promise<ClaimWithRelations[]> {
  return prisma.claim.findMany({ include: CLAIM_RELATIONS, orderBy: { createdAt: "desc" } });
}

export async function getClaimById(id: string): Promise<ClaimWithRelations | null> {
  return prisma.claim.findUnique({ where: { id }, include: CLAIM_RELATIONS });
}
