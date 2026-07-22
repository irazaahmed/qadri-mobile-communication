import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { signOutAction } from "./actions";
import { NavLink } from "./_components/nav-link";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/inventory/phones", label: "Phones" },
  { href: "/admin/inventory/accessories", label: "Accessories" },
  { href: "/admin/purchases", label: "Purchases" },
  { href: "/admin/sales", label: "Sales" },
  { href: "/admin/suppliers", label: "Suppliers" },
  { href: "/admin/customers", label: "Customers" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-white/10 bg-navy text-white print:hidden md:min-h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="px-5 py-5">
          <Link href="/admin" className="flex items-center gap-2">
            <Image src="/logo-icon.png" alt="" width={28} height={28} className="shrink-0" />
            <span className="text-lg font-semibold leading-tight">Qadri Mobile</span>
          </Link>
          <p className="text-xs text-white/60">Admin panel</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2 pb-4 md:overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          {session?.user?.email ? (
            <p className="mb-2 truncate text-xs text-white/60">{session.user.email}</p>
          ) : null}
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full rounded-full border border-white/30 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 bg-surface-muted px-4 py-6 print:bg-surface print:p-0 md:px-8 md:py-8">
        <div className="mx-auto max-w-7xl print:max-w-none">{children}</div>
      </main>
    </div>
  );
}
