import { notFound } from "next/navigation";
import { getAccessoryById } from "@/lib/actions/accessories";
import { Card, PageHeader } from "../../../../_components/ui";
import { AccessoryEditForm } from "./accessory-edit-form";

export default async function EditAccessoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accessory = await getAccessoryById(id);

  if (!accessory) notFound();

  return (
    <div>
      <PageHeader title="Edit accessory" subtitle={accessory.name} />
      <Card className="p-6">
        <AccessoryEditForm
          accessory={{
            id: accessory.id,
            name: accessory.name,
            brand: accessory.brand,
            variant: accessory.variant,
            category: accessory.category,
            costPrice: accessory.costPrice.toString(),
            salePrice: accessory.salePrice.toString(),
            quantity: accessory.quantity,
            lowStockThreshold: accessory.lowStockThreshold,
          }}
        />
      </Card>
    </div>
  );
}
