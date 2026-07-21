import { Card, PageHeader } from "../../../_components/ui";
import { AccessoryForm } from "./accessory-form";

export default function NewAccessoryPage() {
  return (
    <div>
      <PageHeader title="Add accessory" subtitle="Creates a new catalog entry — matched on name + brand + variant." />
      <Card className="p-6">
        <AccessoryForm />
      </Card>
    </div>
  );
}
