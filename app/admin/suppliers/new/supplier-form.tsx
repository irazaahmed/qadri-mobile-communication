"use client";

import { useActionState } from "react";
import { createSupplierAction } from "./actions";
import { Button, ErrorBanner, Field, Input } from "../../_components/ui";

export function SupplierForm() {
  const [state, formAction, pending] = useActionState(createSupplierAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Name *">
        <Input name="name" required autoFocus placeholder="Al-Karam Mobiles" />
      </Field>
      <Field label="Phone">
        <Input name="phone" placeholder="03xx-xxxxxxx" />
      </Field>
      <Field label="Address">
        <Input name="address" placeholder="Saddar, Karachi" />
      </Field>

      <div className="md:col-span-2">
        <ErrorBanner message={state?.error} />
      </div>

      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Add supplier"}
        </Button>
      </div>
    </form>
  );
}
