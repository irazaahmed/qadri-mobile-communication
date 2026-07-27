import { auth } from "@/auth";
import { Card, PageHeader } from "../_components/ui";
import { PasswordForm } from "./password-form";

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div>
      <PageHeader title="Settings" subtitle={session?.user?.email ?? undefined} />
      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-brand-blue">Change password</h2>
        <PasswordForm />
      </Card>
    </div>
  );
}
