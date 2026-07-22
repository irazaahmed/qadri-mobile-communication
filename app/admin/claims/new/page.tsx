import { listPhones } from "@/lib/actions/phones";
import { listAccessories } from "@/lib/actions/accessories";
import { listCustomers } from "@/lib/actions/customers";
import { PageHeader } from "../../_components/ui";
import { ClaimForm } from "./claim-form";

export default async function NewClaimPage() {
  const [phones, accessories, customers] = await Promise.all([
    listPhones({ status: "SOLD" }),
    listAccessories(),
    listCustomers(),
  ]);

  return (
    <div>
      <PageHeader title="New claim" subtitle="Log a customer return or warranty complaint." />
      <ClaimForm
        phones={phones.map((p) => ({ id: p.id, imei: p.imei, brand: p.brand, model: p.model }))}
        accessories={accessories.map((a) => ({ id: a.id, name: a.name, brand: a.brand, variant: a.variant }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
      />
    </div>
  );
}
