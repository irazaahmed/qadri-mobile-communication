"use client";

import { useActionState } from "react";
import { addCashOpeningBalanceAction } from "./actions";
import { Button, ErrorBanner, Field, Input, SuccessBanner } from "../_components/ui";

export function CashOpeningBalanceForm({ isFirstEntry }: { isFirstEntry: boolean }) {
  const [state, formAction, pending] = useActionState(addCashOpeningBalanceAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-xs text-slate">
        {isFirstEntry
          ? "No cash entries yet — write down what's currently in the drawer to start tracking from here. Every sale, purchase, and payment will keep auto-adjusting on top of this. (Abhi jitna cash hath mein hai wo yahan likh dein — is ke baad sab kuch khud auto-adjust hota rahega.)"
          : "Add another manual adjustment on top of the current balance (e.g. cash the owner put into the drawer). (Mojooda balance ke upar aik or manual raqam add karne ke liye.)"}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Amount *">
          <Input name="amount" type="number" step="0.01" min="0.01" className="w-36" required />
        </Field>
        <Field label="Note (optional)">
          <Input name="note" className="w-56" placeholder="Reference / memo" />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : isFirstEntry ? "Set opening balance" : "Add adjustment"}
        </Button>
      </div>
      <ErrorBanner message={state?.error} />
      <SuccessBanner message={state?.success} />
    </form>
  );
}
