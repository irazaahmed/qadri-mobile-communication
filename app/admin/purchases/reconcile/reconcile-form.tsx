"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reconcilePendingBillAction } from "./actions";
import { createSupplierAction } from "../new/actions";
import { Badge, Button, Card, ErrorBanner, Field, Input } from "../../_components/ui";
import { formatCurrency } from "../../_lib/format";

export interface SupplierOption {
  id: string;
  name: string;
  phone: string | null;
}

export interface PendingPhoneOption {
  id: string;
  imei: string | null;
  brand: string;
  model: string;
  storage: string | null;
  color: string | null;
  status: string;
  costPrice: string;
}

export function ReconcileForm({
  phones,
  suppliers,
  preselectedPhoneId,
}: {
  phones: PendingPhoneOption[];
  suppliers: SupplierOption[];
  preselectedPhoneId: string | null;
}) {
  const router = useRouter();

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(preselectedPhoneId ? [preselectedPhoneId] : [])
  );
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(phones.map((p) => [p.id, p.costPrice]))
  );

  const [supplierList, setSupplierList] = useState(suppliers);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierOption | null>(null);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [addingSupplier, startAddingSupplier] = useTransition();

  const [paymentType, setPaymentType] = useState<"CASH" | "CREDIT">("CASH");
  const [creditDays, setCreditDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return [];
    return supplierList
      .filter((s) => s.name.toLowerCase().includes(q) || (s.phone ?? "").includes(q))
      .slice(0, 6);
  }, [supplierList, supplierSearch]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
      setSupplierList((prev) => [...prev, result]);
      setSelectedSupplier(result);
      setNewSupplierName("");
      setNewSupplierPhone("");
    });
  }

  const selectedTotal = useMemo(
    () => phones.filter((p) => selected.has(p.id)).reduce((sum, p) => sum + (Number(rates[p.id]) || 0), 0),
    [phones, selected, rates]
  );

  function handleSubmit() {
    setError(null);

    if (!selectedSupplier) {
      setError("Select or add the supplier this bill came from.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one phone that's on this bill.");
      return;
    }
    if (paymentType === "CREDIT" && (!creditDays || Number(creditDays) <= 0)) {
      setError("Enter valid credit days.");
      return;
    }
    for (const id of selected) {
      const rate = Number(rates[id]);
      if (!rate || rate <= 0) {
        setError("Every selected phone needs a valid rate from the actual bill.");
        return;
      }
    }

    startTransition(async () => {
      const result = await reconcilePendingBillAction({
        supplierId: selectedSupplier.id,
        paymentType,
        creditDays: paymentType === "CREDIT" ? Number(creditDays) : null,
        phones: Array.from(selected).map((id) => ({ phoneId: id, rate: rates[id] })),
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      router.push(`/admin/purchases/${result.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-slate">Supplier / company (bill se) *</p>
            {selectedSupplier ? (
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
            <p className="mb-1 text-xs font-medium text-slate">Bill payment type *</p>
            <div className="flex gap-4 pt-2 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={paymentType === "CASH"} onChange={() => setPaymentType("CASH")} />
                Cash
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={paymentType === "CREDIT"} onChange={() => setPaymentType("CREDIT")} />
                Credit
              </label>
            </div>
            {paymentType === "CREDIT" ? (
              <div className="mt-3">
                <Field label="Credit days *">
                  <Input type="number" min={1} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} required />
                </Field>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-brand-blue">Is bill par konse phones hain?</h2>
        <div className="flex flex-col gap-2">
          {phones.map((p) => {
            const checked = selected.has(p.id);
            return (
              <div
                key={p.id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  checked ? "border-brand-blue/40 bg-brand-blue/5" : "border-slate/15"
                }`}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
                <div className="min-w-[180px]">
                  <p className="text-sm font-medium">
                    {p.brand} {p.model} {p.storage ? `(${p.storage})` : ""}
                  </p>
                  <p className="text-xs text-slate">
                    {p.imei ?? "no IMEI"} · <Badge variant={p.status === "SOLD" ? "slate" : "success"}>{p.status}</Badge>
                  </p>
                </div>
                <span className="text-xs text-slate">Estimate was {formatCurrency(p.costPrice)}</span>
                <div className="ml-auto w-36">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Actual rate"
                    value={rates[p.id] ?? ""}
                    disabled={!checked}
                    onChange={(e) => setRates((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="flex items-center justify-between p-5">
        <span className="text-sm text-slate">Selected total (server recomputes and is authoritative)</span>
        <span className="text-xl font-semibold text-brand-blue">{formatCurrency(selectedTotal)}</span>
      </Card>

      <ErrorBanner message={error} />

      <div>
        <Button type="button" onClick={handleSubmit} disabled={pending} size="lg">
          {pending ? "Saving..." : "Record bill & reconcile"}
        </Button>
      </div>
    </div>
  );
}
