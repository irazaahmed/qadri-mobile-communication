"use client";

import { useActionState } from "react";
import { createCustomerAction } from "./actions";
import { Button, ErrorBanner, Field, Input } from "../../_components/ui";

export function CustomerForm() {
  const [state, formAction, pending] = useActionState(createCustomerAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Name *">
        <Input name="name" required autoFocus placeholder="Ahmed Raza" />
      </Field>
      <Field label="Phone *" hint="Used as the unique key — re-entering an existing phone updates that customer.">
        <Input name="phone" required placeholder="03xx-xxxxxxx" />
      </Field>
      <Field label="Address">
        <Input name="address" placeholder="Gulshan, Karachi" />
      </Field>

      <div className="md:col-span-2">
        <ErrorBanner message={state?.error} />
      </div>

      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Add customer"}
        </Button>
      </div>
    </form>
  );
}
