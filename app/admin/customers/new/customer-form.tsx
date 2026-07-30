"use client";

import { useActionState } from "react";
import { createCustomerAction } from "./actions";
import { Button, ErrorBanner, Field, Input, Select } from "../../_components/ui";

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

      <div className="rounded-xl border border-slate/15 p-4 md:col-span-2">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate">
          Previous balance (optional) — for a customer who already owed or had deposited money before this system
          was used (Pichla credit ya jama shuda amount)
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Amount">
            <Input name="openingBalanceAmount" type="number" step="0.01" min="0" placeholder="0" />
          </Field>
          <Field label="Type">
            <Select name="openingBalanceKind" defaultValue="CREDIT">
              <option value="CREDIT">Customer owes us (previous credit)</option>
              <option value="ADVANCE">Customer already paid extra (advance/deposit)</option>
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
          {pending ? "Saving..." : "Add customer"}
        </Button>
      </div>
    </form>
  );
}
