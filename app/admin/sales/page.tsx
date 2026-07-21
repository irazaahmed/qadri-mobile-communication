import { listSales } from "@/lib/actions/sales";
import { listCustomers } from "@/lib/actions/customers";
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

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; status?: string }>;
}) {
  const params = await searchParams;
  const [sales, customers] = await Promise.all([
    listSales({
      customerId: params.customerId || undefined,
      status: (params.status as "PAID" | "PARTIAL" | "UNPAID") || undefined,
    }),
    listCustomers(),
  ]);
  const customerName = new Map(customers.map((c) => [c.id, c.name]));

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={`${sales.length} invoice(s)`}
        actions={
          <ButtonLink href="/admin/sales/new" variant="primary">
            + New sale
          </ButtonLink>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Select name="customerId" defaultValue={params.customerId} className="max-w-[200px]">
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
          className="rounded-full bg-brand-teal px-4 py-2 text-sm font-medium text-white hover:bg-brand-teal-light"
        >
          Filter
        </button>
        <a href="/admin/sales" className="px-2 py-2 text-sm text-slate hover:underline">
          Clear
        </a>
      </form>

      {sales.length === 0 ? (
        <EmptyState label="No sales yet." />
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={thClass}>Invoice</th>
                <th className={thClass}>Date</th>
                <th className={thClass}>Customer</th>
                <th className={thClass}>Lines</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Total</th>
                <th className={thClass}>Paid</th>
                <th className={thClass}>Due</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const overdue = s.dueDate ? isOverdue(s.dueDate.toISOString()) && s.status !== "PAID" : false;
                return (
                  <tr key={s.id} className={trHover}>
                    <td className={tdClass}>
                      <a href={`/admin/sales/${s.id}/invoice`} className="text-brand-teal hover:underline">
                        {s.invoiceNumber}
                      </a>
                    </td>
                    <td className={tdClass}>{formatDate(s.createdAt)}</td>
                    <td className={tdClass}>{s.customerId ? customerName.get(s.customerId) ?? "-" : "Walk-in"}</td>
                    <td className={tdClass}>{s.items.length}</td>
                    <td className={tdClass}>{s.paymentType}</td>
                    <td className={tdClass}>{formatCurrency(s.totalAmount.toString())}</td>
                    <td className={tdClass}>{formatCurrency(s.paidAmount.toString())}</td>
                    <td className={tdClass}>
                      {s.dueDate ? (
                        <span className={overdue ? "font-medium text-danger" : ""}>
                          {formatDate(s.dueDate)}
                          {overdue ? " (overdue)" : ""}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={tdClass}>
                      <Badge variant={STATUS_BADGE[s.status]}>{s.status}</Badge>
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
