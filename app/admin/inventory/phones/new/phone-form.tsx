"use client";

import { useActionState } from "react";
import { createPhoneAction } from "./actions";
import { Button, ErrorBanner, Field, Input, Select } from "../../../_components/ui";

export function PhoneForm({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createPhoneAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="IMEI *">
        <Input name="imei" required autoFocus placeholder="356789..." />
      </Field>
      <Field label="Condition *">
        <Select name="condition" required defaultValue="NEW">
          <option value="NEW">New</option>
          <option value="USED">Used</option>
        </Select>
      </Field>
      <Field label="Brand *">
        <Input name="brand" required placeholder="Samsung" />
      </Field>
      <Field label="Model *">
        <Input name="model" required placeholder="Galaxy A54" />
      </Field>
      <Field label="Storage">
        <Input name="storage" placeholder="128GB" />
      </Field>
      <Field label="Color">
        <Input name="color" placeholder="Black" />
      </Field>
      <Field label="Warranty (months)" hint="Typically 12 for new, blank for used.">
        <Input name="warrantyMonths" type="number" min={0} placeholder="12" />
      </Field>
      <Field label="Cost price *">
        <Input name="costPrice" type="number" min={0} step="0.01" required placeholder="0.00" />
      </Field>
      <Field label="Supplier">
        <Select name="supplierId" defaultValue="">
          <option value="">— none —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="md:col-span-2">
        <ErrorBanner message={state?.error} />
      </div>

      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Add phone"}
        </Button>
      </div>
    </form>
  );
}
