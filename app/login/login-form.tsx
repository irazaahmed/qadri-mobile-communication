"use client";

import { useActionState } from "react";
import { authenticate } from "./actions";

/*
 * This card is a fixed light "spotlight" panel that floats on the navy page
 * regardless of the visitor's OS light/dark preference — it pairs with the
 * light-theme logo lockup, so it intentionally does NOT use the
 * theme-reactive --color-surface/--color-slate tokens (those invert under
 * prefers-color-scheme and would turn this card dark too).
 */
const fieldClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(authenticate, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-xs font-medium text-gray-500">
          Email
        </label>
        <input id="email" name="email" type="email" required autoFocus className={fieldClass} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-xs font-medium text-gray-500">
          Password
        </label>
        <input id="password" name="password" type="password" required className={fieldClass} />
      </div>
      {state?.error ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center rounded-full bg-brand-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-blue-light disabled:opacity-50"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
