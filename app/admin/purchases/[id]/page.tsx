import { notFound } from "next/navigation";
import { getPurchaseById } from "@/lib/actions/purchases";
import { getSupplierById } from "@/lib/actions/suppliers";
import { getPhoneById } from "@/lib/actions/phones";
import { getAccessoryById } from "@/lib/actions/accessories";
import { Badge, Card, PageHeader, table, tableWrap, tdClass, thClass, trHover } from "../../_components/ui";
import { formatCurrency, formatDate } from "../../_lib/format";

const STATUS_BADGE = { PAID: "success", PARTIAL: "warning", UNPAID: "danger" } as const;

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const purchase = await getPurchaseById(id);
  if (!purchase) notFound();

  const supplier = await getSupplierById(purchase.supplierId);

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
        subtitle={`${supplier?.name ?? "Unknown supplier"} — ${formatDate(purchase.createdAt)}`}
        actions={<Badge variant={STATUS_BADGE[purchase.status]}>{purchase.status}</Badge>}
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
                      <span className="font-mono text-xs text-slate">{phone.imei}</span>
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
    </div>
  );
}
