# mfr

Monorepo for the Miller Family Reunions portal — one repo, three independently-deployed Next.js apps, one shared identity layer.

## Structure

```
apps/
  web/            millerfamilyreunions.org shell (nav, landing page)
  accounting/     shareholder ledger
  reservations/   cabin booking site
packages/
  auth/           shared Auth.js config + identity DB schema (@mfr/auth), used by
                  apps/accounting and apps/reservations so a user logs in once and
                  is recognized across both
```

Each app is deployed to Vercel as its own independent project (Root Directory set per app) — the monorepo is for code sharing, not deployment coupling.

## Development

```bash
npm install
npm run dev:reservations   # or dev:accounting / dev:web
```

See each app's own README for app-specific setup (env vars, database migrations).
