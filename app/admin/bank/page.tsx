import { getBankBalance, listBankEntries } from "@/lib/actions/bank";
import { Card, EmptyState, PageHeader, table, tableWrap, tdClass, thClass, trHover } from "../_components/ui";
import { CsvExportButton } from "../_components/csv-export-button";
import { formatCurrency, formatDateTime } from "../_lib/format";
import { BankForm } from "./bank-form";

export default async function BankPage() {
  const [balance, entries] = await Promise.all([getBankBalance(), listBankEntries()]);

  const csvRows = entries.map((e) => [
    formatDateTime(e.createdAt),
    e.type,
    e.amount.toString(),
    e.balanceAfter.toString(),
    e.note ?? "",
  ]);

  return (
    <div>
      <PageHeader
        title="Bank"
        subtitle="Independent from shop cash — manual deposits/withdrawals, plus the bank-transfer portion of any sale."
      />

      <Card className="mb-6 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate">Bank balance</p>
        <p className="mt-1 text-2xl font-semibold text-brand-blue">{formatCurrency(balance)}</p>
      </Card>

      <Card className="mb-6 p-5">
        <BankForm isFirstEntry={entries.length === 0} />
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-brand-blue">Entries</h2>
        <CsvExportButton
          filename="bank-ledger.csv"
          headers={["Date", "Type", "Amount", "Balance after", "Note"]}
          rows={csvRows}
        />
      </div>
      {entries.length === 0 ? (
        <EmptyState label="No bank entries yet." />
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Balance after</th>
                <th className={thClass}>Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={trHover}>
                  <td className={tdClass}>{formatDateTime(e.createdAt)}</td>
                  <td className={tdClass}>{e.type}</td>
                  <td className={tdClass}>
                    <span className={e.amount.isNegative() ? "text-danger" : "text-success"}>
                      {formatCurrency(e.amount.toString())}
                    </span>
                  </td>
                  <td className={tdClass}>{formatCurrency(e.balanceAfter.toString())}</td>
                  <td className={tdClass}>
                    {e.note ?? "-"}
                    {e.sourceType === "SALE" && e.sourceId && e.amount.greaterThan(0) ? (
                      <>
                        {" "}
                        <a href={`/admin/sales/${e.sourceId}/invoice`} className="text-brand-blue hover:underline">
                          View sale
                        </a>
                      </>
                    ) : null}
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
