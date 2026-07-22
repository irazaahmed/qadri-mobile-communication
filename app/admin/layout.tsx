import { auth } from "@/auth";
import { signOutAction } from "./actions";
import { Sidebar } from "./_components/sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar userEmail={session?.user?.email ?? null} signOutAction={signOutAction} />
      <main className="min-w-0 flex-1 bg-surface-muted px-4 py-6 print:bg-surface print:p-0 md:px-8 md:py-8">
        <div className="mx-auto max-w-7xl print:max-w-none">{children}</div>
      </main>
    </div>
  );
}
