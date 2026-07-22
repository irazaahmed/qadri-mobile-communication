import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-black/5 bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/logo-full-light.png"
            alt="Qadri Mobile Communication"
            width={970}
            height={1024}
            className="mb-4 h-auto w-40"
            priority
          />
          <h1 className="sr-only">Qadri Mobile Communication</h1>
          <p className="mt-1 text-sm text-gray-500">Admin panel sign in</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
