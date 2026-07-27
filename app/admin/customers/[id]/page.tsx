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

export default async function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [customer, sales, ledger] = await Promise.all([
    getCustomerById(id),
    listSales({ customerId: id }),
    prisma.customerLedgerEntry.findMany({ where: { customerId: id }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!customer) notFound();

  const currentBalance = ledger.length ? ledger[ledger.length - 1].balanceAfter.toString() : "0";
  const outstandingAmount = Math.max(0, Number(currentBalance));

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
        <p className="text-xs font-medium uppercase tracking-wide text-slate">Current receivable balance</p>
        <p className="mt-1 text-2xl font-semibold text-warning">{formatCurrency(currentBalance)}</p>
        {outstandingAmount > 0 ? (
          <div className="mt-4 border-t border-slate/10 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate">
              Record payment — clears oldest outstanding sales first
            </p>
            <CustomerBulkPaymentForm customerId={customer.id} outstanding={outstandingAmount} />
          </div>
        ) : null}
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

      <div className="mb-3">
        <h2 className="font-semibold text-brand-blue">Ledger</h2>
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
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
