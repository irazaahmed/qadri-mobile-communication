import { notFound } from "next/navigation";
import { getAccessoryById } from "@/lib/actions/accessories";
import { Card, PageHeader } from "../../../../_components/ui";
import { RestockForm } from "./restock-form";

export default async function RestockAccessoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accessory = await getAccessoryById(id);

  if (!accessory) notFound();

  return (
    <div>
      <PageHeader
        title="Restock accessory"
        subtitle={`${accessory.name} — ${accessory.brand}${accessory.variant ? `, ${accessory.variant}` : ""} — currently ${accessory.quantity} in stock`}
      />
      <Card className="p-6">
        <RestockForm
          accessory={{
            name: accessory.name,
            brand: accessory.brand,
            variant: accessory.variant,
            category: accessory.category,
            costPrice: accessory.costPrice.toString(),
          }}
        />
      </Card>
    </div>
  );
}
