import { listSuppliers } from "@/lib/actions/suppliers";
import { listAccessories } from "@/lib/actions/accessories";
import { PageHeader } from "../../_components/ui";
import { PurchaseForm } from "./purchase-form";

export default async function NewPurchasePage() {
  const [suppliers, accessories] = await Promise.all([listSuppliers(), listAccessories()]);
  const accessoryNames = Array.from(new Set(accessories.map((a) => a.name))).sort();

  return (
    <div>
      <PageHeader
        title="New purchase"
        subtitle="Multi-line invoice — mix phones and accessories. Supplier is optional for cash, required for credit."
      />
      <PurchaseForm
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        accessoryNames={accessoryNames}
      />
    </div>
  );
}
