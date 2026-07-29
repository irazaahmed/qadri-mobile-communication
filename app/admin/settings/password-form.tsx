"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction } from "./actions";
import { Button, ErrorBanner, Field, Input, SuccessBanner } from "../_components/ui";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-4 md:max-w-md">
      <Field label="Current password *">
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password *" hint="At least 8 characters. (Kam az kam 8 characters.)">
        <Input name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm new password *">
        <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </Field>

      <ErrorBanner message={state?.error} />
      <SuccessBanner message={state?.success} />

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Change password"}
        </Button>
      </div>
    </form>
  );
}
