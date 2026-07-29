"use client";

import { useRef, type FormEvent, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Drop-in replacement for `<form method="get">` on a list page's search/
 * filter bar: filters live as the admin types or picks a select/date value
 * (debounced), instead of requiring a Search/Filter button click. Submitting
 * the form (e.g. pressing Enter) applies immediately, skipping the debounce.
 *
 * Relies on React's onChange delegating up from every descendant field to
 * this one handler — works with the existing Input/Select fields unchanged,
 * no per-field wiring needed. Blank fields are dropped from the URL instead
 * of being sent as empty query params.
 */
export function InstantFilterForm({
  children,
  className,
  debounceMs = 400,
}: {
  children: ReactNode;
  className?: string;
  debounceMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value.trim()) {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function handleChange() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(apply, debounceMs);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    apply();
  }

  return (
    <form ref={formRef} onChange={handleChange} onSubmit={handleSubmit} className={className}>
      {children}
    </form>
  );
}
