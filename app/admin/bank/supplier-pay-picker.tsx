"use client";

import { useMemo, useState } from "react";
import { Input } from "../_components/ui";
import { formatCurrency } from "../_lib/format";
import { SupplierBulkPaymentForm } from "../suppliers/[id]/payment-form";

export interface SupplierOwedOption {
  id: string;
  name: string;
  phone: string | null;
  outstanding: number;
}

/**
 * Search-then-select picker for paying a supplier from the Bank page —
 * replaces a one-card-per-supplier stacked list (which doesn't scale past a
 * handful of suppliers) with a search box that filters as you type, then
 * reveals just the selected supplier's outstanding amount + pay form.
 */
export function SupplierPayFromBankPicker({ suppliers }: { suppliers: SupplierOwedOption[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SupplierOwedOption | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.phone ?? "").includes(q))
      : suppliers;
    return base.slice(0, 8);
  }, [suppliers, search]);

  if (selected) {
    return (
      <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">{selected.name}</span>
            {selected.phone ? <span className="ml-2 text-xs text-slate">{selected.phone}</span> : null}
          </div>
          <button type="button" onClick={() => setSelected(null)} className="text-xs text-danger hover:underline">
            Change
          </button>
        </div>
        <p className="mb-2 text-sm font-medium text-danger">Outstanding: {formatCurrency(selected.outstanding)}</p>
        <SupplierBulkPaymentForm supplierId={selected.id} outstanding={selected.outstanding} defaultMethod="BANK_TRANSFER" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input placeholder="Search supplier by name/phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.length === 0 ? (
        <p className="text-sm text-slate">No matching supplier.</p>
      ) : (
        <div className="flex flex-col gap-1 rounded-lg border border-slate/15 p-1">
          {filtered.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setSelected(s)}
              className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
            >
              <span>
                {s.name} {s.phone ? <span className="text-slate">— {s.phone}</span> : null}
              </span>
              <span className="shrink-0 font-medium text-danger">{formatCurrency(s.outstanding)}</span>
            </button>
          ))}
        </div>
      )}
      {!search.trim() && suppliers.length > filtered.length ? (
        <p className="text-xs text-slate">
          Showing {filtered.length} of {suppliers.length} — type a name to search the rest.
        </p>
      ) : null}
    </div>
  );
}
