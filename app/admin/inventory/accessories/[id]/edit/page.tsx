import { notFound } from "next/navigation";
import { getAccessoryById, canDeleteAccessory } from "@/lib/actions/accessories";
import { Card, PageHeader } from "../../../../_components/ui";
import { AccessoryEditForm } from "./accessory-edit-form";
import { ConfirmDeleteButton } from "../../../../_components/confirm-delete-button";
import { deleteAccessoryAction } from "./actions";

export default async function EditAccessoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [accessory, deletable] = await Promise.all([getAccessoryById(id), canDeleteAccessory(id)]);

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

      {deletable ? (
        <Card className="mt-6 p-6">
          <h2 className="mb-3 font-semibold text-danger">Danger zone</h2>
          <ConfirmDeleteButton
            action={deleteAccessoryAction.bind(null, accessory.id)}
            confirmPhrase={accessory.name}
            title="Delete this accessory entirely?"
            consequences={["Removes this catalog entry completely — only possible since it has no purchase/sale/claim history yet."]}
            label="Delete this accessory"
          />
        </Card>
      ) : null}
    </div>
  );
}
