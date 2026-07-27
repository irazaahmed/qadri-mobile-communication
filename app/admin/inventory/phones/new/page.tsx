import { listSuppliers } from "@/lib/actions/suppliers";
import { ButtonLink, Card, PageHeader, SuccessBanner } from "../../../_components/ui";
import { PhoneForm } from "./phone-form";

export default async function NewPhonePage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>;
}) {
  const { added } = await searchParams;
  const suppliers = await listSuppliers();
  const addedCount = added ? Number(added) : 0;

  return (
    <div>
      <ButtonLink href="/admin/inventory/phones" variant="ghost" size="sm" className="mb-3">
        ← Back to phones
      </ButtonLink>
      <PageHeader title="Add phone" subtitle="Manual stock entry — normal restocking happens via Purchases." />
      {addedCount > 0 ? (
        <SuccessBanner
          message={
            addedCount === 1
              ? "Phone added. Form is cleared — add the next one."
              : `${addedCount} units added. Form is cleared — add the next one.`
          }
        />
      ) : null}
      <Card className="p-6">
        <PhoneForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} />
      </Card>
    </div>
  );
}
