"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorBanner } from "./ui";

export interface ConfirmDeleteButtonProps {
  /** Bound server action — call signature already carries the record id. */
  action: () => Promise<{ error: string } | { success?: true } | void>;
  /** Exact text the admin must type to enable the final delete button — e.g. an invoice/claim number or IMEI. */
  confirmPhrase: string;
  title: string;
  /** Bullet list of what this will undo/reverse — shown so the admin knows the blast radius before confirming. */
  consequences: string[];
  label?: string;
  onDeleted?: () => void;
}

/**
 * Destructive-action button with a real double-check: clicking "Delete"
 * only opens a panel; the admin must then type the exact confirmation
 * phrase before the final "Delete permanently" button even becomes
 * clickable. Deliberately stronger than a single native confirm() dialog,
 * since these deletes reverse cash/stock/ledger effects and cannot be
 * undone once submitted.
 */
export function ConfirmDeleteButton({
  action,
  confirmPhrase,
  title,
  consequences,
  label = "Delete",
  onDeleted,
}: ConfirmDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-danger hover:underline">
        {label}
      </button>
    );
  }

  const matches = typed.trim() === confirmPhrase;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      onDeleted?.();
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm">
      <p className="font-medium text-danger">{title}</p>
      <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-slate">
        {consequences.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate">
        Confirm karne ke liye neeche <span className="font-mono font-semibold text-danger">{confirmPhrase}</span> type
        karein — is action ko wapis (undo) nahi kiya ja sakta.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={confirmPhrase}
        className="mt-2 w-full max-w-xs rounded-lg border border-slate/25 bg-surface px-3 py-2 text-sm focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/30"
      />
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={!matches || pending}
          onClick={handleConfirm}
        >
          {pending ? "Deleting..." : "Delete permanently"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      <ErrorBanner message={error} />
    </div>
  );
}
