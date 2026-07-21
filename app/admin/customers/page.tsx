import Link from "next/link";
import { listCustomers } from "@/lib/actions/customers";
import {
  ButtonLink,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  table,
  tableWrap,
  tdClass,
  thClass,
  trHover,
} from "../_components/ui";
import { DeleteButton } from "../_components/delete-button";
import { deleteCustomerAction } from "./actions";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; phone?: string; error?: string }>;
}) {
  const params = await searchParams;
  const customers = await listCustomers({ name: params.name || undefined, phone: params.phone || undefined });

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} customer(s)`}
        actions={
          <ButtonLink href="/admin/customers/new" variant="primary">
            + Add customer
          </ButtonLink>
        }
      />

      <div className="mb-4">
        <ErrorBanner message={params.error} />
      </div>

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="name" placeholder="Search by name" defaultValue={params.name} className="max-w-[200px]" />
        <Input name="phone" placeholder="Search by phone" defaultValue={params.phone} className="max-w-[200px]" />
        <button
          type="submit"
          className="rounded-full bg-brand-teal px-4 py-2 text-sm font-medium text-white hover:bg-brand-teal-light"
        >
          Search
        </button>
        <Link href="/admin/customers" className="px-2 py-2 text-sm text-slate hover:underline">
          Clear
        </Link>
      </form>

      {customers.length === 0 ? (
        <EmptyState label="No customers yet." />
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Phone</th>
                <th className={thClass}>Address</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className={trHover}>
                  <td className={`${tdClass} font-medium`}>
                    <a href={`/admin/customers/${c.id}`} className="text-brand-teal hover:underline">
                      {c.name}
                    </a>
                  </td>
                  <td className={tdClass}>{c.phone}</td>
                  <td className={tdClass}>{c.address || "-"}</td>
                  <td className={`${tdClass} flex gap-3`}>
                    <a href={`/admin/customers/${c.id}/edit`} className="text-brand-teal hover:underline">
                      Edit
                    </a>
                    <DeleteButton action={deleteCustomerAction.bind(null, c.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
