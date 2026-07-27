import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Shared, dense, functional UI primitives for the admin panel. Tailwind
 * utilities only — brand tokens from app/globals.css, no hardcoded hex.
 * Folder is prefixed with "_" so Next.js's App Router ignores it for
 * routing purposes.
 */

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";

const buttonSizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
} as const;

const buttonVariants = {
  primary: "bg-brand-blue text-white hover:bg-brand-blue-light",
  cyan: "bg-brand-cyan text-navy hover:opacity-90",
  outline: "border border-brand-blue text-brand-blue hover:bg-surface-muted",
  ghost: "text-slate hover:bg-surface-muted",
  danger: "bg-danger text-white hover:opacity-90",
} as const;

type ButtonVariant = keyof typeof buttonVariants;
type ButtonSize = keyof typeof buttonSizes;

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={`${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-slate/10 bg-surface shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-brand-blue">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const badgeVariants = {
  success: "bg-success/10 text-success border-success/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  slate: "bg-slate/10 text-slate border-slate/20",
  blue: "bg-brand-blue/10 text-brand-blue border-brand-blue/20",
} as const;

export function Badge({
  variant = "slate",
  children,
}: {
  variant?: keyof typeof badgeVariants;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeVariants[variant]}`}
    >
      {children}
    </span>
  );
}

const fieldClass =
  "w-full rounded-lg border border-slate/25 bg-surface px-3 py-2 text-sm text-foreground placeholder:text-slate/60 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30 disabled:bg-surface-muted disabled:text-slate";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldClass} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldClass} ${className}`} {...props} />;
}

export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`mb-1 block text-xs font-medium text-slate ${className}`} {...props} />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate/80">{hint}</p> : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success">
      {message}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-slate/25 bg-surface-muted px-4 py-10 text-sm text-slate">
      {label}
    </div>
  );
}

export const tableWrap = "overflow-x-auto rounded-xl border border-slate/10 bg-surface shadow-sm";
export const table = "w-full min-w-max text-left text-sm";
export const thClass =
  "sticky top-0 bg-surface-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate whitespace-nowrap";
export const tdClass = "px-3 py-2.5 whitespace-nowrap border-t border-slate/10";
export const trHover = "hover:bg-surface-muted/60";
