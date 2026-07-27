"use server";

import { auth } from "@/auth";
import { changePassword } from "@/lib/actions/settings";

export type ChangePasswordState = { error?: string; success?: string } | undefined;

export async function changePasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Not signed in." };
  }

  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "All fields are required." };
  }

  try {
    await changePassword({ userId, currentPassword, newPassword, confirmPassword });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to change password." };
  }

  return { success: "Password changed. Use it next time you log in." };
}
