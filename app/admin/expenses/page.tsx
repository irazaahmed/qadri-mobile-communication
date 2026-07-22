import { listExpenses } from "@/lib/actions/expenses";
import { Card, EmptyState, PageHeader, table, tableWrap, tdClass, thClass, trHover } from "../_components/ui";
import { formatCurrency, formatDateTime } from "../_lib/format";
import { ExpenseForm } from "./expense-form";

export default async function ExpensesPage() {
  const expenses = await listExpenses();
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div>
      <PageHeader title="Expenses" subtitle={`${expenses.length} expense(s) — ${formatCurrency(total)} total`} />

      <Card className="mb-6 p-5">
        <ExpenseForm />
      </Card>

      {expenses.length === 0 ? (
        <EmptyState label="No expenses recorded yet." />
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Category</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Note</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className={trHover}>
                  <td className={tdClass}>{formatDateTime(e.createdAt)}</td>
                  <td className={tdClass}>{e.category}</td>
                  <td className={tdClass}>{formatCurrency(e.amount.toString())}</td>
                  <td className={tdClass}>{e.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
