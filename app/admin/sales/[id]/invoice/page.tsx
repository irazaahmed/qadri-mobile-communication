import Image from "next/image";
import { notFound } from "next/navigation";
import { getSaleById } from "@/lib/actions/sales";
import { getCustomerById } from "@/lib/actions/customers";
import { getPhoneById } from "@/lib/actions/phones";
import { getAccessoryById } from "@/lib/actions/accessories";
import { listPaymentsForSale } from "@/lib/actions/payments";
import { Badge, Card, EmptyState, table, tableWrap, tdClass, thClass, trHover } from "../../../_components/ui";
import { formatCurrency, formatDate, formatDateTime } from "../../../_lib/format";
import { InvoiceActions } from "./invoice-actions";
import { SalePaymentForm } from "../payment-form";
import { ConfirmDeleteButton } from "../../../_components/confirm-delete-button";
import { deleteSaleAction, deleteSalePaymentAction } from "../actions";

const STATUS_BADGE = { PAID: "success", PARTIAL: "warning", UNPAID: "danger" } as const;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await getSaleById(id);
  if (!sale) notFound();

  const [customer, payments] = await Promise.all([
    sale.customerId ? getCustomerById(sale.customerId) : Promise.resolve(null),
    listPaymentsForSale(sale.id),
  ]);

  const items = await Promise.all(
    sale.items.map(async (item) => {
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

  const amountDue = Number(sale.totalAmount) - Number(sale.paidAmount);
  const shareText = `Invoice ${sale.invoiceNumber} from Qadri Mobile Communication — total ${formatCurrency(
    sale.totalAmount.toString()
  )}, ${sale.status === "PAID" ? "paid in full" : `due ${formatCurrency(amountDue)}`}.`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end print:hidden">
        <InvoiceActions
          invoiceNumber={sale.invoiceNumber}
          customerPhone={customer?.phone ?? null}
          shareText={shareText}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-8 text-gray-900 shadow-sm print:rounded-none print:border-none print:shadow-none">
        <div className="mb-6 flex items-start justify-between border-b border-gray-200 pb-6">
          <div className="flex items-center gap-3">
            <Image src="/logo-icon.png" alt="Qadri Mobile Communication" width={64} height={64} />
            <div>
              <h1 className="text-lg font-semibold text-brand-blue">Qadri Mobile Communication</h1>
              <p className="text-xs text-gray-500">Phones &amp; accessories</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-brand-blue">{sale.invoiceNumber}</p>
            <p className="text-sm text-gray-500">{formatDate(sale.createdAt)}</p>
            <div className="mt-1">
              <Badge variant={STATUS_BADGE[sale.status]}>{sale.status}</Badge>
            </div>
          </div>
        </div>

        <div className="mb-6 flex justify-between text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Billed to</p>
            <p className="font-medium">{customer?.name ?? "Walk-in customer"}</p>
            {customer?.phone ? <p className="text-gray-500">{customer.phone}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-500">Payment type</p>
            <p className="font-medium">{sale.paymentType}</p>
            {sale.dueDate ? <p className="text-gray-500">Due {formatDate(sale.dueDate)}</p> : null}
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2">Item</th>
              <th className="py-2">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ item, phone, accessory }) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-2">
                  {phone ? (
                    <div>
                      <p className="font-medium">
                        {phone.brand} {phone.model} {phone.storage ? `(${phone.storage})` : ""}
                      </p>
                      <p className="text-xs text-gray-500">
                        {phone.color ? `${phone.color} — ` : ""}IMEI {phone.imei ?? "N/A"}
                      </p>
                    </div>
                  ) : accessory ? (
                    <div>
                      <p className="font-medium">{accessory.name}</p>
                      <p className="text-xs text-gray-500">
                        {accessory.brand}
                        {accessory.variant ? `, ${accessory.variant}` : ""}
                      </p>
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="py-2">{item.quantity ?? 1}</td>
                <td className="py-2 text-right">{formatCurrency(item.rate.toString())}</td>
                <td className="py-2 text-right">{formatCurrency(item.lineTotal.toString())}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-6 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span>{formatCurrency(sale.totalAmount.toString())}</span>
          </div>
          <div className="flex justify-between font-semibold text-brand-blue">
            <span>Total</span>
            <span>{formatCurrency(sale.totalAmount.toString())}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Paid</span>
            <span>{formatCurrency(sale.paidAmount.toString())}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Amount due</span>
            <span className={amountDue > 0 ? "text-red-600" : ""}>{formatCurrency(amountDue)}</span>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-gray-500">Thank you for shopping with Qadri Mobile Communication.</p>
      </div>

      <Card className="mt-6 p-5 print:hidden">
        <h2 className="mb-3 font-semibold text-brand-blue">Payments</h2>
        {sale.status !== "PAID" && sale.customerId ? (
          <div className="mb-4">
            <SalePaymentForm saleId={sale.id} remaining={amountDue} />
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
                      <ConfirmDeleteButton
                        action={deleteSalePaymentAction.bind(null, p.id, sale.id)}
                        confirmPhrase={formatCurrency(p.amount.toString())}
                        title="Delete this payment?"
                        consequences={[
                          `Reverses ${formatCurrency(p.amount.toString())} back onto ${sale.invoiceNumber}'s outstanding balance.`,
                          "Reverses the cash movement this payment recorded.",
                        ]}
                        label="Delete"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6 p-5 print:hidden">
        <h2 className="mb-3 font-semibold text-danger">Danger zone</h2>
        <ConfirmDeleteButton
          action={deleteSaleAction.bind(null, sale.id)}
          confirmPhrase={sale.invoiceNumber}
          title={`Delete ${sale.invoiceNumber}?`}
          consequences={[
            "Puts every phone from this sale back IN_STOCK (only allowed if not currently claimed).",
            "Adds every accessory quantity from this sale back to stock.",
            "Reverses this invoice's customer receivable and cash effect.",
            payments.length > 0
              ? "Blocked — delete the payment(s) above first."
              : "Blocked if any payment is recorded against this invoice.",
          ]}
          label="Delete this sale"
        />
      </Card>
    </div>
  );
}
