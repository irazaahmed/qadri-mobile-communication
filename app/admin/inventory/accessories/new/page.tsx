import { ButtonLink, Card, PageHeader, SuccessBanner } from "../../../_components/ui";
import { AccessoryForm } from "./accessory-form";

export default async function NewAccessoryPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>;
}) {
  const { added } = await searchParams;

  return (
    <div>
      <ButtonLink href="/admin/inventory/accessories" variant="ghost" size="sm" className="mb-3">
        ← Back to accessories
      </ButtonLink>
      <PageHeader title="Add accessory" subtitle="Creates a new catalog entry — matched on name + brand + variant." />
      {added ? <SuccessBanner message="Accessory added. Form is cleared — add the next one." /> : null}
      <Card className="p-6">
        <AccessoryForm />
      </Card>
    </div>
  );
}
