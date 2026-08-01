import { getCashBalance } from "@/lib/actions/dashboard";
import { listCashEntries } from "@/lib/actions/cash";
import { Card, EmptyState, PageHeader, table, tableWrap, tdClass, thClass, trHover } from "../_components/ui";
import { CsvExportButton } from "../_components/csv-export-button";
import { ConfirmDeleteButton } from "../_components/confirm-delete-button";
import { formatCurrency, formatDateTime } from "../_lib/format";
import { CashOpeningBalanceForm } from "./opening-balance-form";
import { deleteCashOpeningBalanceAction } from "./actions";

export default async function CashPage() {
  const [balance, entries] = await Promise.all([getCashBalance(), listCashEntries()]);

  const csvRows = entries.map((e) => [
    formatDateTime(e.createdAt),
    e.sourceType,
    e.amount.toString(),
    e.balanceAfter.toString(),
    e.note ?? "",
  ]);

  const latestEntryId = entries[0]?.id;

  return (
    <div>
      <PageHeader
        title="Cash"
        subtitle="The shop's cash-in-hand — every sale, purchase, and credit payment settled in cash writes here automatically."
      />

      <Card className="mb-6 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate">Cash balance</p>
        <p className="mt-1 text-2xl font-semibold text-brand-blue">{formatCurrency(balance)}</p>
      </Card>

      <Card className="mb-6 p-5">
        <CashOpeningBalanceForm isFirstEntry={entries.length === 0} />
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-brand-blue">Entries</h2>
        <CsvExportButton
          filename="cash-ledger.csv"
          headers={["Date", "Source", "Amount", "Balance after", "Note"]}
          rows={csvRows}
        />
      </div>
      {entries.length === 0 ? (
        <EmptyState label="No cash entries yet." />
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
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={trHover}>
                  <td className={tdClass}>{formatDateTime(e.createdAt)}</td>
                  <td className={tdClass}>{e.sourceType}</td>
                  <td className={tdClass}>
                    <span className={e.amount.isNegative() ? "text-danger" : "text-success"}>
                      {formatCurrency(e.amount.toString())}
                    </span>
                  </td>
                  <td className={tdClass}>{formatCurrency(e.balanceAfter.toString())}</td>
                  <td className={tdClass}>{e.note ?? "-"}</td>
                  <td className={tdClass}>
                    {e.sourceType === "MANUAL" && e.id === latestEntryId ? (
                      <ConfirmDeleteButton
                        action={deleteCashOpeningBalanceAction.bind(null, e.id)}
                        confirmPhrase={formatCurrency(e.amount.toString())}
                        title="Undo this manual cash entry?"
                        consequences={[`Reverses ${formatCurrency(e.amount.toString())} off the cash balance.`]}
                        label="Undo"
                      />
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
