import { Card, PageHeader } from "../../_components/ui";
import { SupplierForm } from "./supplier-form";

export default function NewSupplierPage() {
  return (
    <div>
      <PageHeader title="Add supplier" />
      <Card className="p-6">
        <SupplierForm />
      </Card>
    </div>
  );
}
