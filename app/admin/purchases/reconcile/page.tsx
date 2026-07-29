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
        subtitle="Supplier ka asal bill aa gaya — un phones se jorein jo estimate par pehle hi stock/sale ho chuke hain."
      />

      {phones.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-slate">
            Koi phone abhi "bill pending" nahi hai. Ye page tab kaam aata hai jab koi phone "Add phone" se bina
            confirm rate ke, andaza cost par stock/sale kar diya jaye — phir jab supplier ka asal bill aaye, yahan se
            uska exact rate darj karein.
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
