"use client";

import { useActionState } from "react";
import { updateAccessoryAction } from "./actions";
import { Button, ErrorBanner, Field, Input } from "../../../../_components/ui";

export interface AccessoryEditInitial {
  id: string;
  name: string;
  brand: string;
  variant: string | null;
  category: string;
  costPrice: string;
  salePrice: string;
  quantity: number;
  lowStockThreshold: number | null;
}

export function AccessoryEditForm({ accessory }: { accessory: AccessoryEditInitial }) {
  const boundAction = updateAccessoryAction.bind(null, accessory.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-lg bg-surface-muted p-4 text-sm">
        <div>
          <p className="text-xs text-slate">Name</p>
          <p className="font-medium">{accessory.name}</p>
        </div>
        <div>
          <p className="text-xs text-slate">Brand / Variant</p>
          <p>
            {accessory.brand}
            {accessory.variant ? ` / ${accessory.variant}` : ""}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate">Current quantity</p>
          <p className="font-semibold">{accessory.quantity}</p>
        </div>
        <p className="text-xs text-slate">
          Quantity only changes via Purchases or the Restock action — not editable here.
        </p>
      </div>

      <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Category *">
          <Input name="category" required defaultValue={accessory.category} />
        </Field>
        <Field label="Sale price *">
          <Input name="salePrice" type="number" min={0} step="0.01" required defaultValue={accessory.salePrice} />
        </Field>
        <Field label="Low stock threshold">
          <Input
            name="lowStockThreshold"
            type="number"
            min={0}
            defaultValue={accessory.lowStockThreshold ?? ""}
          />
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
    </div>
  );
}
