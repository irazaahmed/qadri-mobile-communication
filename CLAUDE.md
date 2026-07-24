@AGENTS.md

# Qadri Mobile Communication — CLAUDE.md

## 0. Project Overview

Qadri Mobile Communication is a mobile phone and accessories shop (sale + purchase of new/used phones, plus accessories like chargers, cases, cables). This is a single-admin backend management system — no customer-facing login/portal (explicitly out of scope for now), but the admin must have complete visibility into stock, purchases, sales, credit/payable-receivable tracking, warranty claims, and cash/profit reporting.

Stack: Next.js 16 (App Router), Prisma, Postgres (Neon), Tailwind CSS, Auth.js (single ADMIN role only). Deployed on Vercel.

**No seed data.** Build full functionality against empty tables — real data entered manually after handoff.

Money fields are always `Decimal`, never `Float`.

---

## 1. Tech Stack & Next.js 16 Rules (breaking changes — follow strictly)

Confirmed installed: `next@16.2.11`, `react@19.2.4`. Before writing any route/data-fetching code, skim `node_modules/next/dist/docs/` for anything version-specific — the rules below are the ones that matter most for this project:

- **`middleware.ts` is renamed to `proxy.ts`.** Use this filename for the admin-route auth guard.
- **`params` and `searchParams` are async (Promise-based)** in Server Components and Route Handlers:
  ```ts
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
  }
  ```
- **Turbopack is the default bundler** for `next dev` and `next build`, no config needed.
- **Caching is opt-in** via Cache Components (`cacheLife`, `cacheTag`). Do not assume implicit caching — dashboard widgets (low stock, pending payables/receivables, cash balance) must read fresh on every request, which is what we want since these numbers must never be stale.
- `next lint` is removed — use ESLint directly.
- No cron jobs anywhere in this project. Due dates, warranty status, and low-stock flags are all computed at query time from stored dates/thresholds, not via scheduled jobs.

Other conventions:
- Auth.js, credentials provider, single `ADMIN` role. No customer role, no customer login — tracking (customer ledger) lives entirely inside the admin panel.
- Every cash-affecting or stock-affecting write happens inside a single `prisma.$transaction` alongside its ledger entry / stock mutation. Never split these across two requests or two code paths.

### Prisma 7 rules (also a breaking-changes major version, confirmed installed: `prisma@7.9.0`)

- `datasource db { url = env("DATABASE_URL") }` **no longer works** in `schema.prisma`. The `datasource` block only takes `provider`. Connection config lives in `prisma.config.ts` at the project root:
  ```ts
  import "dotenv/config";
  import { defineConfig, env } from "prisma/config";

  export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: { path: "prisma/migrations" },
    datasource: { url: env("DATABASE_URL") },
  });
  ```
  This file is what `prisma db push` / `prisma migrate` / `prisma generate` read for the connection string — it is required, not optional.
- `PrismaClient` **requires a driver adapter** for a direct DB connection (no more implicit Rust query engine). This project uses `@prisma/adapter-neon` (Neon's serverless driver — works over the same connection whether run from Vercel functions or locally):
  ```ts
  // lib/prisma.ts
  import { PrismaClient } from "@prisma/client";
  import { PrismaNeon } from "@prisma/adapter-neon";

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  export const prisma = new PrismaClient({ adapter });
  ```
  Always import `prisma` from `lib/prisma.ts` — never instantiate `PrismaClient` inline elsewhere.
- Neon computes auto-suspend when idle. The **first** `prisma db push`/`migrate`/query after a period of inactivity can take 20–30s while the compute wakes up and may time out once — if a command fails with `P1001: Can't reach database server`, simply retry once before assuming a real connectivity problem.

---

## 2. Brand & Design System (locked — derived from the uploaded logo files)

Logo: navy "QADRI" wordmark in a blue-to-cyan gradient with a phone silhouette and signal-wave swoosh, subtitle "MOBILE COMMUNICATION" in tracked-out caps. Source art lives in `public/Logo.png`; derived assets are `public/logo-icon.png` (compact square mark, used in the sidebar and on invoices), `public/logo-full-light.png` (dark wordmark, for light/white surfaces), and `public/logo-full-dark.png` (light wordmark, for dark/navy surfaces).

Color tokens (defined in `app/globals.css` `:root`, mapped to Tailwind utilities via `@theme inline`):

| Token | Light value | Usage |
|---|---|---|
| `--color-brand-blue` | `#0a56c4` | Primary brand color — primary buttons, links, page titles |
| `--color-brand-blue-light` | `#2f7de8` | Hover/active state for blue elements |
| `--color-brand-cyan` | `#00a8fc` | Secondary accent — used sparingly: CTA highlights, badges, price emphasis, active tab indicator |
| `--color-navy` | `#0a1120` | Fixed dark brand color — sidebar background, login/invoice page chrome. Not theme-reactive; stays navy in both light and dark mode by design (matches the logo's native dark surface) |
| `--color-navy-light` | `#16213a` | Secondary dark surface tone |
| `--color-slate` | `#64748b` | Muted/secondary text, subtitle labels, table meta text |
| `--color-surface` | `#ffffff` | Base background |
| `--color-surface-muted` | `#f3f6fb` | Card/section backgrounds |

Never hardcode hex values inside component files — use the CSS variables (as Tailwind utility classes) instead. The one deliberate exception: components that must always render as a fixed light surface regardless of theme (the login card in `app/login/`, the printable invoice in `app/admin/sales/[id]/invoice/`) use static Tailwind classes (`bg-white`, `text-gray-900`, etc.) instead of the theme-reactive tokens, since those tokens flip under dark mode and would silently break a surface that's meant to always look like a white card / printed paper.

**Semantic colors are separate from brand colors.** Cyan is a brand accent, not an "info" color in this system — don't conflate them. Use standard semantic tokens layered on top of the neutral base:
- Success / in-stock / paid: green (`--color-success`, `#15803d`)
- Danger / overdue / negative stock: red (`--color-danger`, `#dc2626`)
- Warning / low stock / partial: amber (`--color-warning`, `#b45309`) — visually distinct from brand cyan so users don't misread a brand accent as an alert.

**Theme: light is primary, dark is an opt-in toggle — not OS-driven.** The app defaults to light regardless of the visitor's OS `prefers-color-scheme`; dark mode only activates when the admin explicitly flips it via `ThemeToggle` (`app/admin/_components/theme-toggle.tsx`, in the sidebar footer). Mechanism:
- Dark overrides live under the `:root[data-theme="dark"]` selector in `app/globals.css` (not a `prefers-color-scheme` media query).
- `ThemeToggle` sets `data-theme` on `<html>` and persists the choice to `localStorage` under the `qmc-theme` key.
- A small blocking script in `app/layout.tsx` (`<head>`) re-applies a stored `"dark"` preference before first paint, so there's no flash of the wrong theme — but if nothing is stored, it does nothing, which means the default is always light.
- When adding a new admin surface, use the theme-reactive tokens (`bg-surface`, `text-slate`, `border-slate/*`, etc.) so it responds correctly to the toggle; only opt a component out (static classes) if it must always render as a fixed light or fixed dark surface for a specific design reason like the two exceptions above.

**Typography:**
- Headings, logo lockup, page titles: a rounded geometric sans — **Poppins** (bold weights).
- Body text, tables, forms, dense admin UI: **Inter** — clean, high legibility at small sizes for data-entry speed.
- Load both via `next/font/google`, expose as `--font-heading` / `--font-body` CSS variables. Do not import fonts via a CDN `<link>`.

**Shape language:** rounded-xl cards and inputs, pill-shaped primary buttons, generous white space on a white/near-white base, blue dominant with cyan used only as an accent — never let cyan dominate a screen.

---

## 3. Data Model

Design principle: phones and accessories are structurally different (phones are individually serialized by IMEI with per-unit attributes; accessories are aggregate quantity stock) and must not share a table. Both purchase and sale flows are **multi-line/multi-item** (one invoice can contain several phones and/or accessories), following the Huzaifa Traders / Badar Natural Foods pattern rather than Hafeez Communication's single-item-per-sale pattern, since a phone-shop basket realistically mixes a phone + a case + a charger in one transaction.

```prisma
// ---------- Enums ----------

enum PaymentType {
  CASH
  CREDIT
}

enum PaymentStatus {
  PAID
  PARTIAL
  UNPAID
}

enum PaymentMethod {
  CASH
  BANK_TRANSFER
  JAZZCASH
  EASYPAISA
}

enum PaymentDirection {
  PAYABLE     // we pay a supplier
  RECEIVABLE  // a customer pays us
}

enum PhoneCondition {
  NEW
  USED
}

enum PhoneStatus {
  IN_STOCK
  SOLD
  CLAIMED           // currently with us, claimed back from a customer (or back from
                     // supplier, awaiting redelivery to that same customer)
  WITH_SUPPLIER     // sent to supplier/company for warranty exchange
}

enum PurchaseItemType {
  PHONE
  ACCESSORY
}

enum ClaimStatus {
  RECEIVED_FROM_CUSTOMER
  SENT_TO_SUPPLIER
  RECEIVED_FROM_SUPPLIER
  DELIVERED_TO_CUSTOMER
  REFUNDED
  REJECTED
}

// ---------- Parties ----------

model Supplier {
  id          String   @id @default(cuid())
  name        String
  phone       String?
  address     String?
  createdAt   DateTime @default(now())

  purchases   Purchase[]
  payments    Payment[]
  ledger      SupplierLedgerEntry[]
  claims      Claim[]
}

model SupplierLedgerEntry {
  id           String   @id @default(cuid())
  supplierId   String
  supplier     Supplier @relation(fields: [supplierId], references: [id])
  purchaseId   String?
  paymentId    String?
  type         String   // "PURCHASE" | "PAYMENT"
  amount       Decimal
  balanceAfter Decimal
  note         String?
  createdAt    DateTime @default(now())
}

model Customer {
  id          String   @id @default(cuid())
  name        String
  phone       String   @unique
  address     String?
  createdAt   DateTime @default(now())

  sales       Sale[]
  payments    Payment[]
  ledger      CustomerLedgerEntry[]
  claims      Claim[]
}

model CustomerLedgerEntry {
  id           String   @id @default(cuid())
  customerId   String
  customer     Customer @relation(fields: [customerId], references: [id])
  saleId       String?
  paymentId    String?
  claimId      String?
  type         String   // "SALE" | "PAYMENT" | "CLAIM_CREDIT" | "CLAIM_REFUND"
  amount       Decimal
  balanceAfter Decimal
  note         String?
  createdAt    DateTime @default(now())
}

// ---------- Inventory ----------

model Phone {
  id                String          @id @default(cuid())
  imei              String          @unique
  brand             String
  model             String
  storage           String?
  color             String?
  condition         PhoneCondition
  warrantyMonths    Int?            // null/0 typically for USED
  warrantyStartDate DateTime?       // defaults to soldAt when sold; warranty is meaningless while still IN_STOCK
  costPrice         Decimal
  salePrice         Decimal?
  status            PhoneStatus     @default(IN_STOCK)

  supplierId        String?
  supplier          Supplier?       @relation(fields: [supplierId], references: [id])
  purchaseItem      PurchaseItem?
  saleItem          SaleItem?
  claim             Claim?

  createdAt         DateTime        @default(now())
  soldAt            DateTime?
}
```
Add `purchases Purchase[]` back-relation on `Supplier` only if needed for direct queries — the `PurchaseItem.phoneId` link plus `Phone.supplierId` already covers "which supplier did this phone come from."

Warranty status (`IN_WARRANTY` / `EXPIRED` / `N/A`) is **never stored** — compute at read time from `warrantyStartDate + warrantyMonths` vs `now()`, same "computed at query time, not cron" principle as due dates below.

```prisma
model Accessory {
  id                String   @id @default(cuid())
  name              String
  brand             String
  category          String   // "CHARGER" | "CASE" | "CABLE" | "EARPHONE" | "SCREEN_PROTECTOR" | ...
  variant           String?  // color/type descriptor
  costPrice         Decimal  // most recent purchase cost
  salePrice         Decimal
  quantity          Int      @default(0)
  lowStockThreshold Int?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  purchaseItems     PurchaseItem[]
  saleItems         SaleItem[]

  @@unique([name, brand, variant])
}
```

```prisma
// ---------- Purchases ----------

model Purchase {
  id             String        @id @default(cuid())
  invoiceNumber  String        @unique // "PUR-0001"
  supplierId     String?       // optional — required only for CREDIT, see §4.3
  supplier       Supplier?     @relation(fields: [supplierId], references: [id])
  paymentType    PaymentType
  creditDays     Int?
  dueDate        DateTime?
  totalAmount    Decimal
  paidAmount     Decimal       @default(0)
  status         PaymentStatus @default(UNPAID)
  items          PurchaseItem[]
  payments       Payment[]
  createdAt      DateTime      @default(now())
}

model PurchaseItem {
  id          String            @id @default(cuid())
  purchaseId  String
  purchase    Purchase          @relation(fields: [purchaseId], references: [id])
  itemType    PurchaseItemType

  phoneId     String?           @unique
  phone       Phone?            @relation(fields: [phoneId], references: [id])

  accessoryId String?
  accessory   Accessory?        @relation(fields: [accessoryId], references: [id])
  quantity    Int?              // ACCESSORY lines only; PHONE lines are always 1 unit

  rate        Decimal           // cost per unit
  lineTotal   Decimal
}
```

```prisma
// ---------- Sales ----------

model Sale {
  id            String        @id @default(cuid())
  invoiceNumber String        @unique // "INV-0001"
  customerId    String?
  customer      Customer?     @relation(fields: [customerId], references: [id])
  paymentType   PaymentType
  creditDays    Int?
  dueDate       DateTime?
  totalAmount   Decimal
  paidAmount    Decimal       @default(0)
  status        PaymentStatus @default(UNPAID)
  items         SaleItem[]
  payments      Payment[]
  createdAt     DateTime      @default(now())
}

model SaleItem {
  id          String           @id @default(cuid())
  saleId      String
  sale        Sale             @relation(fields: [saleId], references: [id])
  itemType    PurchaseItemType // reuse PHONE | ACCESSORY

  phoneId     String?          @unique
  phone       Phone?           @relation(fields: [phoneId], references: [id])

  accessoryId String?
  accessory   Accessory?       @relation(fields: [accessoryId], references: [id])
  quantity    Int?             // ACCESSORY lines only

  rate        Decimal          // sale price per unit, used for this line
  costAtSale  Decimal          // snapshot of cost at time of sale — source of truth for profit reports
  lineTotal   Decimal
}
```

```prisma
// ---------- Payments (settling credit, both directions) ----------

model Payment {
  id         String           @id @default(cuid())
  direction  PaymentDirection
  supplierId String?
  supplier   Supplier?        @relation(fields: [supplierId], references: [id])
  customerId String?
  customer   Customer?        @relation(fields: [customerId], references: [id])
  purchaseId String?
  purchase   Purchase?        @relation(fields: [purchaseId], references: [id])
  saleId     String?
  sale       Sale?            @relation(fields: [saleId], references: [id])
  amount     Decimal
  method     PaymentMethod
  note       String?
  createdAt  DateTime         @default(now())
}
```

```prisma
// ---------- Claims / Returns (full lifecycle tracking) ----------

model Claim {
  id                     String      @id @default(cuid())
  claimNumber            String      @unique // "CLM-0001"
  customerId             String
  customer               Customer    @relation(fields: [customerId], references: [id])

  itemType               PurchaseItemType
  phoneId                String?     @unique
  phone                  Phone?      @relation(fields: [phoneId], references: [id])
  accessoryId            String?
  accessory              Accessory?  @relation(fields: [accessoryId], references: [id])
  quantity               Int?        // ACCESSORY claims only

  reason                 String
  status                 ClaimStatus @default(RECEIVED_FROM_CUSTOMER)

  supplierId             String?     // which supplier the claim was forwarded to
  supplier               Supplier?   @relation(fields: [supplierId], references: [id])

  receivedFromCustomerAt DateTime    @default(now())
  sentToSupplierAt       DateTime?
  receivedFromSupplierAt DateTime?
  deliveredToCustomerAt  DateTime?

  resolutionNote         String?
  createdAt              DateTime    @default(now())
}
```

```prisma
// ---------- Cash Ledger & Expenses (Hafeez Communication pattern) ----------

model CashLedgerEntry {
  id           String   @id @default(cuid())
  sourceType   String   // SALE, CREDIT_PAYMENT_IN, PURCHASE, CREDIT_PAYMENT_OUT, EXPENSE, CLAIM_REFUND, MANUAL
  sourceId     String?
  amount       Decimal  // signed: + inflow, - outflow
  balanceAfter Decimal
  note         String?
  createdAt    DateTime @default(now())
}

model Expense {
  id        String   @id @default(cuid())
  category  String
  amount    Decimal
  note      String?
  createdAt DateTime @default(now())
}
```

---

## 4. Business Logic

### 4.1 Phone inventory
Each phone purchased is its own row (IMEI is the unique key), never aggregated — a purchase line for a phone always represents exactly one physical unit. Fields captured at purchase: brand, model, storage, color, condition (NEW/USED), warrantyMonths, cost. `status` starts `IN_STOCK`.

### 4.2 Accessory inventory
Aggregate quantity stock, upserted on purchase like Hafeez Communication's `Product`: match on `[name, brand, variant]`. If found, increment `quantity` and update `costPrice` to the latest purchase rate. If not found, create new row. A separate "Edit" action can change price/specs without touching quantity.

### 4.3 Purchases
Multi-line form, optionally against a `Supplier`: each line is either a Phone (full per-unit form: IMEI, brand, model, storage, color, condition, warranty, cost) or an Accessory (pick existing or create + quantity + rate). Supplier is optional for a CASH purchase (e.g. a one-off street purchase with no ongoing supplier relationship) but required for CREDIT, since a payable balance must be tracked against somebody — same shape as `Sale.customerId` (§4.4). On save, in one `prisma.$transaction`:
1. For each PHONE line: create the `Phone` row (`status: IN_STOCK`, `supplierId` from the header, may be null), then the `PurchaseItem` referencing it.
2. For each ACCESSORY line: upsert the `Accessory` per 4.2, increment `quantity`, create the `PurchaseItem`.
3. Sum `lineTotal`s into `Purchase.totalAmount`.
4. If `paymentType = CREDIT`: compute `dueDate = createdAt + creditDays`, create `SupplierLedgerEntry(type: PURCHASE, +totalAmount)`, update running payable.
5. If `paymentType = CASH` and a supplier was picked: still log the `SupplierLedgerEntry` for history (net payable effect zero — log a matching payment same timestamp so the ledger reads clean, same convention as Badar Natural Foods). If no supplier was picked, skip both `SupplierLedgerEntry` writes and the `Payment` row — there's nothing to track them against. Either way, write `CashLedgerEntry(-totalAmount, sourceType: PURCHASE)`.

### 4.4 Sales
Multi-line form: pick phones (search by IMEI/model, only `IN_STOCK`) and/or accessories (search + quantity), optional customer (search by phone or inline-add, upsert by phone number). On save, in one `prisma.$transaction`:
1. Block the sale if any accessory line would take `quantity` negative, or if a selected phone is not `IN_STOCK`.
2. For each PHONE line: set `status: SOLD`, `soldAt: now()`, `warrantyStartDate: now()` (warranty clock starts at sale, not purchase). Snapshot `costAtSale = phone.costPrice`.
3. For each ACCESSORY line: decrement `Accessory.quantity`. Snapshot `costAtSale = accessory.costPrice`.
4. Sum into `Sale.totalAmount`.
5. Cash sale: `paidAmount = totalAmount`, `status = PAID`, `CashLedgerEntry(+totalAmount, sourceType: SALE)`.
6. Credit sale: admin enters `paidAmount` (can be 0), `dueDate = createdAt + creditDays`, `status` = PARTIAL/UNPAID, `CustomerLedgerEntry(type: SALE, +amountDue)`, `CashLedgerEntry(+paidAmount, sourceType: SALE)` for whatever was collected upfront.

### 4.5 Payments (settling credit, both directions)
One shared flow, `direction` determines which ledger it touches:
- **Payable** (paying a supplier against a `Purchase`): create `Payment`, increase `Purchase.paidAmount`, recompute `status`, append `SupplierLedgerEntry(type: PAYMENT, -amount)`, `CashLedgerEntry(-amount, sourceType: CREDIT_PAYMENT_OUT)`.
- **Receivable** (customer paying down a `Sale`): create `Payment`, increase `Sale.paidAmount`, recompute `status`, append `CustomerLedgerEntry(type: PAYMENT, -amount)`, `CashLedgerEntry(+amount, sourceType: CREDIT_PAYMENT_IN)`.

Dashboard sections "Payable to Suppliers" and "Receivable from Customers": list parties with an outstanding balance, oldest-due-first, overdue entries (`dueDate < now()`) visually flagged — computed at query time, no cron.

### 4.6 Claims / Returns (full lifecycle)
Tracks a customer-initiated return/warranty complaint end to end. A claimed item always goes back to the customer who claimed it — there is no path that releases a supplier's replacement into general stock for a different buyer:
1. **`RECEIVED_FROM_CUSTOMER`** — admin logs the claim against a sold `Phone` or `Accessory` line: customer, reason, quantity (if accessory). `Phone.status` → `CLAIMED` if a phone.
2. **`SENT_TO_SUPPLIER`** — admin records which `Supplier` the item was forwarded to and `sentToSupplierAt`. `Phone.status` → `WITH_SUPPLIER`.
3. **`RECEIVED_FROM_SUPPLIER`** — supplier sends back a replacement/repaired unit, `receivedFromSupplierAt` recorded. `Phone.status` → `CLAIMED` (back in the shop's hands, held for redelivery to the same customer).
4. **`DELIVERED_TO_CUSTOMER`** — the resolved item (replacement or repaired original) is handed back to the same customer, `deliveredToCustomerAt` recorded. `Phone.status` → `SOLD` — it's exactly the same situation as any other sold, in-warranty unit.
5. Alternate terminal states, reachable from any non-terminal stage:
   - **`REFUNDED`** — money returned instead of item. Creates `CustomerLedgerEntry(type: CLAIM_REFUND, -amount)` and `CashLedgerEntry(-amount, sourceType: CLAIM_REFUND)`. If the phone is physically in hand (`status = CLAIMED`), it becomes sellable again → `Phone.status` → `IN_STOCK`. If it's still `WITH_SUPPLIER`, leave the status alone — resolve manually once it's physically returned.
   - **`REJECTED`** — claim denied, item handed back to the customer unchanged, no financial effect. If `status = CLAIMED`, `Phone.status` → `SOLD` (same `WITH_SUPPLIER` caveat as above).

Claims list view must show, per claim: current stage, how long it's been sitting with the supplier (flag if stuck), and full timestamp trail. This is the only place `Phone.status` values `CLAIMED` / `WITH_SUPPLIER` are set.

### 4.7 Invoices
Sale invoice (multi-line) rendered as a print-optimized HTML page (`@media print`, browser print-to-PDF — no canvas PDF library, keeps the door open for Urdu text later and avoids the ligature-rendering problems Badar Natural Foods hit with canvas-based PDF renderers). Includes: logo (full lockup from `public/QMC logo 2.0.png`), invoice number, date, customer name/phone if present, line items (phone: brand/model/storage/color/IMEI; accessory: name/variant/qty), rate, subtotal, total, payment type, paidAmount, amountDue.

Two action buttons on the invoice view, same pattern as Badar Natural Foods:
- **Download** — browser print-to-PDF.
- **Share** — Web Share API Level 2 (`navigator.share({ files: [pdfFile] })`) for native share sheet on mobile (WhatsApp appears as a target with the file attached); feature-detect `navigator.canShare({ files: [...] })` and fall back on desktop to downloading the PDF + opening a `wa.me/<customerPhone>` chat in a new tab with a short prefilled text, noting the PDF needs manual attach.

### 4.8 Cash ledger & profit reporting
Single source of truth: `CashLedgerEntry`, exactly one entry per cash-affecting action, `balanceAfter` always `previous balanceAfter + amount`. Never update a running cash balance in more than one code path — same rule as Hafeez Communication.

Profit reporting (daily/weekly/monthly, filterable by date range):
- Revenue = `sum(SaleItem.lineTotal)` in range.
- Cost of goods sold = `sum(SaleItem.costAtSale × quantity)` in range (quantity = 1 for phone lines).
- Profit = Revenue − COGS. This only works because `costAtSale` is snapshotted at sale time — never recompute historical profit from current `Phone.costPrice`/`Accessory.costPrice`, since those change over time.
- Also report: total purchased (period), total sold (period), expenses (period), net cash position (`CashLedgerEntry` sum).

---

## 5. Folder Structure

```
qadri-mobile-communication/
  app/
    (public)/                 # simple showcase page, WhatsApp CTA — no ordering system
    admin/
      dashboard/               # today's sales/purchases, payable/receivable, low stock, claims-in-progress
      inventory/
        phones/
        accessories/
      purchases/
      sales/
      suppliers/               # supplier CRUD + ledger drill-down
      customers/               # customer CRUD + ledger drill-down
      claims/
      ledger/
        cash/
        payable/
        receivable/
      reports/                 # profit, cash, credit reports
    api/
    login/
  components/
  lib/
    stock.ts                   # phone/accessory stock mutation helpers
    ledger.ts                  # cash/supplier/customer ledger helpers (balanceAfter math lives here, nowhere else)
    invoice.ts                 # invoice number generation, print/share helpers
  prisma/
    schema.prisma
  types/
  auth.config.ts
  auth.ts
  proxy.ts
  public/
    QMC logo 2.0.png
    QMC logo 2.0.1.2.png
```

---

## 6. Feature Roadmap

**Phase 1 — MVP**
1. Prisma schema (Section 3), migrate against Neon.
2. Auth.js single-admin login, `proxy.ts` guarding `/admin/*`.
3. Phone inventory CRUD (add/edit, IMEI search).
4. Accessory inventory CRUD with upsert-on-purchase rule.
5. Supplier + Customer CRUD.
6. Purchase flow (multi-line, phones + accessories, cash/credit, supplier ledger).
7. Sale flow (multi-line, phones + accessories, cash/credit, customer ledger, stock decrement).
8. Cash ledger wired into every purchase/sale/payment write.
9. Invoice view: branded, printable, with Download + Share buttons.

**Phase 2 — Credit & Claims**
10. Payment recording against Purchases (payable) and Sales (receivable), with status recomputation.
11. Dashboard payable/receivable widgets, overdue flagging.
12. Claims module: full lifecycle (Section 4.6), claim list with stuck-with-supplier flagging.

**Phase 3 — Reporting & Polish**
13. Profit reports (daily/weekly/monthly), cash report, credit report (consolidated payable/receivable, exportable CSV).
14. Low-stock alerts (accessories) and warranty-expiring flags (phones) on the dashboard.
15. Expense tracking wired into cash ledger.
16. Public showcase page themed per Section 2, WhatsApp CTA.
17. Responsive/mobile pass on all admin screens (claims and sales are likely to be used from a phone at the counter).

---

## 8. Subagents (`.claude/agents/*.md`)

Five subagents, each scoped to one phase, mirroring the split used in Hafeez Communication:

1. **schema-agent** — owns `prisma/schema.prisma`, `prisma.config.ts`, `lib/prisma.ts`. Zero seed data.
2. **backend-agent** — owns all server actions/API routes and every ledger write (`CashLedgerEntry`, `SupplierLedgerEntry`, `CustomerLedgerEntry`). The only agent allowed to write ledger/stock math.
3. **admin-ui-agent** — owns `app/admin/*`: dashboard, inventory, purchases, sales, suppliers, customers, claims, ledger views, reports.
4. **landing-ui-agent** — owns `app/(public)/*`: showcase page, brand theme, WhatsApp CTA.
5. **qa-agent** — runs last, verifies the invariants in Section 4 against the other four agents' output, reports issues back to the owning agent rather than patching across scope.

Build order: schema-agent → backend-agent (guided by the skills below) → admin-ui-agent and landing-ui-agent in parallel once backend routes exist → qa-agent last.

## 9. Skills (`.claude/skills/<name>/SKILL.md`)

Seven skills, one per Section 4 subsection, that the owning agent (mainly backend-agent) must read before writing the matching code:

1. **phone-inventory** (§4.1) — IMEI uniqueness, per-unit purchase/sale, warranty computed at read time, status machine.
2. **accessory-inventory** (§4.2) — upsert-on-purchase rule, quantity vs price/spec edits.
3. **purchase-sale-flow** (§4.3 + §4.4) — multi-line mixed phone/accessory transactions, stock mutation, invoice numbering.
4. **credit-and-ledger** (§4.5) — supplier payable / customer receivable double ledger, shared `Payment` model, customer upsert-by-phone.
5. **claims-lifecycle** (§4.6) — the four-stage return/warranty tracking, status machine, refund/reject terminal states.
6. **invoice-generation** (§4.7) — print-optimized HTML invoice, Download + Share (Web Share API) buttons.
7. **cash-ledger-and-profit** (§4.8) — single-source-of-truth cash rules, `costAtSale` snapshot, daily/weekly/monthly profit reporting.

## 10. Explicitly Out of Scope

- Customer-facing login/portal — tracking stays entirely inside the admin panel, per explicit instruction.
- JazzCash/EasyPaisa cash-agent wallet module (Hafeez Communication's `WalletTransaction` feature) — `PaymentMethod` includes `JAZZCASH`/`EASYPAISA` as settlement methods only, not a dedicated wallet ledger.
- Bilingual Urdu invoices, barcode scanning, weight-based unit conversion — Badar Natural Foods-specific, not relevant to discrete-unit phone/accessory retail.
- Cron jobs / scheduled reminders — all due-date and warranty-status logic is computed at query time.
