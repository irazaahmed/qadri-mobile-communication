"use client";

import { useActionState } from "react";
import { updateSupplierAction } from "./actions";
import { Button, ErrorBanner, Field, Input } from "../../../_components/ui";

export function SupplierEditForm({
  supplier,
}: {
  supplier: { id: string; name: string; phone: string | null; address: string | null };
}) {
  const boundAction = updateSupplierAction.bind(null, supplier.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Name *">
        <Input name="name" required defaultValue={supplier.name} />
      </Field>
      <Field label="Phone">
        <Input name="phone" defaultValue={supplier.phone ?? ""} />
      </Field>
      <Field label="Address">
        <Input name="address" defaultValue={supplier.address ?? ""} />
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
