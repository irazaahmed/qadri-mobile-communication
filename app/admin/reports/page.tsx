import { getProfitReport, getCashReport, getCreditReport } from "@/lib/actions/reports";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Input,
  table,
  tableWrap,
  tdClass,
  thClass,
  trHover,
} from "../_components/ui";
import { CsvExportButton } from "../_components/csv-export-button";
import { InstantFilterForm } from "../_components/instant-filter-form";
import { formatCurrency, formatDate, formatDateTime } from "../_lib/format";

const STATUS_BADGE = { PAID: "success", PARTIAL: "warning", UNPAID: "danger" } as const;

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const from = params.from ? new Date(`${params.from}T00:00:00`) : startOfMonth();
  const to = params.to ? new Date(`${params.to}T23:59:59.999`) : endOfToday();

  const [profit, cashEntries, creditRows] = await Promise.all([
    getProfitReport({ from, to }),
    getCashReport({ from, to }),
    getCreditReport(),
  ]);

  const cashCsvRows = cashEntries.map((e) => [
    formatDateTime(e.createdAt),
    e.sourceType,
    e.amount,
    e.balanceAfter,
    e.note ?? "",
  ]);

  const creditCsvRows = creditRows.map((r) => [
    r.direction,
    r.invoiceNumber,
    r.partyName,
    r.totalAmount,
    r.paidAmount,
    r.amountDue,
    r.dueDate ? formatDate(r.dueDate) : "",
    r.status,
  ]);

  return (
    <div>
      <PageHeader title="Reports" subtitle="Profit, cash, and credit — filterable by date range" />

      <InstantFilterForm className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">From</label>
          <Input type="date" name="from" defaultValue={toDateInputValue(from)} className="w-40" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">To</label>
          <Input type="date" name="to" defaultValue={toDateInputValue(to)} className="w-40" />
        </div>
        <a href="/admin/reports" className="px-2 py-2 text-sm text-slate hover:underline">
          Reset to this month
        </a>
      </InstantFilterForm>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-semibold text-brand-blue">Profit</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Revenue" value={formatCurrency(profit.revenue)} />
          <Stat label="Cost of goods sold" value={formatCurrency(profit.cogs)} />
          <Stat label="Profit" value={formatCurrency(profit.profit)} accent="blue" />
          <Stat label="Expenses" value={formatCurrency(profit.expenses)} accent="danger" />
          <Stat label="Total purchased" value={formatCurrency(profit.totalPurchased)} />
          <Stat label="Total sold" value={formatCurrency(profit.totalSold)} />
          <Stat label="Net cash movement" value={formatCurrency(profit.netCashMovement)} accent="blue" />
        </div>
      </Card>

      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-brand-blue">Cash ledger — this range</h2>
          <CsvExportButton
            filename={`cash-ledger_${toDateInputValue(from)}_${toDateInputValue(to)}.csv`}
            headers={["Date", "Source", "Amount", "Balance after", "Note"]}
            rows={cashCsvRows}
          />
        </div>
        {cashEntries.length === 0 ? (
          <EmptyState label="No cash movement in this range." />
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Source</th>
                  <th className={thClass}>Amount</th>
                  <th className={thClass}>Balance after</th>
                  <th className={thClass}>Note</th>
                </tr>
              </thead>
              <tbody>
                {cashEntries.map((e) => (
                  <tr key={e.id} className={trHover}>
                    <td className={tdClass}>{formatDateTime(e.createdAt)}</td>
                    <td className={tdClass}>{e.sourceType}</td>
                    <td className={tdClass}>
                      <span className={Number(e.amount) < 0 ? "text-danger" : "text-success"}>
                        {formatCurrency(e.amount)}
                      </span>
                    </td>
                    <td className={tdClass}>{formatCurrency(e.balanceAfter)}</td>
                    <td className={tdClass}>{e.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-brand-blue">Credit report — all outstanding</h2>
          <CsvExportButton
            filename={`credit-report_${toDateInputValue(new Date())}.csv`}
            headers={["Direction", "Invoice", "Party", "Total", "Paid", "Due", "Due date", "Status"]}
            rows={creditCsvRows}
          />
        </div>
        {creditRows.length === 0 ? (
          <EmptyState label="No outstanding payables or receivables." />
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th className={thClass}>Direction</th>
                  <th className={thClass}>Invoice</th>
                  <th className={thClass}>Party</th>
                  <th className={thClass}>Total</th>
                  <th className={thClass}>Paid</th>
                  <th className={thClass}>Due</th>
                  <th className={thClass}>Due date</th>
                  <th className={thClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {creditRows.map((r) => (
                  <tr key={`${r.direction}-${r.id}`} className={trHover}>
                    <td className={tdClass}>
                      <Badge variant={r.direction === "PAYABLE" ? "danger" : "warning"}>{r.direction}</Badge>
                    </td>
                    <td className={tdClass}>{r.invoiceNumber}</td>
                    <td className={tdClass}>{r.partyName}</td>
                    <td className={tdClass}>{formatCurrency(r.totalAmount)}</td>
                    <td className={tdClass}>{formatCurrency(r.paidAmount)}</td>
                    <td className={tdClass}>{formatCurrency(r.amountDue)}</td>
                    <td className={tdClass}>{r.dueDate ? formatDate(r.dueDate) : "-"}</td>
                    <td className={tdClass}>
                      <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, accent = "slate" }: { label: string; value: string; accent?: "slate" | "blue" | "danger" }) {
  const accentClass = { slate: "text-foreground", blue: "text-brand-blue", danger: "text-danger" }[accent];
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}
