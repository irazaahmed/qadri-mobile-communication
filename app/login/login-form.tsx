"use client";

import { useActionState } from "react";
import { authenticate } from "./actions";

const fieldClass =
  "w-full rounded-lg border border-slate/25 bg-surface px-3 py-2 text-sm text-foreground placeholder:text-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(authenticate, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate">
          Email
        </label>
        <input id="email" name="email" type="email" required autoFocus className={fieldClass} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate">
          Password
        </label>
        <input id="password" name="password" type="password" required className={fieldClass} />
      </div>
      {state?.error ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center rounded-full bg-brand-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal-light disabled:opacity-50"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
