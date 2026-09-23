# MFR — the site (apps/mfr)

Everything at **millerfamilyreunions.org** is this one Next.js app: the public
front door, the members' hub, cabin reservations, and the shareholder ledger.
It hosts the only sign-in page and the admin screens where users are approved
and roles granted.

## Routes

| Route                     | Access                       | What it is                                                                                    |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| `/`                       | public                       | Home: hero slideshow; fundraising goal card + upcoming events (signed-in only)                |
| `/photos`                 | approved members             | Self-hosted photo gallery (by year / by uploader), plus Featured and History sub-pages        |
| `/meals`                  | approved members             | Reunion-week lunch/dinner RSVPs, headcounts, roster grid                                      |
| `/documents`              | approved members             | In-site browser/viewer for the shared Google Drive folder (service-account read)              |
| `/reservations/*`         | approved members             | Cabin booking calendar, my reservations, summary; admin screens for reservation admins        |
| `/accounting/*`           | linked shareholders + admins | Shareholder dashboard, contributions, ownership, expenses, reports; admin for accounting mgrs |
| `/sign-in`                | public                       | Google sign-in (also the Auth.js error page)                                                  |
| `/admin`                  | site owner **or** manager    | Content editing (schedule, links, events) and the site-wide activity feed                     |
| `/admin/users`            | site owner **or** manager    | Approve/block users; role grants (siteOwner / siteManager / accountingManager) are owner-only |
| `/api/auth/[...nextauth]` | —                            | Auth.js handlers                                                                              |
| `/api/health`             | `CRON_SECRET`                | Deep health check (DB + R2) used by the smoke tests                                           |

## Stack & data

Next.js (App Router) on Vercel (project `mfr_web`) · **one Neon Postgres
project (`mfr`)** via Drizzle. The schema lives in `lib/db/schema/`, one file
per domain: `identity.ts` (Auth.js tables), `portal.ts` (`portal_*`: roles,
settings, photos, events, meal RSVPs), `reservations.ts`, and `accounting.ts`.

Notable design points:

- **Roles are the single authorization source.** `portal_user_roles` is read
  into every session by `@mfr/auth`; pages check the capability helpers
  (`canAdminReservations`, `canAdminAccounting`, …), never raw flags. See
  `packages/auth/README.md`.
- **Schema changes ship as migrations.** `npm run db:generate` (on Node 22)
  writes a migration under `drizzle/`; deploys apply it via `vercel-build` →
  `scripts/migrate-deploy.mjs`, which also re-applies `lib/db/push-only.sql`
  (the objects drizzle-kit can't express). See the schema-change section in
  [docs/workflow.md](../../docs/workflow.md).

## Local development

```bash
npm install            # at the repo root
npm run dev            # http://localhost:3000
```

Env vars live in `.env.local` — see `.env.example` for the commented list
(`DATABASE_URL` / `DIRECT_URL` for the Neon `dev` branch, `AUTH_*`, and the
optional R2 / Drive / cron / email values).

## Tests

```bash
npm test                   # vitest unit project
npm run test:integration   # real queries against a Neon test branch; needs
                           # TEST_DATABASE_URL + TEST_DIRECT_URL
```

Integration setup **truncates** the test branch — the `TEST_*` env names are
the only guard; never point them at real databases. Coverage floors and what
they mean are in the "Coverage policy" section of the workflow doc.
