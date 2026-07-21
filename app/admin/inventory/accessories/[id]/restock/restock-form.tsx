"use client";

import { useActionState } from "react";
import { restockAccessoryAction } from "./actions";
import { Button, ErrorBanner, Field, Input } from "../../../../_components/ui";

export function RestockForm({
  accessory,
}: {
  accessory: { name: string; brand: string; variant: string | null; category: string; costPrice: string };
}) {
  const boundAction = restockAccessoryAction.bind(null, {
    name: accessory.name,
    brand: accessory.brand,
    variant: accessory.variant,
    category: accessory.category,
  });
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Quantity to add *">
        <Input name="quantity" type="number" min={1} required autoFocus placeholder="10" />
      </Field>
      <Field label="Cost price (this restock's rate) *" hint="Updates the accessory's cost basis to this rate.">
        <Input name="costPrice" type="number" min={0} step="0.01" required defaultValue={accessory.costPrice} />
      </Field>

      <div className="md:col-span-2">
        <ErrorBanner message={state?.error} />
      </div>

      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Restock"}
        </Button>
      </div>
      <p className="md:col-span-2 text-xs text-slate">
        This is a standalone stock correction — it is not a cash event and does not log against a supplier. For an
        invoiced restock, use a Purchase instead.
      </p>
    </form>
  );
}
