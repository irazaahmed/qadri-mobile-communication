import { notFound } from "next/navigation";
import { getPhoneById } from "@/lib/actions/phones";
import { listSuppliers } from "@/lib/actions/suppliers";
import { Card, PageHeader } from "../../../../_components/ui";
import { PhoneEditForm } from "./phone-edit-form";

export default async function EditPhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [phone, suppliers] = await Promise.all([getPhoneById(id), listSuppliers()]);

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
          }}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        />
      </Card>
    </div>
  );
}
