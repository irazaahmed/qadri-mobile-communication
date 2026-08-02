import { notFound } from "next/navigation";
import { getCustomerById } from "@/lib/actions/customers";
import { listSales } from "@/lib/actions/sales";
import { prisma } from "@/lib/prisma";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  table,
  tableWrap,
  tdClass,
  thClass,
  trHover,
} from "../../_components/ui";
import { formatCurrency, formatDate, formatDateTime, isOverdue } from "../../_lib/format";
import { CustomerBulkPaymentForm } from "./payment-form";
import { CustomerOpeningBalanceForm } from "./opening-balance-form";
import { deleteCustomerOpeningBalanceAction } from "./opening-balance-actions";
import { ConfirmDeleteButton } from "../../_components/confirm-delete-button";
import { CsvExportButton } from "../../_components/csv-export-button";
import { WhatsAppShareButton } from "../../_components/whatsapp-share-button";

export default async function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [customer, sales, ledger] = await Promise.all([
    getCustomerById(id),
    listSales({ customerId: id }),
    prisma.customerLedgerEntry.findMany({ where: { customerId: id }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!customer) notFound();

  const currentBalance = ledger.length ? ledger[ledger.length - 1].balanceAfter.toString() : "0";
  const balanceNum = Number(currentBalance);
  const outstandingAmount = Math.max(0, balanceNum);
  const advanceAmount = Math.max(0, -balanceNum);

  const ledgerCsvRows = ledger.map((e) => [
    formatDateTime(e.createdAt),
    e.type,
    e.note ?? "",
    e.amount.toString(),
    e.balanceAfter.toString(),
  ]);

  const ledgerShareText = [
    `Qadri Mobile Communication — ${customer.name} ka ledger`,
    ``,
    advanceAmount > 0
      ? `Aap ka advance hamare pass: ${formatCurrency(String(advanceAmount))}`
      : `Aap ka hamare pass baqaya: ${formatCurrency(currentBalance)}`,
    ``,
    ...ledger.map(
      (e) =>
        `${formatDate(e.createdAt)} — ${e.type} — ${formatCurrency(e.amount.toString())} (Balance: ${formatCurrency(
          e.balanceAfter.toString()
        )})`
    ),
    ``,
    `Shukriya!`,
  ].join("\n");

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={`${customer.phone} — ${customer.address || "No address"}`}
        actions={
          <ButtonLink href={`/admin/customers/${customer.id}/edit`} variant="outline">
            Edit
          </ButtonLink>
        }
      />

      <Card className="mb-6 p-5">
        {advanceAmount > 0 ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-slate">
              Customer&apos;s advance credit (Costumer ka advance credit)
            </p>
            <p className="mt-1 text-2xl font-semibold text-success">{formatCurrency(String(advanceAmount))}</p>
            <p className="mt-1 text-xs text-slate">
              This customer paid more than what was owed — it will be automatically applied to reduce their next
              credit sale. (Agli credit sale mein khud adjust ho jayega.)
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-slate">Current receivable balance</p>
            <p className="mt-1 text-2xl font-semibold text-warning">{formatCurrency(currentBalance)}</p>
          </>
        )}
        <div className="mt-4 border-t border-slate/10 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate">
            Record payment — clears oldest outstanding sales first (Purani se nayi invoice tarteeb mein adjust hoga)
          </p>
          <CustomerBulkPaymentForm customerId={customer.id} outstanding={outstandingAmount} />
        </div>
        <div className="mt-4 border-t border-slate/10 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate">
            Previous balance from before this system (Is system se pehle ka baqaya)
          </p>
          <CustomerOpeningBalanceForm customerId={customer.id} />
        </div>
      </Card>

      <div className="mb-3">
        <h2 className="font-semibold text-brand-blue">Sales</h2>
      </div>
      {sales.length === 0 ? (
        <EmptyState label="No sales to this customer yet." />
      ) : (
        <div className={`${tableWrap} mb-6`}>
          <table className={table}>
            <thead>
              <tr>
                <th className={thClass}>Invoice</th>
                <th className={thClass}>Date</th>
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
                      <a href={`/admin/sales/${s.id}/invoice`} className="text-brand-blue hover:underline">
                        {s.invoiceNumber}
                      </a>
                    </td>
                    <td className={tdClass}>{formatDate(s.createdAt)}</td>
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
                      <Badge variant={s.status === "PAID" ? "success" : s.status === "PARTIAL" ? "warning" : "danger"}>
                        {s.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-brand-blue">Ledger</h2>
        {ledger.length > 0 ? (
          <div className="flex items-center gap-2">
            <CsvExportButton
              filename={`${customer.name}-ledger.csv`}
              headers={["Date", "Type", "Note", "Amount", "Balance after"]}
              rows={ledgerCsvRows}
            />
            <WhatsAppShareButton
              defaultPhone={customer.phone}
              message={ledgerShareText}
              label="Share on WhatsApp"
              prompt={`WhatsApp number likhein jis ko ${customer.name} ka ledger bhejna hai. OK karte hi WhatsApp us ki chat khol dega, ledger already likha hoga — bas Send dabayein.`}
            />
          </div>
        ) : null}
      </div>
      {ledger.length === 0 ? (
        <EmptyState label="No ledger activity yet." />
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Note</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Balance after</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry, i) => (
                <tr key={entry.id} className={trHover}>
                  <td className={tdClass}>{formatDateTime(entry.createdAt)}</td>
                  <td className={tdClass}>{entry.type}</td>
                  <td className={tdClass}>{entry.note || "-"}</td>
                  <td className={tdClass}>
                    <span className={entry.amount.isNegative() ? "text-success" : "text-warning"}>
                      {formatCurrency(entry.amount.toString())}
                    </span>
                  </td>
                  <td className={tdClass}>{formatCurrency(entry.balanceAfter.toString())}</td>
                  <td className={tdClass}>
                    {entry.type === "OPENING_BALANCE" && i === ledger.length - 1 ? (
                      <ConfirmDeleteButton
                        action={deleteCustomerOpeningBalanceAction.bind(null, customer.id, entry.id)}
                        confirmPhrase={formatCurrency(entry.amount.toString())}
                        title="Undo this opening balance?"
                        consequences={[`Reverses ${formatCurrency(entry.amount.toString())} off this customer's balance.`]}
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
