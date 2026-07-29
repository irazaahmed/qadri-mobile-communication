"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSaleAction, upsertCustomerAction } from "./actions";
import { Badge, Button, Card, ErrorBanner, Field, Input, Select } from "../../_components/ui";
import { formatCurrency } from "../../_lib/format";

export interface PhoneOption {
  id: string;
  imei: string | null;
  brand: string;
  model: string;
  storage: string | null;
  color: string | null;
}

export interface BulkPhoneGroupOption {
  brand: string;
  model: string;
  storage: string | null;
  color: string | null;
  condition: "NEW" | "USED";
  count: number;
}

export interface AccessoryOption {
  id: string;
  name: string;
  brand: string;
  variant: string | null;
  salePrice: string;
  quantity: number;
}

export interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  /** Existing advance credit this customer has with us (0 if none) — auto-applied to a new credit sale. */
  advanceCredit: string;
}

type PhoneLine = { key: string; itemType: "PHONE"; phoneId: string; label: string; rate: string };
type AccessoryLine = {
  key: string;
  itemType: "ACCESSORY";
  accessoryId: string;
  label: string;
  quantity: string;
  rate: string;
  maxQty: number;
};
type UnbilledPhoneLine = {
  key: string;
  itemType: "PHONE_UNBILLED";
  imei: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  condition: "NEW" | "USED";
  warrantyMonths: string;
  estimatedCost: string;
  rate: string;
};
type BulkPhoneLine = {
  key: string;
  itemType: "PHONE_BULK";
  brand: string;
  model: string;
  storage: string | null;
  color: string | null;
  condition: "NEW" | "USED";
  label: string;
  quantity: string;
  rate: string;
  maxQty: number;
};
type Line = PhoneLine | AccessoryLine | UnbilledPhoneLine | BulkPhoneLine;

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `sline-${keyCounter}`;
}

function lineTotal(line: Line): number {
  const rate = Number(line.rate) || 0;
  if (line.itemType === "PHONE" || line.itemType === "PHONE_UNBILLED") return rate;
  return rate * (Number(line.quantity) || 0);
}

export function SaleForm({
  phones,
  bulkGroups,
  accessories,
  customers,
}: {
  phones: PhoneOption[];
  bulkGroups: BulkPhoneGroupOption[];
  accessories: AccessoryOption[];
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [accessorySearch, setAccessorySearch] = useState("");

  const [customerList, setCustomerList] = useState(customers);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [addingCustomer, startAddingCustomer] = useTransition();

  const [paymentMode, setPaymentMode] = useState<"CASH" | "CREDIT" | "BANK" | "CUSTOM">("CASH");
  const [creditDays, setCreditDays] = useState("30");
  const [paidAmount, setPaidAmount] = useState("0");
  const [customCash, setCustomCash] = useState("");
  const [customBank, setCustomBank] = useState("");
  const [customCredit, setCustomCredit] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addedPhoneIds = useMemo(
    () => new Set(lines.filter((l): l is PhoneLine => l.itemType === "PHONE").map((l) => l.phoneId)),
    [lines]
  );
  const addedAccessoryIds = useMemo(
    () => new Set(lines.filter((l): l is AccessoryLine => l.itemType === "ACCESSORY").map((l) => l.accessoryId)),
    [lines]
  );

  const filteredPhones = useMemo(() => {
    const q = phoneSearch.trim().toLowerCase();
    return phones
      .filter((p) => !addedPhoneIds.has(p.id))
      .filter(
        (p) =>
          !q ||
          (p.imei ?? "").toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.model.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [phones, phoneSearch, addedPhoneIds]);

  const filteredAccessories = useMemo(() => {
    const q = accessorySearch.trim().toLowerCase();
    return accessories
      .filter((a) => !addedAccessoryIds.has(a.id) && a.quantity > 0)
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.brand.toLowerCase().includes(q))
      .slice(0, 8);
  }, [accessories, accessorySearch, addedAccessoryIds]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return [];
    return customerList
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      .slice(0, 6);
  }, [customerList, customerSearch]);

  const total = useMemo(() => lines.reduce((sum, l) => sum + lineTotal(l), 0), [lines]);

  const customSum = (Number(customCash) || 0) + (Number(customBank) || 0) + (Number(customCredit) || 0);
  const willBeCredit =
    paymentMode === "CREDIT" || (paymentMode === "CUSTOM" && (Number(customCredit) || 0) > 0);

  function addPhoneLine(p: PhoneOption) {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        itemType: "PHONE",
        phoneId: p.id,
        label: `${p.brand} ${p.model} ${p.storage ? `(${p.storage})` : ""} — ${p.imei ?? "no IMEI"}`,
        rate: "",
      },
    ]);
    setPhoneSearch("");
  }

  function addAccessoryLine(a: AccessoryOption) {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        itemType: "ACCESSORY",
        accessoryId: a.id,
        label: `${a.name} — ${a.brand}${a.variant ? `, ${a.variant}` : ""}`,
        quantity: "1",
        rate: a.salePrice,
        maxQty: a.quantity,
      },
    ]);
    setAccessorySearch("");
  }

  function addUnbilledPhoneLine() {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        itemType: "PHONE_UNBILLED",
        imei: "",
        brand: "",
        model: "",
        storage: "",
        color: "",
        condition: "NEW",
        warrantyMonths: "",
        estimatedCost: "",
        rate: "",
      },
    ]);
  }

  function addBulkPhoneLine(g: BulkPhoneGroupOption) {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        itemType: "PHONE_BULK",
        brand: g.brand,
        model: g.model,
        storage: g.storage,
        color: g.color,
        condition: g.condition,
        label: `${g.brand} ${g.model} ${g.storage ? `(${g.storage})` : ""} ${g.color || ""}`.trim(),
        quantity: "1",
        rate: "",
        maxQty: g.count,
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? ({ ...l, ...patch } as Line) : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function handleAddCustomer() {
    setCustomerError(null);
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      setCustomerError("Name and phone are required.");
      return;
    }
    startAddingCustomer(async () => {
      const result = await upsertCustomerAction({ name: newCustomerName, phone: newCustomerPhone });
      if ("error" in result) {
        setCustomerError(result.error);
        return;
      }
      const existing = customerList.find((c) => c.id === result.id);
      const withBalance: CustomerOption = { ...result, advanceCredit: existing?.advanceCredit ?? "0" };
      setCustomerList((prev) => {
        const exists = prev.some((c) => c.id === withBalance.id);
        return exists ? prev.map((c) => (c.id === withBalance.id ? withBalance : c)) : [...prev, withBalance];
      });
      setSelectedCustomer(withBalance);
      setNewCustomerName("");
      setNewCustomerPhone("");
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (lines.length === 0) {
      setError("Add at least one phone or accessory line.");
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
        setError(`Cash + bank transfer + credit (${formatCurrency(customSum)}) must equal the sale total (${formatCurrency(total)}).`);
        return;
      }
      const credit = Number(customCredit) || 0;
      paymentType = credit > 0 ? "CREDIT" : "CASH";
      finalPaidAmount = (Number(customCash) || 0) + (Number(customBank) || 0);
      finalBankAmount = Number(customBank) || 0;
    }

    if (paymentType === "CREDIT" && !selectedCustomer) {
      setError("Select or add a customer for a credit sale.");
      return;
    }
    if (paymentType === "CREDIT" && (!creditDays || Number(creditDays) <= 0)) {
      setError("Enter valid credit days.");
      return;
    }
    for (const line of lines) {
      if (!line.rate || Number(line.rate) < 0) {
        setError("Every line needs a valid rate.");
        return;
      }
      if (line.itemType === "ACCESSORY" || line.itemType === "PHONE_BULK") {
        const qty = Number(line.quantity);
        if (!qty || qty <= 0) {
          setError("Every accessory/bulk line needs a quantity greater than 0.");
          return;
        }
        if (qty > line.maxQty) {
          setError(`Only ${line.maxQty} in stock for one of the bulk/accessory lines.`);
          return;
        }
      }
      if (line.itemType === "PHONE_UNBILLED") {
        if (!line.brand.trim() || !line.model.trim()) {
          setError("Every unbilled phone line needs brand and model.");
          return;
        }
        if (!line.estimatedCost || Number(line.estimatedCost) < 0) {
          setError("Every unbilled phone line needs a valid estimated cost.");
          return;
        }
      }
    }

    const items = lines.map((line) => {
      if (line.itemType === "PHONE") return { itemType: "PHONE" as const, phoneId: line.phoneId, rate: line.rate };
      if (line.itemType === "PHONE_UNBILLED")
        return {
          itemType: "PHONE_UNBILLED" as const,
          imei: line.imei.trim() || null,
          brand: line.brand.trim(),
          model: line.model.trim(),
          storage: line.storage.trim() || null,
          color: line.color.trim() || null,
          condition: line.condition,
          warrantyMonths: line.warrantyMonths ? Number(line.warrantyMonths) : null,
          estimatedCost: line.estimatedCost,
          rate: line.rate,
        };
      if (line.itemType === "PHONE_BULK")
        return {
          itemType: "PHONE_BULK" as const,
          brand: line.brand,
          model: line.model,
          storage: line.storage,
          color: line.color,
          condition: line.condition,
          quantity: Number(line.quantity),
          rate: line.rate,
        };
      return {
        itemType: "ACCESSORY" as const,
        accessoryId: line.accessoryId,
        quantity: Number(line.quantity),
        rate: line.rate,
      };
    });

    startTransition(async () => {
      const result = await createSaleAction({
        customerId: selectedCustomer?.id ?? null,
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

      router.push(`/admin/sales/${result.id}/invoice`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-slate">Customer (optional for cash)</p>
            {selectedCustomer ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm">
                  <span className="font-medium">{selectedCustomer.name}</span>
                  <span className="text-slate">{selectedCustomer.phone}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="ml-auto text-xs text-danger hover:underline"
                  >
                    Clear
                  </button>
                </div>
                {Number(selectedCustomer.advanceCredit) > 0 && willBeCredit ? (
                  <p className="text-xs text-success">
                    This customer has {formatCurrency(selectedCustomer.advanceCredit)} advance credit — it will be
                    automatically applied to this sale. (Advance credit khud is sale mein adjust ho jayega.)
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Search existing customer by name/phone"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                {filteredCustomers.length > 0 ? (
                  <div className="flex flex-col gap-1 rounded-lg border border-slate/15 p-1">
                    {filteredCustomers.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch("");
                        }}
                        className="rounded px-2 py-1 text-left text-sm hover:bg-surface-muted"
                      >
                        {c.name} — {c.phone}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-slate">Or add a new customer:</p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Name"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="max-w-[160px]"
                  />
                  <Input
                    placeholder="Phone"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="max-w-[160px]"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddCustomer} disabled={addingCustomer}>
                    {addingCustomer ? "Adding..." : "Add"}
                  </Button>
                </div>
                <ErrorBanner message={customerError} />
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
                  <Input type="number" min={1} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} />
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
                  Split this sale across cash, bank transfer, and credit — the three must add up to the total.
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
                  Split total: {formatCurrency(customSum)} / Sale total: {formatCurrency(total)}
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-blue">Add phone (in stock)</p>
          <Input
            placeholder="Search IMEI / brand / model"
            value={phoneSearch}
            onChange={(e) => setPhoneSearch(e.target.value)}
          />
          <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
            {filteredPhones.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => addPhoneLine(p)}
                className="rounded px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
              >
                <span className="font-medium">{p.brand} {p.model}</span>{" "}
                <span className="text-slate">{p.storage || ""} {p.color || ""}</span>{" "}
                <span className="font-mono text-xs text-slate">{p.imei ?? "no IMEI"}</span>
              </button>
            ))}
            {phoneSearch && filteredPhones.length === 0 ? (
              <p className="px-2 py-1 text-sm text-slate">No matching in-stock phones.</p>
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate">Add accessory</p>
          <Input
            placeholder="Search name / brand"
            value={accessorySearch}
            onChange={(e) => setAccessorySearch(e.target.value)}
          />
          <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
            {filteredAccessories.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => addAccessoryLine(a)}
                className="flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
              >
                <span>
                  {a.name} <span className="text-slate">— {a.brand}{a.variant ? `, ${a.variant}` : ""}</span>
                </span>
                <Badge variant="slate">{a.quantity} left</Badge>
              </button>
            ))}
            {accessorySearch && filteredAccessories.length === 0 ? (
              <p className="px-2 py-1 text-sm text-slate">No matching accessories in stock.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-blue">
            Bulk sale (multiple identical units)
          </p>
          <p className="mb-2 text-xs text-slate">
            Sell several identical no-IMEI units as one line — enter the rate once, quantity multiplies it. (Aik jaisi
            units ek sath bechain — rate aik hi bar likhein.)
          </p>
          {bulkGroups.length === 0 ? (
            <p className="text-sm text-slate">No bulk (no-IMEI) stock available right now.</p>
          ) : (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {bulkGroups.map((g) => (
                <button
                  type="button"
                  key={`${g.brand}|${g.model}|${g.storage ?? ""}|${g.color ?? ""}|${g.condition}`}
                  onClick={() => addBulkPhoneLine(g)}
                  className="flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
                >
                  <span>
                    {g.brand} {g.model} {g.storage ? `(${g.storage})` : ""} {g.color || ""}
                  </span>
                  <Badge variant="slate">{g.count} in stock</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">
            Sell item not in stock (bill pending)
          </p>
          <p className="mb-2 text-xs text-slate">
            For a phone a company dropped off before sending the invoice — sell it now on an estimated cost, then
            reconcile the real cost later from Purchases → Reconcile pending bill. (Jab company bina bill ke phone de
            jaye — abhi bech den, bill baad mein reconcile karein.)
          </p>
          <Button type="button" variant="outline" size="sm" onClick={addUnbilledPhoneLine}>
            + Add unbilled phone line
          </Button>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {lines.length === 0 ? <p className="text-sm text-slate">No lines added yet.</p> : null}
        {lines.map((line) =>
          line.itemType === "PHONE_UNBILLED" ? (
            <Card key={line.key} className="border-warning/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <Badge variant="warning">Bill pending</Badge>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="IMEI" hint="Leave blank if unknown.">
                  <Input value={line.imei} onChange={(e) => updateLine(line.key, { imei: e.target.value })} />
                </Field>
                <Field label="Brand *">
                  <Input value={line.brand} onChange={(e) => updateLine(line.key, { brand: e.target.value })} />
                </Field>
                <Field label="Model *">
                  <Input value={line.model} onChange={(e) => updateLine(line.key, { model: e.target.value })} />
                </Field>
                <Field label="Storage">
                  <Input value={line.storage} onChange={(e) => updateLine(line.key, { storage: e.target.value })} />
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
                <Field label="Estimated cost *" hint="Corrected later once the real bill arrives.">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.estimatedCost}
                    onChange={(e) => updateLine(line.key, { estimatedCost: e.target.value })}
                  />
                </Field>
                <Field label="Sale rate *">
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
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={line.itemType === "PHONE" || line.itemType === "PHONE_BULK" ? "blue" : "slate"}>
                  {line.itemType === "PHONE_BULK" ? "PHONE (bulk)" : line.itemType}
                </Badge>
                <span className="flex-1 text-sm">{line.label}</span>
                {line.itemType === "ACCESSORY" || line.itemType === "PHONE_BULK" ? (
                  <div className="w-20">
                    <Input
                      type="number"
                      min={1}
                      max={line.maxQty}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  </div>
                ) : null}
                <div className="w-28">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Rate"
                    value={line.rate}
                    onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                  />
                </div>
                <span className="w-24 text-right text-sm font-medium">{formatCurrency(lineTotal(line))}</span>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              </div>
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
          {pending ? "Saving..." : "Record sale"}
        </Button>
      </div>
    </form>
  );
}
