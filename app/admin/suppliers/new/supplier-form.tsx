"use client";

import { useActionState } from "react";
import { createSupplierAction } from "./actions";
import { Button, ErrorBanner, Field, Input, Select } from "../../_components/ui";

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

      <div className="rounded-xl border border-slate/15 p-4 md:col-span-2">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate">
          Previous balance (optional) — for a supplier we already owed or had already paid extra before this
          system was used (Pichla credit ya advance amount)
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Amount">
            <Input name="openingBalanceAmount" type="number" step="0.01" min="0" placeholder="0" />
          </Field>
          <Field label="Type">
            <Select name="openingBalanceKind" defaultValue="CREDIT">
              <option value="CREDIT">We owe them (previous credit)</option>
              <option value="ADVANCE">We already paid extra (advance/deposit)</option>
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Input name="openingBalanceNote" placeholder="e.g. balance as of handover" />
          </Field>
        </div>
      </div>

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
