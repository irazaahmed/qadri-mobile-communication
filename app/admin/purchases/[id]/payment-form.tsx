"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { recordPurchasePaymentAction } from "./actions";
import { Button, ErrorBanner, Field, Input, Select } from "../../_components/ui";

export function PurchasePaymentForm({ purchaseId, remaining }: { purchaseId: string; remaining: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await recordPurchasePaymentAction({
        purchaseId,
        amount,
        method: method as "CASH" | "BANK_TRANSFER" | "JAZZCASH" | "EASYPAISA",
        note: note || null,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setAmount("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <Field label="Amount">
        <Input
          type="number"
          step="0.01"
          min="0"
          max={remaining}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32"
          required
        />
      </Field>
      <Field label="Method">
        <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-40">
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="JAZZCASH">JazzCash</option>
          <option value="EASYPAISA">EasyPaisa</option>
        </Select>
      </Field>
      <Field label="Note (optional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} className="w-48" placeholder="Reference / memo" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Recording..." : "Record payment"}
      </Button>
      {error ? (
        <div className="w-full">
          <ErrorBanner message={error} />
        </div>
      ) : null}
    </form>
  );
}
