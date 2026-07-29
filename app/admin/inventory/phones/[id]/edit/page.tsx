import { notFound } from "next/navigation";
import { getPhoneById, canDeletePhone } from "@/lib/actions/phones";
import { listSuppliers } from "@/lib/actions/suppliers";
import { Card, PageHeader } from "../../../../_components/ui";
import { PhoneEditForm } from "./phone-edit-form";
import { ConfirmDeleteButton } from "../../../../_components/confirm-delete-button";
import { deletePhoneAction } from "./actions";

export default async function EditPhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [phone, suppliers, deletable] = await Promise.all([
    getPhoneById(id),
    listSuppliers(),
    canDeletePhone(id),
  ]);

  if (!phone) notFound();

  return (
    <div>
      <PageHeader title="Edit phone" subtitle={`${phone.brand} ${phone.model}`} />
      <Card className="p-6">
        <PhoneEditForm
          phone={{
            id: phone.id,
            imei: phone.imei,
            brand: phone.brand,
            model: phone.model,
            storage: phone.storage,
            color: phone.color,
            condition: phone.condition,
            warrantyMonths: phone.warrantyMonths,
            costPrice: phone.costPrice.toString(),
            salePrice: phone.salePrice ? phone.salePrice.toString() : null,
            supplierId: phone.supplierId,
            status: phone.status,
            soldAt: phone.soldAt ? phone.soldAt.toISOString() : null,
            warrantyStatus: phone.warrantyStatus,
            costPending: phone.costPending,
          }}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        />
      </Card>

      {phone.costPending ? (
        <Card className="mt-6 border-warning/30 p-6">
          <h2 className="mb-1 font-semibold text-warning">Bill pending</h2>
          <p className="mb-3 text-sm text-slate">
            Is phone ki cost sirf andaza hai — supplier ka asal bill abhi nahi aya. Bill anay par exact rate darj
            karne ke liye reconcile karein, take profit exact ho jaye (agar ye phone sell ho chuka hai to uska profit
            bhi khud-ba-khud update ho jayega).
          </p>
          <a
            href={`/admin/purchases/reconcile?phoneId=${phone.id}`}
            className="inline-flex items-center rounded-full bg-warning px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Reconcile bill for this phone
          </a>
        </Card>
      ) : null}

      {deletable ? (
        <Card className="mt-6 p-6">
          <h2 className="mb-3 font-semibold text-danger">Danger zone</h2>
          <ConfirmDeleteButton
            action={deletePhoneAction.bind(null, phone.id)}
            confirmPhrase={phone.imei ?? phone.model}
            title="Delete this phone from stock?"
            consequences={["Removes this unit from inventory entirely — it was a manual entry, not from a Purchase invoice."]}
            label="Delete this phone"
          />
        </Card>
      ) : null}
    </div>
  );
}
