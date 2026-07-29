import { notFound } from "next/navigation";
import { getPurchaseById } from "@/lib/actions/purchases";
import { getSupplierById } from "@/lib/actions/suppliers";
import { getPhoneById } from "@/lib/actions/phones";
import { getAccessoryById } from "@/lib/actions/accessories";
import { listPaymentsForPurchase } from "@/lib/actions/payments";
import { Badge, Card, EmptyState, PageHeader, table, tableWrap, tdClass, thClass, trHover } from "../../_components/ui";
import { formatCurrency, formatDate, formatDateTime } from "../../_lib/format";
import { PurchasePaymentForm } from "./payment-form";
import { ConfirmDeleteButton } from "../../_components/confirm-delete-button";
import { deletePurchaseAction, deletePurchasePaymentAction } from "./actions";

const STATUS_BADGE = { PAID: "success", PARTIAL: "warning", UNPAID: "danger" } as const;

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const purchase = await getPurchaseById(id);
  if (!purchase) notFound();

  const [supplier, payments] = await Promise.all([
    purchase.supplierId ? getSupplierById(purchase.supplierId) : Promise.resolve(null),
    listPaymentsForPurchase(purchase.id),
  ]);
  const remaining = Number(purchase.totalAmount) - Number(purchase.paidAmount);

  const items = await Promise.all(
    purchase.items.map(async (item) => {
      if (item.itemType === "PHONE" && item.phoneId) {
        const phone = await getPhoneById(item.phoneId);
        return { item, phone, accessory: null };
      }
      if (item.itemType === "ACCESSORY" && item.accessoryId) {
        const accessory = await getAccessoryById(item.accessoryId);
        return { item, phone: null, accessory };
      }
      return { item, phone: null, accessory: null };
    })
  );

  return (
    <div>
      <PageHeader
        title={purchase.invoiceNumber}
        subtitle={`${supplier?.name ?? "No supplier"} — ${formatDate(purchase.createdAt)}`}
        actions={
          <>
            {purchase.isReconciliation ? <Badge variant="warning">Bill reconciliation</Badge> : null}
            <Badge variant={STATUS_BADGE[purchase.status]}>{purchase.status}</Badge>
          </>
        }
      />

      <Card className="mb-6 grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
        <div>
          <p className="text-xs text-slate">Payment type</p>
          <p className="font-medium">{purchase.paymentType}</p>
        </div>
        <div>
          <p className="text-xs text-slate">Total</p>
          <p className="font-medium">{formatCurrency(purchase.totalAmount.toString())}</p>
        </div>
        <div>
          <p className="text-xs text-slate">Paid</p>
          <p className="font-medium">{formatCurrency(purchase.paidAmount.toString())}</p>
        </div>
        <div>
          <p className="text-xs text-slate">Due date</p>
          <p className="font-medium">{purchase.dueDate ? formatDate(purchase.dueDate) : "-"}</p>
        </div>
      </Card>

      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={thClass}>Type</th>
              <th className={thClass}>Details</th>
              <th className={thClass}>Qty</th>
              <th className={thClass}>Rate</th>
              <th className={thClass}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ item, phone, accessory }) => (
              <tr key={item.id} className={trHover}>
                <td className={tdClass}>
                  <Badge variant={item.itemType === "PHONE" ? "blue" : "slate"}>{item.itemType}</Badge>
                </td>
                <td className={tdClass}>
                  {phone ? (
                    <span>
                      {phone.brand} {phone.model} {phone.storage ? `(${phone.storage})` : ""}{" "}
                      <span className="font-mono text-xs text-slate">{phone.imei ?? "no IMEI"}</span>
                    </span>
                  ) : accessory ? (
                    <span>
                      {accessory.name} — {accessory.brand}
                      {accessory.variant ? `, ${accessory.variant}` : ""}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className={tdClass}>{item.quantity ?? 1}</td>
                <td className={tdClass}>{formatCurrency(item.rate.toString())}</td>
                <td className={tdClass}>{formatCurrency(item.lineTotal.toString())}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-3 font-semibold text-brand-blue">Payments</h2>
        {purchase.status !== "PAID" ? (
          <div className="mb-4">
            <PurchasePaymentForm purchaseId={purchase.id} remaining={remaining} />
          </div>
        ) : null}
        {payments.length === 0 ? (
          <EmptyState label="No payments recorded yet." />
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Amount</th>
                  <th className={thClass}>Method</th>
                  <th className={thClass}>Note</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className={trHover}>
                    <td className={tdClass}>{formatDateTime(p.createdAt)}</td>
                    <td className={tdClass}>{formatCurrency(p.amount.toString())}</td>
                    <td className={tdClass}>{p.method}</td>
                    <td className={tdClass}>{p.note ?? "-"}</td>
                    <td className={tdClass}>
                      {purchase.paymentType === "CASH" && !purchase.isReconciliation ? (
                        <span className="text-xs text-slate">Settled with the purchase — delete the purchase instead.</span>
                      ) : (
                        <ConfirmDeleteButton
                          action={deletePurchasePaymentAction.bind(null, p.id, purchase.id)}
                          confirmPhrase={formatCurrency(p.amount.toString())}
                          title="Delete this payment?"
                          consequences={[
                            `Reverses ${formatCurrency(p.amount.toString())} back onto ${purchase.invoiceNumber}'s outstanding balance.`,
                            "Reverses the cash/bank movement this payment recorded.",
                          ]}
                          label="Delete"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="mb-3 font-semibold text-danger">Danger zone</h2>
        {purchase.isReconciliation ? (
          <p className="text-sm text-slate">
            This is a bill-reconciliation invoice — these phones already existed in stock/sale, so deleting this
            invoice isn&apos;t supported (the normal reversal would delete those real phone records). If a rate
            was entered wrong, correct the phone&apos;s cost directly on its Edit page instead. (Ye ek
            bill-reconciliation invoice hai — is phone ka cost seedha uske Edit page se theek karein.)
          </p>
        ) : (
          <ConfirmDeleteButton
            action={deletePurchaseAction.bind(null, purchase.id)}
            confirmPhrase={purchase.invoiceNumber}
            title={`Delete ${purchase.invoiceNumber}?`}
            consequences={[
              "Deletes every phone this invoice added to stock (only allowed if still in stock — unsold).",
              "Reverses the accessory quantity this invoice added (only allowed if not already sold elsewhere).",
              "Reverses this invoice's supplier payable and cash/bank effect.",
              purchase.paymentType === "CREDIT"
                ? payments.length > 0
                  ? "Blocked — delete the payment(s) above first."
                  : "Blocked if any payment is recorded against this invoice."
                : "Its own cash/bank settlement record is removed automatically — nothing to delete separately.",
            ]}
            label="Delete this purchase"
          />
        )}
      </Card>
    </div>
  );
}
