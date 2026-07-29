import { getBankBalance, listBankEntries } from "@/lib/actions/bank";
import { listSuppliers, getSupplierBalances } from "@/lib/actions/suppliers";
import { listCustomers, getCustomerBalances } from "@/lib/actions/customers";
import { Card, EmptyState, PageHeader, table, tableWrap, tdClass, thClass, trHover } from "../_components/ui";
import { CsvExportButton } from "../_components/csv-export-button";
import { formatCurrency, formatDateTime } from "../_lib/format";
import { BankForm } from "./bank-form";
import { SupplierPayFromBankPicker } from "./supplier-pay-picker";
import { CustomerReceiveFromBankPicker } from "./customer-receive-picker";

export default async function BankPage() {
  const [balance, entries, suppliers, supplierBalances, customers, customerBalances] = await Promise.all([
    getBankBalance(),
    listBankEntries(),
    listSuppliers(),
    getSupplierBalances(),
    listCustomers(),
    getCustomerBalances(),
  ]);

  const csvRows = entries.map((e) => [
    formatDateTime(e.createdAt),
    e.type,
    e.amount.toString(),
    e.balanceAfter.toString(),
    e.note ?? "",
  ]);

  const suppliersOwed = suppliers
    .map((s) => ({ ...s, outstanding: Number(supplierBalances.get(s.id) ?? "0") }))
    .filter((s) => s.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const customersOwing = customers
    .map((c) => ({ ...c, outstanding: Number(customerBalances.get(c.id) ?? "0") }))
    .filter((c) => c.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  return (
    <div>
      <PageHeader
        title="Bank"
        subtitle="Independent from shop cash — manual deposits/withdrawals, plus the bank-transfer/JazzCash/EasyPaisa portion of any sale or credit payment."
      />

      <Card className="mb-6 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate">Bank balance</p>
        <p className="mt-1 text-2xl font-semibold text-brand-blue">{formatCurrency(balance)}</p>
      </Card>

      <Card className="mb-6 p-5">
        <BankForm isFirstEntry={entries.length === 0} />
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 font-semibold text-brand-blue">Pay a supplier from bank</h2>
          <p className="mb-3 text-xs text-slate">
            Settles that supplier&apos;s outstanding payable and deducts the bank balance in one step. (Supplier ki
            payment bank se karain — payable aur bank balance dono khud update ho jayenge.)
          </p>
          {suppliersOwed.length === 0 ? (
            <EmptyState label="No supplier currently has an outstanding payable." />
          ) : (
            <SupplierPayFromBankPicker suppliers={suppliersOwed} />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 font-semibold text-brand-blue">Receive from a customer via bank</h2>
          <p className="mb-3 text-xs text-slate">
            Settles that customer&apos;s outstanding receivable and adds to the bank balance in one step. (Customer
            se bank ke zariye payment lain — receivable aur bank balance dono khud update ho jayenge.)
          </p>
          {customersOwing.length === 0 ? (
            <EmptyState label="No customer currently has an outstanding receivable." />
          ) : (
            <CustomerReceiveFromBankPicker customers={customersOwing} />
          )}
        </Card>
      </div>

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
