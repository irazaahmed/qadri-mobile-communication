"use client";

import { useActionState } from "react";
import { createAccessoryAction } from "./actions";
import { Button, ErrorBanner, Field, Input } from "../../../_components/ui";

export function AccessoryForm() {
  const [state, formAction, pending] = useActionState(createAccessoryAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Name *">
        <Input name="name" required autoFocus placeholder="Fast charger" />
      </Field>
      <Field label="Brand *">
        <Input name="brand" required placeholder="Samsung" />
      </Field>
      <Field label="Category *">
        <Input name="category" required placeholder="Charger" />
      </Field>
      <Field label="Variant" hint="Leave blank if this accessory has no variant.">
        <Input name="variant" placeholder="Type-C, 25W" />
      </Field>
      <Field label="Cost price *">
        <Input name="costPrice" type="number" min={0} step="0.01" required placeholder="0.00" />
      </Field>
      <Field label="Sale price *">
        <Input name="salePrice" type="number" min={0} step="0.01" required placeholder="0.00" />
      </Field>
      <Field label="Initial quantity" hint="Defaults to 0 — use Restock afterwards, or a Purchase invoice.">
        <Input name="quantity" type="number" min={0} placeholder="0" />
      </Field>
      <Field label="Low stock threshold">
        <Input name="lowStockThreshold" type="number" min={0} placeholder="5" />
      </Field>

      <div className="md:col-span-2">
        <ErrorBanner message={state?.error} />
      </div>

      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Add accessory"}
        </Button>
      </div>
    </form>
  );
}
