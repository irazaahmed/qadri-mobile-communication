"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseAction, createSupplierAction } from "./actions";
import { Button, Card, ErrorBanner, Field, Input, Select } from "../../_components/ui";
import { formatCurrency } from "../../_lib/format";

export interface SupplierOption {
  id: string;
  name: string;
  phone: string | null;
  /** Existing advance credit we have with this supplier (0 if none) — auto-applied to a new credit purchase. */
  advanceCredit: string;
}

type PhoneLine = {
  key: string;
  itemType: "PHONE";
  imei: string;
  quantity: string;
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
    quantity: "1",
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
  if (line.itemType === "PHONE") return rate * (Number(line.quantity) || 1);
  const qty = Number(line.quantity) || 0;
  return rate * qty;
}

export function PurchaseForm({
  suppliers,
  accessoryNames,
}: {
  suppliers: SupplierOption[];
  accessoryNames: string[];
}) {
  const router = useRouter();

  const [supplierList, setSupplierList] = useState(suppliers);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierOption | null>(null);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [addingSupplier, startAddingSupplier] = useTransition();

  const [paymentMode, setPaymentMode] = useState<"CASH" | "CREDIT" | "BANK" | "CUSTOM">("CASH");
  const [creditDays, setCreditDays] = useState("30");
  const [paidAmount, setPaidAmount] = useState("0");
  const [customCash, setCustomCash] = useState("");
  const [customBank, setCustomBank] = useState("");
  const [customCredit, setCustomCredit] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return [];
    return supplierList
      .filter((s) => s.name.toLowerCase().includes(q) || (s.phone ?? "").includes(q))
      .slice(0, 6);
  }, [supplierList, supplierSearch]);

  function handleAddSupplier() {
    setSupplierError(null);
    if (!newSupplierName.trim()) {
      setSupplierError("Name is required.");
      return;
    }
    startAddingSupplier(async () => {
      const result = await createSupplierAction({ name: newSupplierName, phone: newSupplierPhone || null });
      if ("error" in result) {
        setSupplierError(result.error);
        return;
      }
      const withBalance: SupplierOption = { ...result, advanceCredit: "0" };
      setSupplierList((prev) => [...prev, withBalance]);
      setSelectedSupplier(withBalance);
      setNewSupplierName("");
      setNewSupplierPhone("");
    });
  }

  const total = useMemo(() => lines.reduce((sum, l) => sum + lineTotal(l), 0), [lines]);

  const customSum = (Number(customCash) || 0) + (Number(customBank) || 0) + (Number(customCredit) || 0);
  const willBeCredit =
    paymentMode === "CREDIT" || (paymentMode === "CUSTOM" && (Number(customCredit) || 0) > 0);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? ({ ...l, ...patch } as Line) : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (lines.length === 0) {
      setError("Add at least one line item.");
      return;
    }

    let paymentType: "CASH" | "CREDIT";
    let finalPaidAmount: number;
    let finalBankAmount: number;

    if (paymentMode === "CASH") {
      paymentType = "CASH";
      finalPaidAmount = total;
      finalBankAmount = 0;
    } else if (paymentMode === "BANK") {
      paymentType = "CASH";
      finalPaidAmount = total;
      finalBankAmount = total;
    } else if (paymentMode === "CREDIT") {
      paymentType = "CREDIT";
      finalPaidAmount = Number(paidAmount) || 0;
      finalBankAmount = 0;
    } else {
      if (Math.abs(customSum - total) >= 0.01) {
        setError(`Cash + bank transfer + credit (${formatCurrency(customSum)}) must equal the purchase total (${formatCurrency(total)}).`);
        return;
      }
      const credit = Number(customCredit) || 0;
      paymentType = credit > 0 ? "CREDIT" : "CASH";
      finalPaidAmount = (Number(customCash) || 0) + (Number(customBank) || 0);
      finalBankAmount = Number(customBank) || 0;
    }

    if (paymentType === "CREDIT" && !selectedSupplier) {
      setError("Select or add a supplier for a credit purchase (payable must be tracked against a supplier).");
      return;
    }
    if (paymentType === "CREDIT" && (!creditDays || Number(creditDays) <= 0)) {
      setError("Enter valid credit days.");
      return;
    }

    for (const line of lines) {
      if (line.itemType === "PHONE") {
        if (!line.brand || !line.model || !line.rate) {
          setError("Every phone line needs brand, model and cost.");
          return;
        }
        const qty = Number(line.quantity) || 1;
        if (line.imei.trim() && qty > 1) {
          setError(
            `Phone line for "${line.brand} ${line.model}" has a specific IMEI — quantity must be 1. Leave IMEI blank to bulk-add.`
          );
          return;
        }
        if (qty < 1) {
          setError("Quantity must be a positive whole number.");
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
            imei: line.imei.trim() || null,
            quantity: Number(line.quantity) || 1,
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
        supplierId: selectedSupplier?.id ?? null,
        paymentType,
        creditDays: paymentType === "CREDIT" ? Number(creditDays) : null,
        paidAmount: finalPaidAmount,
        bankAmount: finalBankAmount,
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-slate">
              {willBeCredit ? "Supplier *" : "Supplier (optional for cash)"}
            </p>
            {selectedSupplier ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm">
                  <span className="font-medium">{selectedSupplier.name}</span>
                  {selectedSupplier.phone ? <span className="text-slate">{selectedSupplier.phone}</span> : null}
                  <button
                    type="button"
                    onClick={() => setSelectedSupplier(null)}
                    className="ml-auto text-xs text-danger hover:underline"
                  >
                    Clear
                  </button>
                </div>
                {Number(selectedSupplier.advanceCredit) > 0 && willBeCredit ? (
                  <p className="text-xs text-success">
                    We have {formatCurrency(selectedSupplier.advanceCredit)} advance credit with this supplier — it
                    will be automatically applied to this purchase. (Advance credit khud is purchase mein adjust ho
                    jayega.)
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Search existing supplier by name/phone"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                />
                {filteredSuppliers.length > 0 ? (
                  <div className="flex flex-col gap-1 rounded-lg border border-slate/15 p-1">
                    {filteredSuppliers.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => {
                          setSelectedSupplier(s);
                          setSupplierSearch("");
                        }}
                        className="rounded px-2 py-1 text-left text-sm hover:bg-surface-muted"
                      >
                        {s.name} {s.phone ? `— ${s.phone}` : ""}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-slate">Or add a new supplier:</p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Name"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className="max-w-[160px]"
                  />
                  <Input
                    placeholder="Phone (optional)"
                    value={newSupplierPhone}
                    onChange={(e) => setNewSupplierPhone(e.target.value)}
                    className="max-w-[160px]"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddSupplier} disabled={addingSupplier}>
                    {addingSupplier ? "Adding..." : "Add"}
                  </Button>
                </div>
                <ErrorBanner message={supplierError} />
              </div>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate">Payment type *</p>
            <div className="flex flex-wrap gap-4 pt-2 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={paymentMode === "CASH"} onChange={() => setPaymentMode("CASH")} />
                Cash
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={paymentMode === "CREDIT"} onChange={() => setPaymentMode("CREDIT")} />
                Credit
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={paymentMode === "BANK"} onChange={() => setPaymentMode("BANK")} />
                Bank transfer
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={paymentMode === "CUSTOM"} onChange={() => setPaymentMode("CUSTOM")} />
                Custom (split)
              </label>
            </div>

            {paymentMode === "CREDIT" ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Credit days *">
                  <Input type="number" min={1} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} required />
                </Field>
                <Field label="Paid upfront" hint="May be 0.">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                  />
                </Field>
              </div>
            ) : null}

            {paymentMode === "CUSTOM" ? (
              <div className="mt-3 flex flex-col gap-3">
                <p className="text-xs text-slate">
                  Split this purchase across cash, bank transfer, and credit — the three must add up to the total.
                  (Cash, bank transfer aur credit teeno ka jama total ke barabar hona chahiye.)
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Cash">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={customCash}
                      onChange={(e) => setCustomCash(e.target.value)}
                    />
                  </Field>
                  <Field label="Bank transfer">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={customBank}
                      onChange={(e) => setCustomBank(e.target.value)}
                    />
                  </Field>
                  <Field label="Credit (due later)">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={customCredit}
                      onChange={(e) => setCustomCredit(e.target.value)}
                    />
                  </Field>
                </div>
                <p className={`text-xs ${Math.abs(customSum - total) < 0.01 ? "text-success" : "text-danger"}`}>
                  Split total: {formatCurrency(customSum)} / Purchase total: {formatCurrency(total)}
                </p>
                {willBeCredit ? (
                  <Field label="Credit days *" hint="For the credit portion above.">
                    <Input
                      type="number"
                      min={1}
                      value={creditDays}
                      onChange={(e) => setCreditDays(e.target.value)}
                      className="max-w-[160px]"
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}
          </div>
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
                <Field label="IMEI" hint="Leave blank to bulk-add via Quantity.">
                  <Input value={line.imei} onChange={(e) => updateLine(line.key, { imei: e.target.value })} />
                </Field>
                <Field label="Quantity" hint="Only used when IMEI is blank.">
                  <Input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  />
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
