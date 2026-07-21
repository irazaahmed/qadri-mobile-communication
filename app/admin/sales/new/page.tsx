import { listPhones } from "@/lib/actions/phones";
import { listAccessories } from "@/lib/actions/accessories";
import { listCustomers } from "@/lib/actions/customers";
import { PageHeader } from "../../_components/ui";
import { SaleForm } from "./sale-form";

export default async function NewSalePage() {
  const [phones, accessories, customers] = await Promise.all([
    listPhones({ status: "IN_STOCK" }),
    listAccessories(),
    listCustomers(),
  ]);

  return (
    <div>
      <PageHeader title="New sale" subtitle="Only in-stock phones are selectable — mix phones and accessories on one invoice." />
      <SaleForm
        phones={phones.map((p) => ({
          id: p.id,
          imei: p.imei,
          brand: p.brand,
          model: p.model,
          storage: p.storage,
          color: p.color,
        }))}
        accessories={accessories.map((a) => ({
          id: a.id,
          name: a.name,
          brand: a.brand,
          variant: a.variant,
          salePrice: a.salePrice.toString(),
          quantity: a.quantity,
        }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
      />
    </div>
  );
}
