"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/inventory/phones", label: "Phones" },
  { href: "/admin/inventory/accessories", label: "Accessories" },
  { href: "/admin/purchases", label: "Purchases" },
  { href: "/admin/sales", label: "Sales" },
  { href: "/admin/claims", label: "Claims" },
  { href: "/admin/suppliers", label: "Suppliers" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/expenses", label: "Expenses" },
  { href: "/admin/bank", label: "Bank" },
  { href: "/admin/reports", label: "Reports" },
];

/**
 * Collapsible on mobile — a full-height stack of 8 nav links above the page
 * content would otherwise push everything below the fold on a phone. Below
 * `md`, only the header row (logo + toggle) renders by default; the nav and
 * footer share one collapsible panel. At `md` and above the toggle is
 * hidden and everything renders expanded, matching the original fixed
 * sidebar.
 */
export function Sidebar({
  userEmail,
  signOutAction,
}: {
  userEmail: string | null;
  signOutAction: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside className="shrink-0 border-b border-white/10 bg-navy text-white shadow-xl print:hidden md:sticky md:top-0 md:flex md:h-screen md:w-56 md:flex-col md:self-start md:border-b-0 md:border-r">
      <div className="flex items-center justify-between border-white/10 px-5 py-5 md:block md:border-b md:pb-4">
        <Link href="/admin" className="flex items-center gap-2" onClick={() => setIsOpen(false)}>
          <Image src="/logo-icon.png" alt="" width={28} height={28} className="shrink-0" />
          <span className="text-lg font-semibold leading-tight">Qadri Mobile</span>
        </Link>
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
          aria-label="Toggle navigation menu"
          className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-medium text-white md:hidden"
        >
          {isOpen ? "Close" : "Menu"}
        </button>
        <p className="hidden text-xs text-white/60 md:mt-1 md:block">Admin panel</p>
      </div>

      <div className={`${isOpen ? "flex" : "hidden"} flex-col md:flex md:min-h-0 md:flex-1`}>
        <nav
          className="flex flex-col gap-1 px-2 py-3 md:flex-1 md:overflow-y-auto"
          onClick={() => setIsOpen(false)}
        >
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-white/10 px-5 py-4">
          {userEmail ? <p className="truncate text-xs text-white/60">{userEmail}</p> : null}
          <ThemeToggle />
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full rounded-full border border-white/30 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
