"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseAction } from "./actions";
import { Button, Card, ErrorBanner, Field, Input, Select } from "../../_components/ui";
import { formatCurrency } from "../../_lib/format";

type PhoneLine = {
  key: string;
  itemType: "PHONE";
  imei: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  condition: "NEW" | "USED";
  warrantyMonths: string;
  rate: string;
};

type AccessoryLine = {
  key: string;
  itemType: "ACCESSORY";
  name: string;
  brand: string;
  variant: string;
  category: string;
  quantity: string;
  rate: string;
  salePrice: string;
  lowStockThreshold: string;
};

type Line = PhoneLine | AccessoryLine;

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `line-${keyCounter}`;
}

function newPhoneLine(): PhoneLine {
  return {
    key: nextKey(),
    itemType: "PHONE",
    imei: "",
    brand: "",
    model: "",
    storage: "",
    color: "",
    condition: "NEW",
    warrantyMonths: "",
    rate: "",
  };
}

function newAccessoryLine(): AccessoryLine {
  return {
    key: nextKey(),
    itemType: "ACCESSORY",
    name: "",
    brand: "",
    variant: "",
    category: "",
    quantity: "1",
    rate: "",
    salePrice: "",
    lowStockThreshold: "",
  };
}

function lineTotal(line: Line): number {
  const rate = Number(line.rate) || 0;
  if (line.itemType === "PHONE") return rate;
  const qty = Number(line.quantity) || 0;
  return rate * qty;
}

export function PurchaseForm({
  suppliers,
  accessoryNames,
}: {
  suppliers: { id: string; name: string }[];
  accessoryNames: string[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [paymentType, setPaymentType] = useState<"CASH" | "CREDIT">("CASH");
  const [creditDays, setCreditDays] = useState("30");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = useMemo(() => lines.reduce((sum, l) => sum + lineTotal(l), 0), [lines]);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? ({ ...l, ...patch } as Line) : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (paymentType === "CREDIT" && !supplierId) {
      setError("Select a supplier for a credit purchase (payable must be tracked against a supplier).");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    if (paymentType === "CREDIT" && (!creditDays || Number(creditDays) <= 0)) {
      setError("Enter valid credit days.");
      return;
    }

    for (const line of lines) {
      if (line.itemType === "PHONE") {
        if (!line.imei || !line.brand || !line.model || !line.rate) {
          setError("Every phone line needs IMEI, brand, model and cost.");
          return;
        }
      } else {
        if (!line.name || !line.brand || !line.category || !line.quantity || !line.rate) {
          setError("Every accessory line needs name, brand, category, quantity and rate.");
          return;
        }
      }
    }

    const items = lines.map((line) =>
      line.itemType === "PHONE"
        ? {
            itemType: "PHONE" as const,
            imei: line.imei.trim(),
            brand: line.brand.trim(),
            model: line.model.trim(),
            storage: line.storage.trim() || null,
            color: line.color.trim() || null,
            condition: line.condition,
            warrantyMonths: line.warrantyMonths ? Number(line.warrantyMonths) : null,
            rate: line.rate,
          }
        : {
            itemType: "ACCESSORY" as const,
            name: line.name.trim(),
            brand: line.brand.trim(),
            variant: line.variant.trim() || null,
            category: line.category.trim(),
            quantity: Number(line.quantity),
            rate: line.rate,
            salePrice: line.salePrice.trim() || null,
            lowStockThreshold: line.lowStockThreshold ? Number(line.lowStockThreshold) : null,
          }
    );

    startTransition(async () => {
      const result = await createPurchaseAction({
        supplierId: supplierId || null,
        paymentType,
        creditDays: paymentType === "CREDIT" ? Number(creditDays) : null,
        items,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      router.push(`/admin/purchases/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field
            label={paymentType === "CREDIT" ? "Supplier *" : "Supplier (optional for cash)"}
          >
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— none —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment type *">
            <div className="flex gap-4 pt-2 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={paymentType === "CASH"}
                  onChange={() => setPaymentType("CASH")}
                />
                Cash
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={paymentType === "CREDIT"}
                  onChange={() => setPaymentType("CREDIT")}
                />
                Credit
              </label>
            </div>
          </Field>
          {paymentType === "CREDIT" ? (
            <Field label="Credit days *">
              <Input
                type="number"
                min={1}
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
                required
              />
            </Field>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setLines((prev) => [...prev, newPhoneLine()])}>
          + Phone line
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setLines((prev) => [...prev, newAccessoryLine()])}
        >
          + Accessory line
        </Button>
      </div>

      <datalist id="accessory-name-suggestions">
        {accessoryNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="flex flex-col gap-4">
        {lines.length === 0 ? (
          <p className="text-sm text-slate">No lines yet — add a phone or accessory line above.</p>
        ) : null}

        {lines.map((line) =>
          line.itemType === "PHONE" ? (
            <Card key={line.key} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">Phone</span>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="IMEI *">
                  <Input value={line.imei} onChange={(e) => updateLine(line.key, { imei: e.target.value })} />
                </Field>
                <Field label="Brand *">
                  <Input value={line.brand} onChange={(e) => updateLine(line.key, { brand: e.target.value })} />
                </Field>
                <Field label="Model *">
                  <Input value={line.model} onChange={(e) => updateLine(line.key, { model: e.target.value })} />
                </Field>
                <Field label="Storage">
                  <Input
                    value={line.storage}
                    onChange={(e) => updateLine(line.key, { storage: e.target.value })}
                  />
                </Field>
                <Field label="Color">
                  <Input value={line.color} onChange={(e) => updateLine(line.key, { color: e.target.value })} />
                </Field>
                <Field label="Condition *">
                  <Select
                    value={line.condition}
                    onChange={(e) => updateLine(line.key, { condition: e.target.value as "NEW" | "USED" })}
                  >
                    <option value="NEW">New</option>
                    <option value="USED">Used</option>
                  </Select>
                </Field>
                <Field label="Warranty (months)">
                  <Input
                    type="number"
                    min={0}
                    value={line.warrantyMonths}
                    onChange={(e) => updateLine(line.key, { warrantyMonths: e.target.value })}
                  />
                </Field>
                <Field label="Cost *">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.rate}
                    onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                  />
                </Field>
              </div>
              <p className="mt-2 text-right text-sm font-medium">{formatCurrency(lineTotal(line))}</p>
            </Card>
          ) : (
            <Card key={line.key} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate">Accessory</span>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="Name *">
                  <Input
                    list="accessory-name-suggestions"
                    value={line.name}
                    onChange={(e) => updateLine(line.key, { name: e.target.value })}
                  />
                </Field>
                <Field label="Brand *">
                  <Input value={line.brand} onChange={(e) => updateLine(line.key, { brand: e.target.value })} />
                </Field>
                <Field label="Category *">
                  <Input
                    value={line.category}
                    onChange={(e) => updateLine(line.key, { category: e.target.value })}
                  />
                </Field>
                <Field label="Variant">
                  <Input
                    value={line.variant}
                    onChange={(e) => updateLine(line.key, { variant: e.target.value })}
                  />
                </Field>
                <Field label="Quantity *">
                  <Input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  />
                </Field>
                <Field label="Rate (cost) *">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.rate}
                    onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                  />
                </Field>
                <Field label="Sale price" hint="Only used if this is a brand-new accessory.">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.salePrice}
                    onChange={(e) => updateLine(line.key, { salePrice: e.target.value })}
                  />
                </Field>
                <Field label="Low stock threshold" hint="Only used if brand-new.">
                  <Input
                    type="number"
                    min={0}
                    value={line.lowStockThreshold}
                    onChange={(e) => updateLine(line.key, { lowStockThreshold: e.target.value })}
                  />
                </Field>
              </div>
              <p className="mt-2 text-right text-sm font-medium">{formatCurrency(lineTotal(line))}</p>
            </Card>
          )
        )}
      </div>

      <Card className="flex items-center justify-between p-5">
        <span className="text-sm text-slate">Running total (server recomputes and is authoritative)</span>
        <span className="text-xl font-semibold text-brand-blue">{formatCurrency(total)}</span>
      </Card>

      <ErrorBanner message={error} />

      <div>
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Saving..." : "Record purchase"}
        </Button>
      </div>
    </form>
  );
}
