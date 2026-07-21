"use client";

import { useActionState } from "react";
import { updateCustomerAction } from "./actions";
import { Button, ErrorBanner, Field, Input } from "../../../_components/ui";

export function CustomerEditForm({
  customer,
}: {
  customer: { id: string; name: string; phone: string; address: string | null };
}) {
  const boundAction = updateCustomerAction.bind(null, customer.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Name *">
        <Input name="name" required defaultValue={customer.name} />
      </Field>
      <Field label="Phone *">
        <Input name="phone" required defaultValue={customer.phone} />
      </Field>
      <Field label="Address">
        <Input name="address" defaultValue={customer.address ?? ""} />
      </Field>

      <div className="md:col-span-2">
        <ErrorBanner message={state?.error} />
      </div>

      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
