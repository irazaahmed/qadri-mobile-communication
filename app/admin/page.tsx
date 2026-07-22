import {
  getCashBalance,
  getLowStockAccessories,
  getOutstandingPayables,
  getOutstandingReceivables,
  getOutstandingTotals,
  getTodayStats,
} from "@/lib/actions/dashboard";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, tableWrap, table, thClass, tdClass, trHover } from "./_components/ui";
import { formatCurrency, formatDate, isOverdue } from "./_lib/format";

export default async function DashboardPage() {
  const [today, cashBalance, lowStock, payables, receivables, totals] = await Promise.all([
    getTodayStats(),
    getCashBalance(),
    getLowStockAccessories(),
    getOutstandingPayables(8),
    getOutstandingReceivables(8),
    getOutstandingTotals(),
  ]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Today at a glance"
        actions={
          <>
            <ButtonLink href="/admin/purchases/new" variant="outline">
              + New purchase
            </ButtonLink>
            <ButtonLink href="/admin/sales/new" variant="cyan">
              + New sale
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Today's sales" value={formatCurrency(today.salesTotal)} sub={`${today.salesCount} invoice(s)`} />
        <StatCard label="Today's purchases" value={formatCurrency(today.purchasesTotal)} sub={`${today.purchasesCount} invoice(s)`} />
        <StatCard label="Cash balance" value={formatCurrency(cashBalance)} sub="Live shop cash" accent="blue" />
        <StatCard label="Payable to suppliers" value={formatCurrency(totals.totalPayable)} sub="Outstanding" accent="danger" />
        <StatCard label="Receivable from customers" value={formatCurrency(totals.totalReceivable)} sub="Outstanding" accent="warning" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-brand-blue">Payable — oldest due first</h2>
            <ButtonLink href="/admin/suppliers" variant="ghost" size="sm">
              Suppliers
            </ButtonLink>
          </div>
          {payables.length === 0 ? (
            <EmptyState label="No outstanding payables." />
          ) : (
            <div className={tableWrap}>
              <table className={table}>
                <thead>
                  <tr>
                    <th className={thClass}>Invoice</th>
                    <th className={thClass}>Supplier</th>
                    <th className={thClass}>Due</th>
                    <th className={thClass}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payables.map((p) => {
                    const overdue = isOverdue(p.dueDate);
                    return (
                      <tr key={p.id} className={trHover}>
                        <td className={tdClass}>
                          <a href={`/admin/purchases/${p.id}`} className="text-brand-blue hover:underline">
                            {p.invoiceNumber}
                          </a>
                        </td>
                        <td className={tdClass}>{p.supplierName}</td>
                        <td className={tdClass}>
                          {p.dueDate ? (
                            <span className={overdue ? "font-medium text-danger" : ""}>
                              {formatDate(p.dueDate)}
                              {overdue ? " (overdue)" : ""}
                            </span>
                          ) : (
                            <span className="text-slate">-</span>
                          )}
                        </td>
                        <td className={tdClass}>{formatCurrency(p.amountDue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-brand-blue">Receivable — oldest due first</h2>
            <ButtonLink href="/admin/customers" variant="ghost" size="sm">
              Customers
            </ButtonLink>
          </div>
          {receivables.length === 0 ? (
            <EmptyState label="No outstanding receivables." />
          ) : (
            <div className={tableWrap}>
              <table className={table}>
                <thead>
                  <tr>
                    <th className={thClass}>Invoice</th>
                    <th className={thClass}>Customer</th>
                    <th className={thClass}>Due</th>
                    <th className={thClass}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.map((s) => {
                    const overdue = isOverdue(s.dueDate);
                    return (
                      <tr key={s.id} className={trHover}>
                        <td className={tdClass}>
                          <a href={`/admin/sales/${s.id}/invoice`} className="text-brand-blue hover:underline">
                            {s.invoiceNumber}
                          </a>
                        </td>
                        <td className={tdClass}>{s.customerName}</td>
                        <td className={tdClass}>
                          {s.dueDate ? (
                            <span className={overdue ? "font-medium text-danger" : ""}>
                              {formatDate(s.dueDate)}
                              {overdue ? " (overdue)" : ""}
                            </span>
                          ) : (
                            <span className="text-slate">-</span>
                          )}
                        </td>
                        <td className={tdClass}>{formatCurrency(s.amountDue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-brand-blue">Low stock accessories</h2>
          <ButtonLink href="/admin/inventory/accessories" variant="ghost" size="sm">
            View all
          </ButtonLink>
        </div>
        {lowStock.length === 0 ? (
          <EmptyState label="Nothing below its low-stock threshold." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {lowStock.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {a.name} <span className="text-slate">({a.brand}{a.variant ? `, ${a.variant}` : ""})</span>
                </span>
                <Badge variant="warning">
                  {a.quantity} left / min {a.lowStockThreshold}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent = "slate",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "slate" | "blue" | "danger" | "warning";
}) {
  const accentClass = {
    slate: "text-foreground",
    blue: "text-brand-blue",
    danger: "text-danger",
    warning: "text-warning",
  }[accent];

  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold ${accentClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate">{sub}</p> : null}
    </Card>
  );
}
