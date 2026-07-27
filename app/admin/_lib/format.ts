/**
 * Pure, framework-agnostic display formatting helpers for the admin UI.
 * No "use server" here — these are plain sync functions safe to import from
 * both Server and Client Components, and safe to run on values that already
 * crossed the serialization boundary (plain strings/numbers only, never
 * Prisma.Decimal instances — convert those with `.toString()` before they
 * leave a server module).
 */

export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "Rs 0";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "Rs 0";
  const sign = num < 0 ? "-" : "";
  return `${sign}Rs ${Math.abs(num).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** All display timestamps render in Pakistan Standard Time (UTC+5, no DST) regardless of server timezone — storage stays UTC via `DateTime @default(now())`, only display converts. */
const PKT_TIMEZONE = "Asia/Karachi";

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: PKT_TIMEZONE });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PKT_TIMEZONE,
  });
}

export function isOverdue(dueDate: string | Date | null | undefined): boolean {
  if (!dueDate) return false;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return d.getTime() < Date.now();
}

/** Decimal-like -> plain number, safe for arithmetic on already-serialized strings. */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? num : 0;
}
