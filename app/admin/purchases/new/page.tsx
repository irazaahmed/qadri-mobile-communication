import { listSuppliers, getSupplierBalances } from "@/lib/actions/suppliers";
import { listAccessories } from "@/lib/actions/accessories";
import { PageHeader } from "../../_components/ui";
import { PurchaseForm } from "./purchase-form";

export default async function NewPurchasePage() {
  const [suppliers, accessories, balances] = await Promise.all([
    listSuppliers(),
    listAccessories(),
    getSupplierBalances(),
  ]);
  const accessoryNames = Array.from(new Set(accessories.map((a) => a.name))).sort();

  return (
    <div>
      <PageHeader
        title="New purchase"
        subtitle="Multi-line invoice — mix phones and accessories. Supplier is optional for cash, required for credit."
      />
      <PurchaseForm
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.phone,
          advanceCredit: Math.max(0, -Number(balances.get(s.id) ?? "0")).toString(),
        }))}
        accessoryNames={accessoryNames}
      />
    </div>
  );
}
