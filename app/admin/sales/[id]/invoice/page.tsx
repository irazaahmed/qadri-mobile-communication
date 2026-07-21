import Image from "next/image";
import { notFound } from "next/navigation";
import { getSaleById } from "@/lib/actions/sales";
import { getCustomerById } from "@/lib/actions/customers";
import { getPhoneById } from "@/lib/actions/phones";
import { getAccessoryById } from "@/lib/actions/accessories";
import { Badge } from "../../../_components/ui";
import { formatCurrency, formatDate } from "../../../_lib/format";
import { InvoiceActions } from "./invoice-actions";

const STATUS_BADGE = { PAID: "success", PARTIAL: "warning", UNPAID: "danger" } as const;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await getSaleById(id);
  if (!sale) notFound();

  const customer = sale.customerId ? await getCustomerById(sale.customerId) : null;

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

      <div className="rounded-xl border border-slate/10 bg-surface p-8 shadow-sm print:rounded-none print:border-none print:shadow-none">
        <div className="mb-6 flex items-start justify-between border-b border-slate/10 pb-6">
          <div className="flex items-center gap-3">
            <Image src="/QMC logo 2.0.png" alt="Qadri Mobile Communication" width={64} height={64} />
            <div>
              <h1 className="text-lg font-semibold text-brand-teal">Qadri Mobile Communication</h1>
              <p className="text-xs text-slate">Phones &amp; accessories</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-brand-teal">{sale.invoiceNumber}</p>
            <p className="text-sm text-slate">{formatDate(sale.createdAt)}</p>
            <div className="mt-1">
              <Badge variant={STATUS_BADGE[sale.status]}>{sale.status}</Badge>
            </div>
          </div>
        </div>

        <div className="mb-6 flex justify-between text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate">Billed to</p>
            <p className="font-medium">{customer?.name ?? "Walk-in customer"}</p>
            {customer?.phone ? <p className="text-slate">{customer.phone}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate">Payment type</p>
            <p className="font-medium">{sale.paymentType}</p>
            {sale.dueDate ? <p className="text-slate">Due {formatDate(sale.dueDate)}</p> : null}
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate/15 text-xs uppercase tracking-wide text-slate">
              <th className="py-2">Item</th>
              <th className="py-2">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ item, phone, accessory }) => (
              <tr key={item.id} className="border-b border-slate/10">
                <td className="py-2">
                  {phone ? (
                    <div>
                      <p className="font-medium">
                        {phone.brand} {phone.model} {phone.storage ? `(${phone.storage})` : ""}
                      </p>
                      <p className="text-xs text-slate">
                        {phone.color ? `${phone.color} — ` : ""}IMEI {phone.imei}
                      </p>
                    </div>
                  ) : accessory ? (
                    <div>
                      <p className="font-medium">{accessory.name}</p>
                      <p className="text-xs text-slate">
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
            <span className="text-slate">Subtotal</span>
            <span>{formatCurrency(sale.totalAmount.toString())}</span>
          </div>
          <div className="flex justify-between font-semibold text-brand-teal">
            <span>Total</span>
            <span>{formatCurrency(sale.totalAmount.toString())}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate">Paid</span>
            <span>{formatCurrency(sale.paidAmount.toString())}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Amount due</span>
            <span className={amountDue > 0 ? "text-danger" : ""}>{formatCurrency(amountDue)}</span>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate">Thank you for shopping with Qadri Mobile Communication.</p>
      </div>
    </div>
  );
}
