import Image from "next/image";
import { notFound } from "next/navigation";
import { getSaleById, getSaleInitialPaymentSplit } from "@/lib/actions/sales";
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

  const [customer, payments, initialSplit] = await Promise.all([
    sale.customerId ? getCustomerById(sale.customerId) : Promise.resolve(null),
    listPaymentsForSale(sale.id),
    getSaleInitialPaymentSplit(sale.id),
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

  // Group identical no-IMEI phone lines (a bulk sale — see the "bulk sale"
  // feature) into one invoice row with a quantity, instead of one row per
  // physical unit — mirrors how the New Sale form lets them be entered as
  // one line in the first place. IMEI-tracked phones and accessories always
  // stay on their own row.
  type DisplayRow = { key: string; label: string; sub: string; qty: number; rate: string; lineTotal: string };
  const displayRows: DisplayRow[] = [];
  const bulkGroups = new Map<string, DisplayRow>();
  for (const { item, phone, accessory } of items) {
    if (phone && phone.imei === null) {
      const key = `${phone.brand}|${phone.model}|${phone.storage ?? ""}|${phone.color ?? ""}|${item.rate.toString()}`;
      const existing = bulkGroups.get(key);
      if (existing) {
        existing.qty += 1;
        existing.lineTotal = (Number(existing.lineTotal) + Number(item.lineTotal)).toString();
      } else {
        const row: DisplayRow = {
          key,
          label: `${phone.brand} ${phone.model}${phone.storage ? ` (${phone.storage})` : ""}`,
          sub: phone.color ?? "",
          qty: 1,
          rate: item.rate.toString(),
          lineTotal: item.lineTotal.toString(),
        };
        bulkGroups.set(key, row);
        displayRows.push(row);
      }
    } else if (phone) {
      displayRows.push({
        key: item.id,
        label: `${phone.brand} ${phone.model}${phone.storage ? ` (${phone.storage})` : ""}`,
        sub: `${phone.color ? `${phone.color} — ` : ""}IMEI ${phone.imei}`,
        qty: 1,
        rate: item.rate.toString(),
        lineTotal: item.lineTotal.toString(),
      });
    } else if (accessory) {
      displayRows.push({
        key: item.id,
        label: accessory.name,
        sub: `${accessory.brand}${accessory.variant ? `, ${accessory.variant}` : ""}`,
        qty: item.quantity ?? 1,
        rate: item.rate.toString(),
        lineTotal: item.lineTotal.toString(),
      });
    } else {
      displayRows.push({ key: item.id, label: "-", sub: "", qty: item.quantity ?? 1, rate: item.rate.toString(), lineTotal: item.lineTotal.toString() });
    }
  }

  const amountDue = Number(sale.totalAmount) - Number(sale.paidAmount);

  // Payment breakdown by method — the upfront split at sale time
  // (cash/bank, see getSaleInitialPaymentSplit) plus any later top-up
  // Payments, so the WhatsApp message reflects everything collected so far.
  const methodTotals = { CASH: Number(initialSplit.cash), BANK_TRANSFER: Number(initialSplit.bank), JAZZCASH: 0, EASYPAISA: 0 };
  for (const p of payments) {
    methodTotals[p.method] = (methodTotals[p.method] ?? 0) + Number(p.amount);
  }

  const shareText = [
    `Qadri Mobile Communication ki taraf se purchasing ka shukriya!`,
    ``,
    `Invoice: ${sale.invoiceNumber} (${formatDate(sale.createdAt)})`,
    ``,
    `Aap ne ye purchase kiya:`,
    ...displayRows.map((row) => `- ${row.label}${row.qty > 1 ? ` x${row.qty}` : ""} — ${formatCurrency(row.lineTotal)}`),
    ``,
    `Total Bill: ${formatCurrency(sale.totalAmount.toString())}`,
    ``,
    `Payment:`,
    ...(methodTotals.CASH > 0 ? [`Cash: ${formatCurrency(methodTotals.CASH)}`] : []),
    ...(methodTotals.BANK_TRANSFER > 0 ? [`Bank Transfer: ${formatCurrency(methodTotals.BANK_TRANSFER)}`] : []),
    ...(methodTotals.JAZZCASH > 0 ? [`JazzCash: ${formatCurrency(methodTotals.JAZZCASH)}`] : []),
    ...(methodTotals.EASYPAISA > 0 ? [`EasyPaisa: ${formatCurrency(methodTotals.EASYPAISA)}`] : []),
    ...(amountDue > 0 ? [`Credit (Baqaya): ${formatCurrency(amountDue)}`] : []),
    ``,
    `Shukriya, dobara tashreef laayein!`,
  ].join("\n");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end print:hidden">
        <InvoiceActions
          invoiceNumber={sale.invoiceNumber}
          defaultPhone={customer?.phone ?? ""}
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
            {displayRows.map((row) => (
              <tr key={row.key} className="border-b border-gray-200">
                <td className="py-2">
                  <div>
                    <p className="font-medium">{row.label}</p>
                    {row.sub ? <p className="text-xs text-gray-500">{row.sub}</p> : null}
                  </div>
                </td>
                <td className="py-2">{row.qty}</td>
                <td className="py-2 text-right">{formatCurrency(row.rate)}</td>
                <td className="py-2 text-right">{formatCurrency(row.lineTotal)}</td>
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
