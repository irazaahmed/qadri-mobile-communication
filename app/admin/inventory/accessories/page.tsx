import { listAccessories } from "@/lib/actions/accessories";
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
import { formatCurrency } from "../../_lib/format";

export default async function AccessoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; brand?: string; category?: string; lowStockOnly?: string }>;
}) {
  const params = await searchParams;
  const accessories = await listAccessories({
    name: params.name || undefined,
    brand: params.brand || undefined,
    category: params.category || undefined,
    lowStockOnly: params.lowStockOnly === "1",
  });

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

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="name" placeholder="Name" defaultValue={params.name} className="max-w-[160px]" />
        <Input name="brand" placeholder="Brand" defaultValue={params.brand} className="max-w-[140px]" />
        <Input name="category" placeholder="Category" defaultValue={params.category} className="max-w-[140px]" />
        <Select name="lowStockOnly" defaultValue={params.lowStockOnly} className="max-w-[160px]">
          <option value="">All stock levels</option>
          <option value="1">Low stock only</option>
        </Select>
        <button
          type="submit"
          className="rounded-full bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue-light"
        >
          Search
        </button>
        <a href="/admin/inventory/accessories" className="px-2 py-2 text-sm text-slate hover:underline">
          Clear
        </a>
      </form>

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
