import Link from "next/link";
import { listSuppliers } from "@/lib/actions/suppliers";
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
import { deleteSupplierAction } from "./actions";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; error?: string }>;
}) {
  const params = await searchParams;
  const suppliers = await listSuppliers({ name: params.name || undefined });

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle={`${suppliers.length} supplier(s)`}
        actions={
          <ButtonLink href="/admin/suppliers/new" variant="primary">
            + Add supplier
          </ButtonLink>
        }
      />

      <div className="mb-4">
        <ErrorBanner message={params.error} />
      </div>

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="name" placeholder="Search by name" defaultValue={params.name} className="max-w-[220px]" />
        <button
          type="submit"
          className="rounded-full bg-brand-teal px-4 py-2 text-sm font-medium text-white hover:bg-brand-teal-light"
        >
          Search
        </button>
        <Link href="/admin/suppliers" className="px-2 py-2 text-sm text-slate hover:underline">
          Clear
        </Link>
      </form>

      {suppliers.length === 0 ? (
        <EmptyState label="No suppliers yet." />
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
              {suppliers.map((s) => (
                <tr key={s.id} className={trHover}>
                  <td className={`${tdClass} font-medium`}>
                    <a href={`/admin/suppliers/${s.id}`} className="text-brand-teal hover:underline">
                      {s.name}
                    </a>
                  </td>
                  <td className={tdClass}>{s.phone || "-"}</td>
                  <td className={tdClass}>{s.address || "-"}</td>
                  <td className={`${tdClass} flex gap-3`}>
                    <a href={`/admin/suppliers/${s.id}/edit`} className="text-brand-teal hover:underline">
                      Edit
                    </a>
                    <DeleteButton action={deleteSupplierAction.bind(null, s.id)} />
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
