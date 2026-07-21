import { notFound } from "next/navigation";
import { getSupplierById } from "@/lib/actions/suppliers";
import { Card, PageHeader } from "../../../_components/ui";
import { SupplierEditForm } from "./supplier-edit-form";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await getSupplierById(id);

  if (!supplier) notFound();

  return (
    <div>
      <PageHeader title="Edit supplier" subtitle={supplier.name} />
      <Card className="p-6">
        <SupplierEditForm supplier={supplier} />
      </Card>
    </div>
  );
}
