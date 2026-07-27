import { notFound } from "next/navigation";
import { getClaimById } from "@/lib/actions/claims";
import { listSuppliers } from "@/lib/actions/suppliers";
import { Badge, Card, PageHeader } from "../../_components/ui";
import { formatDateTime } from "../../_lib/format";
import { ClaimActions } from "./claim-actions";

const STATUS_BADGE = {
  RECEIVED_FROM_CUSTOMER: "warning",
  SENT_TO_SUPPLIER: "blue",
  RECEIVED_FROM_SUPPLIER: "blue",
  DELIVERED_TO_CUSTOMER: "success",
  REFUNDED: "slate",
  REJECTED: "danger",
} as const;

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [claim, suppliers] = await Promise.all([getClaimById(id), listSuppliers()]);
  if (!claim) notFound();

  const outstandingMax = claim.phone
    ? Number(claim.phone.salePrice ?? 0)
    : Number(claim.accessory?.salePrice ?? 0) * (claim.quantity ?? 1);

  const timeline = [
    { label: "Received from customer", at: claim.receivedFromCustomerAt },
    { label: "Sent to supplier", at: claim.sentToSupplierAt },
    { label: "Received from supplier", at: claim.receivedFromSupplierAt },
    { label: "Delivered to customer", at: claim.deliveredToCustomerAt },
  ].filter((t) => t.at);

  return (
    <div>
      <PageHeader
        title={claim.claimNumber}
        subtitle={`${claim.customer.name} — ${claim.customer.phone}`}
        actions={<Badge variant={STATUS_BADGE[claim.status]}>{claim.status.replaceAll("_", " ")}</Badge>}
      />

      <Card className="mb-6 grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
        <div>
          <p className="text-xs text-slate">Item</p>
          <p className="font-medium">
            {claim.phone
              ? `${claim.phone.brand} ${claim.phone.model}`
              : claim.accessory
                ? `${claim.accessory.name} × ${claim.quantity ?? 1}`
                : "-"}
          </p>
          {claim.phone ? <p className="font-mono text-xs text-slate">{claim.phone.imei ?? "no IMEI"}</p> : null}
        </div>
        <div>
          <p className="text-xs text-slate">Reason</p>
          <p className="font-medium">{claim.reason}</p>
        </div>
        <div>
          <p className="text-xs text-slate">Supplier</p>
          <p className="font-medium">{claim.supplier?.name ?? "-"}</p>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-brand-blue">Timeline</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {timeline.map((t) => (
            <li key={t.label} className="flex justify-between border-b border-slate/10 pb-2 last:border-0 last:pb-0">
              <span>{t.label}</span>
              <span className="text-slate">{formatDateTime(t.at)}</span>
            </li>
          ))}
        </ul>
        {claim.resolutionNote ? (
          <p className="mt-3 rounded-lg border border-slate/15 bg-surface-muted px-3 py-2 text-sm">
            <span className="font-medium">Resolution: </span>
            {claim.resolutionNote}
          </p>
        ) : null}
      </Card>

      <ClaimActions claimId={claim.id} status={claim.status} suppliers={suppliers} outstandingMax={outstandingMax} />
    </div>
  );
}
