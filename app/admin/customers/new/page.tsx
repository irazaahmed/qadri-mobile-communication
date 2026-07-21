import { Card, PageHeader } from "../../_components/ui";
import { CustomerForm } from "./customer-form";

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="Add customer" />
      <Card className="p-6">
        <CustomerForm />
      </Card>
    </div>
  );
}
