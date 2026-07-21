"use client";

import { useActionState } from "react";
import { updatePhoneAction } from "./actions";
import { Badge, Button, ErrorBanner, Field, Input, Select } from "../../../../_components/ui";
import { formatDateTime } from "../../../../_lib/format";
import type { WarrantyStatus } from "@/lib/warranty";

export interface PhoneEditInitial {
  id: string;
  imei: string;
  brand: string;
  model: string;
  storage: string | null;
  color: string | null;
  condition: string;
  warrantyMonths: number | null;
  costPrice: string;
  salePrice: string | null;
  supplierId: string | null;
  status: string;
  soldAt: string | null;
  warrantyStatus: WarrantyStatus;
}

const WARRANTY_BADGE = {
  IN_WARRANTY: "success",
  EXPIRED: "danger",
  "N/A": "slate",
} as const;

export function PhoneEditForm({
  phone,
  suppliers,
}: {
  phone: PhoneEditInitial;
  suppliers: { id: string; name: string }[];
}) {
  const boundAction = updatePhoneAction.bind(null, phone.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-lg bg-surface-muted p-4 text-sm">
        <div>
          <p className="text-xs text-slate">IMEI</p>
          <p className="font-mono">{phone.imei}</p>
        </div>
        <div>
          <p className="text-xs text-slate">Status</p>
          <Badge variant="teal">{phone.status.replaceAll("_", " ")}</Badge>
        </div>
        <div>
          <p className="text-xs text-slate">Warranty</p>
          <Badge variant={WARRANTY_BADGE[phone.warrantyStatus]}>{phone.warrantyStatus}</Badge>
        </div>
        {phone.soldAt ? (
          <div>
            <p className="text-xs text-slate">Sold at</p>
            <p>{formatDateTime(phone.soldAt)}</p>
          </div>
        ) : null}
        <p className="text-xs text-slate">Status, sold date and IMEI are only changed by sale/claim flows.</p>
      </div>

      <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Condition *">
          <Select name="condition" required defaultValue={phone.condition}>
            <option value="NEW">New</option>
            <option value="USED">Used</option>
          </Select>
        </Field>
        <Field label="Brand *">
          <Input name="brand" required defaultValue={phone.brand} />
        </Field>
        <Field label="Model *">
          <Input name="model" required defaultValue={phone.model} />
        </Field>
        <Field label="Storage">
          <Input name="storage" defaultValue={phone.storage ?? ""} />
        </Field>
        <Field label="Color">
          <Input name="color" defaultValue={phone.color ?? ""} />
        </Field>
        <Field label="Warranty (months)">
          <Input name="warrantyMonths" type="number" min={0} defaultValue={phone.warrantyMonths ?? ""} />
        </Field>
        <Field label="Cost price *">
          <Input name="costPrice" type="number" min={0} step="0.01" required defaultValue={phone.costPrice} />
        </Field>
        <Field label="Supplier">
          <Select name="supplierId" defaultValue={phone.supplierId ?? ""}>
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
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
