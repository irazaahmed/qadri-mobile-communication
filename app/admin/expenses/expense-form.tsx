"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { recordExpenseAction } from "./actions";
import { Button, ErrorBanner, Field, Input } from "../_components/ui";

export function ExpenseForm() {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await recordExpenseAction({ category, amount, note: note || null });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setCategory("");
      setAmount("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <Field label="Category *">
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Rent, utilities, transport..."
          className="w-48"
          required
        />
      </Field>
      <Field label="Amount *">
        <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" required />
      </Field>
      <Field label="Note (optional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} className="w-56" placeholder="Details" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Add expense"}
      </Button>
      {error ? (
        <div className="w-full">
          <ErrorBanner message={error} />
        </div>
      ) : null}
    </form>
  );
}
