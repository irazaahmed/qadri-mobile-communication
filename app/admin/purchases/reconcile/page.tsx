import { listPendingBillPhones } from "@/lib/actions/phones";
import { listSuppliers } from "@/lib/actions/suppliers";
import { Card, PageHeader } from "../../_components/ui";
import { ReconcileForm } from "./reconcile-form";

export default async function ReconcilePendingBillPage({
  searchParams,
}: {
  searchParams: Promise<{ phoneId?: string }>;
}) {
  const [{ phoneId }, phones, suppliers] = await Promise.all([
    searchParams,
    listPendingBillPhones(),
    listSuppliers(),
  ]);

  return (
    <div>
      <PageHeader
        title="Reconcile pending bill"
        subtitle="The supplier's real bill has arrived — link it to phones that were already stocked/sold on an estimate. (Supplier ka asal bill aa gaya — un phones se jorein jo estimate par pehle hi stock/sale ho chuke hain.)"
      />

      {phones.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-slate">
            No phone is currently &quot;bill pending&quot;. This page is for when a phone was stocked/sold from
            &quot;Add phone&quot; on an estimated cost without a confirmed rate — once the supplier&apos;s real bill
            arrives, enter its exact rate here. (Koi phone abhi &quot;bill pending&quot; nahi hai — jab asal bill
            aaye, yahan se exact rate darj karein.)
          </p>
        </Card>
      ) : (
        <ReconcileForm
          phones={phones.map((p) => ({
            id: p.id,
            imei: p.imei,
            brand: p.brand,
            model: p.model,
            storage: p.storage,
            color: p.color,
            status: p.status,
            costPrice: p.costPrice.toString(),
          }))}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone }))}
          preselectedPhoneId={phoneId || null}
        />
      )}
    </div>
  );
}
