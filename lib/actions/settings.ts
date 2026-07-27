"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * lib/actions/settings.ts
 *
 * Account-level settings for the single ADMIN user. Password rotation only
 * — no email change, no roles, no signup (matches auth.ts's "single manually
 * provisioned account" design). Hash rounds (12) match scripts/create-admin.ts.
 */

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  if (input.newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }
  if (input.newPassword !== input.confirmPassword) {
    throw new Error("New password and confirmation do not match.");
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });

  const isCurrentValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    throw new Error("Current password is incorrect.");
  }

  const isSameAsOld = await bcrypt.compare(input.newPassword, user.passwordHash);
  if (isSameAsOld) {
    throw new Error("New password must be different from the current password.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
}
