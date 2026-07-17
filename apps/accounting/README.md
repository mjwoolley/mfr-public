# MFR — Shareholder Ledger (apps/accounting)

Tracks shareholder contributions and ownership for the family corporation whose
asset is the lake house on Lake Lure. **$1 contributed = 1 share, always.**
Served under the `/accounting` base path (accounting.millerfamilyreunions.org).

What's inside: a per-shareholder **dashboard** (balance, ownership %, fiscal-year
goal tracker with Venmo QR), **Ownership** and **Contributions** reports,
**Expenses** (operating vs capital, income-vs-expenses chart), a per-shareholder
approval **Inbox**, and an **Admin** console for recording
contributions/transfers/adjustments/corrections, managing expenses and
shareholders, and app settings.

## Stack

Next.js (App Router) on Vercel · Neon Postgres via Prisma (driver adapters, no
Rust engine) · Auth.js v5 via `@mfr/auth` (Google only, shared identity DB —
sign-in happens on the portal, not here) · Amazon SES + react-email for
notifications.

**Fiscal year is the central reporting concept**: Mar 1 – end of Feb, derived in
one place (`src/lib/fiscalYear.ts`). Every "year" in reports, goals, and expense
groupings is a fiscal year.

## Local development

```bash
npm install                # at the repo root
npm run dev:accounting     # http://localhost:3001/accounting  (/ redirects)
npm test                   # unit tests (ledger/fiscal-year/chart math)
npx prisma studio          # inspect the database
```

Environment variables live in `.env` (see `.env.example` for the full commented
list). The Neon project is `mfr-accounting`; local dev uses its `dev` branch.

### Database changes

Edit `prisma/schema.prisma`, then:

```bash
npx prisma migrate dev --name <description>
```

This applies the migration to the dev database and regenerates the Prisma client
(`src/generated/prisma`, gitignored). Production applies migrations during the
Vercel deploy via the `vercel-build` script (`prisma generate && prisma migrate
deploy && next build`); plain `npm run build` deliberately does **not** migrate,
so CI and local builds never touch a database. See
[docs/workflow.md](../../docs/workflow.md#schema-changes-accounting--prisma).

## Required environment variables

See `.env.example` for the full commented list. Summary:

| Variable                                                                                                     | Purpose                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `DATABASE_URL` / `DIRECT_URL`                                                                                | Neon pooled (runtime) / direct (Prisma CLI migrations) connections       |
| `IDENTITY_DATABASE_URL` / `IDENTITY_DIRECT_DATABASE_URL`                                                     | Shared identity DB (`@mfr/auth`) — same values as the other apps         |
| `PORTAL_DATABASE_URL`                                                                                        | Portal DB — the session callback reads portal roles from here            |
| `AUTH_SECRET`                                                                                                | Auth.js session key — **identical across all three apps**                |
| `AUTH_URL`                                                                                                   | This deployment's auth base URL (includes `/accounting/api/auth`)        |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`                                                                      | Google OAuth Web Client credentials (shared across apps)                 |
| `AUTH_COOKIE_DOMAIN` / `AUTH_SESSION_COOKIE_NAME`                                                            | Cross-subdomain SSO cookie domain / staging cookie isolation             |
| `SES_REGION`, `SES_ACCESS_KEY_ID` / `SES_SECRET_ACCESS_KEY`                                                  | SES region + IAM creds (`SES_`-prefixed because Vercel reserves `AWS_*`) |
| `EMAIL_FROM`                                                                                                 | Verified SES sender address                                              |
| `EMAIL_ENABLED`                                                                                              | `true` in production **only** — lets email reach real recipients         |
| `EMAIL_OVERRIDE_TO`                                                                                          | Non-prod inbox all mail is plus-address-redirected to (blank in prod)    |
| `APP_BASE_URL`                                                                                               | Base for links inside emails (includes `/accounting`)                    |
| `NEXT_PUBLIC_VENMO_URL` / `NEXT_PUBLIC_VENMO_HANDLE`                                                         | Venmo contribution link + handle; the dashboard button hides when unset  |
| `NEXT_PUBLIC_HOME_URL` / `NEXT_PUBLIC_RESERVATIONS_URL` / `NEXT_PUBLIC_ACCOUNTING_URL`                       | Cross-app nav overrides for non-prod deploys                             |
| `ADDITIONAL_ALLOWED_ORIGINS`                                                                                 | Extra server-action Origin allow-list entries (staging host)             |
| `TEST_DATABASE_URL` / `TEST_DIRECT_URL` / `TEST_IDENTITY_DATABASE_URL` / `TEST_IDENTITY_DIRECT_DATABASE_URL` | Dedicated Neon test branches for `npm run test:integration`              |

## Auth & authorization

Sign-in is Google-only and happens on the **portal** (`apps/web/sign-in`) — this
app keeps only the `/api/auth` handler to read the shared session cookie.
Whether someone may use the app at all is the portal status
(pending/approved/blocked, managed at the portal's `/admin/users`). Whether they
are an **accounting admin** comes from portal roles (`siteOwner` or
`accountingManager` — `canAdminAccounting` in `@mfr/auth`). Shareholders are
linked to logins by email automatically at sign-in, or manually from the admin
shareholder editor.

## Deploying to Vercel

1. Import the repo; set Root Directory to `apps/accounting`.
2. Add the variables above (production values; the `staging` branch gets its own
   scoped set — see [docs/workflow.md](../../docs/workflow.md#staging-environment-test-the-deployed-site)).
3. `vercel-build` applies pending Prisma migrations on every deploy against
   `DIRECT_URL`.
4. Google OAuth redirect URI:
   `https://accounting.millerfamilyreunions.org/accounting/api/auth/callback/google`.
5. SES: verify the sending domain, create a send-only IAM user with
   `ses:SendEmail`, point `EMAIL_FROM` at a verified sender.

## Data model notes

- **Immutable ledger with one exception**: transactions and their `LedgerEntry`
  rows are never edited. Mistakes are fixed with a `CORRECTION` transaction that
  carries the intended amounts and **soft-deletes** the original
  (`deleted`/`deletedAt` — still shown struck-through everywhere, excluded from
  every balance and total) in the same DB transaction.
- **Approval is informational, not gating**: a `TransactionApproval` row per
  affected shareholder feeds the `/inbox`; confirming/disputing never blocks the
  transaction from counting toward balances.
- **Shareholders vs. logins are decoupled**: admins create `Shareholder` records
  independent of any Google account; linking happens by email at sign-in or
  manually. No cross-database FK — `Shareholder.userId` is a plain unique string.
- **Expenses live outside the ledger**: no shares, no approvals; edits keep the
  original `incurredAt` and deletes are hard. The `capital` flag (not the
  category) drives the operating-vs-capital split in reports.
- **Contributions-tab visibility** is an admin toggle (`AppSettings` singleton):
  everyone, or admins-only (tab shows a lock).

## Tests

```bash
npm test                   # unit (vitest) — pure ledger/fiscal-year/chart math
npm run test:integration   # real queries against the four TEST_* Neon branches;
                           # setup TRUNCATES them — never point at real DBs
```
