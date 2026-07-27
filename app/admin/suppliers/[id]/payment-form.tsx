"use client";

import { useActionState } from "react";
import { recordSupplierBulkPaymentAction } from "./payment-actions";
import { Button, ErrorBanner, Field, Input, Select, SuccessBanner } from "../../_components/ui";

export function SupplierBulkPaymentForm({ supplierId, outstanding }: { supplierId: string; outstanding: number }) {
  const boundAction = recordSupplierBulkPaymentAction.bind(null, supplierId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Amount">
          <Input name="amount" type="number" step="0.01" min="0.01" max={outstanding} className="w-36" required />
        </Field>
        <Field label="Method">
          <Select name="method" defaultValue="CASH" className="w-40">
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="JAZZCASH">JazzCash</option>
            <option value="EASYPAISA">EasyPaisa</option>
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Input name="note" className="w-48" placeholder="Reference / memo" />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Recording..." : "Record payment"}
        </Button>
      </div>
      <p className="text-xs text-slate/80">Purani se nayi invoice tarteeb mein khud adjust hoga.</p>
      <ErrorBanner message={state?.error} />
      <SuccessBanner message={state?.success} />
    </form>
  );
}
