"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClaimAction, upsertCustomerAction } from "./actions";
import { Button, Card, ErrorBanner, Field, Input, Textarea } from "../../_components/ui";

export interface SoldPhoneOption {
  id: string;
  imei: string | null;
  brand: string;
  model: string;
}

export interface AccessoryOption {
  id: string;
  name: string;
  brand: string;
  variant: string | null;
}

export interface CustomerOption {
  id: string;
  name: string;
  phone: string;
}

export function ClaimForm({
  phones,
  accessories,
  customers,
}: {
  phones: SoldPhoneOption[];
  accessories: AccessoryOption[];
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [itemType, setItemType] = useState<"PHONE" | "ACCESSORY">("PHONE");

  const [phoneSearch, setPhoneSearch] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<SoldPhoneOption | null>(null);

  const [accessorySearch, setAccessorySearch] = useState("");
  const [selectedAccessory, setSelectedAccessory] = useState<AccessoryOption | null>(null);
  const [quantity, setQuantity] = useState("1");

  const [customerList, setCustomerList] = useState(customers);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [addingCustomer, startAddingCustomer] = useTransition();

  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredPhones = useMemo(() => {
    const q = phoneSearch.trim().toLowerCase();
    if (!q) return [];
    return phones
      .filter((p) => (p.imei ?? "").toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.model.toLowerCase().includes(q))
      .slice(0, 8);
  }, [phones, phoneSearch]);

  const filteredAccessories = useMemo(() => {
    const q = accessorySearch.trim().toLowerCase();
    if (!q) return [];
    return accessories.filter((a) => a.name.toLowerCase().includes(q) || a.brand.toLowerCase().includes(q)).slice(0, 8);
  }, [accessories, accessorySearch]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return [];
    return customerList.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 6);
  }, [customerList, customerSearch]);

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
      setCustomerList((prev) => {
        const exists = prev.some((c) => c.id === result.id);
        return exists ? prev.map((c) => (c.id === result.id ? result : c)) : [...prev, result];
      });
      setSelectedCustomer(result);
      setNewCustomerName("");
      setNewCustomerPhone("");
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedCustomer) {
      setError("Select or add the customer making the claim.");
      return;
    }
    if (itemType === "PHONE" && !selectedPhone) {
      setError("Search and select the sold phone being claimed.");
      return;
    }
    if (itemType === "ACCESSORY") {
      if (!selectedAccessory) {
        setError("Search and select the accessory being claimed.");
        return;
      }
      if (!quantity || Number(quantity) <= 0) {
        setError("Enter a valid quantity.");
        return;
      }
    }
    if (!reason.trim()) {
      setError("Enter a reason for the claim.");
      return;
    }

    startTransition(async () => {
      const result = await createClaimAction({
        customerId: selectedCustomer.id,
        itemType,
        phoneId: itemType === "PHONE" ? selectedPhone!.id : undefined,
        accessoryId: itemType === "ACCESSORY" ? selectedAccessory!.id : undefined,
        quantity: itemType === "ACCESSORY" ? Number(quantity) : undefined,
        reason,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      router.push(`/admin/claims/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card className="p-5">
        <p className="mb-1 text-xs font-medium text-slate">Customer *</p>
        {selectedCustomer ? (
          <div className="flex items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm">
            <span className="font-medium">{selectedCustomer.name}</span>
            <span className="text-slate">{selectedCustomer.phone}</span>
            <button type="button" onClick={() => setSelectedCustomer(null)} className="ml-auto text-xs text-danger hover:underline">
              Clear
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input placeholder="Search existing customer by name/phone" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
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
              <Input placeholder="Name" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} className="max-w-[160px]" />
              <Input placeholder="Phone" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} className="max-w-[160px]" />
              <Button type="button" variant="outline" size="sm" onClick={handleAddCustomer} disabled={addingCustomer}>
                {addingCustomer ? "Adding..." : "Add"}
              </Button>
            </div>
            <ErrorBanner message={customerError} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <p className="mb-2 text-xs font-medium text-slate">What's being claimed? *</p>
        <div className="mb-4 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={itemType === "PHONE"}
              onChange={() => {
                setItemType("PHONE");
                setSelectedAccessory(null);
              }}
            />
            Phone
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={itemType === "ACCESSORY"}
              onChange={() => {
                setItemType("ACCESSORY");
                setSelectedPhone(null);
              }}
            />
            Accessory
          </label>
        </div>

        {itemType === "PHONE" ? (
          selectedPhone ? (
            <div className="flex items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm">
              <span className="font-medium">
                {selectedPhone.brand} {selectedPhone.model}
              </span>
              <span className="font-mono text-xs text-slate">{selectedPhone.imei ?? "no IMEI"}</span>
              <button type="button" onClick={() => setSelectedPhone(null)} className="ml-auto text-xs text-danger hover:underline">
                Clear
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input placeholder="Search sold phone by IMEI / brand / model" value={phoneSearch} onChange={(e) => setPhoneSearch(e.target.value)} />
              {filteredPhones.length > 0 ? (
                <div className="flex flex-col gap-1 rounded-lg border border-slate/15 p-1">
                  {filteredPhones.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        setSelectedPhone(p);
                        setPhoneSearch("");
                      }}
                      className="rounded px-2 py-1 text-left text-sm hover:bg-surface-muted"
                    >
                      {p.brand} {p.model} <span className="font-mono text-xs text-slate">{p.imei ?? "no IMEI"}</span>
                    </button>
                  ))}
                </div>
              ) : phoneSearch ? (
                <p className="text-sm text-slate">No matching sold phone found.</p>
              ) : null}
            </div>
          )
        ) : selectedAccessory ? (
          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm">
              <span className="font-medium">{selectedAccessory.name}</span>
              <span className="text-slate">
                {selectedAccessory.brand}
                {selectedAccessory.variant ? `, ${selectedAccessory.variant}` : ""}
              </span>
              <button type="button" onClick={() => setSelectedAccessory(null)} className="ml-auto text-xs text-danger hover:underline">
                Clear
              </button>
            </div>
            <div className="w-24">
              <Field label="Qty">
                <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Field>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input placeholder="Search accessory by name / brand" value={accessorySearch} onChange={(e) => setAccessorySearch(e.target.value)} />
            {filteredAccessories.length > 0 ? (
              <div className="flex flex-col gap-1 rounded-lg border border-slate/15 p-1">
                {filteredAccessories.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => {
                      setSelectedAccessory(a);
                      setAccessorySearch("");
                    }}
                    className="rounded px-2 py-1 text-left text-sm hover:bg-surface-muted"
                  >
                    {a.name} — {a.brand}
                    {a.variant ? `, ${a.variant}` : ""}
                  </button>
                ))}
              </div>
            ) : accessorySearch ? (
              <p className="text-sm text-slate">No matching accessory found.</p>
            ) : null}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <Field label="Reason *">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's wrong with the item?" />
        </Field>
      </Card>

      <ErrorBanner message={error} />

      <div>
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Saving..." : "Log claim"}
        </Button>
      </div>
    </form>
  );
}
