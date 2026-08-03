"use client";

import { useActionState, useState } from "react";
import { addCashOpeningBalanceAction } from "./actions";
import { Button, ErrorBanner, Field, Input, SuccessBanner } from "../_components/ui";

export function CashOpeningBalanceForm({ isFirstEntry }: { isFirstEntry: boolean }) {
  const [state, formAction, pending] = useActionState(addCashOpeningBalanceAction, undefined);
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-xs text-slate">
        {isFirstEntry
          ? "No cash entries yet — write down what's currently in the drawer to start tracking from here. Every sale, purchase, and payment will keep auto-adjusting on top of this. (Abhi jitna cash hath mein hai wo yahan likh dein — is ke baad sab kuch khud auto-adjust hota rahega.)"
          : "Add another manual adjustment on top of the current balance — money in or money out (e.g. owner puts cash in, or takes cash out to pay someone). (Mojooda balance ke upar cash add ya minus karne ke liye — jese bank ledger mein hota hai.)"}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Direction *">
          <div className="flex gap-4 pt-2 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="direction"
                value="IN"
                checked={direction === "IN"}
                onChange={() => setDirection("IN")}
              />
              Cash in
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="direction"
                value="OUT"
                checked={direction === "OUT"}
                onChange={() => setDirection("OUT")}
              />
              Cash out
            </label>
          </div>
        </Field>
        <Field label="Amount *">
          <Input name="amount" type="number" step="0.01" min="0.01" className="w-36" required />
        </Field>
        <Field label="Note (optional)">
          <Input name="note" className="w-56" placeholder="Reference / memo" />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : isFirstEntry ? "Set opening balance" : direction === "OUT" ? "Subtract cash" : "Add cash"}
        </Button>
      </div>
      <ErrorBanner message={state?.error} />
      <SuccessBanner message={state?.success} />
    </form>
  );
}
