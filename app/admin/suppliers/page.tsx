import Link from "next/link";
import { listSuppliers, getSupplierBalances } from "@/lib/actions/suppliers";
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
import { formatCurrency } from "../_lib/format";
import { DeleteButton } from "../_components/delete-button";
import { InstantFilterForm } from "../_components/instant-filter-form";
import { deleteSupplierAction } from "./actions";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; error?: string }>;
}) {
  const params = await searchParams;
  const [suppliers, balances] = await Promise.all([
    listSuppliers({ name: params.name || undefined }),
    getSupplierBalances(),
  ]);

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

      <InstantFilterForm className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="name" placeholder="Search by name" defaultValue={params.name} className="max-w-[220px]" />
        <Link href="/admin/suppliers" className="px-2 py-2 text-sm text-slate hover:underline">
          Clear
        </Link>
      </InstantFilterForm>

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
                <th className={thClass}>Total credit</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => {
                const balance = balances.get(s.id) ?? "0";
                const balanceNum = Number(balance);
                const owed = balanceNum > 0;
                const advance = balanceNum < 0;
                return (
                <tr key={s.id} className={trHover}>
                  <td className={`${tdClass} font-medium`}>
                    <a href={`/admin/suppliers/${s.id}`} className="text-brand-blue hover:underline">
                      {s.name}
                    </a>
                  </td>
                  <td className={tdClass}>{s.phone || "-"}</td>
                  <td className={tdClass}>{s.address || "-"}</td>
                  <td className={tdClass}>
                    {advance ? (
                      <span className="font-medium text-success">
                        {formatCurrency(String(-balanceNum))} advance
                      </span>
                    ) : (
                      <span className={owed ? "font-medium text-danger" : "text-slate"}>
                        {formatCurrency(balance)}
                      </span>
                    )}
                  </td>
                  <td className={`${tdClass} flex gap-3`}>
                    <a href={`/admin/suppliers/${s.id}/edit`} className="text-brand-blue hover:underline">
                      Edit
                    </a>
                    <DeleteButton action={deleteSupplierAction.bind(null, s.id)} />
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
