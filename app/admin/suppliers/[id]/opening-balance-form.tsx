"use client";

import { useActionState } from "react";
import { addSupplierOpeningBalanceAction } from "./opening-balance-actions";
import { Button, ErrorBanner, Field, Input, Select, SuccessBanner } from "../../_components/ui";

export function SupplierOpeningBalanceForm({ supplierId }: { supplierId: string }) {
  const boundAction = addSupplierOpeningBalanceAction.bind(null, supplierId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-xs text-slate">
        For a balance we already had with this supplier before this system was used — no cash moves today, it only
        adjusts the payable balance. (Is system se pehle ka baqaya — abhi koi cash move nahi hoga.)
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Amount">
          <Input name="amount" type="number" step="0.01" min="0.01" className="w-36" required />
        </Field>
        <Field label="Type">
          <Select name="kind" defaultValue="CREDIT" className="w-56">
            <option value="CREDIT">We owe them (previous credit)</option>
            <option value="ADVANCE">We already paid extra (advance)</option>
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Input name="note" className="w-48" placeholder="Reference / memo" />
        </Field>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving..." : "Add opening balance"}
        </Button>
      </div>
      <ErrorBanner message={state?.error} />
      <SuccessBanner message={state?.success} />
    </form>
  );
}
