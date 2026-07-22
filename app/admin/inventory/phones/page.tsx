import { listPhones } from "@/lib/actions/phones";
import { listSuppliers } from "@/lib/actions/suppliers";
import type { PhoneStatus } from "@prisma/client";
import {
  Badge,
  ButtonLink,
  Input,
  PageHeader,
  Select,
  table,
  tableWrap,
  tdClass,
  thClass,
  trHover,
  EmptyState,
} from "../../_components/ui";
import { formatCurrency, formatDate } from "../../_lib/format";

const STATUS_OPTIONS: PhoneStatus[] = [
  "IN_STOCK",
  "SOLD",
  "CLAIMED",
  "WITH_SUPPLIER",
  "RETURNED_TO_STOCK",
];

const STATUS_BADGE: Record<PhoneStatus, "success" | "slate" | "warning" | "danger"> = {
  IN_STOCK: "success",
  SOLD: "slate",
  CLAIMED: "warning",
  WITH_SUPPLIER: "warning",
  RETURNED_TO_STOCK: "success",
};

const WARRANTY_BADGE = {
  IN_WARRANTY: "success",
  EXPIRED: "danger",
  "N/A": "slate",
} as const;

export default async function PhonesPage({
  searchParams,
}: {
  searchParams: Promise<{ imei?: string; brand?: string; model?: string; status?: string }>;
}) {
  const params = await searchParams;
  const filters = {
    imei: params.imei || undefined,
    brand: params.brand || undefined,
    model: params.model || undefined,
    status: (params.status as PhoneStatus) || undefined,
  };

  const [phones, suppliers] = await Promise.all([listPhones(filters), listSuppliers()]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <div>
      <PageHeader
        title="Phones"
        subtitle={`${phones.length} unit(s) — IMEI-tracked inventory`}
        actions={
          <ButtonLink href="/admin/inventory/phones/new" variant="primary">
            + Add phone
          </ButtonLink>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="imei" placeholder="Search IMEI" defaultValue={params.imei} className="max-w-[180px]" />
        <Input name="brand" placeholder="Brand" defaultValue={params.brand} className="max-w-[140px]" />
        <Input name="model" placeholder="Model" defaultValue={params.model} className="max-w-[140px]" />
        <Select name="status" defaultValue={params.status} className="max-w-[160px]">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
        <button
          type="submit"
          className="rounded-full bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue-light"
        >
          Search
        </button>
        <a href="/admin/inventory/phones" className="px-2 py-2 text-sm text-slate hover:underline">
          Clear
        </a>
      </form>

      {phones.length === 0 ? (
        <EmptyState label="No phones match this search." />
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={thClass}>IMEI</th>
                <th className={thClass}>Brand / Model</th>
                <th className={thClass}>Storage / Color</th>
                <th className={thClass}>Condition</th>
                <th className={thClass}>Cost</th>
                <th className={thClass}>Sold for</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Warranty</th>
                <th className={thClass}>Supplier</th>
                <th className={thClass}>Added</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {phones.map((p) => (
                <tr key={p.id} className={trHover}>
                  <td className={`${tdClass} font-mono text-xs`}>{p.imei}</td>
                  <td className={tdClass}>
                    <span className="font-medium">{p.brand}</span> {p.model}
                  </td>
                  <td className={tdClass}>
                    {p.storage || "-"} {p.color ? `/ ${p.color}` : ""}
                  </td>
                  <td className={tdClass}>{p.condition}</td>
                  <td className={tdClass}>{formatCurrency(p.costPrice.toString())}</td>
                  <td className={tdClass}>{p.salePrice ? formatCurrency(p.salePrice.toString()) : "-"}</td>
                  <td className={tdClass}>
                    <Badge variant={STATUS_BADGE[p.status]}>{p.status.replaceAll("_", " ")}</Badge>
                  </td>
                  <td className={tdClass}>
                    <Badge variant={WARRANTY_BADGE[p.warrantyStatus]}>{p.warrantyStatus}</Badge>
                  </td>
                  <td className={tdClass}>{p.supplierId ? supplierName.get(p.supplierId) ?? "-" : "-"}</td>
                  <td className={tdClass}>{formatDate(p.createdAt)}</td>
                  <td className={tdClass}>
                    <a href={`/admin/inventory/phones/${p.id}/edit`} className="text-brand-blue hover:underline">
                      Edit
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
