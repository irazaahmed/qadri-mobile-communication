import { notFound } from "next/navigation";
import { getSupplierById } from "@/lib/actions/suppliers";
import { listPurchases } from "@/lib/actions/purchases";
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
import { formatCurrency, formatDateTime, isOverdue, formatDate } from "../../_lib/format";
import { SupplierBulkPaymentForm } from "./payment-form";
import { SupplierOpeningBalanceForm } from "./opening-balance-form";
import { deleteSupplierOpeningBalanceAction } from "./opening-balance-actions";
import { ConfirmDeleteButton } from "../../_components/confirm-delete-button";

export default async function SupplierLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [supplier, purchases, ledger] = await Promise.all([
    getSupplierById(id),
    listPurchases({ supplierId: id }),
    prisma.supplierLedgerEntry.findMany({ where: { supplierId: id }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!supplier) notFound();

  const currentBalance = ledger.length ? ledger[ledger.length - 1].balanceAfter.toString() : "0";
  const balanceNum = Number(currentBalance);
  const outstandingAmount = Math.max(0, balanceNum);
  const advanceAmount = Math.max(0, -balanceNum);

  return (
    <div>
      <PageHeader
        title={supplier.name}
        subtitle={`${supplier.phone || "No phone"} — ${supplier.address || "No address"}`}
        actions={
          <ButtonLink href={`/admin/suppliers/${supplier.id}/edit`} variant="outline">
            Edit
          </ButtonLink>
        }
      />

      <Card className="mb-6 p-5">
        {advanceAmount > 0 ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-slate">
              Advance credit with this supplier (Is supplier ke pas humara advance)
            </p>
            <p className="mt-1 text-2xl font-semibold text-success">{formatCurrency(String(advanceAmount))}</p>
            <p className="mt-1 text-xs text-slate">
              We paid more than what was owed — this will be automatically applied to reduce this supplier&apos;s
              next credit purchase. (Agli credit purchase mein khud adjust ho jayega.)
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-slate">Current payable balance</p>
            <p className="mt-1 text-2xl font-semibold text-danger">{formatCurrency(currentBalance)}</p>
          </>
        )}
        <div className="mt-4 border-t border-slate/10 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate">
            Record payment — clears oldest outstanding purchases first (Purani se nayi invoice tarteeb mein adjust
            hoga)
          </p>
          <SupplierBulkPaymentForm supplierId={supplier.id} outstanding={outstandingAmount} />
        </div>
        <div className="mt-4 border-t border-slate/10 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate">
            Previous balance from before this system (Is system se pehle ka baqaya)
          </p>
          <SupplierOpeningBalanceForm supplierId={supplier.id} />
        </div>
      </Card>

      <div className="mb-3">
        <h2 className="font-semibold text-brand-blue">Purchases</h2>
      </div>
      {purchases.length === 0 ? (
        <EmptyState label="No purchases from this supplier yet." />
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
                      <Badge variant={p.status === "PAID" ? "success" : p.status === "PARTIAL" ? "warning" : "danger"}>
                        {p.status}
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
                    <span className={entry.amount.isNegative() ? "text-success" : "text-danger"}>
                      {formatCurrency(entry.amount.toString())}
                    </span>
                  </td>
                  <td className={tdClass}>{formatCurrency(entry.balanceAfter.toString())}</td>
                  <td className={tdClass}>
                    {entry.type === "OPENING_BALANCE" && i === ledger.length - 1 ? (
                      <ConfirmDeleteButton
                        action={deleteSupplierOpeningBalanceAction.bind(null, supplier.id, entry.id)}
                        confirmPhrase={formatCurrency(entry.amount.toString())}
                        title="Undo this opening balance?"
                        consequences={[`Reverses ${formatCurrency(entry.amount.toString())} off this supplier's balance.`]}
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
