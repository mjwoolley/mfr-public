# MFR — Shareholder Ledger

Tracks shareholder contributions and ownership for a family corporation whose asset is a lake
house on Lake Lure. $1 contributed = 1 share, always. Shares/percent-ownership reports, an admin
console for recording contributions/transfers/adjustments/corrections, and a per-shareholder
approval inbox.

## Stack

Next.js (App Router) on Vercel · Neon Postgres via Prisma (driver adapters, no Rust engine) ·
Auth.js v5 with Google OAuth only · Amazon SES + react-email for notifications.

## Local development

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # ledger math unit tests
npx prisma studio # inspect the database
```

Environment variables live in `.env` (see `.env.example` for the full list). This project
already has a Neon project provisioned (`mfr-accounting`); ask whoever set it up for the
connection strings, or provision your own dev database and update `.env`.

### Database changes

Edit `prisma/schema.prisma`, then:

```bash
npx prisma migrate dev --name <description>
```

This applies the migration to the dev database and regenerates the Prisma client
(`src/generated/prisma`, gitignored).

## Required environment variables

See `.env.example`. Summary:

| Variable                                      | Purpose                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                | Neon **pooled** connection string — used by the app at runtime                       |
| `DIRECT_URL`                                  | Neon **direct** (unpooled) connection string — used by Prisma CLI for migrations     |
| `AUTH_SECRET`                                 | Auth.js session encryption key — generate with `openssl rand -base64 33`             |
| `AUTH_URL`                                    | Base URL of the deployment (e.g. `https://your-app.vercel.app`)                      |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`       | Google OAuth Web Client credentials                                                  |
| `ADMIN_EMAILS`                                | Comma-separated emails that get the `ADMIN` role on first sign-in                    |
| `SES_REGION`                                  | AWS region for SES (default `us-east-1`)                                             |
| `SES_ACCESS_KEY_ID` / `SES_SECRET_ACCESS_KEY` | IAM credentials with `ses:SendEmail` (SES_-prefixed because Vercel reserves `AWS_*`) |
| `EMAIL_FROM`                                  | Verified SES sender address for notification emails                                  |
| `EMAIL_ENABLED`                               | Set to `true` in production only — lets email reach real recipients                  |
| `EMAIL_OVERRIDE_TO`                           | Non-prod inbox that all mail is redirected to (blank in prod)                        |
| `APP_BASE_URL`                                | Used to build links inside emails                                                    |

## Setting up Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or select) a project.
2. **APIs & Services → OAuth consent screen**: User type "External". Since this is a closed
   family group, it's fine to leave the app in **Testing** mode (no Google verification needed)
   — just add each shareholder's Google account email under **Test users**. Scopes: the default
   `openid`, `email`, `profile` are sufficient.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, application type
   **Web application**. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (local dev)
   - `https://<your-production-domain>/api/auth/callback/google`
4. Copy the generated Client ID and Client Secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

Anyone not in **Test users** (or, once verified, anyone at all) can sign in but will land on
`/unauthorized` unless the admin has already added them as a `Shareholder` (or their email is in
`ADMIN_EMAILS`).

## Deploying to Vercel

1. Import the GitHub repo into a new Vercel project (Next.js preset is auto-detected).
2. Add all variables from `.env.example` in the Vercel project's Environment Variables settings.
   Use a **separate Neon branch/database for Preview deployments** than Production, so PR
   previews never touch real financial data — Neon's branching makes this cheap.
3. Set `AUTH_URL` and `APP_BASE_URL` to the real production URL once you know it (a custom domain
   or the `*.vercel.app` URL).
4. The build command (`npm run build` → `prisma generate && prisma migrate deploy && next build`,
   see `package.json`) applies pending migrations automatically on every deploy, against
   `DIRECT_URL`.
5. Add the production redirect URI to the Google OAuth client (step 3 above) before the first
   real sign-in.
6. In [Amazon SES](https://console.aws.amazon.com/ses), verify the sending domain
   (`millerfamilyreunions.org`) and create a send-only IAM user with `ses:SendEmail`; put its
   keys in `SES_ACCESS_KEY_ID` / `SES_SECRET_ACCESS_KEY` and point `EMAIL_FROM` at a verified
   sender (e.g. `accounting@millerfamilyreunions.org`). While SES is in the sandbox, it only
   delivers to verified recipient addresses.

## Data model notes

- **Immutable ledger**: every `Transaction` (contribution/transfer/adjustment/correction) and its
  `LedgerEntry` rows are permanent once created — there is no edit or delete path anywhere in the
  app, including for admins. Mistakes are fixed with a new `CORRECTION` transaction referencing
  the original via `correctsTransactionId`.
- **Approval is informational, not gating**: a `TransactionApproval` row is created per affected
  shareholder on every transaction, surfaced in that shareholder's `/inbox`. It does not block the
  transaction from counting toward balances/reports — those update immediately on creation.
- **Shareholders vs. logins are decoupled**: admins create `Shareholder` records (name + email)
  independent of any Google account. When that email later signs in with Google, the account
  auto-links via `Shareholder.userId`.
