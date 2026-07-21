import { notFound } from "next/navigation";
import { getCustomerById } from "@/lib/actions/customers";
import { Card, PageHeader } from "../../../_components/ui";
import { CustomerEditForm } from "./customer-edit-form";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomerById(id);

  if (!customer) notFound();

  return (
    <div>
      <PageHeader title="Edit customer" subtitle={customer.name} />
      <Card className="p-6">
        <CustomerEditForm customer={customer} />
      </Card>
    </div>
  );
}
