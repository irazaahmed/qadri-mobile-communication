import { listSuppliers } from "@/lib/actions/suppliers";
import { Card, PageHeader } from "../../../_components/ui";
import { PhoneForm } from "./phone-form";

export default async function NewPhonePage() {
  const suppliers = await listSuppliers();

  return (
    <div>
      <PageHeader title="Add phone" subtitle="Manual stock entry — normal restocking happens via Purchases." />
      <Card className="p-6">
        <PhoneForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} />
      </Card>
    </div>
  );
}
