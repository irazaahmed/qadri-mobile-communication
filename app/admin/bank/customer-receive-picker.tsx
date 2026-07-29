"use client";

import { useMemo, useState } from "react";
import { Input } from "../_components/ui";
import { formatCurrency } from "../_lib/format";
import { CustomerBulkPaymentForm } from "../customers/[id]/payment-form";

export interface CustomerOwingOption {
  id: string;
  name: string;
  phone: string;
  outstanding: number;
}

/**
 * Search-then-select picker for receiving a customer's payment from the Bank
 * page — mirrors SupplierPayFromBankPicker (see its comment).
 */
export function CustomerReceiveFromBankPicker({ customers }: { customers: CustomerOwingOption[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerOwingOption | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      : customers;
    return base.slice(0, 8);
  }, [customers, search]);

  if (selected) {
    return (
      <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">{selected.name}</span>
            <span className="ml-2 text-xs text-slate">{selected.phone}</span>
          </div>
          <button type="button" onClick={() => setSelected(null)} className="text-xs text-danger hover:underline">
            Change
          </button>
        </div>
        <p className="mb-2 text-sm font-medium text-warning">Outstanding: {formatCurrency(selected.outstanding)}</p>
        <CustomerBulkPaymentForm customerId={selected.id} outstanding={selected.outstanding} defaultMethod="BANK_TRANSFER" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input placeholder="Search customer by name/phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.length === 0 ? (
        <p className="text-sm text-slate">No matching customer.</p>
      ) : (
        <div className="flex flex-col gap-1 rounded-lg border border-slate/15 p-1">
          {filtered.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setSelected(c)}
              className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
            >
              <span>
                {c.name} <span className="text-slate">— {c.phone}</span>
              </span>
              <span className="shrink-0 font-medium text-warning">{formatCurrency(c.outstanding)}</span>
            </button>
          ))}
        </div>
      )}
      {!search.trim() && customers.length > filtered.length ? (
        <p className="text-xs text-slate">
          Showing {filtered.length} of {customers.length} — type a name to search the rest.
        </p>
      ) : null}
    </div>
  );
}
