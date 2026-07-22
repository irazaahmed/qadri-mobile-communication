import { listClaims } from "@/lib/actions/claims";
import { isClaimStuck } from "@/lib/claim-status";
import {
  Badge,
  ButtonLink,
  EmptyState,
  PageHeader,
  table,
  tableWrap,
  tdClass,
  thClass,
  trHover,
} from "../_components/ui";
import { formatDate } from "../_lib/format";

const STATUS_BADGE = {
  RECEIVED_FROM_CUSTOMER: "warning",
  SENT_TO_SUPPLIER: "blue",
  RECEIVED_FROM_SUPPLIER: "blue",
  DELIVERED_TO_CUSTOMER: "success",
  REFUNDED: "slate",
  REJECTED: "danger",
} as const;

export default async function ClaimsPage() {
  const claims = await listClaims();

  return (
    <div>
      <PageHeader
        title="Claims"
        subtitle={`${claims.length} claim(s)`}
        actions={
          <ButtonLink href="/admin/claims/new" variant="primary">
            + New claim
          </ButtonLink>
        }
      />

      {claims.length === 0 ? (
        <EmptyState label="No claims yet." />
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={thClass}>Claim</th>
                <th className={thClass}>Received</th>
                <th className={thClass}>Customer</th>
                <th className={thClass}>Item</th>
                <th className={thClass}>Supplier</th>
                <th className={thClass}>Stage</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => {
                const stuck = isClaimStuck(c);
                return (
                  <tr key={c.id} className={trHover}>
                    <td className={tdClass}>
                      <a href={`/admin/claims/${c.id}`} className="text-brand-blue hover:underline">
                        {c.claimNumber}
                      </a>
                    </td>
                    <td className={tdClass}>{formatDate(c.receivedFromCustomerAt)}</td>
                    <td className={tdClass}>{c.customer.name}</td>
                    <td className={tdClass}>
                      {c.phone
                        ? `${c.phone.brand} ${c.phone.model}`
                        : c.accessory
                          ? `${c.accessory.name} × ${c.quantity ?? 1}`
                          : "-"}
                    </td>
                    <td className={tdClass}>{c.supplier?.name ?? "-"}</td>
                    <td className={tdClass}>
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_BADGE[c.status]}>{c.status.replaceAll("_", " ")}</Badge>
                        {stuck ? <Badge variant="danger">Stuck with supplier</Badge> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
