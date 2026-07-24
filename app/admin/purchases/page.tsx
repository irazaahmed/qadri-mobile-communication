import Link from "next/link";
import { listPurchases } from "@/lib/actions/purchases";
import { listSuppliers } from "@/lib/actions/suppliers";
import {
  Badge,
  ButtonLink,
  EmptyState,
  PageHeader,
  Select,
  table,
  tableWrap,
  tdClass,
  thClass,
  trHover,
} from "../_components/ui";
import { formatCurrency, formatDate, isOverdue } from "../_lib/format";

const STATUS_BADGE = { PAID: "success", PARTIAL: "warning", UNPAID: "danger" } as const;

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; status?: string }>;
}) {
  const params = await searchParams;
  const [purchases, suppliers] = await Promise.all([
    listPurchases({
      supplierId: params.supplierId || undefined,
      status: (params.status as "PAID" | "PARTIAL" | "UNPAID") || undefined,
    }),
    listSuppliers(),
  ]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle={`${purchases.length} invoice(s)`}
        actions={
          <ButtonLink href="/admin/purchases/new" variant="primary">
            + New purchase
          </ButtonLink>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Select name="supplierId" defaultValue={params.supplierId} className="max-w-[200px]">
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={params.status} className="max-w-[160px]">
          <option value="">All statuses</option>
          <option value="PAID">Paid</option>
          <option value="PARTIAL">Partial</option>
          <option value="UNPAID">Unpaid</option>
        </Select>
        <button
          type="submit"
          className="rounded-full bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue-light"
        >
          Filter
        </button>
        <Link href="/admin/purchases" className="px-2 py-2 text-sm text-slate hover:underline">
          Clear
        </Link>
      </form>

      {purchases.length === 0 ? (
        <EmptyState label="No purchases yet." />
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={thClass}>Invoice</th>
                <th className={thClass}>Date</th>
                <th className={thClass}>Supplier</th>
                <th className={thClass}>Lines</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Total</th>
                <th className={thClass}>Paid</th>
                <th className={thClass}>Due</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => {
                const overdue = p.dueDate ? isOverdue(p.dueDate.toISOString()) && p.status !== "PAID" : false;
                return (
                  <tr key={p.id} className={trHover}>
                    <td className={tdClass}>
                      <a href={`/admin/purchases/${p.id}`} className="text-brand-blue hover:underline">
                        {p.invoiceNumber}
                      </a>
                    </td>
                    <td className={tdClass}>{formatDate(p.createdAt)}</td>
                    <td className={tdClass}>{(p.supplierId && supplierName.get(p.supplierId)) || "-"}</td>
                    <td className={tdClass}>{p.items.length}</td>
                    <td className={tdClass}>{p.paymentType}</td>
                    <td className={tdClass}>{formatCurrency(p.totalAmount.toString())}</td>
                    <td className={tdClass}>{formatCurrency(p.paidAmount.toString())}</td>
                    <td className={tdClass}>
                      {p.dueDate ? (
                        <span className={overdue ? "font-medium text-danger" : ""}>
                          {formatDate(p.dueDate)}
                          {overdue ? " (overdue)" : ""}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={tdClass}>
                      <Badge variant={STATUS_BADGE[p.status]}>{p.status}</Badge>
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
