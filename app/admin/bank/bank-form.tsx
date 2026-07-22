"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { recordBankEntryAction } from "./actions";
import { Button, ErrorBanner, Field, Input } from "../_components/ui";

const TYPE_SUGGESTIONS = ["Opening balance", "Deposit", "Credit", "Withdrawal", "Transfer"];

export function BankForm({ isFirstEntry }: { isFirstEntry: boolean }) {
  const router = useRouter();
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [type, setType] = useState(isFirstEntry ? "Opening balance" : "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await recordBankEntryAction({ direction, type, amount, note: note || null });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setType("");
      setAmount("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {isFirstEntry ? (
        <p className="text-sm text-slate">
          No bank entries yet — start with the balance currently in the account (type &quot;Opening balance&quot;).
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Direction *">
          <div className="flex gap-4 pt-2 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={direction === "IN"} onChange={() => setDirection("IN")} />
              Money in
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={direction === "OUT"} onChange={() => setDirection("OUT")} />
              Money out
            </label>
          </div>
        </Field>
        <Field label="Type *">
          <Input
            list="bank-type-suggestions"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="Deposit, Credit, Withdrawal..."
            className="w-48"
            required
          />
          <datalist id="bank-type-suggestions">
            {TYPE_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Amount *">
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" required />
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} className="w-56" placeholder="Details" />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Add entry"}
        </Button>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
    </form>
  );
}
