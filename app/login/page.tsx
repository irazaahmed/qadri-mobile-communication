import Image from "next/image";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-teal px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/QMC logo 2.0.png"
            alt="Qadri Mobile Communication"
            width={72}
            height={72}
            className="mb-3 rounded-full"
            priority
          />
          <h1 className="text-xl font-semibold text-brand-teal">Qadri Mobile Communication</h1>
          <p className="mt-1 text-sm text-slate">Admin panel sign in</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
