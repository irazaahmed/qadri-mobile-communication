"use client";

/**
 * Generic confirm-then-submit delete button. Wraps a bound server action
 * (already carrying the record id via `.bind(null, id)`) in a form so it
 * still progressively enhances, with a native `confirm()` gate on submit.
 */
export function DeleteButton({
  action,
  confirmText = "Are you sure? This cannot be undone.",
  label = "Delete",
}: {
  action: () => Promise<void>;
  confirmText?: string;
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-danger hover:underline">
        {label}
      </button>
    </form>
  );
}
