import { getAccessoryBrandQuantities, getAccessoryBrands, getAccessoryStockSummary, listAccessories } from "@/lib/actions/accessories";
import {
  Badge,
  ButtonLink,
  EmptyState,
  Input,
  PageHeader,
  Select,
  table,
  tableWrap,
  tdClass,
  thClass,
  trHover,
} from "../../_components/ui";
import { InstantFilterForm } from "../../_components/instant-filter-form";
import { formatCurrency } from "../../_lib/format";

export default async function AccessoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; brand?: string; category?: string; lowStockOnly?: string }>;
}) {
  const params = await searchParams;
  const [accessories, brands, brandQuantities, stockSummary] = await Promise.all([
    listAccessories({
      name: params.name || undefined,
      brand: params.brand || undefined,
      category: params.category || undefined,
      lowStockOnly: params.lowStockOnly === "1",
    }),
    getAccessoryBrands(),
    getAccessoryBrandQuantities(),
    getAccessoryStockSummary(),
  ]);
  const totalBrandQuantity = Object.values(brandQuantities).reduce((sum, n) => sum + n, 0);

  const nameCounts = new Map<string, number>();
  for (const a of accessories) {
    const key = `${a.brand} ${a.name}${a.variant ? ` (${a.variant})` : ""}`;
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + a.quantity);
  }
  const nameCountRows = Array.from(nameCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div>
      <PageHeader
        title="Accessories"
        subtitle={`${accessories.length} item(s) — aggregate quantity stock`}
        actions={
          <ButtonLink href="/admin/inventory/accessories/new" variant="primary">
            + Add accessory
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate/10 bg-surface-muted px-4 py-2.5 text-sm">
        <span className="font-medium text-brand-blue">{stockSummary.itemCount} catalog item(s)</span>
        <span className="text-slate">·</span>
        <span className="font-medium text-brand-blue">{stockSummary.totalQuantity} unit(s) in stock</span>
        <span className="text-slate">·</span>
        <span className="font-medium text-brand-blue">
          Total cost value: {formatCurrency(stockSummary.totalCostValue)}
        </span>
      </div>

      {brands.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <a
            href="/admin/inventory/accessories"
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              !params.brand ? "bg-brand-blue text-white" : "bg-surface-muted text-slate hover:bg-slate/10"
            }`}
          >
            All brands ({totalBrandQuantity})
          </a>
          {brands.map((b) => (
            <a
              key={b}
              href={`/admin/inventory/accessories?brand=${encodeURIComponent(b)}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                params.brand?.toLowerCase() === b.toLowerCase()
                  ? "bg-brand-blue text-white"
                  : "bg-surface-muted text-slate hover:bg-slate/10"
              }`}
            >
              {b} ({brandQuantities[b] ?? 0})
            </a>
          ))}
        </div>
      ) : null}

      <InstantFilterForm className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="name" placeholder="Name" defaultValue={params.name} className="max-w-[160px]" />
        <Input name="brand" placeholder="Brand" defaultValue={params.brand} className="max-w-[140px]" />
        <Input name="category" placeholder="Category" defaultValue={params.category} className="max-w-[140px]" />
        <Select name="lowStockOnly" defaultValue={params.lowStockOnly} className="max-w-[160px]">
          <option value="">All stock levels</option>
          <option value="1">Low stock only</option>
        </Select>
        <a href="/admin/inventory/accessories" className="px-2 py-2 text-sm text-slate hover:underline">
          Clear
        </a>
      </InstantFilterForm>

      {nameCountRows.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {nameCountRows.map(([label, qty]) => (
            <span key={label} className="rounded-full bg-surface-muted px-3 py-1 text-xs text-slate">
              {label}: <span className="font-medium text-brand-blue">{qty}</span>
            </span>
          ))}
        </div>
      ) : null}

      {accessories.length === 0 ? (
        <EmptyState label="No accessories match this search." />
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Brand</th>
                <th className={thClass}>Variant</th>
                <th className={thClass}>Category</th>
                <th className={thClass}>Cost</th>
                <th className={thClass}>Sale price</th>
                <th className={thClass}>Quantity</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {accessories.map((a) => {
                const low = a.lowStockThreshold !== null && a.quantity <= a.lowStockThreshold;
                return (
                  <tr key={a.id} className={trHover}>
                    <td className={`${tdClass} font-medium`}>{a.name}</td>
                    <td className={tdClass}>{a.brand}</td>
                    <td className={tdClass}>{a.variant || "-"}</td>
                    <td className={tdClass}>{a.category}</td>
                    <td className={tdClass}>{formatCurrency(a.costPrice.toString())}</td>
                    <td className={tdClass}>{formatCurrency(a.salePrice.toString())}</td>
                    <td className={tdClass}>
                      <span className={low ? "font-semibold text-warning" : ""}>{a.quantity}</span>
                      {low ? (
                        <span className="ml-2">
                          <Badge variant="warning">Low stock</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className={`${tdClass} flex gap-3`}>
                      <a
                        href={`/admin/inventory/accessories/${a.id}/restock`}
                        className="text-brand-blue hover:underline"
                      >
                        Restock
                      </a>
                      <a
                        href={`/admin/inventory/accessories/${a.id}/edit`}
                        className="text-brand-blue hover:underline"
                      >
                        Edit
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
